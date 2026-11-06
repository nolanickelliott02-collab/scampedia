'use strict';

// The bots propose AI Brain phrases from each new entry. Since 2026-11-05
// they only queue them in review/phrase-queue.json; api/patterns.json (what
// the VerifyGuard app matches scans against) is frozen and changes only by
// hand. These cover the freeze and the guards that keep generic or invented
// phrases out of the queue.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { queueScamPhrases } = require('../lib/scam-pipeline');

function withFiles(scamPatterns, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-phrases-'));
  const patterns = path.join(dir, 'patterns.json');
  const queue = path.join(dir, 'review', 'phrase-queue.json');
  fs.writeFileSync(patterns, JSON.stringify({ version: 2, lastUpdated: '2026-05-27T00:00:00Z', scamPatterns, aiTells: ['x'] }));
  const before = fs.readFileSync(patterns, 'utf8');
  const readQueue = () => (fs.existsSync(queue) ? JSON.parse(fs.readFileSync(queue, 'utf8')) : null);
  try {
    fn((candidates) => queueScamPhrases(candidates, REPORT, patterns, queue), readQueue);
    assert.equal(fs.readFileSync(patterns, 'utf8'), before, 'patterns.json must never change');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const REPORT = {
  id: '200',
  title: 'Unpaid Toll Text Scam',
  summary: 'Texts claim you have an unpaid toll balance.',
  howItWorks: 'The message says your "Unpaid Toll" must be paid today or a late fee applies, and links to a fake site. It is your first notice, it says.',
  redFlags: ['A final notice of license suspension', 'Click here to pay'],
  realExamples: ['Recipients were told to visit a link to settle the balance.'],
};

test('queues grounded, specific phrases for review and leaves patterns.json alone', () => {
  withFiles(['irs', 'gift card'], (queue, readQueue) => {
    const added = queue(['Unpaid Toll', 'final notice of license suspension', 'first notice']);
    assert.deepEqual(added, ['unpaid toll', 'final notice of license suspension', 'first notice']);
    const q = readQueue();
    assert.deepEqual(q.phrases.map(p => p.phrase), added);
    assert.ok(q.phrases.every(p => p.status === 'pending' && p.entryId === '200' && p.entryTitle === REPORT.title && p.proposedAt));
  });
});

test('rejects generic, invented, single-word, and overlapping phrases', () => {
  withFiles(['gift card', 'late fee'], (queue, readQueue) => {
    const added = queue([
      'click here',            // generic
      'pay with bitcoin now',  // not in the entry text
      'toll',                  // one word
      'late fee applies',      // contains an existing pattern
    ]);
    assert.deepEqual(added, []);
    assert.equal(readQueue(), null);
  });
});

test('caps proposals at 3 per entry', () => {
  withFiles([], (queue) => {
    const added = queue(['unpaid toll', 'unpaid toll balance', 'first notice', 'late fee applies', 'fake site']);
    assert.equal(added.length, 3);
  });
});

test('a phrase already waiting in the queue is not queued twice', () => {
  withFiles([], (queue, readQueue) => {
    queue(['unpaid toll']);
    assert.deepEqual(queue(['unpaid toll']), []);
    assert.equal(readQueue().phrases.length, 1);
  });
});

test('a phrase found in an ordinary message is not queued', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-safe-'));
  const patterns = path.join(dir, 'patterns.json');
  const queue = path.join(dir, 'phrase-queue.json');
  const safe = path.join(dir, 'safe-messages.json');
  fs.writeFileSync(patterns, JSON.stringify({ version: 2, scamPatterns: [] }));
  fs.writeFileSync(safe, JSON.stringify({ messages: [{ type: 'job', text: 'We have courier roles open in your area.' }] }));
  const report = {
    id: '300', title: 'Fake Courier Job Scam',
    summary: 'Ads for courier roles lead to a fake insurance payment.',
    howItWorks: 'The ad offers courier roles, then asks for an upfront insurance deposit.',
    redFlags: ['An upfront insurance deposit'], realExamples: [],
  };
  try {
    const added = queueScamPhrases(['courier roles', 'upfront insurance deposit'], report, patterns, queue, safe);
    assert.deepEqual(added, ['upfront insurance deposit']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the real safe-message set blocks the three phrases rejected on 2026-11-05 where they are ordinary', () => {
  const { loadSafeMessages } = require('../lib/scam-pipeline');
  const safe = loadSafeMessages();
  assert.ok(safe.length >= 30);
  assert.ok(safe.some(m => m.includes(' courier roles ')));
});
