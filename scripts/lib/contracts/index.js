'use strict';

// The platform's shared contracts (v1): Entity, ThreatSignal, Evidence,
// Verdict, ChangeProposal and ModelVersion. The JSON Schemas in v1/ are the
// source of truth; Scampedia, Dojo and VGCore keep copies, and the drift
// check (scripts/check_contract_drift.js) fails if any copy differs.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv2020 = require('ajv/dist/2020');

const SCHEMA_DIR = path.join(__dirname, 'v1');
const CONTRACTS = {
  Entity: 'entity.schema.json',
  ThreatSignal: 'threat-signal.schema.json',
  Evidence: 'evidence.schema.json',
  Verdict: 'verdict.schema.json',
  ChangeProposal: 'change-proposal.schema.json',
  ModelVersion: 'model-version.schema.json',
};

function loadSchemas(dir = SCHEMA_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.schema.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// One hash over every schema file, in name order. Each repo's copy records
// this in contracts/v1/SCHEMA_HASH; a different hash means drift.
function schemaHash(dir = SCHEMA_DIR) {
  const hash = crypto.createHash('sha256');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.schema.json')).sort()) {
    hash.update(f);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(dir, f)));
  }
  return hash.digest('hex');
}

// strictRequired off: the if/then rules list required fields defined at the
// top level, which is valid JSON Schema but trips that one strict check.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
for (const schema of loadSchemas()) ajv.addSchema(schema);
const BASE = 'https://officialverifyguard.com/contracts/v1/';

// Rules JSON Schema can't express (comparing two fields).
const EXTRA_CHECKS = {
  ModelVersion: (v) => (v.id === `model:${v.name}@${v.version}` ? [] : [`id must be model:${v.name}@${v.version}`]),
  Entity: (v) => (v.firstSeen <= v.lastSeen ? [] : ['firstSeen is after lastSeen']),
  Verdict: (v) => v.reasons.filter((r) => r.signalIndex >= v.signals.length).map((r) => `reason ${r.reasonCode} points at a missing signal`),
};

/** @returns {{ ok: boolean, errors: string[] }} */
function validate(contract, value) {
  const file = CONTRACTS[contract];
  if (!file) throw new Error(`unknown contract "${contract}"`);
  const check = ajv.getSchema(BASE + file);
  if (!check(value)) {
    return { ok: false, errors: check.errors.map((e) => `${e.instancePath || '/'} ${e.message}`) };
  }
  const extra = EXTRA_CHECKS[contract] ? EXTRA_CHECKS[contract](value) : [];
  return { ok: extra.length === 0, errors: extra };
}

function assertValid(contract, value) {
  const { ok, errors } = validate(contract, value);
  if (!ok) throw new Error(`${contract} is invalid: ${errors.join('; ')}`);
  return value;
}

module.exports = { CONTRACTS, SCHEMA_DIR, validate, assertValid, schemaHash, loadSchemas };
