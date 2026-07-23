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
// guess just to have something to publish today.
//
// Env vars:
//   DRY_RUN=1          run the real API call, print the result, never write the file
//   FORCE_SKIP_TEST=1  force the model down the skip path, to test that branch for real

try { require('dotenv').config(); } catch { /* optional in CI, where env is injected directly */ }

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const REPORTS_PATH = path.join(__dirname, '..', 'api', 'reports.json');
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

function writeGithubOutput(fields) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(fields).map(([k, v]) => `${k}=${String(v).replace(/\n/g, ' ')}`);
  fs.appendFileSync(file, lines.join('\n') + '\n');
}

const toolDefinitions = [
  {
    type: 'web_search_20260209',
    name: 'web_search',
  },
  {
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
        reportCount: { type: 'number', description: 'Conservative estimate of how many people have reported this; use a modest number for a newly-emerging trend if sources give no hard figure' },
        source: { type: 'string', description: 'Real, specific citation: publication/agency name plus the URL you found it at' },
      },
      required: ['title', 'category', 'summary', 'howItWorks', 'redFlags', 'safetyTips', 'realExamples', 'spreadPlatforms', 'firstReported', 'reportCount', 'source'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
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
  },
];

function buildSystemPrompt(existingTitles, forceSkip) {
  const base = `You are a research analyst for Scampedia, a public scam-database encyclopedia. Use
web_search to find ONE genuinely current, real scam trend being reported by news outlets, the FTC,
FBI/IC3, BBB, or similar consumer-protection sources within roughly the last few weeks to months.

Do NOT invent, guess, or extrapolate from training data alone — every fact must trace back to a
real source you actually searched for today. Do NOT propose anything already in this existing
titles list (case-insensitive, near-duplicates count as matches too):
${existingTitles.map(t => `- ${t}`).join('\n')}

If you find a solid, well-cited, genuinely distinct trend, call submit_scam_entry exactly once.
If you don't find anything that meets that bar, call skip_no_confident_finding exactly once —
do not submit a low-confidence or thin entry just to have something to publish today.`;

  if (forceSkip) {
    return `${base}\n\nTESTING OVERRIDE: regardless of what you find, you MUST call skip_no_confident_finding this run.`;
  }
  return base;
}

async function run() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set.');
    writeGithubOutput({ result: 'error', error: 'ANTHROPIC_API_KEY not set' });
    process.exitCode = 1;
    return;
  }

  const data = JSON.parse(fs.readFileSync(REPORTS_PATH, 'utf8'));
  const todayISO = new Date().toISOString().slice(0, 10);
  const lastUpdatedDate = (data.lastUpdated || '').slice(0, 10);

  if (lastUpdatedDate === todayISO && !process.env.DRY_RUN) {
    console.log(`Already ran today (lastUpdated=${data.lastUpdated}). Skipping without calling the API.`);
    writeGithubOutput({ result: 'already-ran' });
    return;
  }

  const existingTitles = data.reports.map(r => r.title);
  const client = new Anthropic({ apiKey });
  const forceSkip = !!process.env.FORCE_SKIP_TEST;

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
    reportCount: entry.reportCount,
    relatedScams: toArray(entry.relatedScams).filter(t => existingTitles.includes(t)),
    safetyTips: toArray(entry.safetyTips),
    datePublished: new Date().toISOString(),
    howItWorks: entry.howItWorks,
    redFlags: toArray(entry.redFlags),
    realExamples: toArray(entry.realExamples),
    source: entry.source,
    spreadPlatforms: toArray(entry.spreadPlatforms),
    isAIDiscovered: true,
  };

  console.log('Would write entry:', JSON.stringify(newReport, null, 2));

  const issues = findQualityIssues(newReport);
  if (issues.length > 0) {
    console.error('Quality gate failed, refusing to write:', issues);
    writeGithubOutput({ result: 'error', error: `Quality gate failed: ${issues.join('; ')}` });
    process.exitCode = 1;
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
  writeGithubOutput({ result: 'written', title: entry.title, citation: entry.source });
}

run().catch(err => {
  console.error('Unexpected error:', err);
  writeGithubOutput({ result: 'error', error: err.message });
  process.exitCode = 1;
});
