'use strict';

// Which entries a push to main just made live: in api/reports.json now but
// not at the commit before the push. Prints GitHub Actions outputs for
// .github/workflows/notify-new-entries.yml: count, the weekly digest message
// (lib/digest.js), and the page the push opens: the batch's
// "This week's new scams" page, or the lead entry's page if that wasn't built.
//
//   node scripts/newly-published.js <sha before the push>

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { digestMessage, digestPagePath, rankForOlderAdults } = require('./lib/digest');

const REPORTS = 'api/reports.json';

function newlyPublished(before, after) {
  const seen = new Set((before?.reports ?? []).map(r => String(r.id)));
  return (after?.reports ?? [])
    .filter(r => !seen.has(String(r.id)))
    .sort((a, b) => String(b.datePublished ?? '').localeCompare(String(a.datePublished ?? '')));
}

// One line per output value: outputs can't hold raw newlines.
const oneLine = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function readAt(sha) {
  if (!sha || /^0+$/.test(sha)) return null; // first push of a branch: nothing to compare
  try {
    return JSON.parse(execFileSync('git', ['show', `${sha}:${REPORTS}`], { encoding: 'utf8' }));
  } catch {
    return null;
  }
}

function main() {
  const before = readAt(process.argv[2]);
  if (!before) {
    // Without a "before" every entry would look new; notify nobody instead.
    console.log('count=0');
    return;
  }
  const after = JSON.parse(fs.readFileSync(path.join(__dirname, '..', REPORTS), 'utf8'));
  const added = newlyPublished(before, after);
  console.log(`count=${added.length}`);
  if (added.length === 0) return;
  const lead = rankForOlderAdults(added)[0];
  const digest = digestPagePath(added);
  const digestBuilt = fs.existsSync(path.join(__dirname, '..', 'scams', `${digest}.html`));
  console.log(`message=${oneLine(digestMessage(added))}`);
  console.log(`slug=${oneLine(lead.slug)}`);
  console.log(`page=${oneLine(digestBuilt ? digest : lead.slug)}`);
}

if (require.main === module) main();

module.exports = { newlyPublished, oneLine };
