// VerifyGuard / Scampedia website JS

const API_BASE = './api';

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function fetchReports() {
  try {
    const res = await fetch(`${API_BASE}/reports.json`);
    const data = await res.json();
    return (data.reports || []).map(r => ({ ...r, slug: r.slug || slugify(r.title) }));
  } catch {
    return FALLBACK_REPORTS.map(r => ({ ...r, slug: r.slug || slugify(r.title) }));
  }
}

// ---- Home page: live entry count stat ----
async function renderEntryCountStat() {
  const el = document.getElementById('entry-count-stat');
  if (!el) return;
  const reports = await fetchReports();
  el.textContent = `${reports.length}+`;
}

// ---- Home page: scam preview cards (link straight into Scampedia articles) ----
async function renderHomePreview() {
  const el = document.getElementById('scam-preview');
  if (!el) return;
  const reports = await fetchReports();
  const preview = reports.slice(0, 3);
  el.innerHTML = preview.map(r => `
    <a class="scam-card" href="scampedia.html#/wiki/${r.slug}">
      <div class="scam-cat">${r.category}</div>
      <h3>${r.title}</h3>
      <p>${r.summary.slice(0, 110)}…</p>
      <div class="scam-count">🚨 ${r.reportCount.toLocaleString()} reports</div>
    </a>
  `).join('');
}

// ===========================
// SCAMPEDIA — wiki app (hash router)
// ===========================
let allReports = [];

async function initScampedia() {
  const main = document.getElementById('wiki-main');
  if (!main) return;

  allReports = await fetchReports();

  const countEl = document.getElementById('report-count');
  if (countEl) countEl.textContent = `${allReports.length} documented scams`;

  renderSidebarCategories();
  bindSidebarSearch();
  bindRandomLink();
  bindTocScrolling(main);
  bindReportForm();

  window.addEventListener('hashchange', route);
  route();
}

// In-article "Contents" box links (#how-it-works, #red-flags, etc.) must NOT
// touch location.hash — this app uses the hash for routing (#/wiki/slug), so
// letting a plain in-page anchor change it makes the router think you
// navigated away and replaces the whole article with the browse grid.
// Intercept the click and scroll manually instead.
function bindTocScrolling(main) {
  main.addEventListener('click', e => {
    const link = e.target.closest('.wiki-toc a');
    if (!link) return;
    e.preventDefault();
    const id = link.getAttribute('href').slice(1);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function bindRandomLink() {
  const link = document.getElementById('random-link');
  if (!link) return;
  link.addEventListener('click', e => {
    e.preventDefault();
    const pick = allReports[Math.floor(Math.random() * allReports.length)];
    if (pick) location.hash = `#/wiki/${pick.slug}`;
  });
}

function bindReportForm() {
  const btn = document.getElementById('report-scam-btn');
  const form = document.getElementById('report-scam-form');
  if (!btn || !form) return;

  btn.addEventListener('click', () => {
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
      document.getElementById('report-scam-details')?.focus();
    }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const details = document.getElementById('report-scam-details').value.trim();
    const email = document.getElementById('report-scam-email').value.trim();
    if (!details) return;

    const subject = encodeURIComponent('Scampedia Scam Report');
    const body = encodeURIComponent(
      `${details}\n\n${email ? `Reporter email: ${email}` : '(no email provided)'}`
    );
    window.location.href = `mailto:support@officialverifyguard.com?subject=${subject}&body=${body}`;

    form.reset();
    form.classList.add('hidden');
  });
}

function bindSidebarSearch() {
  const input = document.getElementById('search');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q) {
      location.hash = `#/search/${encodeURIComponent(q)}`;
    } else if (location.hash.startsWith('#/search')) {
      location.hash = '#/';
    }
  });
}

function renderSidebarCategories() {
  const el = document.getElementById('sidebar-cats');
  if (!el) return;
  const counts = {};
  allReports.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });
  const icons = {
    'Phone Scam': '📞', 'AI Scam': '🤖', 'Government Scam': '🏛️',
    'Tech Scam': '💻', 'Romance Scam': '💔', 'Investment Scam': '💰',
    'Shopping Scam': '🛍️', 'Employment Scam': '💼', 'Delivery Scam': '📦',
    'Charity Scam': '❤️', 'Rental Scam': '🏠'
  };
  el.innerHTML = Object.keys(counts).sort().map(cat => `
    <a href="#/category/${slugify(cat)}" class="sidebar-cat-link" data-cat="${cat}">
      <span>${icons[cat] || '⚠️'} ${cat}</span>
      <span class="sidebar-cat-count">${counts[cat]}</span>
    </a>
  `).join('');
}

function setActiveSidebar(navKey, catSlug) {
  document.querySelectorAll('.sidebar-link, .sidebar-cat-link').forEach(el => el.classList.remove('active'));
  if (navKey) document.querySelector(`.sidebar-link[data-nav="${navKey}"]`)?.classList.add('active');
  if (catSlug) document.querySelector(`.sidebar-cat-link[href="#/category/${catSlug}"]`)?.classList.add('active');
}

// ---- Router ----
function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [seg, ...rest] = hash.split('/');
  const param = rest.join('/');

  if (seg === 'wiki' && param) return renderArticle(param);
  if (seg === 'category' && param) return renderBrowse({ categorySlug: param });
  if (seg === 'search' && param) return renderBrowse({ query: decodeURIComponent(param) });
  if (seg === 'az') return renderAZIndex();
  return renderBrowse({});
}

// ---- Browse view (grid, optionally filtered) ----
function renderBrowse({ categorySlug, query }) {
  const main = document.getElementById('wiki-main');
  let reports = allReports;
  let heading = 'Latest Scam Reports';
  let sub = `The living Scampedia database — the same patterns VerifyGuard scans for in real time, newest first.`;
  let isFeed = true;

  if (categorySlug) {
    reports = reports.filter(r => slugify(r.category) === categorySlug);
    heading = reports[0]?.category || 'Category';
    sub = `${reports.length} scam${reports.length === 1 ? '' : 's'} in this category.`;
    setActiveSidebar(null, categorySlug);
    isFeed = false;
  } else if (query) {
    const q = query.toLowerCase();
    reports = reports.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.safetyTips.some(t => t.toLowerCase().includes(q))
    );
    heading = `Search: "${query}"`;
    sub = `${reports.length} result${reports.length === 1 ? '' : 's'} found.`;
    setActiveSidebar(null, null);
    isFeed = false;
    const input = document.getElementById('search');
    if (input && input.value !== query) input.value = query;
  } else {
    setActiveSidebar('all', null);
  }

  if (isFeed) {
    reports = [...reports].sort((a, b) =>
      new Date(b.datePublished || b.firstReported || 0) - new Date(a.datePublished || a.firstReported || 0)
    );
  }

  const gridHtml = reports.length
    ? `<div class="scam-grid">${reports.map(cardHtml).join('')}</div>`
    : `<div class="no-results"><div class="no-results-icon">🔍</div><p>No scams found.</p></div>`;

  main.innerHTML = `
    <div class="wiki-browse-header">
      <h1>${heading}</h1>
      <p>${sub}</p>
    </div>
    ${isFeed ? `<div class="wiki-feed-note"><span class="live-dot"></span> Synced live with the VerifyGuard app</div>` : ''}
    ${gridHtml}
  `;
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function cardHtml(r) {
  const date = formatDate(r.datePublished || r.firstReported);
  return `
    <a class="scam-card" href="#/wiki/${r.slug}">
      <div class="scam-card-meta">
        <span class="scam-cat">${r.category}</span>
        ${date ? `<span>·</span><span class="scam-card-date">${date}</span>` : ''}
        ${r.isAIDiscovered ? `<span class="ai-pill">🧠 AI Discovered</span>` : ''}
      </div>
      <h3>${r.title}</h3>
      <p>${r.summary.slice(0, 120)}…</p>
      <div class="scam-count">🚨 ${r.reportCount.toLocaleString()} reports</div>
    </a>
  `;
}

// ---- A-Z index ----
function renderAZIndex() {
  const main = document.getElementById('wiki-main');
  setActiveSidebar('az', null);

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
          <a class="az-item" href="#/wiki/${r.slug}">
            <span>${r.title}</span>
            <span class="az-item-cat">${r.category}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');

  main.innerHTML = `
    <div class="wiki-browse-header">
      <h1>A–Z Index</h1>
      <p>Every documented scam, alphabetically.</p>
    </div>
    <div class="az-list">${groupsHtml}</div>
  `;
}

// ---- Article page ----
function renderArticle(slug) {
  const main = document.getElementById('wiki-main');
  const report = allReports.find(r => r.slug === slug);
  setActiveSidebar(null, null);

  if (!report) {
    main.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">❓</div>
        <p>That article doesn't exist yet.</p>
        <a class="wiki-back-link" href="#/">← Back to all scams</a>
      </div>
    `;
    return;
  }

  const tipsHtml = report.safetyTips.map(t => `<li>${t}</li>`).join('');

  const relatedReports = (report.relatedScams || [])
    .map(title => allReports.find(r => r.title === title))
    .filter(Boolean);
  const relatedHtml = relatedReports.length
    ? `<div class="wiki-related">${relatedReports.map(r => `<a class="wiki-related-pill" href="#/wiki/${r.slug}">${r.title} →</a>`).join('')}</div>`
    : `<p class="wiki-no-related">No related scams documented yet.</p>`;

  const firstReportedYear = report.firstReported ? new Date(report.firstReported).getFullYear() : '—';
  const publishedDate = formatDate(report.datePublished || report.firstReported);
  const howItWorks = report.howItWorks || '';
  const redFlags = report.redFlags || [];
  const realExamples = report.realExamples || [];
  const spreadPlatforms = report.spreadPlatforms || [];
  const source = report.source || 'Multiple user reports';

  // Sections present drive both the Contents box and the body — kept in sync in one place.
  const sections = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'how-it-works', label: 'How It Works', show: !!howItWorks },
    { id: 'red-flags', label: 'Red Flags', show: redFlags.length > 0 },
    { id: 'real-examples', label: 'Real Examples', show: realExamples.length > 0 },
    { id: 'platforms', label: 'Where It Spreads', show: spreadPlatforms.length > 0 },
    { id: 'protect', label: 'How to Protect Yourself', show: tipsHtml.length > 0 },
    { id: 'related', label: 'Related Scams', show: true },
  ].filter(s => s.show);

  const tocHtml = `
    <div class="wiki-toc">
      <div class="wiki-toc-title">Contents</div>
      <ol>${sections.map(s => `<li><a href="#${s.id}">${s.label}</a></li>`).join('')}</ol>
    </div>
  `;

  main.innerHTML = `
    <div class="wiki-breadcrumb">
      <a href="#/">Scampedia</a>
      <span class="sep">›</span>
      <a href="#/category/${slugify(report.category)}">${report.category}</a>
      <span class="sep">›</span>
      <span>${report.title}</span>
    </div>

    <div class="wiki-article-header">
      <div class="wiki-cat-tag">${report.category}</div>
      <h1>${report.title}</h1>
      <div class="wiki-byline">
        ${publishedDate ? `<span>Added ${publishedDate}</span><span class="sep">·</span>` : ''}
        ${report.isAIDiscovered ? `<span class="ai-pill">🧠 Discovered by VerifyGuard AI Brain</span><span class="sep">·</span>` : ''}
        <span>Source: ${source}</span>
      </div>
    </div>

    <div class="wiki-body">
      <div class="wiki-main-col">
        <div class="wiki-section" id="overview">
          <div class="wiki-section-heading">Overview</div>
          <p class="wiki-summary">${report.summary}</p>
        </div>

        ${tocHtml}

        ${howItWorks ? `
        <div class="wiki-section" id="how-it-works">
          <div class="wiki-section-heading">How It Works</div>
          <p class="wiki-summary">${howItWorks}</p>
        </div>` : ''}

        ${redFlags.length ? `
        <div class="wiki-section" id="red-flags">
          <div class="wiki-section-heading">Red Flags</div>
          <ul class="wiki-redflags">${redFlags.map(f => `<li>${f}</li>`).join('')}</ul>
        </div>` : ''}

        ${realExamples.length ? `
        <div class="wiki-section" id="real-examples">
          <div class="wiki-section-heading">Real Examples</div>
          <ul class="wiki-examples">${realExamples.map(e => `<li>${e}</li>`).join('')}</ul>
        </div>` : ''}

        ${spreadPlatforms.length ? `
        <div class="wiki-section" id="platforms">
          <div class="wiki-section-heading">Where It Spreads</div>
          <div class="wiki-platforms">${spreadPlatforms.map(p => `<span class="wiki-platform-pill">${p}</span>`).join('')}</div>
        </div>` : ''}

        <div class="wiki-section" id="protect">
          <div class="wiki-section-heading">How to Protect Yourself</div>
          <ul class="wiki-tips">${tipsHtml}</ul>
        </div>

        <div class="wiki-section" id="related">
          <div class="wiki-section-heading">Related Scams</div>
          ${relatedHtml}
        </div>

        <div class="wiki-citation">
          <strong>Source:</strong> ${source} &nbsp;·&nbsp;
          <strong>First reported:</strong> ${firstReportedYear} &nbsp;·&nbsp;
          This entry is part of the same Scampedia database synced into the VerifyGuard app.
        </div>

        <a class="wiki-back-link" href="#/">← Back to all scams</a>
      </div>

      <div class="wiki-infobox">
        <div class="wiki-infobox-title">Quick Facts</div>
        <div class="wiki-infobox-row">
          <span class="wiki-infobox-label">Category</span>
          <span class="wiki-infobox-value">${report.category}</span>
        </div>
        <div class="wiki-infobox-row">
          <span class="wiki-infobox-label">First Reported</span>
          <span class="wiki-infobox-value">${firstReportedYear}</span>
        </div>
        <div class="wiki-infobox-row">
          <span class="wiki-infobox-label">Reports Filed</span>
          <span class="wiki-infobox-value">🚨 ${report.reportCount.toLocaleString()}</span>
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
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  renderHomePreview();
  renderEntryCountStat();
  initScampedia();
});

// ---- Fallback data (if API unreachable) ----
const FALLBACK_REPORTS = [
  {
    id: "1", title: "Grandparent Emergency Scam",
    summary: "Scammers call pretending to be your grandchild in trouble needing urgent money via gift cards.",
    category: "Phone Scam", firstReported: "2020-01-01T00:00:00Z", reportCount: 2847, relatedScams: ["AI Voice Clone Scam"],
    safetyTips: ["Never send money without calling back on a known number.", "Create a secret family code word."]
  },
  {
    id: "2", title: "AI Voice Clone Scam",
    summary: "Deepfake voice calls impersonating family members in manufactured emergency situations.",
    category: "AI Scam", firstReported: "2023-03-15T00:00:00Z", reportCount: 1243, relatedScams: [],
    safetyTips: ["Establish a family safe word.", "Hang up and call back on a saved number."]
  },
  {
    id: "3", title: "Fake IRS Tax Refund Scam",
    summary: "Calls claiming you owe back taxes or are due a refund if you pay a fee via gift cards.",
    category: "Government Scam", firstReported: "2015-06-01T00:00:00Z", reportCount: 3921, relatedScams: [],
    safetyTips: ["The IRS never demands gift card payments.", "Verify at IRS.gov."]
  }
];
