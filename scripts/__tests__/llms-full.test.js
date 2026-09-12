'use strict';

// Phase 4 discoverability: "Add llms.txt and llms-full.txt at the root
// describing the site and linking entries." llms.txt already existed;
// llms-full.txt is new — this is the same structure with every linked
// resource's actual content inlined. Black-box test (real child process,
// same pattern as build-idempotency.test.js) rather than a refactor to
// make build-learn-pages.js's internals independently importable — that
// script already runs main() unconditionally at load time by design.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const LLMS_FULL_PATH = path.join(ROOT, 'llms-full.txt');

test('build:learn produces llms-full.txt with real inlined content, no leftover placeholders', () => {
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-scam-pages.js')], { cwd: ROOT, stdio: 'ignore' });
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-learn-pages.js')], { cwd: ROOT, stdio: 'ignore' });

  assert.ok(fs.existsSync(LLMS_FULL_PATH), 'llms-full.txt must be written');
  const content = fs.readFileSync(LLMS_FULL_PATH, 'utf8');

  // A real lesson's full body content, not just its title/link.
  assert.match(content, /Speed matters more here than anything else on this page/);
  // The volatile-fact placeholder must be resolved to its real content,
  // never left as a literal unresolved {{volatile:...}} token.
  assert.doesNotMatch(content, /\{\{volatile:/);
  // At least one real scam-database entry's full mechanics, not just its title.
  const reports = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'reports.json'), 'utf8')).reports;
  const sample = reports[0];
  assert.match(content, new RegExp(`## Scam Database: ${sample.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.ok(content.includes(sample.howItWorks), "a sampled scam entry's real howItWorks text must be inlined, not summarized away");
});
