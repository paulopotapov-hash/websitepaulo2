import { compatibilityDiff } from './fingerprint';

export function validateFixtureCompatibility(reference: any, current: any) {
  const fields = ['schemaVersion', 'metricSchemaVersion', 'configFingerprint'];
  const differences = fields.filter((field) => reference?.[field] !== current?.[field])
    .map((field) => `${field}: reference=${reference?.[field] ?? 'missing'} current=${current?.[field] ?? 'missing'}`);
  if (reference?.compatibility && current?.compatibility) differences.push(...compatibilityDiff(reference.compatibility, current.compatibility));
  else differences.push('compatibility payload missing');
  return { compatible: differences.length === 0, status: differences.length ? 'INCOMPATIBLE_FIXTURES' : 'PASS', differences };
}

export function anchorFound(fixture: any, name: string): boolean {
  return Boolean(fixture?.texts?.[name]?.found || fixture?.images?.[name]?.found);
}

export function calculateCoverage(reference: any, current: any, anchorNames: string[], regions: Record<string, { anchors: readonly string[] }>) {
  const referenceAnchors = anchorNames.filter((name) => anchorFound(reference, name));
  const implementedAnchors = referenceAnchors.filter((name) => anchorFound(current, name));
  const regionEntries = Object.entries(regions).filter(([name]) => name !== 'navbar');
  const implementedRegions = regionEntries.filter(([, def]) => def.anchors.every((name) => anchorFound(current, name))).map(([name]) => name);
  const missingRegions = regionEntries.filter(([, def]) => !def.anchors.every((name) => anchorFound(current, name))).map(([name]) => name);
  return { implementedAnchors: implementedAnchors.length, referenceAnchors: referenceAnchors.length,
    percent: referenceAnchors.length ? Math.round(implementedAnchors.length / referenceAnchors.length * 10000) / 100 : 0,
    implementedRegions, referenceRegions: regionEntries.length, missingRegions };
}

export const classifyMissingAnchor = (requiredImplemented: boolean) => requiredImplemented ? 'SELECTOR_FAILURE' : 'EXPECTED_MISSING_CONTENT';
export const verifyServerMarker = (actual: string | null, expected: string) => actual === expected
  ? { pass: true, status: 'PASS' } : { pass: false, status: 'SERVER_MARKER_REJECTED' };

export function regionCanvasSize(referenceRect: { width: number; height: number }, currentRect: { width: number; height: number }) {
  return { width: Math.ceil(Math.max(referenceRect.width, currentRect.width)), height: Math.ceil(Math.max(referenceRect.height, currentRect.height)) };
}
