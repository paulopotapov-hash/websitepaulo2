import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  ANCHORS, CHROME_SELECTORS, DEVICE_SCALE_FACTOR, IMPLEMENTED_REGIONS, METRIC_DEFINITIONS,
  METRIC_SCHEMA_VERSION, NORMALIZATION, PATHS, REGIONS, REQUIRED_FONTS, SCHEMA_VERSION,
  SECTIONS, SERVER_MARKER, URLS, type Target, type Viewport,
} from '../fidelity.config';
import { measurePage, type PageCfg } from './measure-page';
import { fidelityConfigPayload, fingerprint } from './fingerprint';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function playwrightVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.resolve('node_modules/@playwright/test/package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function buildCfg(target: Target): PageCfg {
  const anchors: PageCfg['anchors'] = {};
  for (const [key, a] of Object.entries(ANCHORS)) {
    anchors[key] = { kind: a.kind, matcher: target === 'react' ? a.react ?? a.wix : a.wix };
  }
  return { anchors, sections: SECTIONS, regions: REGIONS, navbarSelector: CHROME_SELECTORS[target].navbar, footerSelector: CHROME_SELECTORS[target].footer };
}

async function lazyScroll(page: Page, vp: Viewport) {
  const step = Math.round(vp.height * NORMALIZATION.scrollStepRatio);
  let y = 0;
  for (;;) {
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    if (y >= total) break;
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await sleep(NORMALIZATION.scrollWaitMs);
    y += step;
  }
  await page.evaluate(() => {
    document.querySelectorAll('img').forEach((i) => ((i as HTMLImageElement).loading = 'eager'));
  });
  await page.evaluate(async () => {
    await (document as any).fonts.ready;
    await Promise.all(
      Array.from(document.images).map((i) =>
        i.complete ? null : new Promise((res) => { i.onload = i.onerror = () => res(null); setTimeout(() => res(null), 10000); }),
      ),
    );
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
}

async function animationsAtLoad(page: Page) {
  return page.evaluate(() => {
    const d: any = document;
    const name = (e: any) => (e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') : null);
    const anims = d.getAnimations().map((a: any) => ({
      type: a.constructor.name,
      name: a.animationName ?? a.transitionProperty ?? null,
      target: name(a.effect?.target),
      duration: a.effect?.getTiming?.().duration ?? null,
    }));
    const motion = Array.from(d.querySelectorAll('*'))
      .filter((e: any) => e.getAttributeNames().some((n: string) => n.startsWith('data-motion') || n.startsWith('data-anim')))
      .slice(0, 50)
      .map((e: any) => ({
        el: name(e),
        attrs: e.getAttributeNames().filter((n: string) => n.startsWith('data-motion') || n.startsWith('data-anim')).map((n: string) => `${n}=${e.getAttribute(n)}`),
      }));
    return { note: 'state at load, before scrolling; scroll-triggered entrance animations are not captured here', runningCount: anims.length, running: anims.slice(0, 50), motionAttributeElements: motion };
  });
}

async function inspectBehaviors(page: Page, navbarSel: string) {
  const out: any = {};
  // --- navbar positioning: declared chain + measured behaviour on scroll
  out.navbar = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const chain: any[] = [];
    let c: Element | null = el;
    while (c && c !== document.documentElement) {
      const cs = getComputedStyle(c);
      chain.push({ tag: c.tagName.toLowerCase(), id: c.id, position: cs.position, top: cs.top, zIndex: cs.zIndex });
      c = c.parentElement;
    }
    return { chain };
  }, navbarSel);
  const topNow = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      top: Math.round(b.top * 100) / 100,
      height: Math.round(b.height * 100) / 100
    };
  }, navbarSel);

  out.navbar.atScrollY0 = await topNow();
  await page.evaluate(() => window.scrollTo(0, 1200));
  await sleep(400);
  out.navbar.atScrollY1200 = await topNow();

  if (out.navbar.atScrollY0 && out.navbar.atScrollY1200) {
    out.navbar.inferred =
      Math.abs(out.navbar.atScrollY1200.top - out.navbar.atScrollY0.top) <= 1
        ? 'stays in viewport on scroll (fixed/sticky-like)'
        : 'scrolls away with the page';

    out.navbar.heightChangesOnScroll =
      out.navbar.atScrollY1200.height !== out.navbar.atScrollY0.height;
  } else {
    out.navbar.inferred = 'navbar selector not found';
    out.navbar.heightChangesOnScroll = null;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);

  // --- hover style of the first nav link
  try {
    const link = page.locator(`${navbarSel.split(',')[0]} a:visible`).first();
    const style = () => link.evaluate((e) => { const cs = getComputedStyle(e as Element); return { color: cs.color, textDecoration: cs.textDecorationLine, backgroundColor: cs.backgroundColor, opacity: cs.opacity, fontWeight: cs.fontWeight }; });
    const before = await style();
    await link.hover({ timeout: 10_000 });
    await sleep(400);
    out.hover = { before, after: await style() };
  } catch (e) { out.hover = { error: String(e) }; }

  // --- "More" menu (hover only; clicking can navigate or open overlays, so it is not attempted)
  try {
    const more = page.locator(navbarSel.split(',')[0]).getByText(/^More$/).first();
    if (await more.count()) {
      const collect = () => page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="menu"] a, [role="menuitem"], nav ul ul a, [id*="dropdown" i] a, [class*="dropdown" i] a'))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
          .map((e) => ({ text: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().left), y: Math.round(e.getBoundingClientRect().top + window.scrollY) })));
      const before = await collect();
      await more.hover({ timeout: 10_000 });
      await sleep(600);
      const after = await collect();
      out.more = { openedVia: 'hover', itemsBefore: before.length, itemsAfter: after.length, items: after };
    } else out.more = { found: false };
  } catch (e) { out.more = { error: String(e) }; }
  return out;
}

export async function captureTarget(page: Page, target: Target, vp: Viewport) {
  const t0 = Date.now();
  const log = (m: string) => console.log(`[${target}@${vp.name}] +${Math.round((Date.now() - t0) / 1000)}s ${m}`);
  page.setDefaultTimeout(30_000);
  const consoleErrors: string[] = [];
  const failedRequests: Array<{ url: string; error: string }> = [];
  const badResponses: Array<{ url: string; status: number }> = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', (req) => failedRequests.push({ url: req.url(), error: req.failure()?.errorText ?? 'unknown' }));
  page.on('response', (res) => { if (res.status() >= 400) badResponses.push({ url: res.url(), status: res.status() }); });

  const url = URLS[target];
  log(`goto ${url}`);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { /* Wix keeps connections open */ });
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const serverMarker = target === 'react'
    ? await page.locator(SERVER_MARKER.selector).getAttribute('content')
    : 'not-applicable';
  if (target === 'react' && serverMarker !== SERVER_MARKER.content) {
    throw new Error(`SERVER_MARKER_REJECTED: expected ${SERVER_MARKER.content}, received ${serverMarker ?? 'missing'}`);
  }

  log('inspecting animations at load');
  const animLoad = await animationsAtLoad(page);
  const cfg = buildCfg(target);

  // --- normalization (every step is recorded in the fixture)
  log('normalizing');
  const hidden = NORMALIZATION.hideSelectors[target];
  const before = await page.evaluate(([sels, nav]) => ({
    hiddenHeights: Object.fromEntries((sels as string[]).map((s) => [s, document.querySelector(s)?.getBoundingClientRect().height ?? null])),
    totalHeight: document.documentElement.scrollHeight,
    navbarTop: document.querySelector(nav as string)?.getBoundingClientRect().top ?? null,
  }), [hidden, cfg.navbarSelector] as const);
  if (hidden.length) await page.addStyleTag({ content: hidden.map((s) => `${s}{display:none!important}`).join('\n') });
  await page.addStyleTag({ content: NORMALIZATION.css });
  log('lazy-load scroll');
  await lazyScroll(page, vp);
  const after = await page.evaluate((nav) => ({
    totalHeight: document.documentElement.scrollHeight,
    navbarTop: document.querySelector(nav)?.getBoundingClientRect().top ?? null,
  }), cfg.navbarSelector);

  // --- measure + screenshot (before hover/scroll experiments alter state)
  log('measuring');
  const measurement = await page.evaluate(measurePage, cfg);
  const fontDiagnostics = await page.evaluate((fonts) => fonts.map((font) => {
    const query = `${font.weight} 16px "${font.family}"`;
    const entries = Array.from(document.fonts).filter((entry: any) => {
      const actual = String(entry.family).replace(/["']/g, '').toLowerCase();
      const requested = font.family.toLowerCase();
      return (actual === requested || (requested === 'poppins' && actual.startsWith('poppins'))) && String(entry.weight) === font.weight;
    }).map((entry: any) => ({ family: entry.family, weight: entry.weight, style: entry.style, status: entry.status }));
    return {
      ...font,
      query,
      checkResult: document.fonts.check(query, font.sample),
      loaded: entries.some((entry: any) => entry.status === 'loaded'),
      entries,
    };
  }), REQUIRED_FONTS);
  const imageDiagnostics = await page.evaluate(async () => Promise.all(Array.from(document.images).map(async (img) => {
    let decoded = false;
    let decodeError: string | null = null;
    try { await img.decode(); decoded = true; } catch (error) { decodeError = String(error); }
    const rect = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    return {
      src: img.currentSrc || img.src, complete: img.complete, decoded, decodeError,
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      renderedWidth: Math.round(rect.width * 100) / 100, renderedHeight: Math.round(rect.height * 100) / 100,
      objectFit: style.objectFit, objectPosition: style.objectPosition,
    };
  })));
  const requiredImplementedAnchors = [...new Set(IMPLEMENTED_REGIONS.flatMap((name) => [...REGIONS[name].anchors]))];
  const missingImplementedAnchors = target === 'react'
    ? requiredImplementedAnchors.filter((name) => !(measurement.texts[name]?.found || measurement.images[name]?.found))
    : [];
  if (missingImplementedAnchors.length) {
    throw new Error(`SELECTOR_FAILURE: declared implemented anchors missing: ${missingImplementedAnchors.join(', ')}`);
  }
  log('screenshot');
  fs.mkdirSync(PATHS.shots[target], { recursive: true });
  const shotPath = path.join(PATHS.shots[target], `home-${vp.name}.png`);
  const buf = await page.screenshot({ path: shotPath, fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css', timeout: 90_000 });

  const browser = page.context().browser();
  const browserVersion = browser ? browser.version() : 'unknown';
  const pwVersion = playwrightVersion();
  const compatibility = fidelityConfigPayload(pwVersion, browserVersion);
  const fixture: any = {
    schemaVersion: SCHEMA_VERSION,
    metricSchemaVersion: METRIC_SCHEMA_VERSION,
    configFingerprint: fingerprint(compatibility),
    compatibility,
    source: target,
    url,
    page: '/',
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    timestamp: new Date().toISOString(),
    playwrightVersion: pwVersion,
    browserVersion,
    userAgent,
    normalization: {
      hiddenSelectors: hidden,
      hiddenElementHeights: before.hiddenHeights,
      totalHeightBeforeHide: before.totalHeight,
      totalHeightAfterNormalization: after.totalHeight,
      navbarTopBeforeHide: before.navbarTop,
      navbarTopAfterNormalization: after.navbarTop,
      css: NORMALIZATION.css,
      lazyLoadScroll: { stepRatio: NORMALIZATION.scrollStepRatio, waitMs: NORMALIZATION.scrollWaitMs },
      screenshot: { fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css' },
    },
    screenshot: { path: path.relative(process.cwd(), shotPath), width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) },
    metricDefinitions: METRIC_DEFINITIONS,
    ...measurement,
    captureHealth: {
      status: missingImplementedAnchors.length ? 'SELECTOR_FAILURE' : 'PASS',
      serverMarker: { expected: target === 'react' ? SERVER_MARKER.content : null, actual: serverMarker },
      consoleErrors,
      failedRequests,
      badResponses,
      missingImplementedAnchors,
      documentDimensions: { width: measurement.global.scrollWidth, height: measurement.global.totalHeight },
      url: page.url(), viewport: { width: vp.width, height: vp.height }, browserVersion,
    },
    fontDiagnostics,
    imageDiagnostics,
    behaviors: { skipped: 'not collected yet' },
    animationsAtLoad: animLoad,
  };

  // Core fixture is written BEFORE the behaviour experiments, so a hang there cannot lose the measurements.
  fs.mkdirSync(PATHS.fixtures[target], { recursive: true });
  const fixturePath = path.join(PATHS.fixtures[target], `home-${vp.name}.json`);
  const write = () => fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  write();
  log(`core fixture written: ${path.relative(process.cwd(), fixturePath)}`);

  if (NORMALIZATION.saveHtmlSnapshot[target]) {
    fs.mkdirSync(PATHS.snapshots, { recursive: true });
    fs.writeFileSync(path.join(PATHS.snapshots, `home-${vp.name}.html`), await page.content());
    log('html snapshot saved');
  }

  if (process.env.FIDELITY_SKIP_BEHAVIORS) {
    fixture.behaviors = { skipped: 'FIDELITY_SKIP_BEHAVIORS is set' };
  } else {
    log('inspecting behaviors (navbar scroll, hover, More)');
    const p = inspectBehaviors(page, cfg.navbarSelector);
    p.catch(() => { /* swallow late rejection after context closes */ });
    fixture.behaviors = await Promise.race([
      p,
      new Promise((resolve) => setTimeout(() => resolve({ error: 'timeout after 40s — behaviours not collected' }), 40_000)),
    ]);
  }
  write();
  log('done');
  return fixture;
}
