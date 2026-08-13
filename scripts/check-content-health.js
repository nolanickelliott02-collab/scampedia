'use strict';

// Phase 1 content-health tooling for the Scampedia course build.
//
// Enforces the governing rule that nothing perishable gets typed directly
// into lesson prose, and makes staleness impossible to miss: warns 30 days
// before a lesson's reviewBy date, fails the build once it's passed, and
// fails if any volatile.json fact hasn't been reverified in 180 days.
// Also lints for undated temporal language ("currently", "recently", etc.)
// which reads as evergreen but silently goes stale.
//
// Run: node scripts/check-content-health.js
// Exit code 0 = clean (warnings allowed). Exit code 1 = a real failure —
// wire this into CI once /learn/ has real content.

const fs   = require('fs');
const path = require('path');
const { parseFrontmatter, isExampleFile } = require('./lib/frontmatter');

const ROOT           = path.join(__dirname, '..');
const LESSONS_DIR     = path.join(ROOT, 'content', 'lessons');
const VOLATILE_PATH   = path.join(ROOT, 'content', 'volatile.json');
const SCREENSHOTS_DIR = path.join(ROOT, 'assets', 'learn');
const REVIEW_QUEUE     = path.join(ROOT, 'content', 'REVIEW-QUEUE.md');

const DAY_MS = 24 * 60 * 60 * 1000;

const TEMPORAL_PHRASES = [
  'currently', 'right now', 'at the moment', 'recently',
  'as of today', 'these days', 'the latest',
];

// A sentence containing a temporal phrase is allowed if it also contains
// something date-like: a four-digit year, or a month name.
const DATE_LIKE = new RegExp(
  '\\b(19|20)\\d{2}\\b|' +
  '\\b(January|February|March|April|May|June|July|August|September|October|November|December)\\b',
  'i'
);

let failures = [];
let warnings = [];

function fail(msg)  { failures.push(msg); }
function warn(msg)  { warnings.push(msg); }

// ---- Temporal language lint ------------------------------------------

function lintTemporalLanguage(slug, body) {
  const sentences = body.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const phrase of TEMPORAL_PHRASES) {
      if (lower.includes(phrase) && !DATE_LIKE.test(sentence)) {
        fail(`[${slug}] undated temporal language "${phrase}" in: "${sentence.trim().slice(0, 100)}"`);
      }
    }
  }
}

// ---- Lessons -----------------------------------------------------------

const REQUIRED_FIELDS = ['title', 'slug', 'summary', 'band', 'access', 'decayRisk', 'lastReviewed', 'reviewBy'];
const VALID_BANDS      = ['adult', '3-5', '6-8', '9-12'];
const VALID_ACCESS     = ['free', 'paid'];
const VALID_DECAY_RISK = ['low', 'medium', 'high'];

// reviewBy is derived, not trusted as freely typed: lastReviewed + this many
// days, by decayRisk. medium's interval (120d) was never specified by the
// governing spec — proposed here as a round number between high's 90 and
// low's 180, closer to the middle than either extreme. Flagged as a
// proposal, not treated as settled.
const REVIEW_INTERVAL_DAYS = { low: 180, medium: 120, high: 90 };

function loadLessons() {
  if (!fs.existsSync(LESSONS_DIR)) return [];
  const files = fs.readdirSync(LESSONS_DIR)
    .filter(f => f.endsWith('.md') && !isExampleFile(f));
  const lessons = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(LESSONS_DIR, file), 'utf8');
    const parsed = parseFrontmatter(raw);
    if (!parsed) { fail(`[${file}] missing or malformed frontmatter block`); continue; }

    const { data, body } = parsed;
    for (const field of REQUIRED_FIELDS) {
      if (!data[field]) fail(`[${file}] missing required frontmatter field: ${field}`);
    }
    if (data.band && !VALID_BANDS.includes(data.band)) {
      fail(`[${file}] invalid band "${data.band}" — must be one of ${VALID_BANDS.join(', ')}`);
    }
    if (data.access && !VALID_ACCESS.includes(data.access)) {
      fail(`[${file}] invalid access "${data.access}" — must be one of ${VALID_ACCESS.join(', ')}`);
    }
    if (data.decayRisk && !VALID_DECAY_RISK.includes(data.decayRisk)) {
      fail(`[${file}] invalid decayRisk "${data.decayRisk}" — must be one of ${VALID_DECAY_RISK.join(', ')}`);
    }

    checkReviewByDerivation(file, data);
    lintTemporalLanguage(data.slug || file, body);
    // summary becomes the on-page lead paragraph — equally user-facing and
    // equally capable of going stale, but it's frontmatter, not body, so it
    // needs its own explicit check rather than piggybacking on the one above.
    if (data.summary) lintTemporalLanguage(data.slug || file, data.summary);

    lessons.push({ file, ...data, volatileRefs: data.volatileRefs || [] });
  }
  return lessons;
}

// reviewBy should equal lastReviewed + the interval for its decayRisk band,
// not be freely chosen. Warns rather than fails — a mismatch might be a
// deliberate editorial call, but it should never pass silently.
function checkReviewByDerivation(file, data) {
  if (!data.lastReviewed || !data.reviewBy || !data.decayRisk) return;
  if (data.lastReviewed === 'TODO' || data.reviewBy === 'TODO') return;

  const interval = REVIEW_INTERVAL_DAYS[data.decayRisk];
  if (interval === undefined) return; // already flagged by the decayRisk validity check above

  const lastReviewed = new Date(data.lastReviewed);
  const reviewBy      = new Date(data.reviewBy);
  if (isNaN(lastReviewed) || isNaN(reviewBy)) return; // already flagged elsewhere

  const expected = new Date(lastReviewed.getTime() + interval * DAY_MS);
  const actualISO   = reviewBy.toISOString().slice(0, 10);
  const expectedISO = expected.toISOString().slice(0, 10);

  if (actualISO !== expectedISO) {
    warn(`[${file}] reviewBy is ${actualISO} but lastReviewed + ${interval}d (decayRisk: ${data.decayRisk}) would be ${expectedISO} — mismatch not auto-corrected, confirm this was deliberate`);
  }
}

// ---- volatile.json -------------------------------------------------

function loadVolatile() {
  if (!fs.existsSync(VOLATILE_PATH)) {
    fail('content/volatile.json does not exist');
    return {};
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(VOLATILE_PATH, 'utf8'));
  } catch (err) {
    fail(`content/volatile.json is not valid JSON: ${err.message}`);
    return {};
  }
  return json;
}

function checkVolatileStaleness(volatile) {
  const now = Date.now();
  const entries = [];

  for (const [key, entry] of Object.entries(volatile)) {
    if (key.startsWith('_')) continue; // schema notes, not real entries
    if (!entry.checkUrl) fail(`[volatile.json:${key}] missing checkUrl`);

    if (entry.lastVerified === 'TODO' || !entry.lastVerified) {
      warn(`[volatile.json:${key}] lastVerified not yet set (TODO placeholder) — fine pre-launch, must be real before this key is referenced by a published lesson`);
      entries.push({ key, ...entry, ageDays: null });
      continue;
    }

    const verified = new Date(entry.lastVerified);
    if (isNaN(verified)) {
      fail(`[volatile.json:${key}] lastVerified is not a valid date: "${entry.lastVerified}"`);
      continue;
    }
    const ageDays = Math.floor((now - verified.getTime()) / DAY_MS);
    entries.push({ key, ...entry, ageDays });

    if (ageDays > 180) {
      fail(`[volatile.json:${key}] lastVerified is ${ageDays} days ago — exceeds the 180-day limit. Re-verify at ${entry.checkUrl}`);
    } else if (ageDays > 150) {
      warn(`[volatile.json:${key}] lastVerified is ${ageDays} days ago — approaching the 180-day limit`);
    }
  }
  return entries;
}

// ---- Lesson staleness (reviewBy) --------------------------------------

function checkLessonStaleness(lessons) {
  const now = Date.now();
  for (const lesson of lessons) {
    if (lesson.reviewBy === 'TODO' || !lesson.reviewBy) continue;
    const due = new Date(lesson.reviewBy);
    if (isNaN(due)) { fail(`[${lesson.file}] reviewBy is not a valid date: "${lesson.reviewBy}"`); continue; }

    const daysUntil = Math.floor((due.getTime() - now) / DAY_MS);
    if (daysUntil < 0) {
      fail(`[${lesson.file}] reviewBy (${lesson.reviewBy}) has passed — ${Math.abs(daysUntil)} days overdue`);
    } else if (daysUntil <= 30) {
      warn(`[${lesson.file}] reviewBy (${lesson.reviewBy}) is in ${daysUntil} days`);
    }
  }
}

// ---- Screenshots ----------------------------------------------------

function loadScreenshots() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) return [];
  const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  const now = Date.now();

  return files.map(file => {
    const m = file.match(/^(.+)-(\d{4}-\d{2})\.(png|jpg|jpeg)$/i);
    if (!m) {
      warn(`[assets/learn/${file}] doesn't match the <tool>-<step>-<YYYY-MM>.<ext> naming convention`);
      return { file, tag: null, ageDays: null };
    }
    const [, tag, yyyymm] = m;
    const taken = new Date(`${yyyymm}-01T00:00:00Z`);
    const ageDays = Math.floor((now - taken.getTime()) / DAY_MS);
    return { file, tag, ageDays };
  });
}

// ---- REVIEW-QUEUE.md generation ---------------------------------------

function generateReviewQueue(lessons, volatileEntries, screenshots) {
  const now = new Date().toISOString().slice(0, 10);
  let out = `# Content Review Queue\n\nGenerated ${now} by \`scripts/check-content-health.js\`. Sorted soonest-due first. Re-run after any content change.\n\n`;

  out += `## Lessons — reviewBy date\n\n`;
  const lessonRows = lessons
    .filter(l => l.reviewBy && l.reviewBy !== 'TODO')
    .sort((a, b) => new Date(a.reviewBy) - new Date(b.reviewBy));
  if (!lessonRows.length) {
    out += `_No lessons with a set reviewBy date yet._\n\n`;
  } else {
    out += `| Due | Lesson | decayRisk | Status |\n|---|---|---|---|\n`;
    for (const l of lessonRows) {
      const daysUntil = Math.floor((new Date(l.reviewBy) - Date.now()) / DAY_MS);
      const status = daysUntil < 0 ? `**OVERDUE by ${Math.abs(daysUntil)}d**` : daysUntil <= 30 ? `due in ${daysUntil}d` : 'ok';
      out += `| ${l.reviewBy} | ${l.title || l.file} | ${l.decayRisk || '—'} | ${status} |\n`;
    }
    out += '\n';
  }

  out += `## Volatile facts — lastVerified date\n\n`;
  const volRows = volatileEntries
    .filter(v => v.ageDays !== null)
    .sort((a, b) => b.ageDays - a.ageDays);
  const volTodo = volatileEntries.filter(v => v.ageDays === null);
  if (!volRows.length && !volTodo.length) {
    out += `_No volatile.json entries yet._\n\n`;
  } else {
    if (volRows.length) {
      out += `| Age | Key | checkUrl | Status |\n|---|---|---|---|\n`;
      for (const v of volRows) {
        const status = v.ageDays > 180 ? `**OVER LIMIT**` : v.ageDays > 150 ? 'due soon' : 'ok';
        out += `| ${v.ageDays}d | ${v.key} | ${v.checkUrl || '—'} | ${status} |\n`;
      }
      out += '\n';
    }
    if (volTodo.length) {
      out += `**Not yet verified (TODO placeholders, must be resolved before referencing lessons publish):**\n`;
      for (const v of volTodo) out += `- ${v.key} — ${v.checkUrl || 'checkUrl TODO'}\n`;
      out += '\n';
    }
  }

  out += `## Screenshots — assets/learn/\n\n`;
  const shotRows = screenshots.filter(s => s.ageDays !== null).sort((a, b) => b.ageDays - a.ageDays);
  if (!shotRows.length) {
    out += `_No screenshots yet._\n\n`;
  } else {
    out += `| Age | File | Status |\n|---|---|---|\n`;
    for (const s of shotRows) {
      const status = s.ageDays > 180 ? '**stale, recapture**' : 'ok';
      out += `| ${s.ageDays}d | ${s.file} | ${status} |\n`;
    }
    out += '\n';
  }

  out += `## Known design debt\n\n`;
  out += `- **Body text size split, opened 2026-08-07**: new course/\`/learn/\` templates use a semantic \`--text-body\` token at \`1.125rem\` (~18px); the existing legacy site (scam database pages, homepage) still uses a hardcoded \`16px\` and has not been migrated to the token or bumped to the 18px minimum. This was a deliberate scoped decision, not an oversight — revisit when the legacy scam pages migrate to the shared static-generation pattern (see Phase 0 report) so the whole site ends up on one type scale instead of two permanently.\n\n`;

  out += `## Manual verification needed before launch\n\n`;
  out += `Items that can't be checked by this script and must be confirmed by a human before /learn/ goes live. Remove a line once it's actually been confirmed — don't let this list go stale by assumption.\n\n`;
  out += `- **Legacy pages (scam database, homepage) still lose nav links entirely below 600px effective width** — the underlying \`@media (max-width: 600px) { .nav-links a:not(.btn) { display: none; } }\` rule in \`css/styles.css\` is unchanged; only \`.course-page\` scopes got the real fix (\`flex-wrap\` + a growable \`.nav-inner\` height, in \`css/course.css\`, fixed 2026-08-08). Deliberately scoped rather than site-wide per instruction, to avoid risking legacy pages that haven't been checked against this change. Revisit when the legacy scam pages migrate to the shared static-generation pattern (see Phase 0 report) — same spirit as the type-scale item above, one more reason those pages need a real migration pass rather than living forever as a separate system.\n\n`;

  return out;
}

// ---- Main ---------------------------------------------------------

function main() {
  const lessons    = loadLessons();
  const volatile    = loadVolatile();
  const volEntries  = checkVolatileStaleness(volatile);
  checkLessonStaleness(lessons);
  const screenshots = loadScreenshots();

  const reviewQueue = generateReviewQueue(lessons, volEntries, screenshots);
  fs.writeFileSync(REVIEW_QUEUE, reviewQueue);

  console.log(`Checked ${lessons.length} lesson(s), ${Object.keys(volatile).filter(k => !k.startsWith('_')).length} volatile fact(s), ${screenshots.length} screenshot(s).`);
  console.log(`Wrote ${path.relative(ROOT, REVIEW_QUEUE)}`);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach(w => console.log(`  WARN  ${w}`));
  }
  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    failures.forEach(f => console.log(`  FAIL  ${f}`));
    process.exit(1);
  }
  console.log('\nContent health check passed.');
}

main();
