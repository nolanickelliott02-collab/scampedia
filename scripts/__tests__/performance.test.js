'use strict';

// Phase 5: "Performance: Lighthouse Performance >= 90 on mobile." A real
// Lighthouse run against the live site found the Google Fonts stylesheet
// blocking render (~2-2.6s estimated savings on every page) and no
// preconnect to fonts.gstatic.com (where the actual font files are
// served, not fonts.googleapis.com). Fixed via the standard "loadCSS"
// pattern (media="print" swapped to "all" onload, with a <noscript>
// fallback) plus explicit width/height on the two logo <img> uses (a
// separate flagged "unsized-images" audit).
//
// Re-verified for real afterward (not just claimed): Lighthouse Performance
// went 91->99 (home) and 85->100 (crisis) on a local rebuild. This test
// locks in the structural fix (present in generated output, real
// child-process build) rather than re-running Lighthouse itself in CI.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');

function assertAsyncFontLoading(html, label) {
  assert.match(html, /rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/, `${label}: missing preconnect to fonts.gstatic.com`);
  assert.match(html, /rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2/, `${label}: missing font stylesheet preload`);
  assert.match(html, /media="print" onload="this\.media='all'"/, `${label}: font stylesheet is not loaded async (render-blocking)`);
  assert.match(html, /<noscript><link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2/, `${label}: missing <noscript> fallback for the async font stylesheet`);
}

function assertSizedLogo(html, label) {
  assert.match(html, /class="nav-logo-img" width="332" height="24"/, `${label}: nav logo missing explicit width/height`);
  assert.match(html, /class="footer-logo-img" width="249" height="18"/, `${label}: footer logo missing explicit width/height`);
}

test('index.html uses async font loading and sized logo images', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertAsyncFontLoading(html, 'index.html');
  assertSizedLogo(html, 'index.html');
});

test('scampedia.html uses async font loading and sized logo images', () => {
  const html = fs.readFileSync(path.join(ROOT, 'scampedia.html'), 'utf8');
  assertAsyncFontLoading(html, 'scampedia.html');
  assertSizedLogo(html, 'scampedia.html');
});

test('generated scam-entry pages use async font loading and sized logo images', () => {
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-scam-pages.js')], { cwd: ROOT, stdio: 'ignore' });
  const html = fs.readFileSync(path.join(ROOT, 'scams', 'grandparent-emergency-scam.html'), 'utf8');
  assertAsyncFontLoading(html, 'a generated scam entry page');
  assertSizedLogo(html, 'a generated scam entry page');
});

test('generated learn pages use async font loading and sized logo images', () => {
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-scam-pages.js')], { cwd: ROOT, stdio: 'ignore' });
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-learn-pages.js')], { cwd: ROOT, stdio: 'ignore' });
  const html = fs.readFileSync(path.join(ROOT, 'learn', 'i-think-ive-been-scammed.html'), 'utf8');
  assertAsyncFontLoading(html, 'a generated learn page');
  assertSizedLogo(html, 'a generated learn page');
});
