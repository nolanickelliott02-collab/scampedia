# Project rules

Nothing describes the system in present tense until it runs in production. Copy describes actual behavior, never intended behavior.

Every false claim found in the 2026-08-09 copy audit came from writing the version we were building toward — a fabricated "AI mines scan activity in real time" claim, a hardcoded "Synced just now" timestamp that never updated, "community-updated" describing a form that only emails a notification, "reviewed by a person" asserted before the review gate had ever run once. None of these were invented to deceive; all of them were the intended end state written down before it was real. Check what the code actually does today before describing what it does, every time — not what the commit in progress is building toward.

## The 2026-08-09 audit findings, for pattern recognition

Four false claims shipped from one session writing homepage copy for a system that didn't exist yet, and none were caught for roughly two and a half months:

1. **Fabricated stats** — `47M+`, `$10B+`, and `1 in 3` on the homepage, none sourced to anything. Removed; the site now states only the one real, live-counted number.
2. **"AI mines scan activity in real time"** — described a data pipeline that was never built. The real pipeline is: a daily scheduled job generates one candidate entry, runs it through automated gates, and (as of this audit) opens a PR for a human to read before it publishes. Copy rewritten to say that.
3. **"Community-updated" / "we review every tip"** — the report form emails a notification directly; nothing about it is reviewed before storage, and nothing about it is "the community." Rewritten to say what the form actually does.
4. **Hardcoded "Synced just now"** — a static string in `scampedia.html`, unconditionally true-looking regardless of when the page was actually last built. Replaced with a real timestamp rendered from `reports.json`'s `lastUpdated` field.
5. **`reportCount`** — found 2026-08-09, fixed 2026-08-13. The daily-generation prompt asked the model for "a conservative estimate... if sources give no hard figure" and the result rendered as a bare `"50,000 reports"`-style fact on both this site and the iOS app, where it also drove a live "Most Reported" sort. Fixed by removing the field entirely, cross-repo — not relabeling as a bucketed/tiered estimate, which would have been the same fabrication with softer edges — from the generation schema, all rendering (site + app), the app's sort option, and every existing entry in `api/reports.json`.

The common root: describing the intended end state of a feature in the same commit that started building it, before it was true. Watch for this specifically whenever copy and implementation land together — the copy is very easy to write two steps ahead of what just shipped.

LLM-estimated figures never render as facts — not precise, not bucketed into a tier or label like "widespread." A guess with the edges sanded off is still a guess. If a number or category can't be sourced, either don't show it or say plainly that it's an estimate.
