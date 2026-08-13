'use strict';

// Generates one static, crawlable HTML page per scam entry at /scams/<slug>.html,
// plus /scams/index.html (grouped by category) and /scams/az.html — replacing the
// old hash-routed SPA views (#/, #/az, #/wiki/*) as the canonical, indexable URLs.
// Re-run this any time api/reports.json changes (npm run build:scams).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORTS_PATH = path.join(ROOT, 'api', 'reports.json');
const SCAMS_DIR = path.join(ROOT, 'scams');
const SITE_ORIGIN = 'https://scampedia.net';

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A "Source:" line that just names an organization ("FTC Consumer Alerts")
// isn't actually checkable — 40 of the 52 entries in this database were
// launched that way, before entries were required to cite a real, resolvable
// URL. This renders a real citation as an actual link, and honestly flags
// the ones that aren't, right where a reader is deciding whether to trust
// the entry — not just in a homepage explainer most visitors won't see first.
const SOURCE_URL_PATTERN = /https?:\/\/[^\s;,)"'<>]+/;

function renderSourceCitation(source) {
  const segments = String(source || '').split(';').map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) return escapeHtml(source || '');

  const rendered = segments.map(seg => {
    const match = SOURCE_URL_PATTERN.exec(seg);
    if (!match) return escapeHtml(seg);
    const url = match[0].replace(/[.,;]+$/, '');
    const label = seg.slice(0, match.index).replace(/[,;]\s*$/, '').trim() || url;
    return `<a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a>`;
  });

  const hasAnyUrl = segments.some(seg => SOURCE_URL_PATTERN.test(seg));
  const joined = rendered.join(', ');
  return hasAnyUrl
    ? joined
    : `${joined} <span class="wiki-citation-note">(general reference, not linked to a specific article)</span>`;
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
  // Date-only ISO strings parse as UTC midnight — without pinning the
  // timeZone here, the displayed date shifts by a day depending on
  // whichever timezone the build happens to run in.
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Every scam page needs at least 3 "Related Scams" cross-links for internal
// linking / crawlability, but most entries only have 1-2 explicit ones —
// pad deterministically with same-category entries first, then any others.
function withPaddedRelated(report, allReports) {
  const existing = (report.relatedScams || []).filter(t => allReports.some(r => r.title === t && r.title !== report.title));
  if (existing.length >= 3) return existing.slice(0, 3);

  const have = new Set(existing);
  const sameCategory = allReports.filter(r => r.title !== report.title && r.category === report.category && !have.has(r.title));
  const others = allReports.filter(r => r.title !== report.title && r.category !== report.category && !have.has(r.title));

  const padded = [...existing];
  for (const candidate of [...sameCategory, ...others]) {
    if (padded.length >= 3) break;
    padded.push(candidate.title);
  }
  return padded;
}

function pageShell({ title, description, canonical, ogImage, jsonLd, bodyHtml, activeNav }) {
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
  <link rel="icon" type="image/png" sizes="128x128" href="../assets/favicon/favicon-128.png" />
  <link rel="apple-touch-icon" href="../assets/favicon/favicon-180.png" />
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body>

  <nav class="nav">
    <div class="nav-inner container">
      <a href="../index.html" class="nav-logo">
        <img src="../assets/logo-wordmark-dark.svg" alt="Scampedia" class="nav-logo-img" />
      </a>
      <div class="nav-links">
        <a href="../scampedia.html" class="${activeNav === 'database' ? 'active' : ''}">Scam Database</a>
        <a href="../learn/index.html">Learn</a>
        <a href="../index.html#how-it-works">How It Works</a>
        <a href="https://officialverifyguard.com#pricing">Pricing</a>
        <a href="https://officialverifyguard.com">Official Site</a>
        <a href="../index.html#get-app" class="btn btn-primary btn-sm">Download Free</a>
      </div>
    </div>
  </nav>

  <div class="wiki-shell container">
    <main class="wiki-main" id="wiki-main">
      ${bodyHtml}
    </main>
  </div>

  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <img src="../assets/logo-wordmark-dark.svg" alt="Scampedia" class="footer-logo-img" />
        <span class="footer-copy">© 2026 Scampedia. All rights reserved.</span>
      </div>
      <div class="footer-links">
        <a href="../scampedia.html">Scam Database</a>
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

function scamPageHtml(report, allReports) {
  const canonical = `${SITE_ORIGIN}/scams/${report.slug}.html`;
  const title = `${report.title} — How It Works & Red Flags | Scampedia`;
  const description = metaDescription(report.summary);
  const ogImage = `${SITE_ORIGIN}/assets/og/scampedia-share.png`;
  const publishedDate = formatDate(report.datePublished || report.firstReported);
  // getUTCFullYear, not getFullYear — a date-only ISO string parses as UTC
  // midnight, so local getFullYear() rolls back a year for anyone west of
  // UTC when firstReported falls on/near Jan 1.
  const firstReportedYear = report.firstReported ? new Date(report.firstReported).getUTCFullYear() : null;

  const relatedTitles = withPaddedRelated(report, allReports);
  const relatedReports = relatedTitles.map(t => allReports.find(r => r.title === t)).filter(Boolean);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: report.title,
    description,
    datePublished: report.datePublished || report.firstReported,
    dateModified: report.datePublished || report.firstReported,
    author: { '@type': 'Organization', name: 'Scampedia' },
    publisher: {
      '@type': 'Organization',
      name: 'Scampedia',
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/assets/favicon/favicon-180.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  const redFlags = report.redFlags || [];
  const safetyTips = report.safetyTips || [];
  const realExamples = report.realExamples || [];
  const spreadPlatforms = report.spreadPlatforms || [];
  const howItWorks = report.howItWorks || '';
  const source = report.source || 'Multiple user reports';

  const sections = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'how-it-works', label: 'How It Works', show: !!howItWorks },
    { id: 'red-flags', label: 'Red Flags', show: redFlags.length > 0 },
    { id: 'real-examples', label: 'Real Examples', show: realExamples.length > 0 },
    { id: 'platforms', label: 'Where It Spreads', show: spreadPlatforms.length > 0 },
    { id: 'protect', label: 'How to Protect Yourself', show: safetyTips.length > 0 },
    { id: 'related', label: 'Related Scams', show: true },
  ].filter(s => s.show);

  const bodyHtml = `
    <div class="wiki-breadcrumb">
      <a href="../scams/">Scampedia</a>
      <span class="sep">›</span>
      <a href="../scams/#${slugify(report.category)}">${escapeHtml(report.category)}</a>
      <span class="sep">›</span>
      <span>${escapeHtml(report.title)}</span>
    </div>

    <div class="wiki-article-header">
      <div class="wiki-cat-tag">${escapeHtml(report.category)}</div>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="wiki-byline">
        ${publishedDate ? `<span>Added ${publishedDate}</span><span class="sep">·</span>` : ''}
        ${report.isAIDiscovered ? `<span class="ai-pill">🧠 Discovered by VerifyGuard AI Brain</span><span class="sep">·</span>` : ''}
        <span>Source: ${renderSourceCitation(source)}</span>
      </div>
    </div>

    <div class="wiki-body">
      <div class="wiki-main-col">
        <div class="wiki-section" id="overview">
          <div class="wiki-section-heading">Overview</div>
          <p class="wiki-summary">${escapeHtml(report.summary)}</p>
        </div>

        <div class="wiki-toc">
          <div class="wiki-toc-title">Contents</div>
          <ol>${sections.map(s => `<li><a href="#${s.id}">${s.label}</a></li>`).join('')}</ol>
        </div>

        ${howItWorks ? `
        <div class="wiki-section" id="how-it-works">
          <div class="wiki-section-heading">How It Works</div>
          <p class="wiki-summary">${escapeHtml(howItWorks)}</p>
        </div>` : ''}

        ${redFlags.length ? `
        <div class="wiki-section" id="red-flags">
          <div class="wiki-section-heading">Red Flags</div>
          <ul class="wiki-redflags">${redFlags.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
        </div>` : ''}

        ${realExamples.length ? `
        <div class="wiki-section" id="real-examples">
          <div class="wiki-section-heading">Real Examples</div>
          <ul class="wiki-examples">${realExamples.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
        </div>` : ''}

        ${spreadPlatforms.length ? `
        <div class="wiki-section" id="platforms">
          <div class="wiki-section-heading">Where It Spreads</div>
          <div class="wiki-platforms">${spreadPlatforms.map(p => `<span class="wiki-platform-pill">${escapeHtml(p)}</span>`).join('')}</div>
        </div>` : ''}

        <div class="wiki-section" id="protect">
          <div class="wiki-section-heading">How to Protect Yourself</div>
          <ul class="wiki-tips">${safetyTips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        </div>

        <div class="wiki-section" id="related">
          <div class="wiki-section-heading">Related Scams</div>
          <div class="wiki-related">${relatedReports.map(r => `<a class="wiki-related-pill" href="${r.slug}.html">${escapeHtml(r.title)} →</a>`).join('')}</div>
        </div>

        <div class="wiki-citation">
          <strong>Source:</strong> ${renderSourceCitation(source)} &nbsp;·&nbsp;
          ${firstReportedYear ? `<strong>First reported:</strong> ${firstReportedYear} &nbsp;·&nbsp;` : ''}
          This entry is part of the same Scampedia database synced into the VerifyGuard app.
        </div>

        <div class="wiki-cta">
          <div class="wiki-cta-title">Worried you're being targeted right now?</div>
          <p>VerifyGuard scans photos, links, and messages in seconds and flags exactly these kinds of red flags automatically.</p>
          <a class="btn btn-primary" href="https://officialverifyguard.com">Protect Yourself with VerifyGuard →</a>
        </div>

        <a class="wiki-back-link" href="../scams/">← Back to all scams</a>
      </div>

      <div class="wiki-infobox">
        <div class="wiki-infobox-title">Quick Facts</div>
        <div class="wiki-infobox-row">
          <span class="wiki-infobox-label">Category</span>
          <span class="wiki-infobox-value">${escapeHtml(report.category)}</span>
        </div>
        <div class="wiki-infobox-row">
          <span class="wiki-infobox-label">First Reported</span>
          <span class="wiki-infobox-value">${firstReportedYear || '—'}</span>
        </div>
        <div class="wiki-infobox-row">
          <span class="wiki-infobox-label">Detected By</span>
          <span class="wiki-infobox-value">VerifyGuard AI</span>
        </div>
        ${report.isAIDiscovered ? `
        <div class="wiki-infobox-row">
          <span class="wiki-infobox-label">Discovery</span>
          <span class="wiki-infobox-value">🧠 AI Discovered</span>
        </div>` : ''}
      </div>
    </div>
  `;

  return pageShell({ title, description, canonical, ogImage, jsonLd, bodyHtml, activeNav: 'database' });
}

function indexPageHtml(allReports) {
  const canonical = `${SITE_ORIGIN}/scams/`;
  const title = 'Scam Database — Every Documented Scam | Scampedia';
  const description = `Browse ${allReports.length} documented scam patterns, organized by category — the same living database VerifyGuard scans for in real time.`;
  const ogImage = `${SITE_ORIGIN}/assets/og/scampedia-share.png`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonical,
  };

  const byCategory = {};
  allReports.forEach(r => { (byCategory[r.category] = byCategory[r.category] || []).push(r); });

  const icons = {
    'Phone Scam': '📞', 'AI Scam': '🤖', 'Government Scam': '🏛️',
    'Tech Scam': '💻', 'Romance Scam': '💔', 'Investment Scam': '💰',
    'Shopping Scam': '🛍️', 'Employment Scam': '💼', 'Delivery Scam': '📦',
    'Charity Scam': '❤️', 'Rental Scam': '🏠',
  };

  const categoriesHtml = Object.keys(byCategory).sort().map(cat => `
    <div class="wiki-section" id="${slugify(cat)}">
      <div class="wiki-section-heading">${icons[cat] || '⚠️'} ${escapeHtml(cat)} <span class="scam-card-date">(${byCategory[cat].length})</span></div>
      <div class="scam-grid">
        ${byCategory[cat].map(r => `
          <a class="scam-card" href="${r.slug}.html">
            <div class="scam-card-meta">
              <span class="scam-cat">${escapeHtml(r.category)}</span>
              ${r.isAIDiscovered ? `<span class="ai-pill">🧠 AI Discovered</span>` : ''}
            </div>
            <h3>${escapeHtml(r.title)}</h3>
            <p>${escapeHtml(r.summary.slice(0, 120))}…</p>
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');

  const bodyHtml = `
    <div class="wiki-browse-header">
      <h1>Scam Database</h1>
      <p>${allReports.length} documented scams, organized by category. Also see the <a href="az.html">A–Z index</a> or use <a href="../scampedia.html">live search</a>.</p>
    </div>
    ${categoriesHtml}
  `;

  return pageShell({ title, description, canonical, ogImage, jsonLd, bodyHtml, activeNav: 'database' });
}

function azPageHtml(allReports) {
  const canonical = `${SITE_ORIGIN}/scams/az.html`;
  const title = 'A–Z Scam Index | Scampedia';
  const description = `Every documented scam on Scampedia, listed alphabetically — ${allReports.length} entries and counting.`;
  const ogImage = `${SITE_ORIGIN}/assets/og/scampedia-share.png`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonical,
  };

  const sorted = [...allReports].sort((a, b) => a.title.localeCompare(b.title));
  const groups = {};
  sorted.forEach(r => {
    const letter = r.title[0].toUpperCase();
    (groups[letter] = groups[letter] || []).push(r);
  });

  const groupsHtml = Object.keys(groups).sort().map(letter => `
    <div>
      <div class="az-group-letter">${letter}</div>
      <div class="az-group-items">
        ${groups[letter].map(r => `
          <a class="az-item" href="${r.slug}.html">
            <span>${escapeHtml(r.title)}</span>
            <span class="az-item-cat">${escapeHtml(r.category)}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');

  const bodyHtml = `
    <div class="wiki-browse-header">
      <h1>A–Z Index</h1>
      <p>Every documented scam, alphabetically. Also see the <a href="./">category view</a>.</p>
    </div>
    <div class="az-list">${groupsHtml}</div>
  `;

  return pageShell({ title, description, canonical, ogImage, jsonLd, bodyHtml, activeNav: 'database' });
}

function buildSitemap(allReports) {
  const staticUrls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0' },
    { loc: `${SITE_ORIGIN}/scampedia.html`, priority: '0.9' },
    { loc: `${SITE_ORIGIN}/scams/`, priority: '0.9' },
    { loc: `${SITE_ORIGIN}/scams/az.html`, priority: '0.7' },
  ];
  const scamUrls = allReports.map(r => ({
    loc: `${SITE_ORIGIN}/scams/${r.slug}.html`,
    priority: '0.8',
    lastmod: (r.datePublished || r.firstReported || '').slice(0, 10),
  }));

  const urls = [...staticUrls, ...scamUrls].map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>\n    ` : ''}<changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(REPORTS_PATH, 'utf8'));
  const allReports = data.reports;

  fs.mkdirSync(SCAMS_DIR, { recursive: true });

  for (const report of allReports) {
    const html = scamPageHtml(report, allReports);
    fs.writeFileSync(path.join(SCAMS_DIR, `${report.slug}.html`), html);
  }

  fs.writeFileSync(path.join(SCAMS_DIR, 'index.html'), indexPageHtml(allReports));
  fs.writeFileSync(path.join(SCAMS_DIR, 'az.html'), azPageHtml(allReports));
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(allReports));

  console.log(`Built ${allReports.length} scam pages + index.html + az.html + sitemap.xml`);
}

main();
