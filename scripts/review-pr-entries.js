#!/usr/bin/env node
'use strict';

// Keeps the weekly review PR's description in step with the entries in its
// diff (see scripts/lib/review-entries.js).
//
//   node scripts/review-pr-entries.js render [--base origin/main]
//       Prints the entry list for the current checkout vs the base.
//   node scripts/review-pr-entries.js splice --body-file <f> [--base origin/main]
//       Prints the PR body with its entry list replaced (or appended).
//   node scripts/review-pr-entries.js check --body-file <f> [--base origin/main]
//       Exits 1 if the body's entry list doesn't match the diff.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { diffEntries, renderBlock, spliceBody, bodyMatches } = require('./lib/review-entries');

const ROOT = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

function reportsAt(ref) {
  const text = ref ? git('show', `${ref}:api/reports.json`) : fs.readFileSync(path.join(ROOT, 'api/reports.json'), 'utf8');
  return JSON.parse(text).reports;
}

function currentBlock(base) {
  const reviewFiles = git('diff', '--name-status', base, 'HEAD', '--', 'review/')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status: status[0], path: rest[rest.length - 1] };
    });
  return renderBlock(diffEntries(reportsAt(base), reportsAt('HEAD')), reviewFiles);
}

function main() {
  const mode = process.argv[2];
  const base = arg('--base', 'origin/main');
  const block = currentBlock(base);
  if (mode === 'render') {
    process.stdout.write(`${block}\n`);
    return 0;
  }
  const bodyFile = arg('--body-file');
  if (!bodyFile) throw new Error('--body-file is required');
  const body = fs.readFileSync(bodyFile, 'utf8');
  if (mode === 'splice') {
    process.stdout.write(spliceBody(body, block));
    return 0;
  }
  if (mode === 'check') {
    if (bodyMatches(body, block)) {
      console.log('The PR description lists exactly the entries in the diff.');
      return 0;
    }
    console.error('The PR description does not match the entries in the diff. It should say:\n');
    console.error(block);
    return 1;
  }
  throw new Error(`unknown mode "${mode}" (render, splice or check)`);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
}
