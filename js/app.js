// VerifyGuard Website JS

const API_BASE = './api';

async function fetchReports() {
  try {
    const res = await fetch(`${API_BASE}/reports.json`);
    const data = await res.json();
    return data.reports || [];
  } catch {
    return FALLBACK_REPORTS;
  }
}

// ---- Home page: scam preview cards ----
async function renderHomePreview() {
  const el = document.getElementById('scam-preview');
  if (!el) return;
  const reports = await fetchReports();
  const preview = reports.slice(0, 3);
  el.innerHTML = preview.map(r => `
    <div class="scam-card" onclick="openModal(${JSON.stringify(r).replace(/"/g, '&quot;')})">
      <div class="scam-cat">${r.category}</div>
      <h3>${r.title}</h3>
      <p>${r.summary.slice(0, 110)}…</p>
      <div class="scam-count">🚨 ${r.reportCount.toLocaleString()} reports</div>
    </div>
  `).join('');
}

// ---- Scampedia page ----
let allReports = [];
let activeCategory = 'all';

async function renderScampedia() {
  const grid = document.getElementById('scam-grid');
  const countEl = document.getElementById('report-count');
  if (!grid) return;

  allReports = await fetchReports();
  if (countEl) countEl.textContent = `${allReports.length} documented scams`;

  bindSearch();
  bindFilters();
  renderGrid(allReports);
}

function renderGrid(reports) {
  const grid = document.getElementById('scam-grid');
  const none = document.getElementById('no-results');
  if (!grid) return;

  if (reports.length === 0) {
    grid.innerHTML = '';
    none && none.classList.remove('hidden');
    return;
  }
  none && none.classList.add('hidden');
  grid.innerHTML = reports.map(r => `
    <div class="scam-card" onclick='openModal(${JSON.stringify(r)})'>
      <div class="scam-cat">${r.category}</div>
      <h3>${r.title}</h3>
      <p>${r.summary.slice(0, 120)}…</p>
      <div class="scam-count">🚨 ${r.reportCount.toLocaleString()} reports</div>
    </div>
  `).join('');
}

function bindSearch() {
  const input = document.getElementById('search');
  if (!input) return;
  input.addEventListener('input', () => filterAndRender());
}

function bindFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      filterAndRender();
    });
  });
}

function filterAndRender() {
  const query = (document.getElementById('search')?.value || '').toLowerCase();
  let filtered = allReports;

  if (activeCategory !== 'all') {
    filtered = filtered.filter(r => r.category === activeCategory);
  }
  if (query) {
    filtered = filtered.filter(r =>
      r.title.toLowerCase().includes(query) ||
      r.summary.toLowerCase().includes(query) ||
      r.category.toLowerCase().includes(query) ||
      r.safetyTips.some(t => t.toLowerCase().includes(query))
    );
  }
  renderGrid(filtered);
}

// ---- Modal ----
function openModal(report) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) return;

  const tipsHtml = report.safetyTips.map(t => `<li>${t}</li>`).join('');
  const relatedHtml = report.relatedScams?.length
    ? `<p style="margin-top:20px;font-size:13px;color:var(--text-3)">Related: ${report.relatedScams.join(', ')}</p>`
    : '';

  content.innerHTML = `
    <div class="modal-cat">${report.category}</div>
    <div class="modal-title">${report.title}</div>
    <div class="modal-reports">🚨 ${report.reportCount.toLocaleString()} reports filed</div>
    <div class="modal-summary">${report.summary}</div>
    <div class="modal-tips-heading">Safety Tips</div>
    <ul class="modal-tips">${tipsHtml}</ul>
    ${relatedHtml}
  `;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('modal-close')?.addEventListener('click', closeModal);
document.getElementById('modal-overlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  renderHomePreview();
  renderScampedia();
});

// ---- Fallback data (if API unreachable) ----
const FALLBACK_REPORTS = [
  {
    id: "1", title: "Grandparent Emergency Scam",
    summary: "Scammers call pretending to be your grandchild in trouble needing urgent money via gift cards.",
    category: "Phone Scam", reportCount: 2847, relatedScams: ["AI Voice Clone Scam"],
    safetyTips: ["Never send money without calling back on a known number.", "Create a secret family code word."]
  },
  {
    id: "2", title: "AI Voice Clone Scam",
    summary: "Deepfake voice calls impersonating family members in manufactured emergency situations.",
    category: "AI Scam", reportCount: 1243, relatedScams: [],
    safetyTips: ["Establish a family safe word.", "Hang up and call back on a saved number."]
  },
  {
    id: "3", title: "Fake IRS Tax Refund",
    summary: "Calls claiming you owe back taxes or are due a refund if you pay a fee via gift cards.",
    category: "Government Scam", reportCount: 3921, relatedScams: [],
    safetyTips: ["The IRS never demands gift card payments.", "Verify at IRS.gov."]
  }
];
