/**
 * measure-page.ts — executed INSIDE the page via page.evaluate(measurePage, cfg).
 * It must stay self-contained (no imports used at runtime, no closures over module scope),
 * because Playwright serializes the function. Same function = same schema for Wix and React.
 */
export interface PageMatcher {
  textExact?: string;
  textStartsWith?: string;
  imgSrcIncludes?: string;
  selector?: string;
  scope?: 'main' | 'any';
}
export interface PageCfg {
  anchors: Record<string, { kind: 'text' | 'image'; matcher: PageMatcher }>;
  sections: Record<string, string[]>;
  navbarSelector: string;
  footerSelector: string;
  regions: Record<string, { rect: { type: 'navbar' | 'anchor' | 'anchorBounds'; anchor?: string }; anchors: readonly string[] }>;
}

export function measurePage(cfg: PageCfg): any {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const px = (v: string): number | string => (/^-?[\d.]+px$/.test(v) ? r2(parseFloat(v)) : v);
  const rectOf = (el: Element) => {
    const b = el.getBoundingClientRect();
    return { x: r2(b.left + window.scrollX), y: r2(b.top + window.scrollY), width: r2(b.width), height: r2(b.height) };
  };
  const navbar = document.querySelector(cfg.navbarSelector);
  const footer = document.querySelector(cfg.footerSelector);
  const inChrome = (el: Element | null) =>
    !!el && ((!!navbar && navbar.contains(el)) || (!!footer && footer.contains(el)));
  const isVisible = (el: Element) => {
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const elOf = (n: Node): Element => (n.nodeType === 1 ? (n as Element) : (n.parentElement as Element));

  // ------------------------------------------------------------- text anchors
  const findText = (m: PageMatcher): Node[] => {
    if (m.selector) return Array.from(document.querySelectorAll(m.selector));
    const out: Node[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || !n.parentElement) continue;
      const ok =
        m.textExact !== undefined ? t === m.textExact : m.textStartsWith !== undefined ? t.startsWith(m.textStartsWith) : false;
      if (ok) out.push(n);
    }
    return out;
  };
  const textInfo = (node: Node) => {
    const el = elOf(node);
    const range = document.createRange();
    range.selectNodeContents(node);
    const b = range.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: r2(b.left + window.scrollX),
      y: r2(b.top + window.scrollY),
      width: r2(b.width),
      height: r2(b.height),
      lineCount: range.getClientRects().length,
      fontFamily: cs.fontFamily,
      fontSize: px(cs.fontSize),
      fontWeight: cs.fontWeight,
      lineHeight: px(cs.lineHeight),
      letterSpacing: px(cs.letterSpacing),
      textAlign: cs.textAlign,
      color: cs.color,
      textTransform: cs.textTransform,
      textShadow: cs.textShadow,
      textStroke: cs.getPropertyValue('-webkit-text-stroke'),
      opacity: cs.opacity,
    };
  };

  // ------------------------------------------------------------ image anchors
  const findImage = (m: PageMatcher): Element[] => {
    if (m.selector) return Array.from(document.querySelectorAll(m.selector));
    const out: Element[] = [];
    if (m.imgSrcIncludes) {
      document.querySelectorAll('img').forEach((i) => {
        if (((i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src || '').includes(m.imgSrcIncludes as string)) out.push(i);
      });
      if (!out.length) {
        document.querySelectorAll('*').forEach((e) => {
          const bg = getComputedStyle(e).backgroundImage;
          if (bg && bg !== 'none' && bg.includes(m.imgSrcIncludes as string)) out.push(e);
        });
      }
    }
    return out;
  };
  const imageInfo = (el: Element) => {
    const cs = getComputedStyle(el);
    const isImg = el.tagName === 'IMG';
    const src = isImg ? (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src : cs.backgroundImage;
    const crop = /\/crop\/x_(\d+),y_(\d+),w_(\d+),h_(\d+)/.exec(src);
    const fill = /\/fill\/w_(\d+),h_(\d+)/.exec(src);
    return {
      ...rectOf(el),
      isBackground: !isImg,
      naturalWidth: isImg ? (el as HTMLImageElement).naturalWidth : null,
      naturalHeight: isImg ? (el as HTMLImageElement).naturalHeight : null,
      objectFit: isImg ? cs.objectFit : null,
      objectPosition: isImg ? cs.objectPosition : null,
      borderRadius: px(cs.borderTopLeftRadius),
      backgroundSize: isImg ? null : cs.backgroundSize,
      backgroundPosition: isImg ? null : cs.backgroundPosition,
      src,
      alt: isImg ? (el as HTMLImageElement).alt : null,
      // Wix-only information (skipped by the comparison): crop/fill parameters encoded in the media URL
      wix: {
        crop: crop ? { x: +crop[1], y: +crop[2], w: +crop[3], h: +crop[4] } : null,
        fill: fill ? { w: +fill[1], h: +fill[2] } : null,
      },
    };
  };

  // ------------------------------------------------------------------ anchors
  const anchorEls: Record<string, Element | null> = {};
  const texts: Record<string, any> = {};
  const images: Record<string, any> = {};
  const duplicates: Record<string, any> = {};
  for (const [key, a] of Object.entries(cfg.anchors)) {
    const scopeAny = a.matcher.scope === 'any';
    if (a.kind === 'text') {
      const all = findText(a.matcher);
      const inScope = all.filter((n) => scopeAny || !inChrome(elOf(n)));
      const first = inScope.find((n) => isVisible(elOf(n))) || null;
      anchorEls[key] = first ? elOf(first) : null;
      texts[key] = first ? { found: true, matchCount: inScope.length, ...textInfo(first) } : { found: false };
      if (a.matcher.textExact && all.length > 1) {
        duplicates[key] = {
          count: all.length,
          headingTextContent: first ? elOf(first).closest('h1,h2,h3,h4,h5,h6')?.textContent ?? null : null,
          instances: all.slice(0, 10).map((n) => {
            const e = elOf(n);
            const cs = getComputedStyle(e);
            return {
              tag: e.tagName.toLowerCase(),
              visible: isVisible(e),
              ariaHidden: !!e.closest('[aria-hidden="true"]'),
              position: cs.position,
              opacity: cs.opacity,
              color: cs.color,
              textShadow: cs.textShadow,
              textStroke: cs.getPropertyValue('-webkit-text-stroke'),
              rect: rectOf(e),
            };
          }),
        };
      }
    } else {
      const all = findImage(a.matcher).filter((e) => scopeAny || !inChrome(e));
      const first = all.find(isVisible) || all[0] || null;
      anchorEls[key] = first;
      images[key] = first ? { found: true, matchCount: all.length, ...imageInfo(first) } : { found: false };
    }
  }

  // ----------------------------------------------------------------- sections
  const layoutOf = (el: Element) => {
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      position: cs.position,
      marginTop: px(cs.marginTop), marginRight: px(cs.marginRight), marginBottom: px(cs.marginBottom), marginLeft: px(cs.marginLeft),
      paddingTop: px(cs.paddingTop), paddingRight: px(cs.paddingRight), paddingBottom: px(cs.paddingBottom), paddingLeft: px(cs.paddingLeft),
      gap: px(cs.gap), rowGap: px(cs.rowGap), columnGap: px(cs.columnGap),
      maxWidth: px(cs.maxWidth), minWidth: px(cs.minWidth),
      flexDirection: cs.flexDirection, justifyContent: cs.justifyContent, alignItems: cs.alignItems,
      gridTemplateColumns: cs.gridTemplateColumns, backgroundColor: cs.backgroundColor,
    };
  };
  const lca = (els: Element[]): Element | null => {
    let cur: Element | null = els[0];
    while (cur && !els.every((e) => (cur as Element).contains(e))) cur = cur.parentElement;
    return cur;
  };
  const stopIds = new Set(['PAGES_CONTAINER', 'SITE_CONTAINER', 'site-root', 'root']);
  const stopTags = new Set(['BODY', 'HTML', 'MAIN']);
  const sections: Record<string, any> = {};
  const containerOf: Record<string, Element> = {};
  for (const [name, keys] of Object.entries(cfg.sections)) {
    const mine = keys.map((k) => anchorEls[k]).filter(Boolean) as Element[];
    if (!mine.length) { sections[name] = { found: false, anchors: keys }; continue; }
    const others = Object.entries(anchorEls).filter(([k, e]) => e && !keys.includes(k)).map(([, e]) => e as Element);
    let cand = lca(mine) as Element;
    while (cand.parentElement) {
      const p = cand.parentElement;
      if (stopTags.has(p.tagName) || stopIds.has(p.id)) break;
      if (others.some((e) => p.contains(e))) break;
      if ((navbar && p.contains(navbar)) || (footer && p.contains(footer))) break;
      cand = p;
    }
    containerOf[name] = cand;
    const rect = rectOf(cand);
    sections[name] = {
      found: true,
      anchors: keys,
      ...rect,
      start: rect.y,
      end: r2(rect.y + rect.height),
      layout: layoutOf(cand),
      foundAnchors: mine.length,
    };
  }
  // sections that resolved to the same DOM element (cannot be separated) — documented, not hidden
  for (const a of Object.keys(containerOf)) {
    const shared = Object.keys(containerOf).filter((b) => b !== a && containerOf[b] === containerOf[a]);
    if (shared.length) sections[a].sharedContainerWith = shared;
  }

  // Authoritative regions use verified chrome or anchor rectangles, never inferred ancestors.
  const regionsValidated: Record<string, any> = {};
  for (const [name, def] of Object.entries(cfg.regions)) {
    const required = [...def.anchors];
    const missingAnchors = required.filter((key) => !anchorEls[key]);
    let elements: Element[] = [];
    if (def.rect.type === 'navbar') elements = navbar ? [navbar] : [];
    else if (def.rect.type === 'anchor' && def.rect.anchor && anchorEls[def.rect.anchor]) elements = [anchorEls[def.rect.anchor] as Element];
    else if (def.rect.type === 'anchorBounds') elements = required.map((key) => anchorEls[key]).filter(Boolean) as Element[];
    if (!elements.length || missingAnchors.length) {
      regionsValidated[name] = { found: false, anchors: required, missingAnchors, rectSource: def.rect };
      continue;
    }
    const rects = elements.map(rectOf);
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    const right = Math.max(...rects.map((r) => r.x + r.width));
    const bottom = Math.max(...rects.map((r) => r.y + r.height));
    regionsValidated[name] = {
      found: true, anchors: required, missingAnchors: [], rectSource: def.rect,
      x: r2(x), y: r2(y), width: r2(right - x), height: r2(bottom - y),
    };
  }

  // ---------------------------------------------------------------- navbar
  let nav: any = null;
  if (navbar) {
    let items = Array.from(navbar.querySelectorAll('a, button, [role="menuitem"]'))
      .filter(isVisible)
      .filter((e) => (e.textContent || '').trim().length > 0);
    items = items.filter((e) => !items.some((o) => o !== e && o.contains(e)));
    items.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const navItems = items.map((e) => {
      const cs = getComputedStyle(e);
      return {
        text: (e.textContent || '').replace(/\s+/g, ' ').trim(),
        ...rectOf(e),
        fontFamily: cs.fontFamily, fontSize: px(cs.fontSize), fontWeight: cs.fontWeight,
        lineHeight: px(cs.lineHeight), letterSpacing: px(cs.letterSpacing), color: cs.color, textTransform: cs.textTransform,
      };
    });
    const gaps = navItems.slice(1).map((it, i) => r2(it.x - (navItems[i].x + navItems[i].width)));
    const logo = Array.from(navbar.querySelectorAll('img')).find(isVisible);
    const ncs = getComputedStyle(navbar);
    nav = {
      ...rectOf(navbar),
      position: ncs.position,
      backgroundColor: ncs.backgroundColor,
      items: navItems,
      gaps,
      logo: logo ? { ...rectOf(logo), naturalWidth: (logo as HTMLImageElement).naturalWidth, naturalHeight: (logo as HTMLImageElement).naturalHeight } : null,
    };
  }

  // -------------------------------------------------- footer, buttons, images
  const footerInfo = footer ? { ...rectOf(footer), layout: layoutOf(footer) } : null;
  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
    .filter((e) => !inChrome(e) && isVisible(e))
    .map((e) => {
      const cs = getComputedStyle(e);
      return {
        text: (e.textContent || '').replace(/\s+/g, ' ').trim(), ...rectOf(e),
        fontFamily: cs.fontFamily, fontSize: px(cs.fontSize), fontWeight: cs.fontWeight, color: cs.color,
        backgroundColor: cs.backgroundColor, borderRadius: px(cs.borderTopLeftRadius),
      };
    });
  const imageList = Array.from(document.querySelectorAll('img'))
    .filter((i) => (i as HTMLImageElement).naturalWidth > 0 && i.getBoundingClientRect().width > 1 && isVisible(i))
    .map((i, idx) => ({
      index: idx,
      area: navbar && navbar.contains(i) ? 'navbar' : footer && footer.contains(i) ? 'footer' : 'main',
      ...rectOf(i),
      src: (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src,
    }));

  const fonts = Array.from((document as any).fonts as Iterable<any>).map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status }));

  return {
    global: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      totalHeight: document.documentElement.scrollHeight,
      navbarHeight: navbar ? rectOf(navbar).height : null,
      footerHeight: footer ? rectOf(footer).height : null,
      visibleImageCount: imageList.length,
      navItemCount: nav ? nav.items.length : 0,
      sectionsObservedFound: Object.values(sections).filter((s: any) => s.found).length,
    },
    nav,
    footer: footerInfo,
    sectionsObserved: sections,
    regionsValidated,
    texts,
    images,
    buttons,
    imageList,
    fonts,
    duplicates,
  };
}
