import crypto from 'node:crypto';
import {
  ANCHORS, CHROME_SELECTORS, DEVICE_SCALE_FACTOR, IMPLEMENTED_REGIONS, METRIC_SCHEMA_VERSION,
  NORMALIZATION, PIXEL, REGIONS, REQUIRED_FONTS, SCHEMA_VERSION, SECTIONS, SERVER_MARKER,
  TOLERANCE_RULES, VIEWPORTS,
} from '../fidelity.config';

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

export function fidelityConfigPayload(playwrightVersion: string, browserVersion: string) {
  return {
    schemaVersion: SCHEMA_VERSION,
    metricSchemaVersion: METRIC_SCHEMA_VERSION,
    anchors: ANCHORS,
    sectionsObserved: SECTIONS,
    regions: REGIONS,
    implementedRegions: IMPLEMENTED_REGIONS,
    chromeSelectors: CHROME_SELECTORS,
    normalization: NORMALIZATION,
    requiredFonts: REQUIRED_FONTS,
    comparison: { pixel: PIXEL, toleranceRules: TOLERANCE_RULES.map((rule) => ({ ...rule, match: String(rule.match) })) },
    serverMarker: SERVER_MARKER,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    viewports: VIEWPORTS,
    playwrightVersion,
    browserVersion,
  };
}

export function fingerprint(payload: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalize(payload)).digest('hex')}`;
}

export function compatibilityDiff(a: Record<string, unknown>, b: Record<string, unknown>, prefix = ''): string[] {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out: string[] = [];
  for (const key of [...keys].sort()) {
    const path = prefix ? `${prefix}.${key}` : key;
    const av = a?.[key], bv = b?.[key];
    if (av && bv && typeof av === 'object' && typeof bv === 'object' && !Array.isArray(av) && !Array.isArray(bv)) {
      out.push(...compatibilityDiff(av as Record<string, unknown>, bv as Record<string, unknown>, path));
    } else if (canonicalize(av) !== canonicalize(bv)) {
      out.push(`${path}: reference=${canonicalize(av)} current=${canonicalize(bv)}`);
    }
  }
  return out;
}
