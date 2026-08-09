# Content Review Queue

Generated 2026-08-09 by `scripts/check-content-health.js`. Sorted soonest-due first. Re-run after any content change.

## Lessons — reviewBy date

| Due | Lesson | decayRisk | Status |
|---|---|---|---|
| 2026-11-06 | Reverse Image Search | high | ok |
| 2026-11-06 | I Think I've Already Been Scammed | high | ok |
| 2026-11-07 | Content Credentials and C2PA | high | ok |
| 2026-12-06 | Why "Just Look at the Hands" Stopped Working | medium | ok |
| 2027-02-04 | Where Did This Come From? | low | ok |
| 2027-02-04 | What to Do When You're Not Sure | low | ok |
| 2027-02-05 | What Is It Actually Asking You to Do? | low | ok |

## Volatile facts — lastVerified date

| Age | Key | checkUrl | Status |
|---|---|---|---|
| 1d | reverse-image-search-iphone-steps | https://support.google.com/websearch/answer/1325808?hl=en&co=GENIE.Platform%3DiOS | ok |
| 1d | reverse-image-search-desktop-steps | https://support.google.com/websearch/answer/1325808?hl=en&co=GENIE.Platform%3DDesktop | ok |
| 1d | crisis-reporting-resources | https://reportfraud.ftc.gov/ | ok |
| 0d | c2pa-verify-tool | https://verify.contentauthenticity.org/ | ok |
| 0d | c2pa-metadata-limitations | https://c2pa.org/faqs/ | ok |

## Screenshots — assets/learn/

_No screenshots yet._

## Known design debt

- **Body text size split, opened 2026-08-07**: new course/`/learn/` templates use a semantic `--text-body` token at `1.125rem` (~18px); the existing legacy site (scam database pages, homepage) still uses a hardcoded `16px` and has not been migrated to the token or bumped to the 18px minimum. This was a deliberate scoped decision, not an oversight — revisit when the legacy scam pages migrate to the shared static-generation pattern (see Phase 0 report) so the whole site ends up on one type scale instead of two permanently.

## Manual verification needed before launch

Items that can't be checked by this script and must be confirmed by a human before /learn/ goes live. Remove a line once it's actually been confirmed — don't let this list go stale by assumption.

- **Legacy pages (scam database, homepage) still lose nav links entirely below 600px effective width** — the underlying `@media (max-width: 600px) { .nav-links a:not(.btn) { display: none; } }` rule in `css/styles.css` is unchanged; only `.course-page` scopes got the real fix (`flex-wrap` + a growable `.nav-inner` height, in `css/course.css`, fixed 2026-08-08). Deliberately scoped rather than site-wide per instruction, to avoid risking legacy pages that haven't been checked against this change. Revisit when the legacy scam pages migrate to the shared static-generation pattern (see Phase 0 report) — same spirit as the type-scale item above, one more reason those pages need a real migration pass rather than living forever as a separate system.

