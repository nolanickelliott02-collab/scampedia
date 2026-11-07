'use strict';

// Permanent IDs (Phase 1). Every entry is scampedia:<slug>; a published slug
// never changes, even if the title does (Nick, 2026-11-06).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { scampediaId, citationEvidence, SLUG_RE } = require('../lib/scampedia-ids');
const { recordPublishedSlugs, retireSlug, PUBLISHED_SLUGS_PATH } = require('../lib/published-slugs');
const { validate } = require('../lib/contracts');

const ROOT = path.join(__dirname, '..', '..');
const reports = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'reports.json'), 'utf8')).reports;
const lock = JSON.parse(fs.readFileSync(PUBLISHED_SLUGS_PATH, 'utf8'));

test('every entry has a valid, unique slug', () => {
  const slugs = reports.map((r) => r.slug);
  for (const s of slugs) assert.match(s, SLUG_RE);
  assert.equal(new Set(slugs).size, slugs.length, 'two entries share a slug');
});

test('no published slug has been renamed or dropped', () => {
  const current = new Set(reports.map((r) => r.slug));
  const missing = lock.slugs.filter((s) => !current.has(s));
  assert.deepEqual(missing, [], 'these published slugs disappeared. A slug never changes when a title does; to take an entry down, move its slug to "retired" with a reason');
});

test('every current slug is recorded (run npm run build:scams)', () => {
  const known = new Set(lock.slugs);
  assert.deepEqual(reports.map((r) => r.slug).filter((s) => !known.has(s)), []);
});

test('a retired slug is never reused', () => {
  const retired = new Set(lock.retired.map((r) => r.slug));
  assert.deepEqual(reports.map((r) => r.slug).filter((s) => retired.has(s)), []);
  for (const r of lock.retired) assert.ok(r.reason && r.retiredAt, `retired slug ${r.slug} needs a date and reason`);
});

test('scampediaId builds the contract ID and refuses bad slugs', () => {
  assert.equal(scampediaId('grandparent-emergency-scam'), 'scampedia:grandparent-emergency-scam');
  assert.throws(() => scampediaId('Bad Slug'));
  assert.throws(() => scampediaId('7'.replace('7', '')));
});

test('recording and retiring slugs in a scratch lock file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-slugs-'));
  const file = path.join(dir, 'published-slugs.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ note: '', slugs: ['a-scam'], retired: [] }));
    assert.deepEqual(recordPublishedSlugs([{ slug: 'a-scam' }, { slug: 'b-scam' }], file), ['b-scam']);
    assert.deepEqual(recordPublishedSlugs([{ slug: 'b-scam' }], file), [], 'never removes, never duplicates');
    assert.equal(retireSlug('a-scam', 'test', file), true);
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(after.slugs, ['b-scam']);
    assert.equal(after.retired[0].slug, 'a-scam');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('citationEvidence turns a real entry\'s source into a valid Evidence record', () => {
  const entry = reports.find((r) => /https:\/\/[^\s]*\.gov\//.test(r.source));
  const ev = citationEvidence(entry);
  assert.ok(validate('Evidence', ev).ok);
  assert.equal(ev.trusted, true);
  assert.equal(ev.scampediaId, `scampedia:${entry.slug}`);
});
