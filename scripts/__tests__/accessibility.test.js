'use strict';

// Phase 5: "run an automated audit (axe or Lighthouse) and fix every
// violation." A real Lighthouse run against the live site found two
// confirmed violations, fixed here:
//   - color-contrast: --text-3 (#4A5568 on --bg #0A0A0F) computes to
//     ~2.63:1, failing WCAG AA's 4.5:1 for normal text. Hit footer copy,
//     sidebar labels, card dates, the live-feed note — every use of the
//     token, everywhere it's used.
//   - heading-order: the database browse grid's cards used <h3> directly
//     under the page's own <h1>, with nothing at <h2> in between.
//
// Both are locked in here so they can't silently regress: the contrast
// ratio is actually computed (WCAG's real relative-luminance formula, not
// a hardcoded "looks fine" assumption), and the heading order is checked
// against real generated HTML, not just eyeballed.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');

// WCAG 2.x relative luminance + contrast ratio — straight from the spec
// (https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html),
// not a library, so this test has zero dependency on any package agreeing
// with WCAG's own formula.
function relativeLuminance(hex) {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
    .map(h => parseInt(h, 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

function readCssVar(css, name) {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`CSS variable ${name} not found`);
  return match[1];
}

test('WCAG contrast self-check: the test\'s own formula agrees with a known example', () => {
  // Pure black on pure white is the textbook 21:1 maximum.
  assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 0.01);
});

test('--text-3 meets WCAG AA (4.5:1) against --bg — regression check for the fixed color-contrast violation', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
  const bg = readCssVar(css, '--bg');
  const text3 = readCssVar(css, '--text-3');
  const ratio = contrastRatio(bg, text3);
  assert.ok(ratio >= 4.5, `--text-3 (${text3}) on --bg (${bg}) is ${ratio.toFixed(2)}:1 — below WCAG AA's 4.5:1`);
});

test('--text-3 stays visibly more muted than --text-2 (the fix should not flatten the token hierarchy)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
  const bg = readCssVar(css, '--bg');
  const text2 = readCssVar(css, '--text-2');
  const text3 = readCssVar(css, '--text-3');
  assert.ok(contrastRatio(bg, text3) < contrastRatio(bg, text2), '--text-3 should remain lower-contrast (more muted) than --text-2');
});

test('regenerated scam-database pages have no heading-order skip (h1 -> h2 -> h3, never h1 -> h3)', () => {
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-scam-pages.js')], { cwd: ROOT, stdio: 'ignore' });

  const html = fs.readFileSync(path.join(ROOT, 'scams', 'grandparent-emergency-scam.html'), 'utf8');
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
  assert.ok(headings.length > 0, 'expected at least one heading in a real entry page');
  assert.equal(headings[0], 1, 'first heading must be h1');
  for (let i = 1; i < headings.length; i++) {
    assert.ok(headings[i] <= headings[i - 1] + 1, `heading jumped from h${headings[i - 1]} straight to h${headings[i]} — a skipped level`);
  }
});

test('the database index page\'s category dividers are real headings, not styled divs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'scams', 'index.html'), 'utf8');
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
  assert.equal(headings[0], 1);
  assert.ok(headings.slice(1).every(h => h === 2 || h === 3), 'expected only h2 (category dividers) and h3 (card titles) after the page h1');
  for (let i = 1; i < headings.length; i++) {
    assert.ok(headings[i] <= headings[i - 1] + 1, `heading jumped from h${headings[i - 1]} straight to h${headings[i]}`);
  }
});
