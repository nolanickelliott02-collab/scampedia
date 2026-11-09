'use strict';

// US-focus gate (2026-11-09): entries for US readers, with US sources and terms.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { usFocusIssues, findQualityIssues } = require('../lib/scam-pipeline');

const base = (over = {}) => ({
  title: 'Fake toll texts', summary: 'Texts claim you owe an unpaid toll and link to a fake payment page.',
  howItWorks: 'x'.repeat(160), source: 'FTC, https://consumer.ftc.gov/consumer-alerts/2025/01/toll-scam',
  safetyTips: ['Do not click', 'Check your toll account directly'], redFlags: ['Small fee', 'Urgent deadline'],
  realExamples: ['A driver in Texas got a text saying they owed $4.15.'], ...over,
});

test('a US entry with a US source passes', () => {
  assert.deepEqual(usFocusIssues(base()), []);
});

test('an entry citing only non-US sites fails; one US source among them passes', () => {
  assert.match(usFocusIssues(base({ source: 'https://www.actionfraud.police.uk/x; https://www.gov.uk/y' }))[0] ?? '', /every citation is a non-US site/);
  assert.match(usFocusIssues(base({ source: 'https://www.gov.uk/y' })).join(), /non-US site/);
  assert.deepEqual(usFocusIssues(base({ source: 'https://www.gov.uk/y; https://consumer.ftc.gov/z' })), []);
});

test('foreign money and reporting channels fail', () => {
  assert.match(usFocusIssues(base({ summary: 'Victims were asked for £200.' })).join(), /UK money/);
  assert.match(usFocusIssues(base({ howItWorks: 'Report it to Action Fraud. ' + 'x'.repeat(160) })).join(), /UK agencies/);
  assert.match(usFocusIssues(base({ redFlags: ['Claims to be from Royal Mail', 'Asks for a fee'] })).join(), /UK agencies/);
  assert.match(usFocusIssues(base({ safetyTips: ['Report to Scamwatch', 'Hang up'] })).join(), /Australian or Canadian/);
  assert.match(usFocusIssues(base({ summary: 'They asked for 50 euros.' })).join(), /euros/);
});

test('the gate is part of findQualityIssues', () => {
  assert.ok(findQualityIssues(base({ summary: 'Victims were asked for £200.' })).some((i) => i.startsWith('not US-focused')));
});

test('no published entry fails it today', () => {
  const reports = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'reports.json'), 'utf8')).reports;
  assert.deepEqual(reports.filter((r) => usFocusIssues(r).length).map((r) => r.slug), []);
});
