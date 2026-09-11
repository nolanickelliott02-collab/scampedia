// Shared "newest first" ordering for report cards. Extracted so the
// homepage preview and the /scampedia.html live feed can never independently
// drift on what "newest" means — see the bug this fixed: the homepage
// preview used to take reports.slice(0, 3) straight off the JSON array with
// no sort at all, which is insertion order, not recency. Since the launch
// batch of 40 legacy entries was inserted first, that widget — badged
// "Latest Entries" — showed the same three pre-2024 entries forever, no
// matter how many new AI-discovered entries the daily pipeline published.
//
// Plain script (no bundler on this site), loaded as a normal <script> tag
// before app.js so it's usable in the browser, but also exported via
// module.exports when required from Node so it's unit-testable without a
// DOM. Keep this file free of any `document`/`window` reference.
function sortReportsByNewest(reports) {
  return [...reports].sort((a, b) =>
    new Date(b.datePublished || b.firstReported || 0) - new Date(a.datePublished || a.firstReported || 0)
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sortReportsByNewest };
}
