'use strict';

// Daily job: ask Claude to research ONE genuinely current, real, cited scam
// trend not already in api/reports.json, and append it if (and only if) it
// finds something solid. Uses Anthropic's server-side web_search tool so
// entries are grounded in real sources instead of invented from training
// data — this is a public-facing scam database, so fabricated "facts" would
// be a real harm, not just an embarrassing bug.
//
// Two tools represent the only two valid outcomes (submit_scam_entry /
// skip_no_confident_finding) so the model can't half-submit a low-confidence
// guess just to have something to publish today. Shared gates (citation
// resolution, content relevance, fact-checking) live in lib/scam-pipeline.js
// — see that file for the actual verification logic and its history.
//
// Env vars:
//   DRY_RUN=1          run the real API call, print the result, never write the file
//   FORCE_SKIP_TEST=1  force the model down the skip path, to test that branch for real

try { require('dotenv').config(); } catch { /* optional in CI, where env is injected directly */ }

const { CITATION_DISCIPLINE, runPipeline, writeGithubOutput } = require('./lib/scam-pipeline');

function buildSystemPrompt(existingTitles, forceSkip) {
  const base = `You are a research analyst for Scampedia, a public scam-database encyclopedia. Use
web_search to find ONE genuinely current, real scam trend being reported by news outlets, the FTC,
FBI/IC3, BBB, or similar consumer-protection sources within roughly the last few weeks to months.

Do NOT invent, guess, or extrapolate from training data alone — every fact must trace back to a
real source you actually searched for today. ${CITATION_DISCIPLINE} Do NOT propose anything already
in this existing titles list (case-insensitive, near-duplicates count as matches too):
${existingTitles.map(t => `- ${t}`).join('\n')}

If you find a solid, well-cited, genuinely distinct trend, call submit_scam_entry exactly once.
If you don't find anything that meets that bar, call skip_no_confident_finding exactly once —
do not submit a low-confidence or thin entry just to have something to publish today.`;

  if (forceSkip) {
    return `${base}\n\nTESTING OVERRIDE: regardless of what you find, you MUST call skip_no_confident_finding this run.`;
  }
  return base;
}

runPipeline({ buildSystemPrompt }).catch(err => {
  console.error('Unexpected error:', err);
  writeGithubOutput({ result: 'error', error: err.message });
  process.exitCode = 1;
});
