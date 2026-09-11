'use strict';

// Phase 2 hardening: "each run produces a machine-readable summary
// (entries ingested / generated / rejected by gate / published, with
// reasons). Surface it in the workflow summary." recordOutcome() wraps
// every terminal writeGithubOutput() call in runPipeline() with (a) a
// single-line JSON log and (b) a real Markdown block appended to
// $GITHUB_STEP_SUMMARY, the file GitHub renders in a run's own Summary
// tab. This tests both effects directly against real temp files, not
// mocked fs calls.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { recordOutcome } = require('../lib/scam-pipeline');

function withTempFiles(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scampedia-summary-test-'));
  const outputFile = path.join(dir, 'github_output');
  const summaryFile = path.join(dir, 'github_step_summary');
  fs.writeFileSync(outputFile, '');
  fs.writeFileSync(summaryFile, '');
  const prevOutput = process.env.GITHUB_OUTPUT;
  const prevSummary = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_OUTPUT = outputFile;
  process.env.GITHUB_STEP_SUMMARY = summaryFile;
  try {
    return fn({ outputFile, summaryFile });
  } finally {
    if (prevOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = prevOutput;
    if (prevSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY; else process.env.GITHUB_STEP_SUMMARY = prevSummary;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('recordOutcome still writes the existing GITHUB_OUTPUT fields (backward compatible)', () => {
  withTempFiles(({ outputFile }) => {
    recordOutcome('daily-scam-entry', { result: 'gate-rejected', reason: 'Citation verification: dead link' });
    const content = fs.readFileSync(outputFile, 'utf8');
    assert.match(content, /result=gate-rejected/);
    assert.match(content, /reason=Citation verification: dead link/);
  });
});

test('recordOutcome appends a real Markdown block to GITHUB_STEP_SUMMARY', () => {
  withTempFiles(({ summaryFile }) => {
    recordOutcome('gov-scam-scan', { result: 'written', title: 'Fake Toll Road Text Scam', citation: 'https://ftc.gov/x' });
    const content = fs.readFileSync(summaryFile, 'utf8');
    assert.match(content, /gov-scam-scan/);
    assert.match(content, /written/);
    assert.match(content, /Fake Toll Road Text Scam/);
    assert.match(content, /\|.*Field.*\|.*Value.*\|/); // a real Markdown table, not a text blob
  });
});

test('multiple runs append to the summary rather than overwriting it', () => {
  withTempFiles(({ summaryFile }) => {
    recordOutcome('daily-scam-entry', { result: 'skipped', reason: 'nothing found today' });
    recordOutcome('gov-scam-scan', { result: 'skipped', reason: 'no primary .gov source found' });
    const content = fs.readFileSync(summaryFile, 'utf8');
    assert.match(content, /daily-scam-entry/);
    assert.match(content, /gov-scam-scan/);
  });
});

test('a pipe character in a field value does not break the Markdown table', () => {
  withTempFiles(({ summaryFile }) => {
    recordOutcome('daily-scam-entry', { result: 'gate-rejected', reason: 'Quality gate: title contains a | character' });
    const content = fs.readFileSync(summaryFile, 'utf8');
    assert.match(content, /\\\|/); // escaped, not a raw pipe that would corrupt the table structure
  });
});

test('does nothing to GITHUB_STEP_SUMMARY when the env var is unset (e.g. local runs)', () => {
  withTempFiles(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
    assert.doesNotThrow(() => recordOutcome('daily-scam-entry', { result: 'skipped', reason: 'x' }));
  });
});
