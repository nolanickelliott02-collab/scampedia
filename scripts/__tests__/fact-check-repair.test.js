'use strict';

// 2026-09-30: the cut-only repair pass that runs after a fact-check
// rejection (see reviseToSupportedClaims in scam-pipeline.js). Uses a fake
// client, same shape as triage.test.js, so no API key or network is needed.

const test = require('node:test');
const assert = require('node:assert/strict');
const { reviseToSupportedClaims } = require('../lib/scam-pipeline');

function fakeClient(input, stopReason = 'tool_use') {
  return {
    messages: {
      async create() {
        return { stop_reason: stopReason, content: [{ type: 'tool_use', name: 'submit_revised_entry', input }] };
      },
    },
  };
}

const REPORT = {
  id: '99',
  slug: 'fake-utility-shutoff-scam',
  title: 'Fake Utility Shutoff Scam',
  category: 'Phone Scam',
  summary: 'Callers threaten to cut your power today.',
  howItWorks: 'x'.repeat(200),
  redFlags: ['a', 'b', 'c'],
  safetyTips: ['a', 'b', 'c'],
  realExamples: ['A made-up town reported 40 victims.'],
  firstReported: '2020-07-15',
  source: 'FTC, https://consumer.ftc.gov/example',
};

const REVISED = {
  summary: 'Callers threaten to cut your power today unless you pay.',
  howItWorks: 'y'.repeat(200),
  redFlags: ['d', 'e', 'f'],
  safetyTips: ['g', 'h', 'i'],
  realExamples: ['The FTC describes callers demanding immediate payment.'],
  firstReported: '2024-08-14',
};

test('repair replaces only the editable fields and keeps identity/citation', async () => {
  const out = await reviseToSupportedClaims(fakeClient(REVISED), REPORT, 'made-up town', 'source text');
  assert.equal(out.title, REPORT.title);
  assert.equal(out.source, REPORT.source);
  assert.equal(out.id, REPORT.id);
  assert.deepEqual(out.realExamples, REVISED.realExamples);
  assert.equal(out.firstReported, '2024-08-14');
});

test('repair returns null for an unparseable firstReported date', async () => {
  const out = await reviseToSupportedClaims(fakeClient({ ...REVISED, firstReported: 'unknown' }), REPORT, 'x', 'source text');
  assert.equal(out, null);
});

test('repair returns null when the response was truncated', async () => {
  const out = await reviseToSupportedClaims(fakeClient(REVISED, 'max_tokens'), REPORT, 'x', 'source text');
  assert.equal(out, null);
});

// 2026-10-02: the fact-check result is decided per claim in code.
const { factCheckClaims } = require('../lib/scam-pipeline');

function fakeChecker(checkedClaims) {
  return { messages: { async create() { return { content: [{ type: 'tool_use', name: 'submit_fact_check', input: { checkedClaims } }] }; } } };
}
const ENTRY = { title: 't', summary: 's', howItWorks: 'h', redFlags: ['r'], realExamples: ['e'], firstReported: '2024-08-22' };

test('passes when every checked claim is supported (the 2026-10-02 false rejection)', async () => {
  const out = await factCheckClaims(fakeChecker([
    { claim: "fake report called an 'ASR report'", supported: true, reason: 'matches source' },
    { claim: 'First reported 2024-08-22', supported: true, reason: 'BBB article date' },
  ]), ENTRY, 'source text');
  assert.equal(out.ok, true);
});

test('fails and names only the unsupported claims', async () => {
  const out = await factCheckClaims(fakeChecker([
    { claim: 'tap report', supported: true, reason: 'matches' },
    { claim: "FTC warned about '.vin' sites", supported: false, reason: 'FTC and .vin not in source' },
  ]), ENTRY, 'source text');
  assert.equal(out.ok, false);
  assert.match(out.issues[0], /\.vin/);
  assert.doesNotMatch(out.issues[0], /tap report/);
});
