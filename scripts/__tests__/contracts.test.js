'use strict';

// This repo's copy of the platform contracts (scripts/lib/contracts) must
// pass the same fixtures and normalization cases as the server's source copy.

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTRACTS, validate, schemaHash } = require('../lib/contracts');
const { normalize } = require('../lib/contracts/normalize');

const DIR = path.join(__dirname, '..', 'lib', 'contracts');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(DIR, rel), 'utf8'));

for (const contract of Object.keys(CONTRACTS)) {
  test(`${contract}: shared fixtures`, () => {
    const { valid, invalid } = read(`fixtures/${contract}.json`);
    for (const { name, value } of valid) assert.ok(validate(contract, value).ok, `${name} should pass`);
    for (const { name, value } of invalid) assert.equal(validate(contract, value).ok, false, `${name} should fail`);
  });
}

test('normalization matches the shared cases', () => {
  for (const c of read('normalize-cases.json').cases) {
    assert.equal(normalize(c.type, c.in), c.out, `${c.type} ${JSON.stringify(c.in)}`);
  }
});

test('this copy of the schemas matches its recorded hash', () => {
  assert.equal(schemaHash(path.join(DIR, 'v1')), fs.readFileSync(path.join(DIR, 'v1', 'SCHEMA_HASH'), 'utf8').trim());
});
