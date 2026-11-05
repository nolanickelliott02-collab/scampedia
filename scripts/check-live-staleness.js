'use strict';

// Fails loudly if the LIVE site hasn't published a new scam entry in too
// long. Deliberately independent of daily-scam-entry.yml — a health check
// living inside the pipeline it watches can only ever catch "the pipeline
// ran and something inside it failed," not "the pipeline's cron stopped
// firing at all" or "generation succeeded but the deploy/CDN silently
// didn't serve it." Fetching the real public URL instead of reading local
// git state after checkout closes both gaps: this keeps working even if
// the daily-scam-entry workflow goes fully dark, and it catches deploy
// failures the old git-state version structurally could not.
//
// Run: node scripts/check-live-staleness.js

// 10, not 5, since 2026-11-05: entries now go live only when Nick merges the
// weekly review batch, so up to a week without a new live entry is normal.
// Past 10 days either the bots have stopped or the batch is waiting on him.
const MAX_STALE_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_URL = 'https://scampedia.net/api/reports.json';

async function main() {
  let res;
  try {
    res = await fetch(LIVE_URL, { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    console.error(`FAIL: could not reach ${LIVE_URL} (${err.message}) — site may be down.`);
    process.exitCode = 1;
    return;
  }

  if (!res.ok) {
    console.error(`FAIL: ${LIVE_URL} returned HTTP ${res.status} — site or CDN may be down.`);
    process.exitCode = 1;
    return;
  }

  const data = await res.json();
  const lastUpdated = new Date(data.lastUpdated);
  if (isNaN(lastUpdated)) {
    console.error(`FAIL: live reports.json lastUpdated ("${data.lastUpdated}") is not a valid date — treating as stale.`);
    process.exitCode = 1;
    return;
  }

  const ageDays = Math.floor((Date.now() - lastUpdated.getTime()) / DAY_MS);
  console.log(`Live site's newest entry: ${data.lastUpdated} (${ageDays} day(s) ago).`);

  if (ageDays > MAX_STALE_DAYS) {
    console.error(
      `FAIL: the live site has not published a new entry in ${ageDays} days (limit: ${MAX_STALE_DAYS}). ` +
      `Check github.com/nolanickelliott02-collab/scampedia/actions for the daily-scam-entry pipeline's recent runs.`
    );
    process.exitCode = 1;
    return;
  }

  console.log('OK — within staleness limit.');
}

main();
