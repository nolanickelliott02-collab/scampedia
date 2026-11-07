'use strict';

// What a weekly review PR actually changes, entry by entry (Nick, 2026-11-06:
// PR #38's description said "no new entries" after a bot had added one).
// Compares api/reports.json on main with the review branch and lists every
// entry that would be published, changed or removed, plus held candidates
// and proposed app phrases. The PR description carries this list between
// the markers below; the check fails if it doesn't match the diff.

const START = '<!-- review-entries:start -->';
const END = '<!-- review-entries:end -->';

const keyOf = (r) => r.slug || `id-${r.id}`;
const label = (r) => `\`scampedia:${r.slug || r.id}\`: ${r.title}${r.category ? ` (${r.category})` : ''}`;

function diffEntries(baseReports, headReports) {
  const base = new Map(baseReports.map((r) => [keyOf(r), r]));
  const head = new Map(headReports.map((r) => [keyOf(r), r]));
  const added = [];
  const changed = [];
  const removed = [];
  for (const [k, r] of head) {
    const old = base.get(k);
    if (!old) {
      added.push(r);
      continue;
    }
    const fields = [...new Set([...Object.keys(old), ...Object.keys(r)])]
      .filter((f) => JSON.stringify(old[f]) !== JSON.stringify(r[f]))
      .sort();
    if (fields.length) changed.push({ entry: r, fields });
  }
  for (const [k, r] of base) if (!head.has(k)) removed.push(r);
  return { added, changed, removed };
}

// reviewFiles: [{ status: 'A' | 'M' | 'D', path }] under review/.
function renderBlock({ added, changed, removed }, reviewFiles = []) {
  const held = reviewFiles.filter((f) => f.status === 'A' && f.path !== 'review/phrase-queue.json');
  const phrases = reviewFiles.some((f) => f.path === 'review/phrase-queue.json');
  const section = (title, items) => [`**${title} (${items.length})**`, ...(items.length ? items : ['- none']), ''];
  return [
    START,
    '### Entries in this PR (updated automatically; the "Review entries" check fails if this list is out of date)',
    '',
    ...section('Goes live on merge', added.map((r) => `- ${label(r)}`)),
    ...section('Changed', changed.map(({ entry, fields }) => `- ${label(entry)}: ${fields.join(', ')}`)),
    ...section('Removed from the site', removed.map((r) => `- ${label(r)}`)),
    ...section('Held candidates (not published)', held.map((f) => `- \`${f.path}\``)),
    `**Proposed app phrases changed:** ${phrases ? 'yes, see review/phrase-queue.json (never reaches the app unless copied into api/patterns.json by hand)' : 'no'}`,
    END,
  ].join('\n');
}

// Replaces the block in a PR body, or appends it.
function spliceBody(body, block) {
  const text = body || '';
  const i = text.indexOf(START);
  const j = text.indexOf(END);
  if (i !== -1 && j > i) return text.slice(0, i) + block + text.slice(j + END.length);
  return `${text.trimEnd()}\n\n${block}\n`;
}

function extractBlock(body) {
  const text = body || '';
  const i = text.indexOf(START);
  const j = text.indexOf(END);
  return i !== -1 && j > i ? text.slice(i, j + END.length) : null;
}

const normalize = (s) => (s || '').replace(/\r\n/g, '\n').trim();
const bodyMatches = (body, block) => normalize(extractBlock(body)) === normalize(block);

module.exports = { diffEntries, renderBlock, spliceBody, extractBlock, bodyMatches, START, END };
