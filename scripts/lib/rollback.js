'use strict';

// Pure logic for rolling back the most recently published entry, split out
// from the CLI script (scripts/rollback-last-entry.js) so it's testable
// without touching real files. "Most recent" means most recently
// PUBLISHED (max datePublished), not highest id and not most recent
// firstReported — those are different fields with different meanings (see
// api/reports.json's schema) and only datePublished reflects when
// Scampedia itself added the entry.

function pickMostRecentReport(reports) {
  if (!reports || reports.length === 0) return null;
  let latest = reports[0];
  for (const r of reports) {
    const latestDate = new Date(latest.datePublished || 0);
    const rDate = new Date(r.datePublished || 0);
    if (rDate > latestDate) latest = r;
  }
  return latest;
}

// Returns a new data object (does not mutate the input) with the given
// report id removed and version/lastUpdated advanced — the same shape
// runPipeline() itself writes on a normal publish, just in reverse.
function removeReportById(data, id) {
  const reports = data.reports.filter(r => r.id !== id);
  if (reports.length === data.reports.length) {
    throw new Error(`No report with id "${id}" found — nothing to roll back.`);
  }
  return {
    ...data,
    reports,
    version: (data.version || 1) + 1,
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = { pickMostRecentReport, removeReportById };
