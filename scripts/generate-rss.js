#!/usr/bin/env node
// Regenerates rss.xml from api/reports.json — run after any change to
// reports.json (including the weekly auto-post routine).
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://scampedia.net';

function escapeXML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/reports.json'), 'utf8'));
  const reports = [...data.reports].sort((a, b) =>
    new Date(b.datePublished || b.firstReported || 0) - new Date(a.datePublished || a.firstReported || 0)
  );

  const items = reports.slice(0, 30).map(r => {
    const link = `${SITE}/scampedia.html#/wiki/${r.slug}`;
    const pubDate = new Date(r.datePublished || r.firstReported || Date.now()).toUTCString();
    return `    <item>
      <title>${escapeXML(r.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">scampedia-${r.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXML(r.category)}</category>
      <description>${escapeXML(r.summary)}</description>
    </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Scampedia — Latest Scams</title>
    <link>${SITE}/scampedia.html</link>
    <description>The living, AI-updated encyclopedia of scams — new entries as they're documented.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  fs.writeFileSync(path.join(ROOT, 'rss.xml'), rss);
  console.log(`rss.xml regenerated with ${reports.length} entries`);
}

main();
