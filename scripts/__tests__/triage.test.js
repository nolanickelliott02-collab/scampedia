'use strict';

// Phase 3b: "Add a triage step before generation that scores each
// candidate... Output structured JSON. Log every decision. Candidates
// below a confidence threshold go to a review queue, not to publication.
// This step must never invent information not present in the source."
//
// triageCandidate() takes the same shared `client` runPipeline already
// builds — a fake with the same shape as the real Anthropic SDK response
// lets this run with zero API key and zero real network call, while still
// exercising the exact code path runPipeline uses.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { triageCandidate, writeToReviewQueue } = require('../lib/scam-pipeline');

function fakeClient(input) {
  return {
    messages: {
      async create() {
        return { content: [{ type: 'tool_use', name: 'submit_triage', input }] };
      },
    },
  };
}

const CANDIDATE = {
  title: 'Fake Toll Road Text Scam',
  slug: 'fake-toll-road-text-scam',
  category: 'Delivery Scam',
  summary: 'A text claims you owe unpaid toll fees.',
  howItWorks: 'Scammers text a fake toll-payment link.',
};

const EXISTING = [{ id: '1', title: 'Package Delivery Text Scam', category: 'Delivery Scam' }];

test('a high-confidence, distinct candidate passes triage', async () => {
  const client = fakeClient({
    isDistinctPattern: true, duplicateOf: null, novelty: 'new', severity: 'medium', urgency: 'medium',
    sourceCredibility: 'government-agency', suggestedCategory: 'Delivery Scam', suggestedAliases: [],
    confidence: 0.9, reasoning: 'Genuinely distinct pattern, well-sourced.',
  });
  const result = await triageCandidate(client, CANDIDATE, EXISTING, 'source text here');
  assert.equal(result.ok, true);
  assert.equal(result.passed, true);
});

test('a low-confidence candidate does NOT pass, even if marked distinct', async () => {
  const client = fakeClient({
    isDistinctPattern: true, duplicateOf: null, novelty: 'new', severity: 'low', urgency: 'low',
    sourceCredibility: 'other', suggestedCategory: 'Delivery Scam', suggestedAliases: [],
    confidence: 0.3, reasoning: 'Thin sourcing, uncertain this is a real distinct trend.',
  });
  const result = await triageCandidate(client, CANDIDATE, EXISTING, 'source text here');
  assert.equal(result.ok, true); // the triage step itself ran fine
  assert.equal(result.passed, false); // but the candidate doesn't clear the bar
  assert.match(result.issues[0], /confidence 0\.3/);
});

test('a candidate flagged as a duplicate/variant does NOT pass regardless of confidence', async () => {
  const client = fakeClient({
    isDistinctPattern: false, duplicateOf: 'Package Delivery Text Scam', novelty: 'known-variant', severity: 'medium', urgency: 'medium',
    sourceCredibility: 'established-outlet', suggestedCategory: 'Delivery Scam', suggestedAliases: [],
    confidence: 0.95, reasoning: 'Same underlying pattern as an existing entry, different wrapper.',
  });
  const result = await triageCandidate(client, CANDIDATE, EXISTING, 'source text here');
  assert.equal(result.passed, false);
  assert.match(result.issues[0], /possible duplicate of "Package Delivery Text Scam"/);
});

test('a missing tool call is a real triage-pass failure, not a silent pass', async () => {
  const client = { messages: { async create() { return { content: [] }; } } };
  const result = await triageCandidate(client, CANDIDATE, EXISTING, 'source text here');
  assert.equal(result.ok, false);
  assert.equal(result.passed, false);
});

test('writeToReviewQueue writes a real file under review/ with the full assessment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-review-test-'));
  const prevCwd = process.cwd();
  try {
    // writeToReviewQueue resolves REVIEW_DIR relative to the lib file's own
    // location (../../review from scripts/lib/), not cwd — so just check
    // it wrote *somewhere real* and the content round-trips correctly,
    // without assuming a particular cwd.
    const assessment = { isDistinctPattern: true, confidence: 0.9, reasoning: 'test' };
    const filePath = writeToReviewQueue('daily-scam-entry', CANDIDATE, assessment);
    assert.ok(fs.existsSync(filePath));
    const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(written.botName, 'daily-scam-entry');
    assert.equal(written.candidate.title, CANDIDATE.title);
    assert.deepEqual(written.triage, assessment);
    fs.unlinkSync(filePath); // clean up — this really does write into the repo's real review/ dir
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
