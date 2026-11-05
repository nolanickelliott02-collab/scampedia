'use strict';

// notify-new-entries.yml pushes one notification per merge to main, for the
// newest entry that merge made live.

const test = require('node:test');
const assert = require('node:assert/strict');
const { newlyPublished, oneLine } = require('../newly-published');

const before = { reports: [{ id: '1', title: 'Old', datePublished: '2026-10-01T00:00:00Z' }] };

test('finds only entries that weren\'t there before, newest first', () => {
  const after = { reports: [
    ...before.reports,
    { id: '2', title: 'Monday', datePublished: '2026-11-02T00:00:00Z' },
    { id: '3', title: 'Friday', datePublished: '2026-11-06T00:00:00Z' },
  ] };
  assert.deepEqual(newlyPublished(before, after).map(r => r.title), ['Friday', 'Monday']);
});

test('an edit to an existing entry is not a new entry', () => {
  const after = { reports: [{ ...before.reports[0], title: 'Old, corrected' }] };
  assert.deepEqual(newlyPublished(before, after), []);
});

test('output values are kept on one line', () => {
  assert.equal(oneLine('Line one\nline two  '), 'Line one line two');
  assert.equal(oneLine(undefined), '');
});
