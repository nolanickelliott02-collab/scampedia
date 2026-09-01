'use strict';

// Shared verification pipeline used by every scam-entry bot (the general
// daily researcher in generate-daily-scam.js, the government-source scanner
// in generate-gov-scam.js, and any future one). Extracted so every bot gets
// the same proven gates instead of each reimplementing (and potentially
// diverging on) citation/relevance/fact-check safety — this is a public,
// unreviewed, auto-publishing database, so these checks are the only thing
// standing between a model's mistake and a real user reading it as fact.

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const REPORTS_PATH = path.join(__dirname, '..', '..', 'api', 'reports.json');
const MODEL = 'claude-sonnet-5';

const CATEGORIES = [
  'AI Scam', 'Charity Scam', 'Delivery Scam', 'Employment Scam', 'Government Scam',
  'Investment Scam', 'Phone Scam', 'Rental Scam', 'Romance Scam', 'Shopping Scam', 'Tech Scam',
];

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Defense in depth: even with a strict tool schema, models occasionally
// collapse an array field into a single string (seen in testing: a
// "<item>...</item><item>...</item>" blob instead of a real array). Normalize
// rather than trust the shape blindly, since a stray string here would crash
// the frontend's .map() over these fields.
function toArray(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const items = [...value.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1].trim());
  if (items.length > 0) return items;
  return value.split('\n').map(s => s.trim()).filter(Boolean);
}

// Never trust a single heuristic (like stop_reason) alone for something that
// publishes straight to a live, public scam database with no human review.
// Seen in testing: a truncated response still produced a syntactically-valid
// tool call with literal "Placeholder" strings and an unclosed <cite> tag
// stuffed into the required fields just to satisfy the schema.
const DEGENERATE_PATTERNS = [/\bplaceholder\b/i, /<cite\b/i, /<item\b/i, /\btodo\b/i, /\blorem ipsum\b/i];

function findQualityIssues(report) {
  const issues = [];
  const allStrings = [report.summary, report.howItWorks, report.source, ...report.safetyTips, ...report.redFlags, ...report.realExamples];
  for (const s of allStrings) {
    for (const pattern of DEGENERATE_PATTERNS) {
      if (pattern.test(s)) issues.push(`degenerate content matched ${pattern}: "${String(s).slice(0, 60)}"`);
    }
  }
  if (report.safetyTips.length < 2) issues.push('safetyTips has fewer than 2 items');
  if (report.redFlags.length < 2) issues.push('redFlags has fewer than 2 items');
  if (report.realExamples.length < 1) issues.push('realExamples is empty');
  if (!report.howItWorks || report.howItWorks.length < 150) issues.push('howItWorks is suspiciously short or missing');
  if (!report.source || report.source.length < 10) issues.push('source citation is missing or too short');
  return issues;
}

// Structural completeness (above) says nothing about whether a citation is
// real. A model can produce a well-formed, plausible-looking source string
// that doesn't resolve, or resolves to something else entirely — this
// actually happened in this database's own launch data (40 legacy entries
// shipped with generic labels like "FTC Consumer Alerts" and no link at
// all). Every entry from this point on must cite at least one URL, and
// every URL cited must actually resolve, checked for real over the network,
// not assumed from the string looking right.
const URL_PATTERN = /https?:\/\/[^\s;,)"'<>]+/g;
// Fallback for citations that name a bare domain with no scheme, e.g.
// "bbb.org/article/..." instead of "https://bbb.org/article/..." — the
// model does this often enough in practice that treating it as "no URL"
// silently gate-rejected every single entry for ~13 days (2026-08-13 to
// 2026-08-25) before anyone noticed. Only used when the strict pattern
// finds nothing, and a bad match still has to actually resolve below —
// this doesn't relax the "must be a real, checkable source" requirement.
const BARE_DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s;,)"'<>]*)?/gi;

function extractCitationUrls(source) {
  const str = String(source || '');
  const urls = [...str.matchAll(URL_PATTERN)].map(m => m[0].replace(/[.,;]+$/, ''));
  if (urls.length > 0) return urls;
  return [...str.matchAll(BARE_DOMAIN_PATTERN)]
    .map(m => m[0].replace(/[.,;]+$/, ''))
    .map(u => `https://${u}`);
}

// Real-world finding (2026-08-30): legitimate, live sources (Washington
// Times, McAfee's blog) returned HTTP 403 to these checks — not because the
// page doesn't exist, but because their WAF blocks the generic User-Agent
// Node's fetch sends by default. Presenting as a normal browser (same
// pattern already used server-side in VerifyGuard's webTools.js) fixes the
// false negative without weakening what's actually being verified — the
// page still has to really resolve and really contain the claimed content.
const FETCH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function verifyCitationUrls(source) {
  const urls = extractCitationUrls(source);
  if (urls.length === 0) {
    return { ok: false, issues: ['source citation contains no URL at all — a citation must be checkable, not just a claimed organization name'] };
  }

  const issues = [];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let res;
      try {
        res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': FETCH_UA } });
        // Some servers reject HEAD outright even though the real page is fine — retry with GET before concluding the URL is dead.
        if (res.status === 405 || res.status === 403) {
          res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': FETCH_UA } });
        }
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) issues.push(`citation URL returned HTTP ${res.status}, not a real page: ${url}`);
    } catch (err) {
      issues.push(`citation URL failed to resolve (${err.message}): ${url}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

// A URL returning 200 only proves a page exists — it doesn't prove the page
// is actually about this scam. The likelier fabrication pattern isn't a
// dead link, it's a real, live citation pointing at a news site's homepage
// or an unrelated article instead of the specific piece that supposedly
// backs this entry. This fetches the cited page's real text and checks
// whether it actually mentions what the entry claims it's a source for.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'and', 'or', 'for', 'with',
  'this', 'that', 'it', 'its', 'on', 'at', 'from', 'by', 'as', 'be', 'been',
  'was', 'were', 'has', 'have', 'had', 'new', 'scam',
]);

// "scam" is excluded on purpose — it's in nearly every title in this
// database by construction, so it would pass against almost any page about
// any topic and add nothing to the check.
function significantWords(text) {
  return [...new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  )];
}

function stripHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .toLowerCase();
}

// At least half of the title's significant words must appear in the page.
// Titles here are required to be "short, specific" by the tool schema, so
// even a modest 50% overlap is a real signal — a citation pointing at an
// unrelated page matching half the words of a specific multi-word scam
// title by chance is very unlikely, while 50% (not 100%) still tolerates
// one term being paraphrased by the source article's own wording.
const RELEVANCE_THRESHOLD = 0.5;

async function checkContentRelevance(report) {
  const words = significantWords(report.title);
  if (words.length === 0) {
    return { ok: false, issues: ['title produced no significant words to check relevance against — title itself may be malformed'] };
  }

  const urls = extractCitationUrls(report.source);
  const attempts = [];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let res;
      try {
        res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': FETCH_UA } });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) { attempts.push({ url, matched: 0, of: words.length, error: `HTTP ${res.status}` }); continue; }
      const html = await res.text();
      const pageText = stripHtmlToText(html);
      const matched = words.filter(w => pageText.includes(w));
      attempts.push({ url, matched: matched.length, of: words.length, ratio: matched.length / words.length, pageText });
    } catch (err) {
      attempts.push({ url, matched: 0, of: words.length, error: err.message });
    }
  }

  const best = attempts.find(a => a.ratio >= RELEVANCE_THRESHOLD);
  if (best) {
    console.log(`Relevance check passed: ${best.url} matched ${best.matched}/${best.of} title words (${words.join(', ')}).`);
    // Returned so factCheckClaims can verify against the exact text this
    // check already fetched, instead of re-fetching the same page again.
    return { ok: true, issues: [], sourceText: best.pageText };
  }

  return {
    ok: false,
    issues: [
      `no cited URL's page content matched enough of the title's significant words (need ${Math.ceil(words.length * RELEVANCE_THRESHOLD)}/${words.length}: ${words.join(', ')}) — ` +
      attempts.map(a => `${a.url} matched ${a.matched}/${a.of}${a.error ? ` (${a.error})` : ''}`).join('; '),
    ],
  };
}

// The gates above establish that a citation exists, resolves, and is
// topically about the same subject — none of them confirm the *specific*
// facts in the entry (how the scam works, red flags, real examples) are
// actually supported by that source rather than embellished or invented.
// This is what replaces the "a human has to read this before it publishes"
// step: a second, independent Claude pass, given only the generated claims
// and the real fetched source text, asked to flag anything not actually
// supported. No web_search here on purpose — the point is scoring the
// claims against the exact text already verified as relevant, not giving
// the model a chance to rationalize a claim by finding some other page
// that happens to agree with it.
async function factCheckClaims(client, newReport, sourceText) {
  const claims = [
    `Title: ${newReport.title}`,
    `Summary: ${newReport.summary}`,
    `How it works: ${newReport.howItWorks}`,
    `Red flags: ${newReport.redFlags.join(' | ')}`,
    `Real examples: ${newReport.realExamples.join(' | ')}`,
    `First reported: ${newReport.firstReported}`,
  ].join('\n');

  const prompt = `You are fact-checking a scam-database entry against its cited source before it
publishes with no human review. Below are the entry's claims, then the full text of the page it
cites as its source.

Flag ONLY claims not actually supported by the source text — not stylistic paraphrasing, not a
claim that's plausible-but-unconfirmed, but a specific fact (a date, a named method, a named
institution, a statistic, a quote) asserted in the entry that the source text does not contain or
contradicts. A "real example" describing a pattern that generalizes beyond the source's exact
wording is fine; a fabricated specific (a made-up dollar figure, a named victim not in the
source, a statistic not present in the source) is not fine.

--- ENTRY CLAIMS ---
${claims}

--- SOURCE TEXT (truncated) ---
${sourceText.slice(0, 12000)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: 'You are a strict fact-checker. Call submit_fact_check exactly once.',
    tools: [{
      name: 'submit_fact_check',
      description: 'Submit your fact-check verdict.',
      input_schema: {
        type: 'object',
        properties: {
          verified: { type: 'boolean', description: 'true only if every factual claim is supported by the source text' },
          unsupportedClaims: { type: 'array', items: { type: 'string' }, description: 'Specific claims not supported by the source, if any' },
        },
        required: ['verified', 'unsupportedClaims'],
        additionalProperties: false,
      },
      strict: true,
    }],
    tool_choice: { type: 'tool', name: 'submit_fact_check' },
    messages: [{ role: 'user', content: prompt }],
  });

  const call = response.content.find(b => b.type === 'tool_use' && b.name === 'submit_fact_check');
  if (!call) return { ok: false, issues: ['fact-check pass did not return a verdict'] };
  if (!call.input.verified) {
    return { ok: false, issues: [`Fact-check found unsupported claims: ${(call.input.unsupportedClaims || []).join('; ')}`] };
  }
  return { ok: true, issues: [] };
}

function writeGithubOutput(fields) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(fields).map(([k, v]) => `${k}=${String(v).replace(/\n/g, ' ')}`);
  fs.appendFileSync(file, lines.join('\n') + '\n');
}

// Every fact must trace back to a real source actually fetched today — not
// only "don't invent facts" but "don't attribute a real fact to a source you
// didn't fetch," which is a distinct failure mode the fact-check gate caught
// in production (2026-08-25): a draft cited a real Malwarebytes article, then
// separately attributed other claims to an uninvolved "CyberSecurityNews"
// that was never fetched or verified. Shared across bots since both generate
// from web_search and are equally capable of doing this.
const CITATION_DISCIPLINE = `Cite exactly the source(s) you actually fetched and read via web_search —
never attribute a claim to a publication, agency, or report you did not yourself fetch, even if it
sounds plausible. Every specific fact (a statistic, a named method, a dollar figure, what the
malware/scam can technically do) must come from the text of a source you fetched, not be added for
color. If your one cited source doesn't support a detail, cut the detail — don't reach for an
uncited second source to back it up.`;

function buildScamEntryTool() {
  return {
    name: 'submit_scam_entry',
    description: 'Submit one genuinely current, real, cited scam trend to add to the database. Call this exactly once, only if you found solid, cited evidence for a trend not already in the existing titles list.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, specific title, e.g. "Fake Toll Road Text Scam"' },
        category: { type: 'string', enum: CATEGORIES },
        summary: { type: 'string', description: '1-2 sentences for a preview card' },
        howItWorks: { type: 'string', description: 'One paragraph, plain English, describing the mechanics of the scam' },
        redFlags: { type: 'array', items: { type: 'string' }, description: 'At least 3 items' },
        safetyTips: { type: 'array', items: { type: 'string' }, description: 'At least 3 items' },
        realExamples: {
          type: 'array',
          items: { type: 'string' },
          description: 'Describe real reported patterns/incidents from your sources without inventing named private individuals not mentioned in those sources',
        },
        relatedScams: {
          type: 'array',
          items: { type: 'string' },
          description: 'Titles of 1-3 related scams, chosen ONLY from the existing-titles list you were given',
        },
        spreadPlatforms: { type: 'array', items: { type: 'string' }, description: 'e.g. "Text Messages", "Email", "Social Media"' },
        firstReported: { type: 'string', description: 'Best-estimate ISO 8601 date this trend was first reported by your sources' },
        source: { type: 'string', description: 'Real, specific citation: publication/agency name plus the exact URL you found it at, always including the https:// scheme' },
      },
      required: ['title', 'category', 'summary', 'howItWorks', 'redFlags', 'safetyTips', 'realExamples', 'spreadPlatforms', 'firstReported', 'source'],
      additionalProperties: false,
    },
    strict: true,
  };
}

const skipTool = {
  name: 'skip_no_confident_finding',
  description: 'Call this instead of submit_scam_entry if you did not find a genuinely current, distinct, well-cited scam trend today.',
  input_schema: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
    required: ['reason'],
    additionalProperties: false,
  },
  strict: true,
};

// Shared orchestration: run the search/generate loop, then the full gate
// sequence, then write. Bot-specific behavior is injected via options rather
// than duplicated, since the two bots (general daily researcher, government-
// source scanner) need identical safety gates and only differ in what they
// search for and how they decide "already ran today."
//
//   buildSystemPrompt(existingTitles, forceSkip) -> string
//   alreadyRanToday(data, todayISO) -> bool        (default: reports.json's own lastUpdated)
//   extraGates: [{ name, check: async (report) => {ok, issues} }]
//   extraReportFields(entry) -> object             (merged into the written report)
async function runPipeline({ buildSystemPrompt, alreadyRanToday, extraGates = [], extraReportFields = () => ({}) }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set.');
    writeGithubOutput({ result: 'error', error: 'ANTHROPIC_API_KEY not set' });
    process.exitCode = 1;
    return;
  }

  const data = JSON.parse(fs.readFileSync(REPORTS_PATH, 'utf8'));
  const todayISO = new Date().toISOString().slice(0, 10);
  const defaultAlreadyRan = (d, today) => (d.lastUpdated || '').slice(0, 10) === today;
  const ranToday = (alreadyRanToday || defaultAlreadyRan)(data, todayISO);

  if (ranToday && !process.env.DRY_RUN) {
    console.log('Already ran today. Skipping without calling the API.');
    writeGithubOutput({ result: 'already-ran' });
    return;
  }

  const existingTitles = data.reports.map(r => r.title);
  const client = new Anthropic({ apiKey });
  const forceSkip = !!process.env.FORCE_SKIP_TEST;

  const toolDefinitions = [
    { type: 'web_search_20260209', name: 'web_search' },
    buildScamEntryTool(),
    skipTool,
  ];

  const messages = [{ role: 'user', content: 'Find and submit (or skip) today\'s scam trend entry.' }];
  let outcome = null;

  for (let turn = 0; turn < 8 && !outcome; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: buildSystemPrompt(existingTitles, forceSkip),
      tools: toolDefinitions,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    // A truncated response can still contain a syntactically-valid tool_use
    // block with the model's own stub/placeholder content stuffed into the
    // required fields to close out the JSON — never trust it if generation
    // didn't finish naturally.
    if (response.stop_reason === 'max_tokens') {
      console.error('Response was truncated (stop_reason=max_tokens) — refusing to trust its tool call.');
      writeGithubOutput({ result: 'error', error: 'Response truncated at max_tokens' });
      process.exitCode = 1;
      return;
    }

    const toolCalls = response.content.filter(b => b.type === 'tool_use');
    if (toolCalls.length === 0) {
      console.error('Model stopped without calling a tool.');
      writeGithubOutput({ result: 'error', error: 'Model stopped without calling a tool' });
      process.exitCode = 1;
      return;
    }

    const submit = toolCalls.find(c => c.name === 'submit_scam_entry');
    const skip = toolCalls.find(c => c.name === 'skip_no_confident_finding');

    if (submit) {
      outcome = { type: 'submit', input: submit.input };
      break;
    }
    if (skip) {
      outcome = { type: 'skip', input: skip.input };
      break;
    }

    // Only web_search calls left — the SDK/API executes these server-side
    // automatically as part of the same turn, so this loop mainly exists to
    // let the model take multiple search rounds before deciding.
    const toolResults = toolCalls.map(c => ({
      type: 'tool_result',
      tool_use_id: c.id,
      content: 'ok',
    }));
    messages.push({ role: 'user', content: toolResults });
  }

  if (!outcome) {
    console.error('Did not converge within the turn limit.');
    writeGithubOutput({ result: 'error', error: 'Did not converge within the turn limit' });
    process.exitCode = 1;
    return;
  }

  if (outcome.type === 'skip') {
    console.log('Skipped:', outcome.input.reason);
    writeGithubOutput({ result: 'skipped', reason: outcome.input.reason });
    return;
  }

  const entry = outcome.input;
  const nextId = String(Math.max(0, ...data.reports.map(r => parseInt(r.id, 10) || 0)) + 1);
  const newReport = {
    id: nextId,
    slug: slugify(entry.title),
    title: entry.title,
    summary: entry.summary,
    category: entry.category,
    firstReported: entry.firstReported,
    relatedScams: toArray(entry.relatedScams).filter(t => existingTitles.includes(t)),
    safetyTips: toArray(entry.safetyTips),
    datePublished: new Date().toISOString(),
    howItWorks: entry.howItWorks,
    redFlags: toArray(entry.redFlags),
    realExamples: toArray(entry.realExamples),
    source: entry.source,
    spreadPlatforms: toArray(entry.spreadPlatforms),
    isAIDiscovered: true,
    ...extraReportFields(entry),
  };

  console.log('Would write entry:', JSON.stringify(newReport, null, 2));

  // A gate rejecting a candidate is the safety net working as designed, not
  // a pipeline failure — it must not fail the Action run (no red X, no
  // exitCode 1). That would make "the gate caught something" and "the
  // pipeline is broken" look identical in run history. Only genuine
  // infrastructure problems (missing key, truncated response, an actual
  // thrown error) should fail the job; a rejected candidate just means no
  // entry publishes today, same as the model's own voluntary skip above.
  const issues = findQualityIssues(newReport);
  if (issues.length > 0) {
    console.error('Quality gate failed, refusing to write:', issues);
    writeGithubOutput({ result: 'gate-rejected', reason: `Quality gate: ${issues.join('; ')}` });
    return;
  }

  console.log('Verifying citation URL(s) resolve...');
  const citationCheck = await verifyCitationUrls(newReport.source);
  if (!citationCheck.ok) {
    console.error('Citation verification failed, refusing to write:', citationCheck.issues);
    writeGithubOutput({ result: 'gate-rejected', reason: `Citation verification: ${citationCheck.issues.join('; ')}` });
    return;
  }

  console.log('Checking cited page content is actually relevant...');
  const relevanceCheck = await checkContentRelevance(newReport);
  if (!relevanceCheck.ok) {
    console.error('Content relevance check failed, refusing to write:', relevanceCheck.issues);
    writeGithubOutput({ result: 'gate-rejected', reason: `Content relevance: ${relevanceCheck.issues.join('; ')}` });
    return;
  }

  for (const gate of extraGates) {
    console.log(`Running extra gate: ${gate.name}...`);
    const result = await gate.check(newReport);
    if (!result.ok) {
      console.error(`${gate.name} failed, refusing to write:`, result.issues);
      writeGithubOutput({ result: 'gate-rejected', reason: `${gate.name}: ${result.issues.join('; ')}` });
      return;
    }
  }

  console.log('Fact-checking claims against the cited source...');
  const factCheck = await factCheckClaims(client, newReport, relevanceCheck.sourceText);
  if (!factCheck.ok) {
    console.error('Fact-check failed, refusing to write:', factCheck.issues);
    writeGithubOutput({ result: 'gate-rejected', reason: `Fact-check: ${factCheck.issues.join('; ')}` });
    return;
  }

  if (process.env.DRY_RUN) {
    console.log('[DRY_RUN] Not writing to reports.json.');
    writeGithubOutput({ result: 'written', title: entry.title, citation: entry.source, dryRun: 'true' });
    return;
  }

  data.reports.push(newReport);
  data.version = (data.version || 0) + 1;
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(REPORTS_PATH, JSON.stringify(data, null, 2) + '\n');

  console.log(`Wrote new entry "${entry.title}" — version now ${data.version}.`);
  // summary/slug are read by the workflow's notify step to build the actual
  // push notification content — real per-entry text, not a generic string.
  writeGithubOutput({ result: 'written', title: entry.title, citation: entry.source, summary: entry.summary, slug: newReport.slug });
}

module.exports = {
  REPORTS_PATH,
  MODEL,
  CATEGORIES,
  CITATION_DISCIPLINE,
  extractCitationUrls,
  verifyCitationUrls,
  checkContentRelevance,
  writeGithubOutput,
  runPipeline,
};
