# Scampedia Pipeline Runbook

Written for you at 11pm with no context. If something's wrong with the site right now, start at **"How to know it's broken"** below and work down — don't read this top to bottom first.

> **This runbook describes the pipeline once PRs #6-#13 (the Phase 0-2 audit/hardening pass) are merged.** As of this writing they're open but not merged. If you're reading this before merging them, some of what's described below (the dedup gate, retries, the rollback script, the structured run summary) doesn't exist on `main` yet — check `git log` / the PR list if something here doesn't match what you see.

---

## How it works, in one page

Two independent GitHub Actions bots research and publish one scam-database entry a day, straight to `main`, with no human in the loop — a chain of automated gates stands in for review. GitHub Pages serves `main` directly, so a successful push *is* the deploy.

```
17:00 UTC daily-scam-entry.yml           23:00 UTC gov-scam-scan.yml
  │  (general news/FTC/FBI/BBB search)     │  (primary .gov sources only)
  ▼                                        ▼
  Claude searches the web, proposes ONE entry or explicitly skips
  │
  ▼
  Quality gate       — structural completeness, no placeholder/degenerate text
  ▼
  Dedup gate         — normalized title + primary source URL vs every existing entry
  ▼
  Citation gate      — every cited URL actually resolves (HEAD/GET, retried on 5xx)
  ▼
  Relevance gate      — the cited page's real text actually matches the title
  ▼
  [gov bot only] .gov-hostname gate
  ▼
  Fact-check gate     — a 2nd, independent Claude pass checks specific claims against
                         the exact fetched source text (this is what stands in for
                         "a human reads this first")
  ▼
  written → rebuild static pages (build:scams + build:learn) → git push to main
```

**Any gate rejecting a candidate is the system working, not a bug.** The job still ends green (no red X) — that's deliberate, so "a bad candidate got caught" and "the pipeline is broken" don't look identical in run history. A rejected day is a normal day. What's *not* normal is the same rejection reason repeating for many days in a row — see below.

**A third workflow, `scampedia-staleness-check.yml`, runs independently** ~20 minutes after the daily bot, checks `https://scampedia.net/api/reports.json`'s real `lastUpdated` field over HTTP (not git state — this is what lets it catch a dead CDN/deploy, not just a dead bot), and fails if it's more than 5 days old.

**Key files:**
- `scripts/lib/scam-pipeline.js` — every gate, shared by both bots
- `scripts/generate-daily-scam.js` / `scripts/generate-gov-scam.js` — the two bots' prompts
- `scripts/check-live-staleness.js` — the dead-man's-switch check
- `api/reports.json` — the entire database, one JSON file, git-committed
- `scripts/build-scam-pages.js` / `scripts/build-learn-pages.js` — regenerate every static page + `sitemap.xml` + `llms.txt` from `api/reports.json` / `content/lessons/`

---

## How to know it's broken

**⚠️ Known gap as of this writing: the SendGrid email alerts below may not actually be arriving.** A full mailbox search for "Scampedia Watchdog" / the alert sender turned up nothing, despite the staleness check firing real failures for 9 straight days (Sep 2-10). This was **not** fixed in this pass (deferred by explicit choice) — the detection logic is real and tested, but verify delivery is actually working (check the SendGrid dashboard's Activity Feed, and that `SENDGRID_API_KEY` is set in the repo's Actions secrets) before trusting your inbox to tell you something's wrong. Until then, check manually:

1. **Is the site actually current?**
   ```
   curl -s https://scampedia.net/api/reports.json | grep lastUpdated
   ```
   Compare against today's date. If it's more than a day or two stale, something's wrong.

2. **What do the last few runs actually say?**
   `github.com/nolanickelliott02-collab/scampedia/actions/workflows/daily-scam-entry.yml` (and the `gov-scam-scan.yml` one). Every run is green by design even on a rejection — click into the run and open its **Summary** tab (not the raw logs): the structured run summary (added in this pass) shows the bot name, result, and the exact gate + reason for every outcome, right there, no log-scrolling required.

3. **Is the staleness check itself green?**
   `.../actions/workflows/scampedia-staleness-check.yml`. If *this* is red, the live site is genuinely stale — go to "Roll back" below only if the last publish was bad; otherwise this just means no bot has published in >5 days, which is itself worth investigating via #2.

---

## The 3 most likely failures, and how to fix them

### 1. A gate is rejecting every candidate, every day

**Symptom:** many days in a row of `gate-rejected` in the run summary, same gate each time.

This happened twice before (documented in `scripts/lib/scam-pipeline.js`'s own comments): once when the citation gate treated a bare domain like `bbb.org/article/123` as "no URL" for 13 days straight (fixed by adding a bare-domain fallback), and once when a WAF started 403-ing the pipeline's generic User-Agent on some real, live sources (fixed by sending a real browser User-Agent).

**Fix:**
- Read the exact rejection reason in the run Summary tab — it names the gate and the specific issue.
- If it's the **citation** or **relevance** gate rejecting real, live URLs: something about how those pages are being fetched has changed (a new WAF, a redirect chain, a format change). Test it directly:
  ```
  node -e "require('./scripts/lib/scam-pipeline').verifyCitationUrls('SOURCE STRING HERE').then(r => console.log(r))"
  ```
- If it's the **fact-check** gate: read the specific unsupported claim it flagged. If it's a false positive (the source really does support the claim), the fact-check prompt in `scam-pipeline.js`'s `factCheckClaims()` may need tightening.
- If it's the **dedup** gate rejecting things that aren't actually duplicates: check `normalizeTitleForDedup()` / `primarySourceKey()` in `scam-pipeline.js` — a title normalization that's too aggressive (collapsing two genuinely different titles to the same key) is the likely cause.

### 2. `ANTHROPIC_API_KEY` is missing, expired, or rate-limited

**Symptom:** run result is `error`, not `gate-rejected` — check the Summary tab, the `error` field says exactly what the SDK returned (auth failure, rate limit, etc.).

**Fix:** repo Settings → Secrets and variables → Actions → confirm `ANTHROPIC_API_KEY` exists and is current. This is the one failure mode that isn't self-healing — every other gate failure just means "no entry today," but a bad key means **zero** entries until someone fixes it, on either bot.

### 3. The push to `main` itself fails (merge conflict / protected branch / permissions)

**Symptom:** `error` result specifically at or after the "Publish directly to main" step, or the run summary shows `written` but nothing new is actually live. `gov-scam-scan.yml` already does a `git pull --rebase` before pushing to guard against the (normally-impossible, given the 6-hour schedule offset) case of both bots racing.

**Fix:** confirm the workflow's `permissions: contents: write` block is still present (a repo-wide default permissions change could silently strip it), and that no branch protection rule on `main` requires a PR/review — either would make this push fail every time with no other symptom.

---

## How to roll back the last publish

```
npm run rollback:last-entry -- --dry-run   # see what it would do first
npm run rollback:last-entry                # actually remove it + delete its page
npm run build:scams && npm run build:learn # regenerate index/az/sitemap.xml/llms.txt
git diff                                    # LOOK at this before the next step
git add -A && git commit -m "Roll back: <title>"
git push origin main
```

`rollback:last-entry` targets the most recently **published** entry (max `datePublished`), not the highest id — pass a specific id (`npm run rollback:last-entry -- <id>`) to roll back something else instead. It never commits or pushes on its own; you always see the diff first.

If you need to roll back something other than the single newest entry, or roll back multiple entries, do it the same way but by hand: remove the entry object from `api/reports.json`, delete `scams/<slug>.html`, then the same rebuild/diff/commit/push steps above.

---

## Things that look broken but aren't

- **A gate rejecting a candidate.** No entry published today is the safety net working, not a failure. Only worry if the *same* gate rejects for many days straight (see failure #1 above).
- **Only one bot published today, or neither did.** Both bots are allowed to find nothing on any given day — that's by design, not a bug.
- **The homepage/scampedia.html count doesn't match `api/reports.json.reports.length` immediately after a publish.** `learn/index.html`'s entry count is computed at *build* time from `api/reports.json`, so it's only as current as the last time `build:learn` ran — which, once these PRs merge, is every successful publish.

---

## What this runbook doesn't cover

- The 40 legacy launch entries (ids 1-40) that cite only an organization name with no real URL (e.g. "FTC Consumer Alerts") — a known, flagged, not-yet-backfilled gap, tracked separately, not a pipeline bug.
- SendGrid alert delivery — see the callout at the top of "How to know it's broken."
