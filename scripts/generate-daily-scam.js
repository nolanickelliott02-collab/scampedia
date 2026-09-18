'use strict';

// Daily job: ask Claude to research real, cited scam entries not already in
// api/reports.json, and append each one it finds that clears every gate.
// Uses Anthropic's server-side web_search tool so entries are grounded in
// real sources instead of invented from training data — this is a
// public-facing scam database, so fabricated "facts" would be a real harm,
// not just an embarrassing bug.
//
// Two tools represent the only two valid outcomes per attempt
// (submit_scam_entry / skip_no_confident_finding) so the model can't
// half-submit a low-confidence guess just to have something to publish
// today. Shared gates (citation resolution, content relevance, fact-
// checking) live in lib/scam-pipeline.js — see that file for the actual
// verification logic and its history, including how maxAttempts (below)
// lets one run publish more than one entry, each independently gated.
//
// Env vars:
//   DRY_RUN=1          run the real API call, print the result, never write the file
//   FORCE_SKIP_TEST=1  force the model down the skip path, to test that branch for real

try { require('dotenv').config(); } catch { /* optional in CI, where env is injected directly */ }

const { CITATION_DISCIPLINE, runPipeline, writeGithubOutput } = require('./lib/scam-pipeline');

// Broadened 2026-09-17 (was: "within roughly the last few weeks to
// months" only) — that restriction meant this bot could only ever propose
// brand-new trends and had no path to documenting the large backlog of
// well-established, still-active scam patterns that simply hadn't been
// written up here yet. Both are equally worth documenting; a scam being old
// doesn't make it any less real or any less likely to catch someone today.
function buildSystemPrompt(existingTitles, forceSkip) {
  const base = `You are a research analyst for Scampedia, a public scam-database encyclopedia. Use
web_search to find ONE genuinely real, currently-active scam pattern not already documented here —
either something new/trending being reported by news outlets, the FTC, FBI/IC3, BBB, or similar
consumer-protection sources within roughly the last few weeks to months, OR a well-established,
long-running scam pattern (regardless of how old it is) that is still actively catching victims
today, as long as it isn't already in the existing titles list below. Older, "classic" patterns are
just as valuable to document as brand-new ones — don't favor recency for its own sake.

Do NOT invent, guess, or extrapolate from training data alone — every fact must trace back to a
real source you actually searched for today, even for a long-established pattern (find a real,
current source confirming it's still active — a general knowledge claim that "this scam exists" is
not enough on its own). ${CITATION_DISCIPLINE} Do NOT propose anything already
in this existing titles list (case-insensitive, near-duplicates count as matches too):
${existingTitles.map(t => `- ${t}`).join('\n')}

If you find a solid, well-cited, genuinely distinct pattern (new or old), call submit_scam_entry
exactly once. If you don't find anything that meets that bar, call skip_no_confident_finding
exactly once — do not submit a low-confidence or thin entry just to have something to publish today.`;

  if (forceSkip) {
    return `${base}\n\nTESTING OVERRIDE: regardless of what you find, you MUST call skip_no_confident_finding this run.`;
  }
  return base;
}

// maxAttempts raised 2026-09-17 (was implicitly 1) — this bot was capped at
// exactly one entry per run no matter how many good, distinct, well-cited
// candidates it could actually find. 3 is a deliberately moderate starting
// point (not unlimited): each attempt still runs the full real cost of a
// multi-turn agent search plus a second independent fact-check pass, so
// this directly multiplies real per-run API cost up to ~3x on days it finds
// that much. Every attempt is gated exactly as before — this changes how
// many tries happen, not what's allowed to publish.
runPipeline({ buildSystemPrompt, maxAttempts: 3 }).catch(err => {
  console.error('Unexpected error:', err);
  writeGithubOutput({ result: 'error', error: err.message });
  process.exitCode = 1;
});
