'use strict';

// Phrase false-positive check (2026-11-09): every phrase the app matches
// (api/patterns.json scamPatterns and aiTells) is run, with the app's exact
// matching rule (scripts/lib/phrase-match.js), against the hand-written safe
// set (scripts/lib/safe-messages.json: ordinary bank, pharmacy, family,
// delivery... messages). A phrase that would flag an ordinary message is
// reported; the script exits 1 so CI catches it.
//   node scripts/check-phrase-false-positives.js [--json]
const fs = require('fs');
const path = require('path');
const { containsPhrase } = require('./lib/phrase-match');

const ROOT = path.join(__dirname, '..');

function findFalsePositives(patterns, safeMessages) {
  const hits = [];
  for (const list of ['scamPatterns', 'aiTells']) {
    for (const phrase of patterns[list] || []) {
      const matched = safeMessages.filter((m) => containsPhrase(m.text, phrase));
      if (matched.length) hits.push({ list, phrase, messages: matched.map((m) => ({ type: m.type, text: m.text })) });
    }
  }
  return hits;
}

function main() {
  const patterns = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'patterns.json'), 'utf8'));
  const safe = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'safe-messages.json'), 'utf8')).messages;
  const hits = findFalsePositives(patterns, safe);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(hits, null, 2));
  } else if (!hits.length) {
    console.log(`No false positives: none of ${(patterns.scamPatterns || []).length + (patterns.aiTells || []).length} phrases matches any of ${safe.length} safe messages.`);
  } else {
    console.log(`${hits.length} phrase(s) would flag ordinary messages:`);
    for (const h of hits) {
      console.log(`- "${h.phrase}" (${h.list}) matches ${h.messages.length}:`);
      for (const m of h.messages) console.log(`    [${m.type}] ${m.text}`);
    }
  }
  if (hits.length) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { findFalsePositives };
