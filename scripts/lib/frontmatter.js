'use strict';

// Shared by scripts/check-content-health.js and scripts/build-learn-pages.js
// so lesson parsing rules only live in one place.

// Deliberately hand-rolled rather than pulling in a YAML dependency — the
// schema is flat scalars plus one array field, which a tiny parser covers
// without adding a new package for something this small.
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const [, fmBlock, body] = match;

  const data = {};
  const lines = fmBlock.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;

    if (rawValue.trim() === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        i++;
        items.push(lines[i].replace(/^\s+-\s+/, '').trim());
      }
      data[key] = items;
    } else if (/^\[.*\]$/.test(rawValue.trim())) {
      const inner = rawValue.trim().slice(1, -1).trim();
      data[key] = inner ? inner.split(',').map(s => s.trim()) : [];
    } else {
      data[key] = rawValue.trim();
    }
  }
  return { data, body: body.trim() };
}

// Files prefixed with "_" are schema/tooling examples, never real content —
// excluded from linting, staleness tracking, and every build:learn output:
// HTML pages, sitemap.xml, llms.txt.
function isExampleFile(filename) {
  return filename.startsWith('_');
}

module.exports = { parseFrontmatter, isExampleFile };
