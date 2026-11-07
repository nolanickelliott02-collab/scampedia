'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { diffEntries, renderBlock, spliceBody, extractBlock, bodyMatches, START, END } = require('../lib/review-entries');

// Made-up entries.
const a = { id: '1', slug: 'fake-toll-text-scam', title: 'Fake Toll Text Scam', category: 'Text Scam' };
const b = { id: '2', slug: 'fake-roblox-tool-scam', title: 'Fake Roblox Tool Scam', category: 'Phone Scam' };
const c = { id: '3', slug: 'new-qr-code-scam', title: 'New QR Code Scam', category: 'Tech Scam' };

test('lists added, changed and removed entries by permanent ID', () => {
  const d = diffEntries([a, b], [{ ...b, category: 'Tech Scam' }, c]);
  assert.deepEqual(d.added.map((r) => r.slug), ['new-qr-code-scam']);
  assert.deepEqual(d.changed.map((x) => [x.entry.slug, x.fields]), [['fake-roblox-tool-scam', ['category']]]);
  assert.deepEqual(d.removed.map((r) => r.slug), ['fake-toll-text-scam']);
  const block = renderBlock(d);
  assert.match(block, /Goes live on merge \(1\)\*\*\n- `scampedia:new-qr-code-scam`: New QR Code Scam \(Tech Scam\)/);
  assert.match(block, /- `scampedia:fake-roblox-tool-scam`: Fake Roblox Tool Scam \(Tech Scam\): category/);
  assert.match(block, /Removed from the site \(1\)/);
});

test('held candidates and phrase proposals are listed, not counted as published', () => {
  const block = renderBlock(diffEntries([a], [a]), [
    { status: 'A', path: 'review/2026-11-06-parking-meter-qr-code-quishing-scam.json' },
    { status: 'M', path: 'review/phrase-queue.json' },
  ]);
  assert.match(block, /Goes live on merge \(0\)\*\*\n- none/);
  assert.match(block, /Held candidates \(not published\) \(1\)\*\*\n- `review\/2026-11-06-parking-meter-qr-code-quishing-scam.json`/);
  assert.match(block, /Proposed app phrases changed:\*\* yes/);
});

test('PR #38 case: a description written before the bot added an entry fails the check', () => {
  const written = renderBlock(diffEntries([a], [a]));
  const body = spliceBody('Weekly review batch. No new entries.', written);
  const afterBotRun = renderBlock(diffEntries([a], [a, b]));
  assert.equal(bodyMatches(body, written), true);
  assert.equal(bodyMatches(body, afterBotRun), false);
  assert.equal(bodyMatches(spliceBody(body, afterBotRun), afterBotRun), true, 'updating the description fixes it');
});

test('a description with no entry list fails the check', () => {
  assert.equal(bodyMatches('New entries from the Scampedia bots.', renderBlock(diffEntries([], [c]))), false);
  assert.equal(extractBlock('no markers here'), null);
});

test('splicing replaces only the list and keeps the rest of the description', () => {
  const body = `Intro text.\n\n${START}\nold list\n${END}\n\nNotes Nick added.`;
  const out = spliceBody(body, `${START}\nnew list\n${END}`);
  assert.equal(out, `Intro text.\n\n${START}\nnew list\n${END}\n\nNotes Nick added.`);
  assert.equal(spliceBody(out, `${START}\nnew list\n${END}`), out, 'running it again changes nothing');
});
