'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sortReportsByNewest, sortReportsAlphabetically } = require('../report-sort');

// Fixture shaped like the real bug: api/reports.json's array order is
// insertion order (the 40-entry 2026-05-27 launch batch first, id "1"..40,
// dates from 1920-2023), with AI-discovered entries appended afterward in
// publish order. "Newest" must mean datePublished descending, not array
// position — this is exactly the mismatch that made the homepage preview
// widget show the same three pre-2024 launch entries forever.
const LAUNCH_ORDER_FIXTURE = [
  { id: '1', title: 'Grandparent Emergency Scam', datePublished: '2020-01-01T00:00:00Z' },
  { id: '2', title: 'AI Voice Clone Scam', datePublished: '2023-03-15T00:00:00Z' },
  { id: '3', title: 'Fake IRS Tax Refund Scam', datePublished: '2015-06-01T00:00:00Z' },
  { id: '60', title: 'Health Insurer + Chinese Law Enforcement Impersonation Extortion Scam', datePublished: '2026-08-27T04:13:42.927Z' },
  { id: '61', title: 'Virtual Casting Call Text Scam', datePublished: '2026-09-11T19:21:49.545Z' },
];

test('sorts strictly by datePublished, most recent first', () => {
  const sorted = sortReportsByNewest(LAUNCH_ORDER_FIXTURE);
  assert.deepEqual(sorted.map(r => r.id), ['61', '60', '2', '1', '3']);
});

test('the most recently published entry is never buried behind array position', () => {
  // This is the concrete bug: a naive `reports.slice(0, 3)` on this exact
  // fixture returns ids ['1', '2', '3'] — the newest real entry (id '61',
  // published today) would never appear in a 3-item "Latest Entries" widget.
  const top3 = sortReportsByNewest(LAUNCH_ORDER_FIXTURE).slice(0, 3);
  assert.ok(top3.some(r => r.id === '61'), 'newest entry must be in the top 3');
  assert.deepEqual(top3.map(r => r.id), ['61', '60', '2']);
});

test('falls back to firstReported when datePublished is missing', () => {
  const fixture = [
    { id: 'a', title: 'Old', firstReported: '2010-01-01T00:00:00Z' },
    { id: 'b', title: 'New', firstReported: '2024-01-01T00:00:00Z' },
  ];
  assert.deepEqual(sortReportsByNewest(fixture).map(r => r.id), ['b', 'a']);
});

test('does not mutate the input array', () => {
  const original = [...LAUNCH_ORDER_FIXTURE];
  sortReportsByNewest(LAUNCH_ORDER_FIXTURE);
  assert.deepEqual(LAUNCH_ORDER_FIXTURE, original);
});

// A-Z index sort. Confirmed already correct in production during the same
// Phase 0 audit that found the "newest" bug above — this locks that in so
// it can't regress unnoticed the way the newest-sort's duplicate definition
// did.
test('sortReportsAlphabetically sorts by title, A-Z', () => {
  const fixture = [
    { title: 'Wangiri / One-Ring Callback Scam' },
    { title: 'AI Voice Clone Scam' },
    { title: '"Can You Hear Me?" Robocall Scam' },
    { title: 'Grandparent Emergency Scam' },
  ];
  const sorted = sortReportsAlphabetically(fixture).map(r => r.title);
  // localeCompare (en-US, this project's only audience) sorts the leading
  // `"` before letters — confirmed directly, not assumed — so the quoted
  // title sorts first here despite starting with "C".
  assert.deepEqual(sorted, [
    '"Can You Hear Me?" Robocall Scam',
    'AI Voice Clone Scam',
    'Grandparent Emergency Scam',
    'Wangiri / One-Ring Callback Scam',
  ]);
});

test('sortReportsAlphabetically does not mutate the input array', () => {
  const fixture = [{ title: 'B' }, { title: 'A' }];
  const original = [...fixture];
  sortReportsAlphabetically(fixture);
  assert.deepEqual(fixture, original);
});
