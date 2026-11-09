'use strict';

// Phrase false-positive check (2026-11-09): the app's matching rule, run over
// every published phrase against the hand-written safe set. CI fails on any
// false positive that isn't already listed in phrase-false-positive-known.json.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { containsPhrase, ENDINGS } = require('../lib/phrase-match');
const { findFalsePositives } = require('../check-phrase-false-positives');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// The same cases as the app (PhraseMatcherTests.swift) and the server
// (tests/fusion/phase2.test.js), so all three matchers stay identical.
test('matcher: the shared cases', () => {
  const yes = [
    ['The IRS says you owe.', 'irs'], ['Call the IRS!', 'irs'], ['(irs) notice', 'irs'], ['Buy 3 Gift Cards now', 'gift cards'],
    ["I'm in jail, need bail.", 'jail'], ['First of all, the IRS called.', 'irs'],
    ['Your license will be revoked.', 'revoke'], ['Your card expired yesterday', 'expire'], ['You were refunded $20', 'refund'],
    ['Please reply urgently', 'urgent'], ['Two warrants are out', 'warrant'], ['Refunds processing', 'refund'],
    ['Stop sending gift cards', 'gift card'], ['She is expiring soon', 'expir'], ['act nowly', 'act now'],
  ];
  const no = [
    ['First, read this.', 'irs'], ['Take the stairs.', 'irs'], ['That bag is theirs.', 'irs'], ['upstairs', 'irs'],
    ['Our jailbreak guide', 'jail'], ['an accidental tap', 'accident'], ['gift cardboard box', 'gift card'],
    ['The insurgent forces', 'urgent'], ['Your warranty is active', 'warrant'], ['Refundable deposit', 'refund'],
    ['urgentlyish', 'urgent'], ['giftcards', 'gift card'], ['gifts card', 'gift card'], ['anything', ''], ['anything', '   '],
  ];
  for (const [t, p] of yes) assert.equal(containsPhrase(t, p), true, `${p} in "${t}"`);
  for (const [t, p] of no) assert.equal(containsPhrase(t, p), false, `${p} in "${t}"`);
  assert.deepEqual(ENDINGS, ['s', 'es', 'ed', 'd', 'ing', 'ly']);
});

test('no NEW published phrase flags an ordinary message from the safe set', () => {
  const hits = findFalsePositives(read('api/patterns.json'), read('scripts/lib/safe-messages.json').messages);
  const known = new Set(read('scripts/lib/phrase-false-positive-known.json').phrases);
  const fresh = hits.filter((h) => !known.has(h.phrase));
  assert.deepEqual(fresh.map((h) => `${h.phrase} -> ${h.messages[0].text}`), []);
});

test('the known list holds only phrases that still match (stale entries are removed)', () => {
  const hits = new Set(findFalsePositives(read('api/patterns.json'), read('scripts/lib/safe-messages.json').messages).map((h) => h.phrase));
  for (const p of read('scripts/lib/phrase-false-positive-known.json').phrases) assert.ok(hits.has(p), `"${p}" no longer matches; remove it from the known list`);
});

test('the check finds a false positive and ignores a safe phrase', () => {
  const safe = [{ type: 'pharmacy', text: 'Your prescription is ready for pickup.' }];
  const hits = findFalsePositives({ scamPatterns: ['prescription is ready', 'wire transfer'], aiTells: [] }, safe);
  assert.deepEqual(hits.map((h) => h.phrase), ['prescription is ready']);
});
