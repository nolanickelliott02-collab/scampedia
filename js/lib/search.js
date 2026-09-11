// Typo-tolerant search fallback + zero-results suggestions. Phase 5:
// "Search: fast, forgiving (typo-tolerant), and useful with zero results
// ('Try: ...' suggestions, link to categories)." Plain script (no bundler
// on this site), loaded before app.js in the browser; also exported via
// module.exports for the Node test suite. Keep free of `document`/`window`.

// Standard Levenshtein edit distance — the simplest real fuzzy-match
// primitive, no library needed for something this small.
function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// Longer words tolerate one more typo than short ones — a 1-character typo
// in a 4-letter word is a much bigger relative change than the same typo
// in a 10-letter word.
function maxTypoDistance(word) {
  return word.length > 6 ? 2 : 1;
}

// Exact substring match is tried first by the caller and is always
// preferred; this is only the fallback when that returns nothing, so it
// deliberately doesn't need to be fast against a huge corpus — this site's
// entry count is in the dozens, not thousands.
function fuzzyMatchReports(reports, query) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return [];

  return reports.filter(r => {
    const candidateWords = [
      ...r.title.toLowerCase().split(/\s+/),
      ...r.category.toLowerCase().split(/\s+/),
    ].filter(w => w.length > 2); // skip tiny words ("a", "or") — too easy to false-match

    return queryWords.some(qw =>
      qw.length > 2 && candidateWords.some(w => levenshteinDistance(qw, w) <= maxTypoDistance(qw))
    );
  });
}

// Real, grounded suggestions for a genuine zero-results page — actual
// category names from the live database, never invented examples. Picks up
// to 3, in a stable (alphabetical) order so the suggestions don't reshuffle
// on every render of the same empty state.
function suggestedCategories(reports, count = 3) {
  const categories = [...new Set(reports.map(r => r.category))].sort();
  return categories.slice(0, count);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { levenshteinDistance, fuzzyMatchReports, suggestedCategories };
}
