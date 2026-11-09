'use strict';

// The weekly "new scams" digest (Nick, 2026-11-09): one push per merged review
// batch instead of one for the newest entry. The push leads with the entry most
// relevant to older US adults, and tapping it opens a page listing the batch.

// Most relevant first: Medicare and Social Security, then other government
// impersonation, then banks, then family. Anything else ranks after these.
const PRIORITY = [
  { name: 'medicare-social-security', test: /social security|\bssa\b|medicare/i },
  {
    name: 'government',
    test: /\birs\b|government|federal|\bfbi\b|\bftc\b|police|sheriff|marshal|court|jury|warrant|\bdmv\b|treasury|department of/i,
    category: 'Government Scam',
  },
  { name: 'bank', test: /\bbanks?\b|banking|zelle|credit union|debit card|credit card|fraud department|wire transfer/i },
  { name: 'family', test: /grand(?:parent|child|children|son|daughter|ma|pa)|family|relative|loved one|voice clon/i },
];

function priorityOf(report) {
  const text = `${report.title ?? ''} ${report.summary ?? ''}`;
  for (let i = 0; i < PRIORITY.length; i++) {
    const p = PRIORITY[i];
    if (p.test.test(text) || (p.category && report.category === p.category)) return i;
  }
  return PRIORITY.length;
}

// Most relevant first; ties go to the newest.
function rankForOlderAdults(reports) {
  return [...reports].sort((a, b) =>
    priorityOf(a) - priorityOf(b) ||
    String(b.datePublished ?? '').localeCompare(String(a.datePublished ?? '')));
}

// "6 new scams this week, including the Fake Social Security Deposit Scam."
// Built from the entry's real title, nothing rewritten.
function digestMessage(reports) {
  const ranked = rankForOlderAdults(reports);
  if (ranked.length === 0) return '';
  const lead = String(ranked[0].title ?? '').replace(/\s+/g, ' ').trim();
  if (ranked.length === 1) return `1 new scam this week: ${lead}.`;
  return `${ranked.length} new scams this week, including the ${lead}.`;
}

// The batch page's name under /scams/ (scams/<name>.html), by id range, so an
// older notification keeps opening the batch it announced. Kept directly in
// /scams/ because the page shell's links are relative to that folder.
function digestPagePath(reports) {
  const ids = reports.map((r) => Number(r.id)).filter(Number.isFinite).sort((a, b) => a - b);
  if (ids.length === 0) return null;
  return `new-${ids[0]}-${ids[ids.length - 1]}`;
}

module.exports = { PRIORITY, priorityOf, rankForOlderAdults, digestMessage, digestPagePath };
