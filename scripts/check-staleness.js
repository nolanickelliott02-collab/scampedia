'use strict';

// Fails loudly if no scam entry has actually merged to main in too long.
// This exists specifically because moving to a PR-review gate
// (daily-scam-entry.yml) introduces a new failure mode the old direct-push
// setup didn't have: if PRs pile up unreviewed, the database quietly stops
// updating instead of erroring — nothing before this script would ever
// have caught that. api/reports.json's lastUpdated field only changes when
// a PR is actually merged (the workflow no longer pushes directly), so it's
// a real, simple signal for "how long since a human last approved one."
//
// Run: node scripts/check-staleness.js

const fs = require('fs');
const path = require('path');

const REPORTS_PATH = path.join(__dirname, '..', 'api', 'reports.json');
const MAX_STALE_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function main() {
  const data = JSON.parse(fs.readFileSync(REPORTS_PATH, 'utf8'));
  const lastUpdated = new Date(data.lastUpdated);
  if (isNaN(lastUpdated)) {
    console.error(`api/reports.json lastUpdated ("${data.lastUpdated}") is not a valid date — treating as stale.`);
    process.exitCode = 1;
    return;
  }

  const ageDays = Math.floor((Date.now() - lastUpdated.getTime()) / DAY_MS);
  console.log(`Last merged entry: ${data.lastUpdated} (${ageDays} day(s) ago).`);

  if (ageDays > MAX_STALE_DAYS) {
    console.error(
      `FAIL: no scam entry has merged in ${ageDays} days (limit: ${MAX_STALE_DAYS}). ` +
      `This almost always means PRs from the review-gated pipeline are piling up unreviewed — ` +
      `check open PRs at github.com and either merge or close the backlog.`
    );
    process.exitCode = 1;
    return;
  }

  console.log('OK — within staleness limit.');
}

main();
