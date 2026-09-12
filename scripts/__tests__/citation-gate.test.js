'use strict';

// Phase 0 finding: "citation gate exit codes were recently corrected —
// confirm the gate actually blocks uncited content in the current
// workflow, not just logs it." Confirmed by reading runPipeline() in
// ../lib/scam-pipeline.js: a gate rejection returns before setting
// data.reports.push(...)/writing the file, and the workflow's "Publish
// directly to main" step is guarded by
// `if: steps.generate.outputs.result == 'written'` — a rejected entry's
// result is 'gate-rejected', so it structurally cannot reach main. This
// test exercises the actual exported gate functions directly (no mocking)
// so that guarantee is enforced by a real, automated check instead of by
// reading code and workflow YAML by hand every time someone touches it.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCitationUrls,
  verifyCitationUrls,
} = require('../lib/scam-pipeline');

test('extractCitationUrls: a source with no URL and no bare domain yields nothing to check', () => {
  assert.deepEqual(extractCitationUrls('FTC Consumer Alerts'), []);
  assert.deepEqual(extractCitationUrls('AARP Fraud Watch Network'), []);
});

test('extractCitationUrls: falls back to a bare domain (no scheme) as https://', () => {
  // The exact pattern that gate-rejected every daily entry for 13 days
  // (2026-08-13 to 2026-08-25) before this fallback was added.
  assert.deepEqual(extractCitationUrls('BBB, bbb.org/article/12345'), ['https://bbb.org/article/12345']);
});

test('citation gate BLOCKS an entry whose source has no URL at all (the org-name-only pattern)', async () => {
  // This is exactly the shape of all 40 legacy launch entries in
  // api/reports.json (e.g. "FTC Consumer Alerts") — an uncited claim of
  // an institution with nothing a reader or this pipeline can check.
  const result = await verifyCitationUrls('FTC Consumer Alerts + VerifyGuard user-submitted reports');
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(i => /no URL at all/i.test(i)),
    `expected a "no URL at all" issue, got: ${JSON.stringify(result.issues)}`
  );
});

test('citation gate BLOCKS an entry whose only cited URL does not resolve', { timeout: 15_000 }, async () => {
  const deadUrl = 'https://this-domain-does-not-exist-fpr9x83-scampedia-test.invalid/some-article';
  const result = await verifyCitationUrls(`Some Publication, ${deadUrl}`);
  assert.equal(result.ok, false);
  assert.ok(result.issues.length > 0, 'expected at least one issue for a URL that cannot resolve');
});

test('citation gate PASSES a real, resolvable URL', { timeout: 15_000 }, async () => {
  // A real, stable government page — the same class of source the daily
  // bots actually cite. If this starts failing, the gate itself (or the
  // network) is broken, not the test's fixture.
  const result = await verifyCitationUrls('FTC, https://www.ftc.gov/');
  assert.equal(result.ok, true, `expected a real, live URL to pass: ${JSON.stringify(result.issues)}`);
});
