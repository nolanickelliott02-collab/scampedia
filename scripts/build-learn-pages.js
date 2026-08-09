'use strict';

// Generates one static, crawlable HTML page per course lesson at
// /learn/<slug>.html, plus /learn/index.html — following the same
// static-generation pattern as build-scam-pages.js (source data in,
// real HTML file at a real path out, no client-side rendering of
// primary content). Also appends /learn/ URLs into sitemap.xml (which
// build:scams regenerates first) and writes llms.txt.
//
// Run: node scripts/build-learn-pages.js (or npm run build, which runs
// check-content first — an expired lesson fails before this ever runs).
//
// IMPORTANT for whoever builds Phase 4 (the paywall-boundary config):
// any lesson with `pageType: crisis` in its frontmatter (currently just
// i-think-ive-been-scammed.md) must stay free and unauthenticated
// unconditionally — per the governing rule, crisis content is never
// paywalled, permanently. That must be an override the paywall config
// can't touch, not something that happens to be free today because it's
// early in the lesson list.

const fs   = require('fs');
const path = require('path');
const { marked } = require('marked');
const { parseFrontmatter, isExampleFile } = require('./lib/frontmatter');

const ROOT         = path.join(__dirname, '..');
const LESSONS_DIR   = path.join(ROOT, 'content', 'lessons');
const VOLATILE_PATH = path.join(ROOT, 'content', 'volatile.json');
const REPORTS_PATH   = path.join(ROOT, 'api', 'reports.json');
const LEARN_DIR      = path.join(ROOT, 'learn');
const SITEMAP_PATH   = path.join(ROOT, 'sitemap.xml');
const LLMS_PATH       = path.join(ROOT, 'llms.txt');
const SITE_ORIGIN     = 'https://scampedia.net';

// Read live, not hardcoded — this count changes daily via the real scam-entry
// pipeline, so a hardcoded number in a trust-building blurb would be visibly
// wrong within a day. Reading it fresh at build time means it's automatically
// correct on every rebuild, the same mechanism the scam database pages use
// for their own counts.
function currentScamCount() {
  try {
    return JSON.parse(fs.readFileSync(REPORTS_PATH, 'utf8')).reports.length;
  } catch {
    return null;
  }
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function metaDescription(summary) {
  const clean = summary.trim();
  if (clean.length <= 155) return clean;
  const cut = clean.slice(0, 152);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ---- Load lessons -----------------------------------------------------

function loadLessons() {
  if (!fs.existsSync(LESSONS_DIR)) return [];
  const files = fs.readdirSync(LESSONS_DIR)
    .filter(f => f.endsWith('.md') && !isExampleFile(f))
    .sort(); // numeric filename prefixes (01-, 02-, ...) control course order

  return files.map(file => {
    const raw = fs.readFileSync(path.join(LESSONS_DIR, file), 'utf8');
    const parsed = parseFrontmatter(raw);
    if (!parsed) throw new Error(`[${file}] missing or malformed frontmatter — should have been caught by check-content`);
    return { file, ...parsed.data, volatileRefs: parsed.data.volatileRefs || [], rawBody: parsed.body };
  });
}

function loadVolatile() {
  if (!fs.existsSync(VOLATILE_PATH)) return {};
  return JSON.parse(fs.readFileSync(VOLATILE_PATH, 'utf8'));
}

// ---- Volatile-fact substitution ----------------------------------------
// {{volatile:<key>}} in a lesson body is replaced with real Markdown built
// from that key's `methods` array (each method's steps become a numbered
// list) BEFORE the whole body is parsed as Markdown together — so the
// output is real semantic <h3>/<ol> structure, not an opaque text blob.

function volatileToMarkdown(entry, key) {
  if (!entry) return `\n> **Missing volatile.json entry: \`${key}\`**\n`;
  if (entry.methods && entry.methods.length) {
    return entry.methods.map(m => `\n**${m.title}**\n\n${m.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`).join('\n');
  }
  if (entry.resources && entry.resources.length) {
    return '\n' + entry.resources.map(r => `- **[${r.name}](${r.url})** — ${r.whenToUse}`).join('\n') + '\n';
  }
  return entry.value ? `\n${entry.value}\n` : `\n> **[${key}] has no methods, resources, or value to render]**\n`;
}

function substituteVolatile(rawBody, volatile) {
  return rawBody.replace(/\{\{volatile:([a-z0-9-]+)\}\}/gi, (_, key) => volatileToMarkdown(volatile[key], key));
}

// ---- Markdown rendering with heading IDs + TOC collection --------------

function renderBody(markdownSource) {
  const toc = [];
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const html = this.parser.parseInline(tokens);
    // textRenderer strips formatting AND leaves entities un-escaped (a
    // literal apostrophe, not &#39;) — using the HTML output instead (even
    // after stripping tags) leaves entities behind, which corrupts both the
    // slug ("won-39-t") and, if reused for display text, double-escapes to
    // a visibly broken "&amp;#39;". Plain text needs the text renderer, not
    // a tag-stripped HTML string.
    const text = this.parser.parseInline(tokens, this.parser.textRenderer);
    const id   = slugify(text);
    if (depth === 2) toc.push({ id, text });
    return `<h${depth} id="${id}">${html}</h${depth}>\n`;
  };
  const html = marked.parse(markdownSource, { renderer });
  return { html, toc };
}

// ---- Page shell ----------------------------------------------------

function courseShell({ title, description, canonical, ogImage, jsonLd, bodyHtml, activeNav, suppressAppCta }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Scampedia" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${ogImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${ogImage}" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/styles.css" />
  <link rel="stylesheet" href="../css/course.css" />
  <link rel="icon" type="image/png" sizes="128x128" href="../assets/favicon/favicon-128.png" />
  <link rel="apple-touch-icon" href="../assets/favicon/favicon-180.png" />
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body class="course-page">

  <nav class="nav">
    <div class="nav-inner container">
      <a href="../index.html" class="nav-logo">
        <img src="../assets/logo-wordmark-dark.svg" alt="Scampedia" class="nav-logo-img" />
      </a>
      <div class="nav-links">
        <a href="../scams/">Scam Database</a>
        <a href="../learn/index.html" class="${activeNav === 'learn' ? 'active' : ''}">Learn</a>
        ${suppressAppCta ? '' : `
        <a href="https://officialverifyguard.com#pricing">Pricing</a>
        <a href="https://officialverifyguard.com">Official Site</a>
        <a href="../index.html#get-app" class="btn btn-primary btn-sm">Download Free</a>`}
      </div>
    </div>
  </nav>

  <div class="course-shell">
    ${bodyHtml}
  </div>

  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <img src="../assets/logo-wordmark-dark.svg" alt="Scampedia" class="footer-logo-img" />
        <span class="footer-copy">© 2026 Scampedia. All rights reserved.</span>
      </div>
      <div class="footer-links">
        <a href="../learn/index.html">Learn</a>
        <a href="https://officialverifyguard.com">Official Site</a>
        <a href="https://officialverifyguard.com/privacy.html">Privacy Policy</a>
        <a href="mailto:verifyguardsupport@gmail.com">Contact</a>
      </div>
    </div>
  </footer>

</body>
</html>
`;
}

// ---- Lesson page --------------------------------------------------

function lessonPageHtml(lesson, numberedLessons, volatile) {
  const isCrisis = lesson.pageType === 'crisis';
  const canonical = `${SITE_ORIGIN}/learn/${lesson.slug}.html`;
  const title = `${lesson.title} | Scampedia Learn`;
  const description = metaDescription(lesson.summary);
  const ogImage = `${SITE_ORIGIN}/assets/og/scampedia-share.png`;
  const reviewedDate = formatDate(lesson.lastReviewed);

  const markdownSource = substituteVolatile(lesson.rawBody, volatile);
  const { html: bodyHtmlRaw, toc } = renderBody(markdownSource);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: lesson.title,
    description,
    datePublished: lesson.lastReviewed,
    dateModified: lesson.lastReviewed,
    author: { '@type': 'Organization', name: 'Scampedia' },
    publisher: {
      '@type': 'Organization',
      name: 'Scampedia',
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/assets/favicon/favicon-180.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  // The crisis page isn't part of the numbered course sequence — it doesn't
  // make sense to cycle "prev/next" between it and, say, reverse image
  // search, so it's excluded from this array entirely rather than just
  // skipped when found.
  let navLinksHtml;
  if (isCrisis) {
    navLinksHtml = '';
  } else {
    const idx = numberedLessons.findIndex(l => l.slug === lesson.slug);
    const prev = idx > 0 ? numberedLessons[idx - 1] : null;
    const next = idx < numberedLessons.length - 1 ? numberedLessons[idx + 1] : null;
    navLinksHtml = `
    <div class="course-nav-links">
      ${prev ? `<a href="${prev.slug}.html">← ${escapeHtml(prev.title)}</a>` : `<span class="disabled">← Previous</span>`}
      ${next ? `<a href="${next.slug}.html">${escapeHtml(next.title)} →</a>` : `<span class="disabled">Next →</span>`}
    </div>`;
  }

  const bodyHtml = `
    <div class="course-breadcrumb">
      <a href="index.html">Learn</a>
      <span class="sep"> › </span>
      <span>${escapeHtml(lesson.title)}</span>
    </div>

    <div class="course-article-header">
      <h1>${escapeHtml(lesson.title)}</h1>
      <div class="course-byline">
        ${reviewedDate ? `Last reviewed: ${reviewedDate}` : ''}
        ${lesson.access === 'free' ? ' · Free' : ' · Guardian'}
      </div>
    </div>

    <p class="course-lead">${escapeHtml(lesson.summary)}</p>

    ${toc.length ? `
    <div class="course-toc">
      <div class="course-toc-title">On this page</div>
      <ol>${toc.map(t => `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`).join('')}</ol>
    </div>` : ''}

    <div class="course-body">${bodyHtmlRaw}</div>

    ${navLinksHtml}

    <a class="course-back-link" href="index.html">← All lessons</a>
  `;

  return courseShell({ title, description, canonical, ogImage, jsonLd, bodyHtml, activeNav: 'learn', suppressAppCta: isCrisis });
}

// ---- /learn/index.html ----------------------------------------------

function indexPageHtml(numberedLessons, crisisPages) {
  const canonical = `${SITE_ORIGIN}/learn/index.html`;
  const title = 'Learn — Spotting Scams and AI-Generated Content | Scampedia';
  const description = 'Free, plain-language lessons on verifying what you see online — reverse image search, checking context, and more.';
  const ogImage = `${SITE_ORIGIN}/assets/og/scampedia-share.png`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonical,
  };

  const crisisHtml = crisisPages.map(l => `
    <a class="course-list-item course-list-item-crisis" href="${l.slug}.html">
      <span class="course-access-pill free">Free — start here if this is urgent</span>
      <h3>${escapeHtml(l.title)}</h3>
      <p>${escapeHtml(l.summary)}</p>
    </a>
  `).join('');

  const listHtml = numberedLessons.map(l => `
    <a class="course-list-item" href="${l.slug}.html">
      <span class="course-access-pill ${l.access}">${l.access === 'free' ? 'Free' : 'Guardian'}</span>
      <h3>${escapeHtml(l.title)}</h3>
      <p>${escapeHtml(l.summary)}</p>
    </a>
  `).join('');

  const scamCount = currentScamCount();

  const bodyHtml = `
    <div class="course-article-header">
      <h1>Learn</h1>
      <div class="course-byline">Free, plain-language lessons on verifying what you see online.</div>
    </div>

    <p class="course-lead">
      Part of Scampedia's scam-database work${scamCount ? ` — ${scamCount}+ real, documented scams and counting` : ''} — and the same real-time detection used in the <a href="https://officialverifyguard.com">VerifyGuard app</a>. Every fact here that can go out of date (which tool to use, which number to call) is checked against its real, current source before it's published, and reviewed on a set schedule — the "Last reviewed" date on each lesson is real, not a deploy timestamp.
    </p>
    ${crisisHtml ? `<div class="course-list">${crisisHtml}</div><div style="margin-bottom:32px"></div>` : ''}
    <div class="course-list">${listHtml}</div>
  `;

  return courseShell({ title, description, canonical, ogImage, jsonLd, bodyHtml, activeNav: 'learn' });
}

// ---- sitemap.xml — append /learn/ URLs to what build:scams wrote -------

function updateSitemap(allLessons) {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.warn('[build:learn] sitemap.xml not found — run build:scams first. Skipping sitemap update.');
    return;
  }
  let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');

  // Idempotent: strip any /learn/ URLs from a previous run before re-adding,
  // so re-running build:learn without build:scams doesn't duplicate entries.
  sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/scampedia\.net\/learn\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');

  const learnUrls = [
    { loc: `${SITE_ORIGIN}/learn/index.html`, priority: '0.9' },
    // Crisis pages get the highest priority on the whole site — someone
    // reaching one is mid-emergency, and it's the query nobody optimizes
    // for because it doesn't convert, which is exactly why it matters here.
    ...allLessons.map(l => ({
      loc: `${SITE_ORIGIN}/learn/${l.slug}.html`,
      priority: l.pageType === 'crisis' ? '1.0' : '0.85',
      lastmod: l.lastReviewed,
    })),
  ];

  const urlsXml = learnUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>\n    ` : ''}<changefreq>monthly</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  sitemap = sitemap.replace('</urlset>', `${urlsXml}\n</urlset>`);
  fs.writeFileSync(SITEMAP_PATH, sitemap);
}

// ---- llms.txt --------------------------------------------------------

function buildLlmsTxt(allLessons) {
  const crisisPages     = allLessons.filter(l => l.pageType === 'crisis');
  const numberedLessons = allLessons.filter(l => l.pageType !== 'crisis');

  const lines = [
    '# Scampedia',
    '',
    '> Scampedia is a free scam and AI-generated-content education site: a scam database, a photo/video/link detector (via the VerifyGuard app), and plain-language lessons on verifying what you see online.',
    '',
    ...(crisisPages.length ? [
      '## If you think you\'ve already been scammed',
      '',
      ...crisisPages.map(l => `- [${l.title}](${SITE_ORIGIN}/learn/${l.slug}.html): ${l.summary}`),
      '',
    ] : []),
    '## Learn',
    '',
    ...numberedLessons.map(l => `- [${l.title}](${SITE_ORIGIN}/learn/${l.slug}.html): ${l.summary}`),
    '',
    '## Scam Database',
    '',
    `- [Scam Database](${SITE_ORIGIN}/scams/): every documented scam pattern, organized by category`,
    `- [A–Z Index](${SITE_ORIGIN}/scams/az.html): every documented scam, alphabetically`,
    '',
  ];
  fs.writeFileSync(LLMS_PATH, lines.join('\n'));
}

// ---- Main ---------------------------------------------------------

function main() {
  const lessons  = loadLessons();
  const volatile = loadVolatile();

  if (!lessons.length) {
    console.log('[build:learn] No lessons in content/lessons/ (example files are excluded). Nothing to build.');
    return;
  }

  const numberedLessons = lessons.filter(l => l.pageType !== 'crisis');
  const crisisPages      = lessons.filter(l => l.pageType === 'crisis');

  fs.mkdirSync(LEARN_DIR, { recursive: true });

  for (const lesson of lessons) {
    const html = lessonPageHtml(lesson, numberedLessons, volatile);
    fs.writeFileSync(path.join(LEARN_DIR, `${lesson.slug}.html`), html);
  }
  fs.writeFileSync(path.join(LEARN_DIR, 'index.html'), indexPageHtml(numberedLessons, crisisPages));

  updateSitemap(lessons);
  buildLlmsTxt(lessons);

  console.log(`Built ${lessons.length} page(s) (${numberedLessons.length} lesson, ${crisisPages.length} crisis) + learn/index.html, updated sitemap.xml + llms.txt`);
}

main();
