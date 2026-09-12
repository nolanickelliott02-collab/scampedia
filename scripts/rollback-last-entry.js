#!/usr/bin/env node
'use strict';

// One-command rollback of the most recently published scam entry — Phase 2
// hardening's "document and script a one-command rollback of the last
// publish." Removes the entry from api/reports.json and deletes its static
// page, then tells you the two commands left to actually make it live.
//
// Deliberately does NOT commit or push itself: this changes public,
// published content, so the person running it should see the diff (a real
// git diff of api/reports.json and the deleted file) before it goes out,
// not have it silently pushed to main as a side effect of running a
// script. See docs/PIPELINE_RUNBOOK.md for the full rollback walkthrough.
//
// Usage:
//   node scripts/rollback-last-entry.js           roll back the newest entry
//   node scripts/rollback-last-entry.js --dry-run  show what would happen, change nothing
//   node scripts/rollback-last-entry.js <id>       roll back a specific entry by id, not just the newest

const fs = require('fs');
const path = require('path');
const { pickMostRecentReport, removeReportById } = require('./lib/rollback');

const ROOT = path.join(__dirname, '..');
const REPORTS_PATH = path.join(ROOT, 'api', 'reports.json');
const SCAMS_DIR = path.join(ROOT, 'scams');

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const explicitId = args.find(a => !a.startsWith('--'));

  const data = JSON.parse(fs.readFileSync(REPORTS_PATH, 'utf8'));

  const target = explicitId
    ? data.reports.find(r => r.id === explicitId)
    : pickMostRecentReport(data.reports);

  if (!target) {
    console.error(explicitId ? `No entry with id "${explicitId}" found.` : 'No entries to roll back.');
    process.exitCode = 1;
    return;
  }

  console.log(`Target: "${target.title}" (id ${target.id}, published ${target.datePublished || '(no datePublished)'})`);
  console.log(`Source: ${target.source}`);
  console.log(`Page:   scams/${target.slug}.html`);

  if (dryRun) {
    console.log('\n[dry run] Would remove this entry from api/reports.json and delete its page. Nothing changed.');
    return;
  }

  const updated = removeReportById(data, target.id);
  fs.writeFileSync(REPORTS_PATH, JSON.stringify(updated, null, 2) + '\n');

  const pagePath = path.join(SCAMS_DIR, `${target.slug}.html`);
  if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath);

  console.log(`\nRemoved from api/reports.json (version ${data.version || 1} -> ${updated.version}) and deleted ${path.relative(ROOT, pagePath)}.`);
  console.log('\nNext steps to actually make this live:');
  console.log('  1. npm run build:scams && npm run build:learn   # regenerate index/az/sitemap.xml/llms.txt');
  console.log('  2. Review the diff: git diff');
  console.log('  3. git add -A && git commit -m "Roll back: ' + target.title.replace(/"/g, '\\"') + '"');
  console.log('  4. git push origin main');
}

main();
