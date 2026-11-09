'use strict';

// The weekly digest push (Nick, 2026-11-09): one push per merged batch, leading
// with the entry most relevant to older US adults, opening a page for the batch.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { rankForOlderAdults, digestMessage, digestPagePath, priorityOf } = require('../lib/digest');
const { digestPageHtml, writeDigest } = require('../build-weekly-digest');

const entry = (id, title, category, datePublished = `2026-11-0${id % 9}T00:00:00Z`, summary = '') =>
  ({ id: String(id), slug: `s-${id}`, title, category, summary: summary || `${title} summary.`, datePublished });

// The real batch merged in #45.
const batch45 = [
  entry(129, 'Fake Concert & Event Ticket Resale Scam', 'Shopping Scam', '2026-11-07T20:37:24Z'),
  entry(130, 'Jewelry Swap Distraction Theft Scam', 'Shopping Scam', '2026-11-07T20:41:44Z'),
  entry(131, '"Bankruptcy Fraud Watchdog Group" Letter Scam', 'Government Scam', '2026-11-08T02:18:18Z'),
  entry(132, 'Prize-Linked Social Security Direct Deposit Redirect Scam', 'Government Scam', '2026-11-08T02:19:28Z'),
  entry(133, 'Fake Planning & Zoning Permit Fee Phishing Scam', 'Government Scam', '2026-11-08T20:54:07Z'),
  entry(134, 'End-of-Life Router Botnet Proxy Scam', 'Tech Scam', '2026-11-09T02:33:44Z'),
];

test('Medicare / Social Security first, then government, bank, family, then the rest', () => {
  const ranked = rankForOlderAdults([
    entry(1, 'Router Botnet Scam', 'Tech Scam'),
    entry(2, 'Grandson in Jail Call', 'Phone Scam'),
    entry(3, 'Fake Bank Fraud Department Text', 'Phone Scam'),
    entry(4, 'Fake IRS Warrant Call', 'Phone Scam'),
    entry(5, 'Medicare Card Replacement Call', 'Phone Scam'),
  ]);
  assert.deepEqual(ranked.map((r) => r.id), ['5', '4', '3', '2', '1']);
});

test('ties go to the newest entry', () => {
  const ranked = rankForOlderAdults([
    entry(1, 'Fake IRS Letter', 'Government Scam', '2026-11-01T00:00:00Z'),
    entry(2, 'Fake Jury Duty Call', 'Government Scam', '2026-11-05T00:00:00Z'),
  ]);
  assert.equal(ranked[0].id, '2');
});

test('the #45 batch leads with the Social Security entry', () => {
  assert.equal(
    digestMessage(batch45),
    '6 new scams this week, including the Prize-Linked Social Security Direct Deposit Redirect Scam.',
  );
  assert.equal(digestPagePath(batch45), 'new-129-134');
});

test('one entry and no entries', () => {
  assert.equal(digestMessage([batch45[5]]), '1 new scam this week: End-of-Life Router Botnet Proxy Scam.');
  assert.equal(digestMessage([]), '');
  assert.equal(digestPagePath([]), null);
});

test('a summary mention counts, not only the title', () => {
  assert.equal(priorityOf(entry(1, 'Prize Letter', 'Shopping Scam', undefined, 'Asks for your Medicare number.')), 0);
});

test('the page lists the whole batch, most relevant first, linking to each entry', () => {
  const html = digestPageHtml(batch45);
  assert.match(html, /<h1>This week's new scams<\/h1>/);
  assert.match(html, /6 new scams added to Scampedia this week/);
  const order = batch45.map((r) => html.indexOf(`href="${r.slug}.html"`));
  assert.ok(order.every((i) => i > 0));
  assert.ok(html.indexOf('href="s-132.html"') < html.indexOf('href="s-129.html"'));
  assert.match(html, /<link rel="canonical" href="https:\/\/scampedia\.net\/scams\/new-129-134\.html"/);
});

test('a growing batch replaces its older page, other batches stay', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-'));
  fs.writeFileSync(path.join(dir, 'new-120-128.html'), 'last week');
  writeDigest(batch45.slice(0, 3), dir);
  writeDigest(batch45, dir);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['new-120-128.html', 'new-129-134.html']);
});
