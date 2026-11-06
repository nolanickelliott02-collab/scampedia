'use strict';

// Permanent IDs for Scampedia entries (Phase 1, Nick's decision 2026-11-06).
// An entry's ID is scampedia:<slug>, never its integer `id`: integers get
// reused (id 127 was first a rejected UK entry, then the SSA fake-badge
// entry) and the app's built-in entries used 1-9 too. A published slug never
// changes, even if the title does; data/published-slugs.json records every
// one (lib/published-slugs.js), and scripts/__tests__/permanent-ids.test.js
// fails on a rename.

const crypto = require('crypto');
const { assertValid } = require('./contracts');

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function scampediaId(slug) {
  if (!SLUG_RE.test(slug || '')) throw new Error(`not a valid slug: "${slug}"`);
  return `scampedia:${slug}`;
}

// The entry's first cited link, as a contract Evidence record. Only .gov
// links count as trusted; every other source still needs a person's review.
function citationEvidence(report, { collectedBy = 'bot:scampedia', now = new Date() } = {}) {
  const sourceUrl = (String(report.source || '').match(/https:\/\/[^\s,;)"']+/) || [])[0];
  if (!sourceUrl) return null;
  const sourceName = String(report.source).split(/,\s*https:\/\//)[0].trim() || new URL(sourceUrl).hostname;
  const host = new URL(sourceUrl).hostname;
  return assertValid('Evidence', {
    id: `evidence:${crypto.randomUUID()}`,
    kind: 'source_citation',
    scampediaId: scampediaId(report.slug),
    summary: `Source cited by the Scampedia entry "${report.title}".`.slice(0, 1000),
    sourceName: sourceName.slice(0, 300),
    sourceUrl,
    trusted: host.endsWith('.gov'),
    collectedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    collectedBy,
  });
}

module.exports = { scampediaId, citationEvidence, SLUG_RE };
