'use strict';

// Phase 5: "Search: fast, forgiving (typo-tolerant), and useful with zero
// results ('Try: ...' suggestions, link to categories)."

const test = require('node:test');
const assert = require('node:assert/strict');
const { levenshteinDistance, fuzzyMatchReports, suggestedCategories } = require('../search');

test('levenshteinDistance: identical strings are 0', () => {
  assert.equal(levenshteinDistance('scam', 'scam'), 0);
});

test('levenshteinDistance: one substitution is 1', () => {
  assert.equal(levenshteinDistance('grandparent', 'granoparent'), 1);
});

test('levenshteinDistance: one deletion is 1', () => {
  assert.equal(levenshteinDistance('grandparent', 'grandparnt'), 1);
});

const FIXTURE = [
  { title: 'Grandparent Emergency Scam', category: 'Phone Scam' },
  { title: 'Fake IRS Tax Refund Scam', category: 'Government Scam' },
  { title: 'Crypto Investment Scam', category: 'Investment Scam' },
];

test('fuzzyMatchReports: a one-letter typo in a real title word still matches', () => {
  const results = fuzzyMatchReports(FIXTURE, 'granparent'); // missing a "d"
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Grandparent Emergency Scam');
});

test('fuzzyMatchReports: a typo in a category word still matches', () => {
  const results = fuzzyMatchReports(FIXTURE, 'goverment'); // missing an "n"
  assert.equal(results.length, 1);
  assert.equal(results[0].category, 'Government Scam');
});

test('fuzzyMatchReports: a genuinely unrelated query matches nothing', () => {
  const results = fuzzyMatchReports(FIXTURE, 'xylophone');
  assert.equal(results.length, 0);
});

test('suggestedCategories: real categories from the actual data, deduped and sorted', () => {
  const withDupes = [...FIXTURE, { title: 'Another Phone Scam', category: 'Phone Scam' }];
  const suggestions = suggestedCategories(withDupes);
  assert.deepEqual(suggestions, ['Government Scam', 'Investment Scam', 'Phone Scam']);
});

test('suggestedCategories: respects the count limit', () => {
  const suggestions = suggestedCategories(FIXTURE, 2);
  assert.equal(suggestions.length, 2);
});
