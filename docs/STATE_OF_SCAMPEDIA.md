# State of Scampedia — after the Phase 0-6 audit/build pass

Written 2026-09-11. Covers 17 PRs (#6-#22 — check the actual numbers in the PR list, since this list is ordered by work, not necessarily final numbering) opened against `main`, **none merged yet** — everything below describes what's true once you merge them, not what's live on scampedia.net today. A full local integration test (all 17 branches merged into one throwaway branch, never pushed) confirmed they combine cleanly: 2 small `package.json`/script-tag conflicts, both trivial "keep both lines," resolved and documented below.

## What was fixed (confirmed real, not assumed)

**Pipeline correctness (Phase 1)**
- Homepage "Latest Entries" widget showed 3 fixed pre-2024 entries forever — no sort at all, not a bad sort. Fixed, plus the A-Z sort (already correct) got extracted and tested too.
- Homepage claimed (6 places) that a human merges every entry via PR — false since `ab386f8`, replaced by an automated fact-check gate. Rewritten to describe the real mechanism.
- `/learn/`'s footer template had drifted from the actually-committed pages (wrong Privacy link, missing Terms of Service) — the next real edit would have silently regressed all 7 pages. Fixed the template.
- Neither daily bot ran `build:learn`, so `build:scams`'s sitemap overwrite erased `/learn/`'s sitemap entries every single day. Wired `build:learn` into both workflows.
- Added a test proving the citation gate actually blocks uncited/dead-link entries (it did; now it's verified, not just read).

**Pipeline hardening (Phase 2)**
- Real dedup gate: normalized title + primary source URL, not just the model's own judgment.
- `fetchWithRetry()`: exponential backoff on 5xx, no infinite loop, used by both network-checking gates.
- `timeout-minutes` on every workflow job (was unset — 360min default); `--max-time 15` on every alert curl call.
- Structured run summary: every outcome now logs a JSON line and a real Markdown table in the GitHub Actions Summary tab, not just scattered console.log.
- `npm run rollback:last-entry` — one command, `--dry-run` first, never auto-commits.
- `docs/PIPELINE_RUNBOOK.md` — how it works, how to know it's broken, the 3 most likely failures, how to roll back.

**Content quality (Phase 3)**
- `content/CITATION-BACKFILL-QUEUE.md`: 43 of 61 live entries (70%) fail the real citation gate — 40 never had a URL (the launch batch), 3 have a real URL that now 403s (likely bot-blocking, flagged separately). **Nothing in `api/reports.json` was rewritten** — this is a queue for manual research, per instruction.
- Editorial triage step (`triageCandidate()`): scores distinct-pattern/novelty/severity/credibility, routes low-confidence candidates to `review/` instead of publishing. **Adds a real ongoing cost** — one more Claude call per candidate per day, on each bot. Read its PR before merging; don't rubber-stamp it with the smaller fixes.
- `docs/CROSS_REFERENCING.md`: researched live — FTC/IC3/BBB have no public feed for this data. No integration built; documented why, and what a real one would actually need.
- Crisis page audited: accurate, live sources (all 4 resource URLs verified), correct heading structure, calm tone. No defect found.

**Discoverability (Phase 4)**
- `llms-full.txt` added (llms.txt already existed) — every lesson's real body + every scam entry's real mechanics inlined, not just links.

**Experience (Phase 5)**
- Two real WCAG violations, found by an actual Lighthouse run (not skipped as "unverifiable"): color-contrast (`--text-3` was 2.63:1, fixed to ~5.4:1) and heading-order (h1→h3 skip on the browse grid; every entry page's "Overview"/"Red Flags"/etc. were `<div>`s, not headings at all — zero screen-reader heading navigation on any of the 61 entry pages). **Accessibility: 91/89/93 → 100/100/100** on the three pages audited before/after.
- Render-blocking Google Fonts + missing `fonts.gstatic.com` preconnect, fixed with the standard async-loadCSS pattern. **Performance: home 91→99, crisis 85→100.**
- Unsized logo `<img>`s given real dimensions from the SVG's own aspect ratio.
- Typo-tolerant search (real Levenshtein fallback, tried only when exact match returns nothing) + zero-results page now shows real category suggestions and a way back, instead of a dead end.

## Final combined numbers (all 17 branches merged locally, Lighthouse re-run for real)

| Page | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Home | 98 | 100 | 100 | 100 |
| Database browse | 85 | 100 | 100 | 100 |
| Scam entry | 100 | 100 | 100 | 100 |
| Crisis page | 100 | 100 | 100 | 100 |

Task target was Performance ≥90 and SEO ≥95. SEO and Accessibility are 100 everywhere tested. Performance clears 90 on 3 of 4; the database browse page sits at 85 because its own client-side JS (fetching `reports.json`, rendering the grid) dominates its Largest Contentful Paint — not something the font/image fixes in this pass touch. See "Deferred" below.

## Deliberately deferred (with reasons)

| Item | Why deferred |
|---|---|
| SendGrid alert delivery (U1) | Searched the connected inbox for the "Scampedia Watchdog" alerts — zero hits, despite 9 real staleness-check failures firing in early September. Detection logic is real and tested; delivery is unverified. **Deferred by explicit choice earlier in this session**, not fixed. Needs either a GitHub token (to read Actions run logs) or direct SendGrid dashboard access — neither available in this environment. |
| 43 uncited/broken-citation entries | Flagged in `content/CITATION-BACKFILL-QUEUE.md`, not rewritten. Real research needed per entry; the pipeline's own gates can't manufacture a citation that was never there. |
| `unminified-css`/`unminified-javascript`/`uses-text-compression` (Lighthouse) | Would need a minification/bundling build step this static site doesn't have — a real architecture addition, not a template fix. Not attempted here. |
| `uses-long-cache-ttl` (Lighthouse) | GitHub Pages' own cache headers, not controllable from this repo. |
| Database browse page's Performance (85, not ≥90) | Its own JS/fetch work dominates LCP. Would need profiling `js/app.js`'s render path specifically — out of scope for a font/image pass. |
| Tap-target sizing (44px minimum) | Manual CSS review found a couple of borderline cases (`.btn-sm`, `.sidebar-link`, ~34-38px), but Lighthouse's `tap-targets` audit did not fire in this environment at all — no confirmed violation to point to. Noted, not "fixed," to avoid inventing a defect without evidence. |
| Cross-referencing against FTC/IC3/BBB (Phase 3c) | No public feed exists for any of the three, researched live. See `docs/CROSS_REFERENCING.md`. |
| Attorney/legal review of privacy copy | Outside this pass's scope entirely — a standing item from before this audit. |

## Remaining risks, stated honestly

- **This entire pass is unmerged.** Nothing here is live until the PRs are reviewed and merged, in whatever order makes sense — the "small reconciliation" notes in each PR's description (and fully resolved on the local integration test) tell you what to expect when two touch the same lines.
- **The triage classifier (Phase 3b PR) changes production cost and behavior.** It's the one PR in this pass that isn't a pure fix — it adds a recurring API cost and a new `review/` queue that needs a human to actually check. Read it on its own.
- **No lint tooling exists.** Tests are real (`node --test`, 60 passing across the combined branches) but nothing enforces style/lint automatically. Not fixed in this pass — adding one wasn't asked for and would be a separate decision.
- **No CI runs on pull requests.** `npm test` and `npm run build` were run manually (documented in every PR), but nothing in this repo automatically re-runs them when a PR is opened or updated. Worth adding a `pull_request`-triggered workflow as a follow-up — not built here, since it's a new workflow, not a fix to an existing one.
- **The full end-to-end pipeline (a real model call through every gate) could not be dry-run in this environment** — no `ANTHROPIC_API_KEY` available here. Every individual gate is tested against its real logic (dedup, retry, citation resolution, triage scoring via a fake-but-real-shaped Anthropic client), and the wiring between them was verified by direct code reading, but nobody has run the actual multi-turn `web_search` conversation loop against this exact merged code. Do a `workflow_dispatch` run of `daily-scam-entry.yml` with `DRY_RUN=1` after merging, before trusting it fully.
- **The 43-entry citation backfill is real work, not a quick follow-up.** Budget real time for it; don't let the flagged list sit indefinitely once merged.

## Exact commands

```bash
# Install
npm ci

# Full test suite (60 tests across the combined branches)
npm test

# Full build (content-health check, then regenerate every static page + sitemap + llms files)
npm run build

# Roll back the most recently published entry
npm run rollback:last-entry -- --dry-run   # see what it would do first
npm run rollback:last-entry                # actually do it

# Manually trigger either bot (needs ANTHROPIC_API_KEY set in the repo's Actions secrets)
# via github.com/nolanickelliott02-collab/scampedia/actions -> Run workflow
# Add DRY_RUN=1 as a repo/environment variable first to test without publishing.
```

See `docs/PIPELINE_RUNBOOK.md` for how to know it's broken and fix the 3 most likely failures, and `content/CITATION-BACKFILL-QUEUE.md` / `docs/CROSS_REFERENCING.md` for the two Phase 3 findings that need a human decision, not more code.
