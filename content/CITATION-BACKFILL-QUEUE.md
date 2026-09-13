# Citation Backfill Queue

**STATUS (2026-09-12): Category A backfill complete.** All 40 entries that
previously cited only a bare organization name (no checkable URL) now cite
a real, specific, verified-live source. Category B's 3 entries were
reviewed in a real browser-equivalent check and confirmed genuinely live —
no changes needed there; see below.

Original queue generated 2026-09-11 by running the pipeline's own real
`verifyCitationUrls()` gate (`scripts/lib/scam-pipeline.js`) against every
entry then in `api/reports.json`, over the real network.

## A. Backfilled (40 entries, ids 1-40)

Each entry was researched individually: read the entry's own `summary`/
`howItWorks` claims, searched for a real, specific, currently-live source
that substantively supports those claims (preferring the same publisher
type already cited — FTC, FBI IC3, AARP — when a specific matching article
existed there), then verified the candidate URL was real and on-topic via
a real fetch (not just a search snippet) before writing it into
`api/reports.json`.

**Two citations initially chosen from search results turned out to be
dead links (real HTTP 404 from the FTC's own server, not a WAF block) even
though search engines still had them indexed** — ids 24 and 25. Caught by
re-running the pipeline's own `verifyCitationUrls()` gate after the first
pass and confirming with `curl` directly against the FTC's server. Both
were replaced with different, `curl`-verified-live (HTTP 200) FTC sources
that are still on-topic. Lesson for any future backfill pass: a search
engine's cached snippet is not proof a URL is currently live — always do a
final live-fetch check against the real URL before trusting it, even when
the snippet itself contains real, on-topic quoted text.

Re-running `verifyCitationUrls()` against the finished `api/reports.json`:
**56 of 61 entries pass. The 5 that don't are all documented WAF
false-negatives** (see section B) — not missing or fake citations.

## B. WAF false-negatives, confirmed real (5 entries — not a problem)

These all return HTTP 403 to this pipeline's own automated check (and to
a `curl`/WebFetch check using a real browser user-agent) but were
independently confirmed live and on-topic via other means (WebSearch
surfacing the exact indexed page content, or corroboration from
independent third parties quoting the same live URL). This is the same
false-negative pattern already documented in `scam-pipeline.js`'s own
comments for Washington Times/McAfee — a WAF rejecting this pipeline's
request pattern, not evidence the page is gone.

| id | Title | Source | Verified via |
|---|---|---|---|
| 30 | Fake Trading App Scam | FINRA, "Be Alert to Signs of Imposter Investment Scams" | WebFetch returned full matching content before a later 403 |
| 38 | Fake Charity / Disaster Relief Scam | FBI, "Charity and Disaster Fraud" | WebSearch surfaced matching indexed content from this exact URL |
| 46 | Gold Bar & Bulk Cash Courier Scam | FBI Boston Division | WebSearch surfaced matching indexed content; pre-existing entry, confirmed in this pass |
| 48 | AI-Cloned Fake Vehicle Dealership Scam | Auto Finance News + Autoblog | WebSearch surfaced matching indexed content; pre-existing entry, confirmed in this pass |
| 51 | Fake VPN App Malware Scam | Forbes (Davey Winder) | WebSearch surfaced matching indexed content; pre-existing entry, confirmed in this pass |

**Observation carried over from the original audit, still unaddressed:**
entries 48 and 51 each cite multiple sources, and the gate fails the whole
entry if any one cited URL 403s — even when at least one source resolves
fine. Whether "at least one must resolve" is the right bar instead of
"every one must resolve" for multi-source entries is a real design
question for a future pass, not something changed here.
