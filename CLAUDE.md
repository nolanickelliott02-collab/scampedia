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

## Publishing and the app's phrase list (2026-11-05)

Bots never publish. They add entries to the `scampedia/pending-batch` branch, and Nick's merge of the weekly review PR is the only path to the live site. Bots also never write `api/patterns.json` (the phrase list the VerifyGuard app matches scans against); they only queue proposals in `review/phrase-queue.json`. Keep both rules when changing the pipeline. Public copy (index.html, about.html) says new entries wait for the editor's weekly review; that copy ships in the same merge as the pipeline change, so it's never live before it's true. Don't claim any specific entry was reviewed.

The review PR's description lists every entry in its diff, between `<!-- review-entries:start -->` and `<!-- review-entries:end -->` (added 2026-11-06 after PR #38's description said "no new entries" while it published one). `scripts/review-pr-sync.sh` rewrites that list; the bots run it after every push, and `.github/workflows/review-pr-entries.yml` runs it after a person pushes. It sets a "Review entries" status that fails if the list doesn't match the diff, and keeps one comment with the final list for the head commit. Don't hand-edit the list; change the branch instead.


## Retention of message text (VerifyGuard platform rule, 2026-11-05)

Message text is never stored without the user's explicit opt-in, and opted-in scrubbed text is deleted after 180 days. This applies to anything that reaches VerifyGuard's systems, including data this repo reads or produces.

## Merging pull requests (Nick's rule, 2026-11-06)

Never merge any pull request unless Nick says "merge #N" for that specific PR. General approval ("go ahead", "merge it", "do what you can") is not a merge instruction, and a "merge #N" covers only that PR. When unsure which PR is meant, ask.

## Permanent IDs and shared contracts (Phase 1, 2026-11-06)

- An entry's permanent ID is `scampedia:<slug>`, never its integer `id`. Integers get reused (id 127 was first a rejected UK entry, then the SSA fake-badge entry), and the app's built-in entries used 1-9.
- A published slug never changes, even when the title does. `data/published-slugs.json` records every slug (the page builder adds new ones); `scripts/__tests__/permanent-ids.test.js` fails if one disappears. To take an entry down, move its slug to `retired` with a date and reason (`rollback-last-entry.js` does this).
- `scripts/lib/contracts/` is a copy of the platform contracts from the server repo. Don't edit it here; change the server's copy and copy it over.
- Tests run one file at a time (`--test-concurrency=1`): several tests rebuild the real site pages, and running them in parallel made `build-idempotency` fail about 1 run in 6.

## Git safety (Nick, 2026-11-09)

- Never run git commands that can overwrite or discard work in Nick's folders without asking him first: `git stash pop` / `git stash apply`, `git reset --hard`, `git checkout -- <file>` / `git checkout <commit> -- <file>` / `git restore`, `git clean`, and force pushes.
- For experiments (e.g. checking a test fails on old code), use a separate worktree (`git worktree add`) or a scratch copy, never the working tree.
