import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { ANCHORS, COMPARED_ROOTS, IMPLEMENTED_REGIONS, PATHS, PIXEL, REGIONS, TOLERANCE_RULES, VIEWPORTS, type FidelityMode, type Rule } from './fidelity.config';
import { calculateCoverage, validateFixtureCompatibility } from './lib/comparison-core';

type Prim = number | string | boolean | null;
const mode: FidelityMode = process.env.FIDELITY_MODE === 'strict' ? 'strict' : 'implemented';
function flatten(obj: unknown, prefix: string, out: Record<string, Prim>) {
  if (obj === undefined) return out;
  if (obj === null || typeof obj !== 'object') { out[prefix] = obj as Prim; return out; }
  if (Array.isArray(obj)) obj.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
  else for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}
const DEFAULT_RULE: Rule = { match: /.*/, kind: 'numeric', tolerance: 1, note: 'default' };
const ruleFor = (metric: string) => TOLERANCE_RULES.find((rule) => rule.match.test(metric)) ?? DEFAULT_RULE;
const norm = (value: Prim) => String(value).replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
function compareMetric(metric: string, reference: Prim, actual: Prim | undefined) {
  const rule = ruleFor(metric);
  if (rule.kind === 'skip') return null;
  const tolerance = rule.kind === 'exact' ? 0 : rule.tolerance ?? 1;
  if (actual === undefined) return { metric, reference, actual: null, delta: null, tolerance, pass: false, classification: 'SELECTOR_FAILURE' };
  if (typeof reference === 'number' && typeof actual === 'number') {
    const delta = Math.round(Math.abs(actual - reference) * 100) / 100;
    return { metric, reference, actual, delta, tolerance, pass: delta <= tolerance, classification: delta <= tolerance ? null : 'REAL_VISUAL_MISMATCH' };
  }
  const pass = norm(reference) === norm(actual);
  return { metric, reference, actual, delta: null, tolerance: 0, pass, classification: pass ? null : 'REAL_VISUAL_MISMATCH' };
}
const readPng = (file: string) => PNG.sync.read(fs.readFileSync(file));
function filledCanvas(width: number, height: number) {
  const output = new PNG({ width, height });
  for (let i = 0; i < output.data.length; i += 4) { output.data[i] = 255; output.data[i + 2] = 255; output.data[i + 3] = 255; }
  return output;
}
function crop(source: PNG, rect: any, width: number, height: number) {
  const output = filledCanvas(width, height);
  const x = Math.max(0, Math.round(rect.x)), y = Math.max(0, Math.round(rect.y));
  const copyWidth = Math.max(0, Math.min(Math.round(rect.width), width, source.width - x));
  const copyHeight = Math.max(0, Math.min(Math.round(rect.height), height, source.height - y));
  if (copyWidth && copyHeight) PNG.bitblt(source, output, x, y, copyWidth, copyHeight, 0, 0);
  return output;
}
function pixelDiff(reference: PNG, current: PNG) {
  const width = Math.max(reference.width, current.width), height = Math.max(reference.height, current.height);
  const a = crop(reference, { x: 0, y: 0, width: reference.width, height: reference.height }, width, height);
  const b = crop(current, { x: 0, y: 0, width: current.width, height: current.height }, width, height);
  const output = new PNG({ width, height });
  const mismatched = pixelmatch(a.data, b.data, output.data, width, height, { threshold: PIXEL.threshold, includeAA: PIXEL.includeAA });
  return { output, pct: Math.round(mismatched / (width * height) * 10000) / 100 };
}
function selectedMetrics(reference: any, current: any, selectedRegions: readonly string[]) {
  const ref: Record<string, Prim> = {}, cur: Record<string, Prim> = {};
  if (mode === 'strict') {
    for (const root of COMPARED_ROOTS.filter((root) => root !== 'sections')) { flatten(reference[root], root, ref); flatten(current[root], root, cur); }
    flatten(reference.regionsValidated, 'regionsValidated', ref); flatten(current.regionsValidated, 'regionsValidated', cur);
  } else {
    if (selectedRegions.includes('navbar')) { flatten(reference.nav, 'nav', ref); flatten(current.nav, 'nav', cur); }
    for (const region of selectedRegions.filter((name) => name !== 'navbar')) {
      flatten(reference.regionsValidated?.[region], `regionsValidated.${region}`, ref);
      flatten(current.regionsValidated?.[region], `regionsValidated.${region}`, cur);
      for (const anchor of REGIONS[region as keyof typeof REGIONS].anchors) {
        const root = ANCHORS[anchor].kind === 'text' ? 'texts' : 'images';
        flatten(reference[root]?.[anchor], `${root}.${anchor}`, ref); flatten(current[root]?.[anchor], `${root}.${anchor}`, cur);
      }
    }
  }
  return Object.entries(ref).map(([key, value]) => {
    const result = compareMetric(key, value, cur[key]);
    if (result && mode === 'strict' && (cur[key] === undefined || ['global.totalHeight', 'global.visibleImageCount'].includes(key))) result.classification = 'EXPECTED_MISSING_CONTENT';
    return result;
  }).filter(Boolean) as any[];
}

const report: any = { generatedAt: new Date().toISOString(), mode, viewports: {}, overall: {} };
let unsuccessful = false;
for (const vp of VIEWPORTS) {
  const reference = JSON.parse(fs.readFileSync(path.join(PATHS.fixtures.wix, `home-${vp.name}.json`), 'utf8'));
  const current = JSON.parse(fs.readFileSync(path.join(PATHS.fixtures.react, `home-${vp.name}.json`), 'utf8'));
  const compatibility = validateFixtureCompatibility(reference, current);
  console.log(`\n${vp.width}×${vp.height}`);
  if (!compatibility.compatible) {
    unsuccessful = true; report.viewports[vp.name] = { status: 'INCOMPATIBLE_FIXTURES', compatibility };
    console.log('Compatibility: INCOMPATIBLE_FIXTURES');
    compatibility.differences.slice(0, 20).forEach((difference) => console.log(`  - ${difference}`));
    continue;
  }
  const coverage = calculateCoverage(reference, current, Object.keys(ANCHORS), REGIONS);
  const selectedRegions = mode === 'strict' ? Object.keys(REGIONS) : [...IMPLEMENTED_REGIONS];
  const metrics = selectedMetrics(reference, current, selectedRegions), failed = metrics.filter((metric) => !metric.pass);
  const referencePng = readPng(path.join(PATHS.shots.wix, `home-${vp.name}.png`));
  const currentPng = readPng(path.join(PATHS.shots.react, `home-${vp.name}.png`));
  const regionPixels: Record<string, any> = {};
  for (const name of selectedRegions) {
    const rr = reference.regionsValidated?.[name], cr = current.regionsValidated?.[name];
    if (!rr?.found || !cr?.found) {
      const declared = (IMPLEMENTED_REGIONS as readonly string[]).includes(name);
      regionPixels[name] = { status: declared ? 'SELECTOR_FAILURE' : 'EXPECTED_MISSING_CONTENT', pass: false };
      continue;
    }
    const width = Math.ceil(Math.max(rr.width, cr.width)), height = Math.ceil(Math.max(rr.height, cr.height));
    const result = pixelDiff(crop(referencePng, rr, width, height), crop(currentPng, cr, width, height));
    fs.mkdirSync(path.join(PATHS.shots.diff, 'regions'), { recursive: true });
    fs.writeFileSync(path.join(PATHS.shots.diff, 'regions', `home-${vp.name}-${name}.png`), PNG.sync.write(result.output));
    regionPixels[name] = { status: result.pct < PIXEL.sectionMaxMismatchPercent ? 'PASS' : 'REAL_VISUAL_MISMATCH', pct: result.pct, pass: result.pct < PIXEL.sectionMaxMismatchPercent, referenceRect: rr, currentRect: cr };
  }
  let fullPage: any = { status: coverage.missingRegions.length ? 'INCOMPLETE' : 'NOT_RUN_IN_IMPLEMENTED_MODE' };
  if (mode === 'strict') {
    const result = pixelDiff(referencePng, currentPng);
    fs.mkdirSync(PATHS.shots.diff, { recursive: true });
    fs.writeFileSync(path.join(PATHS.shots.diff, `home-${vp.name}.png`), PNG.sync.write(result.output));
    fullPage = { status: result.pct < PIXEL.maxMismatchPercent ? 'PASS' : coverage.missingRegions.length ? 'INCOMPLETE' : 'REAL_VISUAL_MISMATCH', pct: result.pct, pass: result.pct < PIXEL.maxMismatchPercent };
  }
  const captureHealth = { reference: reference.captureHealth?.status ?? 'UNKNOWN', current: current.captureHealth?.status ?? 'UNKNOWN', pass: reference.captureHealth?.status === 'PASS' && current.captureHealth?.status === 'PASS' };
  const fontDifferences = (reference.fontDiagnostics ?? []).flatMap((font: any) => {
    const actual = (current.fontDiagnostics ?? []).find((entry: any) => entry.family.toLowerCase() === font.family.toLowerCase() && entry.weight === font.weight);
    const referenceHasFace = font.entries?.length > 0;
    const currentHasFace = actual?.entries?.length > 0;
    return referenceHasFace && !currentHasFace ? [{ classification: 'FONT_DIFFERENCE', family: font.family, weight: font.weight, referenceEntries: font.entries.length, currentEntries: actual?.entries?.length ?? 0 }] : [];
  });
  const pass = failed.length === 0 && Object.values<any>(regionPixels).every((value) => value.pass) && (mode !== 'strict' || fullPage.pass);
  unsuccessful ||= !pass;
  report.viewports[vp.name] = { status: pass ? 'PASS' : mode === 'strict' && coverage.missingRegions.length ? 'INCOMPLETE' : 'REAL_VISUAL_MISMATCH', compatibility, captureHealth, coverage, fontDifferences, implementedMetrics: { pass: metrics.length - failed.length, total: metrics.length, failed }, regionPixels, fullPage };
  console.log('Compatibility: PASS'); console.log(`Capture health: ${captureHealth.pass ? 'PASS' : 'WARNING'}`);
  console.log(`Coverage: ${coverage.implementedRegions.length}/${coverage.referenceRegions} regions, ${coverage.implementedAnchors}/${coverage.referenceAnchors} anchors (${coverage.percent}%)`);
  console.log(`Implemented metrics: ${metrics.length - failed.length}/${metrics.length} PASS`);
  fontDifferences.forEach((difference: any) => console.log(`FONT_DIFFERENCE: ${difference.family} ${difference.weight} is available in Wix but absent from React`));
  for (const [name, pixel] of Object.entries<any>(regionPixels)) console.log(`${name}: ${pixel.pct ?? 'n/a'}% mismatch (${pixel.status})`);
  console.log(`Whole page: ${fullPage.status}${fullPage.pct === undefined ? '' : ` (${fullPage.pct}% mismatch)`}`);
  if (coverage.missingRegions.length) console.log(`Expected missing regions: ${coverage.missingRegions.join(', ')}`);
  failed.slice(0, 8).forEach((failure) => console.log(`  - ${failure.classification}: ${failure.metric} ref=${failure.reference} actual=${failure.actual}`));
}
report.overall = { pass: !unsuccessful, mode };
const modeReport = path.join(path.dirname(PATHS.report), `fidelity-report.${mode}.json`);
fs.writeFileSync(PATHS.report, JSON.stringify(report, null, 2));
fs.writeFileSync(modeReport, JSON.stringify(report, null, 2));
console.log(`\nReport: ${path.relative(process.cwd(), modeReport)}`);
process.exit(unsuccessful && !process.env.FIDELITY_NO_FAIL ? 1 : 0);
