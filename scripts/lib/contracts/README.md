# Shared contracts (copy)

A copy of the VerifyGuard platform contracts. The source of truth is `contracts/` in the server repo (verifyguard-server). Don't edit these files here: change them there, then copy `v1/`, `fixtures/`, `normalize-cases.json`, `normalize.js` and `index.js` over. `scripts/__tests__/contracts.test.js` fails if this copy stops matching its recorded hash, and the server's `scripts/check_contract_drift.js` fails if it differs from the server's.
