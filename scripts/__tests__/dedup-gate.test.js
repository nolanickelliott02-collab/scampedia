'use strict';

// Phase 2 hardening: idempotency/dedup on a stable key (normalized title +
// primary source URL), not exact string match. Before this, the only
// defense against a duplicate was the model's own judgment (the
// existingTitles list in the prompt) — a soft instruction a model could
// still fail to follow on a rename or a resubmitted source.

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkNotDuplicate } = require('../lib/scam-pipeline');

const EXISTING = [
  { id: '1', title: 'Grandparent Emergency Scam', source: 'FTC Consumer Alerts' },
  { id: '57', title: 'FTC Impersonator Fake Employee ID Refund Recovery Scam', source: 'Federal Trade Commission, https://consumer.ftc.gov/consumer-alerts/2026/06/real-ftc-employee-wont-text-you-their-photo-id-verify-their-identity' },
];

test('blocks an exact title match', () => {
  const result = checkNotDuplicate({ title: 'Grandparent Emergency Scam', source: 'Some other outlet, https://example.com/x' }, EXISTING);
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /normalized title matches/);
});

test('blocks a case/punctuation-varied title (normalized match)', () => {
  const result = checkNotDuplicate({ title: '  grandparent-emergency SCAM!! ', source: 'https://example.com/y' }, EXISTING);
  assert.equal(result.ok, false);
});

test('blocks a re-submission of the same primary source under a different title', () => {
  const result = checkNotDuplicate({
    title: 'FTC Employee Impersonation Text Scam', // different wording, same underlying story
    source: 'FTC, https://consumer.ftc.gov/consumer-alerts/2026/06/real-ftc-employee-wont-text-you-their-photo-id-verify-their-identity?utm_source=x',
  }, EXISTING);
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /same primary source/);
});

test('source-URL match ignores protocol, www., trailing slash, query string', () => {
  const result = checkNotDuplicate({
    title: 'Totally Different Title',
    source: 'http://WWW.consumer.ftc.gov/consumer-alerts/2026/06/real-ftc-employee-wont-text-you-their-photo-id-verify-their-identity/',
  }, EXISTING);
  assert.equal(result.ok, false);
});

test('allows a genuinely new title with a genuinely new source', () => {
  const result = checkNotDuplicate({
    title: 'Fake Toll Road Text Scam',
    source: 'FTC, https://consumer.ftc.gov/consumer-alerts/2025/05/toll-road-text-scam',
  }, EXISTING);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('two entries with no URL at all (org-name-only) still dedupe on title', () => {
  const result = checkNotDuplicate({ title: 'AARP Fraud Watch Network' }, [{ id: '7', title: 'Medicare / Health Insurance Scam', source: 'AARP Fraud Watch Network' }]);
  // Different titles, both sourceless -> title is the only signal, and
  // these titles differ, so this must NOT be flagged as a duplicate.
  assert.equal(result.ok, true);
});

test('a candidate already held for review counts as a duplicate (title or source)', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { loadHeldCandidates } = require('../lib/scam-pipeline');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-held-'));
  try {
    fs.writeFileSync(path.join(dir, '2026-11-01-ssa-badge.json'), JSON.stringify({
      botName: 'gov-scam-scan',
      candidate: { title: 'SSA Fake Badge Imposter Scam', source: 'SSA OIG, https://oig.ssa.gov/scam-alerts/2026-04-28-badges/' },
    }));
    fs.writeFileSync(path.join(dir, 'phrase-queue.json'), JSON.stringify({ phrases: [] }));
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
    const held = loadHeldCandidates(dir);
    assert.equal(held.length, 1);
    const sameSource = checkNotDuplicate({ title: 'SSA Real Employee Name Scam', source: 'https://www.oig.ssa.gov/scam-alerts/2026-04-28-badges' }, held);
    assert.equal(sameSource.ok, false);
    const sameTitle = checkNotDuplicate({ title: 'ssa fake badge imposter scam', source: 'https://example.com/z' }, held);
    assert.equal(sameTitle.ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
