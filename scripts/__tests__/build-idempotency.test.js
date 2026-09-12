'use strict';

// Regression test for the class of bug this fixed: build-learn-pages.js's
// footer template had drifted from what was actually committed (someone
// hand-patched the Learn pages' footer links to point at Scampedia's own
// privacy.html/terms.html after those were added, but never updated the
// generator that produces those same pages) — invisible until someone next
// ran the build, at which point it would have silently regenerated all 7
// Learn pages with the wrong link and no Terms of Service link at all.
//
// This runs both builders twice in a row (as real child processes, the same
// way CI invokes them) and asserts the second run produces byte-identical
// output to the first for every file whose content isn't expected to change
// between two runs microseconds apart. A generator whose own template
// disagrees with its last committed output would fail this on the very
// next commit that touches source content, instead of sitting undetected
// for weeks like this one did.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');

function runBuilders() {
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-scam-pages.js')], { cwd: ROOT, stdio: 'ignore' });
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-learn-pages.js')], { cwd: ROOT, stdio: 'ignore' });
}

function hashTree(relPaths) {
  const hash = crypto.createHash('sha256');
  for (const rel of relPaths.sort()) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      hash.update(rel);
      hash.update(fs.readFileSync(full));
    }
  }
  return hash.digest('hex');
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(path.relative(ROOT, full));
  }
  return out;
}

test('running both static-page builders twice in a row is idempotent', () => {
  runBuilders();
  const trackedFiles = [
    ...listFilesRecursive(path.join(ROOT, 'scams')),
    ...listFilesRecursive(path.join(ROOT, 'learn')),
    'sitemap.xml',
    'llms.txt',
  ];
  const firstRunHash = hashTree(trackedFiles);

  runBuilders();
  const secondRunHash = hashTree(trackedFiles);

  assert.equal(
    secondRunHash,
    firstRunHash,
    'build output changed on a second consecutive run with no source content change — a generator template has likely drifted from what it last produced'
  );
});
