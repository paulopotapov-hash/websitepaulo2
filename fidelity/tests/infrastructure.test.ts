import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCoverage, classifyMissingAnchor, regionCanvasSize, validateFixtureCompatibility, verifyServerMarker } from '../lib/comparison-core';

const compatibility = { schemaVersion: 2, metricSchemaVersion: 2, anchors: { hero: true } };
const fixture = (hash = 'sha256:same') => ({ schemaVersion: 2, metricSchemaVersion: 2, configFingerprint: hash, compatibility });

test('different config fingerprint refuses comparison', () => {
  assert.equal(validateFixtureCompatibility(fixture('sha256:a'), fixture('sha256:b')).status, 'INCOMPATIBLE_FIXTURES');
});

test('same fingerprint and payload proceeds', () => {
  assert.equal(validateFixtureCompatibility(fixture(), fixture()).compatible, true);
});

test('missing declared implemented anchor is selector failure', () => {
  assert.equal(classifyMissingAnchor(true), 'SELECTOR_FAILURE');
});

test('missing future anchor is expected missing content', () => {
  assert.equal(classifyMissingAnchor(false), 'EXPECTED_MISSING_CONTENT');
});

test('full-page height does not affect implemented region canvas', () => {
  assert.deepEqual(regionCanvasSize({ width: 1440, height: 646 }, { width: 1440, height: 646 }), { width: 1440, height: 646 });
});

test('coverage is calculated independently from fidelity', () => {
  const ref = { texts: { hero: { found: true }, future: { found: true } }, images: {} };
  const cur = { texts: { hero: { found: true }, future: { found: false } }, images: {} };
  const result = calculateCoverage(ref, cur, ['hero', 'future'], { hero: { anchors: ['hero'] }, future: { anchors: ['future'] } });
  assert.equal(result.percent, 50); assert.deepEqual(result.missingRegions, ['future']);
});

test('server marker rejection is explicit', () => {
  assert.equal(verifyServerMarker('wrong', 'paulowebsite2').status, 'SERVER_MARKER_REJECTED');
});

test('legacy fixture is detected as stale', () => {
  assert.equal(validateFixtureCompatibility({ schemaVersion: 1 }, fixture()).status, 'INCOMPATIBLE_FIXTURES');
});
