'use strict';

// Real production break, 2026-09-18: a `run:` step in gov-scam-scan.yml
// spliced ${{ steps.generate.outputs.reason }} directly into a shell
// command. That value is free text the model wrote based on real scraped
// web content, and it happened to contain embedded double-quotes
// ("QR Code Scam") — which closed the intended -m "..." string early and
// let the rest of the text get parsed as bare `git` arguments: "error:
// pathspec 'Code' did not match any file(s) known to git", job failed, a
// real candidate was silently lost. This isn't just a formatting risk —
// it's the shape of real command injection in a job with `contents: write`
// and push access to `main`, since the text ultimately traces back to
// whatever a scraped page said.
//
// The fix (same commit as this test) was to route every such value through
// `env:` and reference it as `"$VAR"` instead of splicing `${{ }}` directly
// into the script — bash then treats it as one opaque string no matter what
// characters it contains, same as the SendGrid alert step and the
// notify-devices step already did elsewhere in these same files.
//
// This test is the guardrail against that regression quietly coming back:
// it statically scans both bot workflows' `run:` script bodies for any raw
// `${{ steps.generate.outputs.* }}` reference. Deliberately NOT using a
// real YAML parser (not already a dependency here, and not worth adding
// just for this) — instead a small indentation-aware line scanner that only
// needs to isolate `run:` block-scalar bodies from the rest of the file,
// which is enough for these two specific, simply-structured workflow
// files. Every current and future output field the generator script
// produces (reason, title, citation, titles, summary, reviewPath, count,
// ...) is either free text or could cheaply become free text in a future
// change — there's no field worth special-casing as "safe enough to splice
// directly." If this starts failing, the fix is never to loosen this test;
// move the new usage into `env:` the same way the others were fixed.

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const WORKFLOWS_DIR = path.join(__dirname, '..', '..', '.github', 'workflows');
const BOT_WORKFLOWS = ['daily-scam-entry.yml', 'gov-scam-scan.yml'];

const UNSAFE_PATTERN = /\$\{\{\s*steps\.generate\.outputs\.[a-zA-Z0-9_]+\s*\}\}/g;

// Returns [{ startLine, indent, text }] for every `run: |` block-scalar body
// in the file (1-indexed startLine = the line the `run:` key itself is on).
// Deliberately only handles the `run: |` block-scalar form used throughout
// these two files (not single-line `run: <cmd>`, which none of the
// step-output-touching steps use) — narrow on purpose, matching exactly
// what these files actually contain rather than general YAML.
function extractRunBlocks(fileText) {
  const lines = fileText.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)run:\s*\|\s*$/);
    if (!m) continue;
    const keyIndent = m[1].length;
    const bodyLines = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') { bodyLines.push(line); continue; }
      const lineIndent = line.match(/^(\s*)/)[1].length;
      if (lineIndent <= keyIndent) break;
      bodyLines.push(line);
    }
    blocks.push({ startLine: i + 1, indent: keyIndent, text: bodyLines.join('\n') });
    i = j - 1;
  }
  return blocks;
}

for (const filename of BOT_WORKFLOWS) {
  const filePath = path.join(WORKFLOWS_DIR, filename);

  test(`${filename}: no run: block splices a generator output directly into the shell script`, () => {
    const fileText = fs.readFileSync(filePath, 'utf8');
    const blocks = extractRunBlocks(fileText);

    const offenders = [];
    for (const block of blocks) {
      const matches = block.text.match(UNSAFE_PATTERN);
      if (matches) offenders.push({ nearLine: block.startLine, matches });
    }

    assert.deepEqual(
      offenders,
      [],
      `found run: block(s) in ${filename} splicing a generator output directly into the shell script instead of passing it via env: ` +
      JSON.stringify(offenders)
    );
  });

  test(`${filename}: the run: block extractor actually found something (sanity check for the test above)`, () => {
    const fileText = fs.readFileSync(filePath, 'utf8');
    const blocks = extractRunBlocks(fileText);
    assert.ok(blocks.length >= 5, `expected several run: blocks in ${filename}, found ${blocks.length} — if this fails, the extractor may have stopped matching this file's structure, which would make the test above silently check nothing`);
  });
}
