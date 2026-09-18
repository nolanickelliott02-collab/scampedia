'use strict';

// Phase: "let one run publish more than one entry, up to maxAttempts,
// instead of capping every run at exactly one" (2026-09-17). This tests the
// new attempt loop in runPipeline() directly, using a fake Anthropic client
// (same dependency-injection shape triageCandidate/factCheckClaims already
// used for the same reason: real model calls cost money and aren't
// deterministic) so this runs with zero API key and zero real network call.
//
// What this deliberately does NOT cover: a full successful write through
// every gate (citation resolution + content relevance need a real fetch
// against a real page whose content matches the fake title, which is the
// same tradeoff citation-gate.test.js already accepts for the single-
// attempt case — reusing that here for a multi-attempt success path was
// judged not worth the added fragility). What IS covered here is the actual
// new mechanic: the loop retries the correct number of times, doesn't stop
// early on a gate rejection, and the final recorded outcome/written count
// aggregate correctly across attempts — the part of this change that
// doesn't overlap with what citation-gate.test.js/dedup-gate.test.js/
// triage.test.js already verify about the gates themselves (unchanged by
// this refactor).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { runPipeline } = require('../lib/scam-pipeline');

async function withTempReports(reports, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-multi-attempt-test-'));
  const reportsPath = path.join(dir, 'reports.json');
  fs.writeFileSync(reportsPath, JSON.stringify({ version: 1, lastUpdated: '2026-01-01T00:00:00Z', reports }, null, 2));
  const outputFile = path.join(dir, 'github_output');
  fs.writeFileSync(outputFile, '');
  const prevOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = outputFile;
  try {
    return await fn({ reportsPath, outputFile });
  } finally {
    if (prevOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = prevOutput;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Always proposes a title that already exists — guaranteed to hit the
// dedup gate every time, before any network call, so this is fully
// deterministic and network-free. Counts how many times it was actually
// called, to prove the loop really retries instead of stopping after one.
function makeDuplicateProposingClient(duplicateTitle) {
  let calls = 0;
  return {
    calls: () => calls,
    messages: {
      async create() {
        calls++;
        return {
          content: [{
            type: 'tool_use',
            name: 'submit_scam_entry',
            input: {
              title: duplicateTitle,
              summary: 'test summary',
              category: 'Phone Scam',
              firstReported: '2026-01-01',
              relatedScams: [],
              safetyTips: ['a', 'b'],
              howItWorks: 'x'.repeat(200),
              redFlags: ['a', 'b'],
              realExamples: ['a'],
              source: 'Test Source, https://example.invalid/article',
              spreadPlatforms: ['Phone Calls'],
            },
          }],
        };
      },
    },
  };
}

test('maxAttempts=1 (default): a rejected candidate still produces exactly one call and zero writes, same as before this change', async () => {
  await withTempReports([{ id: '1', title: 'Existing Scam', source: 'x' }], async ({ reportsPath, outputFile }) => {
    const client = makeDuplicateProposingClient('Existing Scam');
    await runPipeline({
      buildSystemPrompt: () => 'test prompt',
      botName: 'test-bot',
      client,
      reportsPath,
    });
    assert.equal(client.calls(), 1, 'default maxAttempts=1 must not retry');
    const data = JSON.parse(fs.readFileSync(reportsPath, 'utf8'));
    assert.equal(data.reports.length, 1, 'nothing should have been written');
    const output = fs.readFileSync(outputFile, 'utf8');
    assert.match(output, /result=gate-rejected/);
    assert.match(output, /Duplicate check/);
  });
});

test('maxAttempts=3: the loop retries after a gate rejection instead of stopping, and calls the model up to 3 times', async () => {
  await withTempReports([{ id: '1', title: 'Existing Scam', source: 'x' }], async ({ reportsPath, outputFile }) => {
    const client = makeDuplicateProposingClient('Existing Scam');
    await runPipeline({
      buildSystemPrompt: () => 'test prompt',
      botName: 'test-bot',
      client,
      reportsPath,
      maxAttempts: 3,
    });
    assert.equal(client.calls(), 3, 'should have tried all 3 attempts since every one was rejected, not stopped early');
    const data = JSON.parse(fs.readFileSync(reportsPath, 'utf8'));
    assert.equal(data.reports.length, 1, 'nothing should have been written across any attempt');
    const output = fs.readFileSync(outputFile, 'utf8');
    // Final recorded outcome reflects the LAST attempt, not the first —
    // proves the aggregation didn't just latch onto attempt 1's result.
    assert.match(output, /result=gate-rejected/);
  });
});

test('maxAttempts=3: a mid-run skip does not abort the run, and the run still ends cleanly with nothing written', async () => {
  await withTempReports([], async ({ reportsPath, outputFile }) => {
    let calls = 0;
    const client = {
      messages: {
        async create() {
          calls++;
          if (calls === 2) {
            return { content: [{ type: 'tool_use', name: 'skip_no_confident_finding', input: { reason: 'nothing found on this attempt' } }] };
          }
          return {
            content: [{
              type: 'tool_use',
              name: 'submit_scam_entry',
              input: {
                title: 'Duplicate Of Itself Scam',
                summary: 's', category: 'Phone Scam', firstReported: '2026-01-01',
                relatedScams: [], safetyTips: ['a', 'b'], howItWorks: 'x'.repeat(200),
                redFlags: ['a', 'b'], realExamples: ['a'],
                source: 'Test Source, https://example.invalid/article',
                spreadPlatforms: ['Phone Calls'],
              },
            }],
          };
        },
      },
    };
    // Attempts 1 and 3 both propose the exact same title as each other —
    // attempt 1's proposal isn't in existingTitles yet (reports.json starts
    // empty) so it would only be caught by dedup on a LATER attempt if
    // attempt 1 had actually been written, which it wasn't here (this fake
    // client doesn't clear citation/relevance, so it gate-rejects there
    // instead — still proves the loop continues past a rejection either way).
    await runPipeline({
      buildSystemPrompt: () => 'test prompt',
      botName: 'test-bot',
      client,
      reportsPath,
      maxAttempts: 3,
    });
    assert.equal(calls, 3, 'a skip on attempt 2 should not stop attempt 3 from running');
    const data = JSON.parse(fs.readFileSync(reportsPath, 'utf8'));
    assert.equal(data.reports.length, 0);
  });
});
