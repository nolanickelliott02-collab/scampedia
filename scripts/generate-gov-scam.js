'use strict';

// Second, independent scam-entry bot: instead of general news/web research
// (generate-daily-scam.js's job), this one searches specifically for scam
// alerts published directly by government consumer-protection agencies —
// FTC, FBI/IC3, CFPB, SSA-OIG, USPS-OIG, DOJ, HHS-OIG, state Attorneys
// General, etc. — and requires the entry's actual citation to be a .gov page
// itself, not a news article merely reporting on one.
//
// Runs on its own schedule (gov-scam-scan.yml), independent of the daily
// researcher, so a day can get zero, one, or two new entries depending on
// what each bot actually finds — neither bot is required to find anything to
// keep the other's run green (see the shared "skip cleanly" pattern in
// lib/scam-pipeline.js).
//
// Same env vars as generate-daily-scam.js: DRY_RUN=1, FORCE_SKIP_TEST=1.

try { require('dotenv').config(); } catch { /* optional in CI, where env is injected directly */ }

const { CITATION_DISCIPLINE, extractCitationUrls, runPipeline, writeGithubOutput } = require('./lib/scam-pipeline');

function buildSystemPrompt(existingTitles, forceSkip) {
  const base = `You are a research analyst for Scampedia, a public scam-database encyclopedia. Use
web_search to find ONE genuinely current scam or fraud alert published DIRECTLY by a government
consumer-protection agency — for example the FTC (ftc.gov / consumer.ftc.gov), FBI/IC3 (ic3.gov,
fbi.gov), CFPB (consumerfinance.gov), SSA Office of Inspector General (oig.ssa.gov), USPS OIG
(uspsoig.gov), the DOJ (justice.gov), HHS-OIG (oig.hhs.gov), the IRS (irs.gov), or a state Attorney
General's office (any .gov domain). Try search queries like "site:ftc.gov scam alert",
"site:ic3.gov" plus a current topic, or "[your state] attorney general scam alert".

Your cited source MUST be the government page itself, not a news article that merely reports on
one — if you only find a news article describing a government warning, go find and cite the actual
government page it's describing instead. If you cannot find a genuine primary .gov source, that is
grounds to skip, not a reason to cite the news article instead.

Do NOT invent, guess, or extrapolate from training data alone — every fact must trace back to a
real .gov page you actually fetched today. ${CITATION_DISCIPLINE} Do NOT propose anything already in
this existing titles list (case-insensitive, near-duplicates count as matches too):
${existingTitles.map(t => `- ${t}`).join('\n')}

If you find a solid, well-cited, genuinely distinct trend with a real primary .gov source, call
submit_scam_entry exactly once. If you don't find anything that meets that bar, call
skip_no_confident_finding exactly once — do not submit a low-confidence or thin entry, and do not
substitute a non-government source, just to have something to publish today.`;

  if (forceSkip) {
    return `${base}\n\nTESTING OVERRIDE: regardless of what you find, you MUST call skip_no_confident_finding this run.`;
  }
  return base;
}

// The prompt asks for a primary .gov source, but per this project's own
// established pattern (never trust prompt compliance alone for something
// that auto-publishes), that's enforced here for real: every URL the
// citation resolves to must have a .gov hostname, checked after redirects
// are already followed by the shared citation-resolution gate.
const govSourceGate = {
  name: 'Government source verification',
  async check(report) {
    const urls = extractCitationUrls(report.source);
    const nonGov = [];
    for (const url of urls) {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (!hostname.endsWith('.gov')) nonGov.push(url);
      } catch {
        nonGov.push(url);
      }
    }
    if (nonGov.length === urls.length) {
      return { ok: false, issues: [`no cited URL resolves to a .gov hostname — this bot only publishes entries sourced directly from a government page: ${urls.join(', ')}`] };
    }
    return { ok: true, issues: [] };
  },
};

function alreadyRanToday(data, todayISO) {
  return data.reports.some(r => r.isGovSourced && String(r.datePublished || '').slice(0, 10) === todayISO);
}

runPipeline({
  buildSystemPrompt,
  alreadyRanToday,
  extraGates: [govSourceGate],
  extraReportFields: () => ({ isGovSourced: true }),
}).catch(err => {
  console.error('Unexpected error:', err);
  writeGithubOutput({ result: 'error', error: err.message });
  process.exitCode = 1;
});
