'use strict';

// Phase 2 hardening: "document and script a one-command rollback of the
// last publish." Tests the pure logic directly, plus a real end-to-end run
// of the CLI script (as a child process) against a temp fixture repo copy
// — never against the real api/reports.json or scams/ directory.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickMostRecentReport, removeReportById } = require('../lib/rollback');

const FIXTURE_REPORTS = {
  version: 5,
  lastUpdated: '2026-09-11T19:21:49.545Z',
  reports: [
    { id: '1', slug: 'old-scam', title: 'Old Legacy Scam', datePublished: '2020-01-01T00:00:00Z', source: 'FTC Consumer Alerts' },
    { id: '60', slug: 'second-newest-scam', title: 'Second Newest Scam', datePublished: '2026-08-27T04:13:42.927Z', source: 'FTC, https://ftc.gov/x' },
    { id: '61', slug: 'newest-scam', title: 'Newest Scam', datePublished: '2026-09-11T19:21:49.545Z', source: 'FTC, https://ftc.gov/y' },
  ],
};

// ---- pure lib functions ----

test('pickMostRecentReport picks the max datePublished, not array position or id order', () => {
  const shuffled = [FIXTURE_REPORTS.reports[1], FIXTURE_REPORTS.reports[0], FIXTURE_REPORTS.reports[2]];
  const picked = pickMostRecentReport(shuffled);
  assert.equal(picked.id, '61');
});

test('pickMostRecentReport returns null for an empty list', () => {
  assert.equal(pickMostRecentReport([]), null);
});

test('removeReportById removes the right entry and advances version/lastUpdated', () => {
  const before = JSON.parse(JSON.stringify(FIXTURE_REPORTS));
  const after = removeReportById(before, '61');
  assert.deepEqual(after.reports.map(r => r.id), ['1', '60']);
  assert.equal(after.version, before.version + 1);
  assert.notEqual(after.lastUpdated, before.lastUpdated);
  // does not mutate the input
  assert.equal(before.reports.length, 3);
});

test('removeReportById throws on an unknown id (never silently no-ops)', () => {
  assert.throws(() => removeReportById(FIXTURE_REPORTS, 'not-a-real-id'), /No report with id/);
});

// ---- real CLI, against a temp fixture repo copy ----

function makeFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-rollback-test-'));
  fs.mkdirSync(path.join(dir, 'api'));
  fs.mkdirSync(path.join(dir, 'scams'));
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'api', 'reports.json'), JSON.stringify(FIXTURE_REPORTS, null, 2));
  for (const r of FIXTURE_REPORTS.reports) {
    fs.writeFileSync(path.join(dir, 'scams', `${r.slug}.html`), `<html><!-- ${r.title} --></html>`);
  }
  // Real scripts, copied in so `require('./lib/rollback')` resolves the
  // same way it does in the real repo, against a throwaway copy of the data.
  fs.copyFileSync(path.join(__dirname, '..', 'rollback-last-entry.js'), path.join(dir, 'scripts', 'rollback-last-entry.js'));
  fs.copyFileSync(path.join(__dirname, '..', 'lib', 'rollback.js'), path.join(dir, 'scripts', 'lib', 'rollback.js'));
  return dir;
}

test('CLI --dry-run changes nothing', () => {
  const dir = makeFixtureRepo();
  try {
    const output = execFileSync('node', [path.join(dir, 'scripts', 'rollback-last-entry.js'), '--dry-run'], { encoding: 'utf8' });
    assert.match(output, /Newest Scam/);
    assert.match(output, /dry run/);
    const stillThere = JSON.parse(fs.readFileSync(path.join(dir, 'api', 'reports.json'), 'utf8'));
    assert.equal(stillThere.reports.length, 3);
    assert.ok(fs.existsSync(path.join(dir, 'scams', 'newest-scam.html')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI with no args rolls back the most recently PUBLISHED entry (not highest id, not array-last)', () => {
  const dir = makeFixtureRepo();
  try {
    execFileSync('node', [path.join(dir, 'scripts', 'rollback-last-entry.js')], { encoding: 'utf8' });
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'api', 'reports.json'), 'utf8'));
    assert.deepEqual(after.reports.map(r => r.id), ['1', '60']);
    assert.ok(!fs.existsSync(path.join(dir, 'scams', 'newest-scam.html')), 'the rolled-back entry\'s page must be deleted');
    assert.ok(fs.existsSync(path.join(dir, 'scams', 'second-newest-scam.html')), 'other pages must be untouched');
    assert.ok(fs.existsSync(path.join(dir, 'scams', 'old-scam.html')), 'other pages must be untouched');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI with an explicit id rolls back that entry regardless of recency', () => {
  const dir = makeFixtureRepo();
  try {
    execFileSync('node', [path.join(dir, 'scripts', 'rollback-last-entry.js'), '1'], { encoding: 'utf8' });
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'api', 'reports.json'), 'utf8'));
    assert.deepEqual(after.reports.map(r => r.id), ['60', '61']);
    assert.ok(!fs.existsSync(path.join(dir, 'scams', 'old-scam.html')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI with an unknown explicit id exits non-zero and changes nothing', () => {
  const dir = makeFixtureRepo();
  try {
    assert.throws(() => execFileSync('node', [path.join(dir, 'scripts', 'rollback-last-entry.js'), 'nope'], { encoding: 'utf8' }));
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'api', 'reports.json'), 'utf8'));
    assert.equal(after.reports.length, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
