'use strict';

// Real production bug, found 2026-09-18 while investigating why the
// database hadn't grown in a week: stripHtmlToText() stripped tags from
// the ENTIRE fetched page with no attempt to isolate the real article from
// surrounding site chrome. For a page like consumer.ftc.gov with heavy
// nav/header/footer markup, the resulting "source text" handed to
// checkContentRelevance/triageCandidate/factCheckClaims was mostly
// cookie-banner and menu boilerplate ("skip to main content", "here's how
// you know", ...) with the real article buried or absent — confirmed
// against a real live FTC page in that session, not a synthetic case only.
// That starves the fact-check pass of real content to verify claims
// against, and was very plausibly behind a meaningful share of a whole
// week's "source doesn't actually contain the claimed content" false
// rejections on otherwise-real, well-cited candidates.
//
// This test is the guardrail: synthetic HTML shaped like the real
// failure case (heavy nav/header/footer noise, real content inside
// <main>), asserting the extracted text contains the real article and
// does NOT contain the chrome. If this starts failing, don't loosen the
// assertions — the fix regressed, not the test.

const test = require('node:test');
const assert = require('node:assert/strict');
const { stripHtmlToText } = require('../lib/scam-pipeline');

test('stripHtmlToText extracts <main> content, not surrounding nav/header/footer chrome', () => {
  const html = `
    <html>
      <head><title>Getting a pet? Avoid scams | Consumer Advice</title></head>
      <body>
        <header>
          <nav>
            <a href="#main">Skip to main content</a>
            <div>An official website of the United States government</div>
            <div>Here's how you know</div>
            <ul><li>Home</li><li>Consumer Alerts</li><li>Report Fraud</li></ul>
          </nav>
        </header>
        <main>
          <h1>Getting a pet? Avoid scams</h1>
          <p>Scammers are posting ads, particularly for puppies, pretending these
          precious pooches are for sale. Sometimes advertising purebred puppies
          for a few hundred dollars when they often cost thousands.</p>
        </main>
        <footer>
          <div>Browse by topic</div>
          <ul><li>Credit and debt (62)</li><li>Identity theft (127)</li></ul>
          <div>Recent consumer alerts</div>
        </footer>
      </body>
    </html>
  `;

  const text = stripHtmlToText(html);

  assert.ok(text.includes('puppies'), 'expected the real article content to survive extraction');
  assert.ok(text.includes('few hundred dollars'), 'expected the real article\'s specific detail to survive extraction');
  assert.ok(!text.includes('skip to main content'), 'nav chrome should not leak into the extracted text when <main> is present');
  assert.ok(!text.includes('browse by topic'), 'footer chrome should not leak into the extracted text when <main> is present');
  assert.ok(!text.includes('here'), 'the exact "here\'s how you know" nav phrase should not appear'); // weak on its own; paired with the header/footer checks above
});

test('stripHtmlToText falls back to stripping nav/header/footer when there is no <main> or <article>', () => {
  const html = `
    <html>
      <body>
        <nav><a href="#">Home</a><a href="#">About</a></nav>
        <header><div>Site Header Banner</div></header>
        <div class="content">
          <h1>BBB Scam Alert: Car wrap scams hook job seekers</h1>
          <p>A major brand is paying people hundreds of dollars a week to wrap
          their car with the company logo.</p>
        </div>
        <footer><div>Copyright Footer Text</div></footer>
        <aside><div>Related articles sidebar</div></aside>
      </body>
    </html>
  `;

  const text = stripHtmlToText(html);

  assert.ok(text.includes('hundreds of dollars a week'), 'expected the real article content to survive the fallback path');
  assert.ok(!text.includes('site header banner'), 'header content should be stripped in the fallback path');
  assert.ok(!text.includes('copyright footer text'), 'footer content should be stripped in the fallback path');
  assert.ok(!text.includes('related articles sidebar'), 'aside content should be stripped in the fallback path');
});

test('stripHtmlToText still handles a plain page with no nav/header/footer/main/article at all', () => {
  // Regression check for the pre-fix behavior on simple pages — the fix
  // must not make extraction WORSE for pages that never had this problem.
  const html = '<html><body><p>Some simple scam alert text with no layout chrome at all.</p></body></html>';
  const text = stripHtmlToText(html);
  assert.ok(text.includes('simple scam alert text'));
});
