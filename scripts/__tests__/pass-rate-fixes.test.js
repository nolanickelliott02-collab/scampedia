'use strict';

// 2026-10-02: fixes for the two non-fact-check reasons good candidates were
// rejected — search-tool <cite> markup in fields, and one dead link sinking
// an entry whose other cited sources were live.

const test = require('node:test');
const assert = require('node:assert/strict');
const { stripCiteMarkup, pruneDeadCitations } = require('../lib/scam-pipeline');

test('stripCiteMarkup removes cite tags but keeps their text, in nested fields', () => {
  const out = stripCiteMarkup({
    summary: 'Callers <cite index="3-1,3-2">threaten to cut power</cite> today.',
    redFlags: ['<cite index="1-4">Demands gift cards</cite>', 'plain'],
    confidence: 0.5,
  });
  assert.equal(out.summary, 'Callers threaten to cut power today.');
  assert.deepEqual(out.redFlags, ['Demands gift cards', 'plain']);
  assert.equal(out.confidence, 0.5);
});

test('pruneDeadCitations drops only the segments whose URL is dead', () => {
  const src = 'FTC, https://consumer.ftc.gov/node/76581; FBI Boston, https://www.fbi.gov/a-real-page; BBB, https://www.bbb.org/x';
  assert.equal(
    pruneDeadCitations(src, ['https://consumer.ftc.gov/node/76581']),
    'FBI Boston, https://www.fbi.gov/a-real-page; BBB, https://www.bbb.org/x',
  );
  assert.equal(pruneDeadCitations(src, []), src);
});
