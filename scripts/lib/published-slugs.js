'use strict';

// data/published-slugs.json: every Scampedia slug ever published, so a slug
// is never renamed or reused (Nick, 2026-11-06). Kept free of other
// dependencies so the rollback script can use it on its own.

const fs = require('fs');
const path = require('path');

const PUBLISHED_SLUGS_PATH = path.join(__dirname, '..', '..', 'data', 'published-slugs.json');

// Adds any slug in reports.json that isn't recorded yet. Never removes one:
// taking a published entry down means listing it under "retired" by hand.
function recordPublishedSlugs(reports, lockPath = PUBLISHED_SLUGS_PATH) {
  const lock = fs.existsSync(lockPath)
    ? JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    : { note: '', slugs: [], retired: [] };
  const known = new Set(lock.slugs);
  const added = reports.map((r) => r.slug).filter((s) => !known.has(s));
  if (added.length === 0) return [];
  lock.slugs.push(...added);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  return added;
}

// Taking an entry down keeps its slug, under "retired", so it's never reused
// for a different scam.
function retireSlug(slug, reason, lockPath = PUBLISHED_SLUGS_PATH, now = new Date()) {
  if (!fs.existsSync(lockPath)) return false;
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (!lock.slugs.includes(slug)) return false;
  lock.slugs = lock.slugs.filter((s) => s !== slug);
  lock.retired.push({ slug, retiredAt: now.toISOString().slice(0, 10), reason });
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  return true;
}

module.exports = { recordPublishedSlugs, retireSlug, PUBLISHED_SLUGS_PATH };
