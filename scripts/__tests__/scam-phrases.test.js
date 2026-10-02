'use strict';

// 2026-10-02: published entries grow api/patterns.json, the phrase list the
// VerifyGuard app's AI Brain matches scans against. These cover the guards
// that keep generic or invented phrases out of it.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { addScamPhrases } = require('../lib/scam-pipeline');

function withPatterns(scamPatterns, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-phrases-'));
  const file = path.join(dir, 'patterns.json');
  fs.writeFileSync(file, JSON.stringify({ version: 2, lastUpdated: '2026-05-27T00:00:00Z', scamPatterns, aiTells: ['x'] }));
  try { return fn(file, () => JSON.parse(fs.readFileSync(file, 'utf8'))); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const REPORT = {
  summary: 'Texts claim you have an unpaid toll balance.',
  howItWorks: 'The message says your "Unpaid Toll" must be paid today or a late fee applies, and links to a fake site. It is your first notice, it says.',
  redFlags: ['A final notice of license suspension', 'Click here to pay'],
  realExamples: ['Recipients were told to visit a link to settle the balance.'],
};

test('adds grounded, specific phrases and bumps the version', () => {
  withPatterns(['irs', 'gift card'], (file, read) => {
    const added = addScamPhrases(['Unpaid Toll', 'final notice of license suspension', 'first notice'], REPORT, file);
    assert.deepEqual(added, ['unpaid toll', 'final notice of license suspension', 'first notice']);
    const p = read();
    assert.equal(p.version, 3);
    assert.ok(p.scamPatterns.includes('unpaid toll'));
    assert.deepEqual(p.aiTells, ['x']);
  });
});

test('rejects generic, invented, single-word, and overlapping phrases', () => {
  withPatterns(['gift card', 'late fee'], (file, read) => {
    const added = addScamPhrases([
      'click here',            // generic
      'pay with bitcoin now',  // not in the entry text
      'toll',                  // one word
      'late fee applies',      // contains an existing pattern
    ], REPORT, file);
    assert.deepEqual(added, []);
    assert.equal(read().version, 2);
  });
});

test('caps additions at 3 per entry', () => {
  withPatterns([], (file) => {
    const added = addScamPhrases(['unpaid toll', 'unpaid toll balance', 'first notice', 'late fee applies', 'fake site'], REPORT, file);
    assert.equal(added.length, 3);
  });
});
