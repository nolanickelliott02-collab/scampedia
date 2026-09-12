'use strict';

// Regression test for the false-claim class of bug this project's own
// CLAUDE.md documents repeatedly: copy describing an intended/former
// mechanism instead of what the code actually does today. The homepage
// claimed "requires a person to merge each entry before it publishes" in
// six places (meta description, og:description, twitter:description,
// JSON-LD description, hero copy, and a "How It Works" step card) — false
// since commit ab386f8 replaced the human-merge step with an automated
// fact-check gate and started pushing straight to main. This locks that
// fix in so it can't silently regress the next time someone edits the
// hero or "How It Works" section.

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const INDEX_HTML = path.join(__dirname, '..', 'index.html');

const BANNED_PHRASES = [
  /requires a person to merge/i,
  /published only after a person merges/i,
  /can'?t publish anything without a human/i,
  /becomes a pull request/i,
  /reviews and merges it/i,
];

test('homepage never claims a human merges/reviews each entry before publish', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  for (const pattern of BANNED_PHRASES) {
    assert.doesNotMatch(
      html,
      pattern,
      `index.html still claims a human-merge step (matched ${pattern}) — the pipeline has pushed straight to main since commit ab386f8`
    );
  }
});

test('homepage describes the real mechanism (automated fact-check) instead', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  assert.match(
    html,
    /fact-check/i,
    'expected the homepage to describe the actual automated fact-check gate that replaced the human-merge step'
  );
});
