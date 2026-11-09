'use strict';

// Builds /scams/new-<first>-<last>.html, "This week's new scams": the entries in
// this review batch (in api/reports.json here but not yet on main), most
// relevant to older US adults first. The weekly push opens it (Nick, 2026-11-09).
//
// Run after build:scams on the review batch branch (the bots do). On main, or
// with no new entries, it changes nothing. An older page for the same batch
// (same first id, fewer entries) is replaced.
//
//   node scripts/build-weekly-digest.js [base ref, default origin/main]

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pageShell, escapeHtml, formatDate, SITE_ORIGIN } = require('./build-scam-pages');
const { newlyPublished } = require('./newly-published');
const { rankForOlderAdults, digestMessage, digestPagePath } = require('./lib/digest');

const ROOT = path.join(__dirname, '..');
const SCAMS_DIR = path.join(ROOT, 'scams');

function digestPageHtml(batch) {
  const name = digestPagePath(batch);
  const canonical = `${SITE_ORIGIN}/scams/${name}.html`;
  const title = "This Week's New Scams | Scampedia";
  const description = digestMessage(batch);
  const ranked = rankForOlderAdults(batch);
  const cards = ranked.map((r) => `
          <a class="scam-card" href="${r.slug}.html">
            <div class="scam-card-meta">
              <span class="scam-cat">${escapeHtml(r.category)}</span>
              ${formatDate(r.datePublished) ? `<span class="scam-card-date">${formatDate(r.datePublished)}</span>` : ''}
            </div>
            <h3>${escapeHtml(r.title)}</h3>
            <p>${escapeHtml(r.summary)}</p>
          </a>`).join('');
  const bodyHtml = `
    <div class="wiki-browse-header">
      <h1>This week's new scams</h1>
      <p>${ranked.length} new ${ranked.length === 1 ? 'scam' : 'scams'} added to Scampedia this week. Tap one to see how it works and the red flags to watch for. Also see <a href="index.html">every documented scam</a>.</p>
    </div>
    <div class="wiki-section">
      <div class="scam-grid">${cards}
      </div>
    </div>
  `;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: canonical };
  const ogImage = `${SITE_ORIGIN}/assets/og/scampedia-share.png`;
  return pageShell({ title, description, canonical, ogImage, jsonLd, bodyHtml, activeNav: 'database' });
}

function writeDigest(batch, dir = SCAMS_DIR) {
  const name = digestPagePath(batch);
  if (!name) return null;
  const first = name.split('-')[1];
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(`new-${first}-`) && f !== `${name}.html`) fs.unlinkSync(path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, `${name}.html`), digestPageHtml(batch));
  return name;
}

function main() {
  const base = process.argv[2] || 'origin/main';
  let before;
  try {
    before = JSON.parse(execFileSync('git', ['show', `${base}:api/reports.json`], { encoding: 'utf8' }));
  } catch {
    console.log(`No ${base} to compare with; weekly digest page not built.`);
    return;
  }
  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'reports.json'), 'utf8'));
  const batch = newlyPublished(before, after);
  if (batch.length === 0) {
    console.log('No new entries in this batch; weekly digest page unchanged.');
    return;
  }
  console.log(`Built scams/${writeDigest(batch)}.html (${batch.length} entries)`);
}

if (require.main === module) main();

module.exports = { digestPageHtml, writeDigest };
