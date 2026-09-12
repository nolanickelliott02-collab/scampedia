# Citation Backfill Queue

Generated 2026-09-11 by running the pipeline's own real `verifyCitationUrls()` gate (`scripts/lib/scam-pipeline.js`) against every entry currently in `api/reports.json`, over the real network. Re-run after any backfill to confirm a fix actually resolved.

**Per Rule 6 (preserve data) and the instruction to flag rather than silently rewrite: nothing in `api/reports.json` was changed to produce this list.** These entries are still live on scampedia.net exactly as they were before this audit. This is a queue for your review, not a completed fix.

Command used:
```
node -e "
const fs = require('fs');
const { verifyCitationUrls } = require('./scripts/lib/scam-pipeline');
const data = JSON.parse(fs.readFileSync('api/reports.json', 'utf8'));
(async () => {
  for (const r of data.reports) {
    const check = await verifyCitationUrls(r.source);
    if (!check.ok) console.log(r.id, r.title, JSON.stringify(check.issues));
  }
})();
"
```

**43 of 61 live entries (70%) currently fail this gate.** Two distinct categories:

## A. Never had a real citation (40 entries — the 2026-05-27 launch batch)

Every one of these cites only an organization name — no URL, nothing checkable. This predates the citation gate (which only applies to entries the pipeline generates itself going forward) and was already flagged once, in `CLAUDE.md`'s own 2026-08-09 audit history, as a known cross-repo issue — but never actually backfilled for the database entries themselves.

Per your instruction (Phase 3a): **do not auto-rewrite these.** Each one needs a real, verifiable, specific source found and attached by a human (or a supervised research pass) — the gate can't manufacture a citation that was never there; `extractCitationUrls()` on a bare org name like `"FTC Consumer Alerts"` correctly returns nothing to check, because there's nothing to check.

| id | Title | Category | Current (unusable) source |
|---|---|---|---|
| 1 | Grandparent Emergency Scam | Phone Scam | FTC Consumer Alerts + VerifyGuard user-submitted reports |
| 2 | AI Voice Clone Scam | AI Scam | FBI IC3 (Internet Crime Complaint Center) |
| 3 | Fake IRS Tax Refund Scam | Government Scam | FTC Consumer Alerts |
| 4 | Tech Support Pop-Up Scam | Tech Scam | FTC Consumer Alerts |
| 5 | Romance / Military Scam | Romance Scam | FTC Consumer Alerts |
| 6 | Crypto Investment Scam | Investment Scam | FBI IC3 (Internet Crime Complaint Center) |
| 7 | Medicare / Health Insurance Scam | Government Scam | AARP Fraud Watch Network |
| 8 | Lottery / Prize Notification Scam | Phone Scam | FTC Consumer Alerts |
| 9 | Wangiri / One-Ring Callback Scam | Phone Scam | FTC Consumer Alerts |
| 10 | "Can You Hear Me?" Robocall Scam | Phone Scam | FTC Consumer Alerts |
| 11 | Fake Bank Fraud Alert Scam | Phone Scam | FTC Consumer Alerts |
| 12 | Jury Duty Scam | Government Scam | FTC Consumer Alerts |
| 13 | Social Security Number Suspended Scam | Government Scam | AARP Fraud Watch Network |
| 14 | Unemployment Benefits Identity Theft Scam | Government Scam | FTC Consumer Alerts |
| 15 | Student Loan Forgiveness Scam | Government Scam | FTC Consumer Alerts |
| 16 | USCIS / Immigration Scam | Government Scam | FTC Consumer Alerts |
| 17 | Phishing Email Scam | Tech Scam | FBI IC3 (Internet Crime Complaint Center) |
| 18 | Smishing Text Message Scam | Tech Scam | FTC Consumer Alerts |
| 19 | QR Code Scam | Tech Scam | FTC Consumer Alerts |
| 20 | Fake Antivirus / Scareware Scam | Tech Scam | FTC Consumer Alerts |
| 21 | Social Media Account Takeover Scam | Tech Scam | FTC Consumer Alerts |
| 22 | SIM Swap Scam | Tech Scam | FBI IC3 (Internet Crime Complaint Center) |
| 23 | Virtual Kidnapping Scam | AI Scam | FBI IC3 (Internet Crime Complaint Center) |
| 24 | Deepfake Celebrity Endorsement Scam | AI Scam | FTC Consumer Alerts |
| 25 | AI Chatbot Romance Scam | AI Scam | FTC Consumer Alerts |
| 26 | Catfishing Scam | Romance Scam | FTC Consumer Alerts |
| 27 | Sextortion Scam | Romance Scam | FBI IC3 (Internet Crime Complaint Center) |
| 28 | Ponzi Scheme | Investment Scam | FTC Consumer Alerts |
| 29 | Pump and Dump Scam | Investment Scam | FTC Consumer Alerts |
| 30 | Fake Trading App Scam | Investment Scam | FTC Consumer Alerts |
| 31 | Pig Butchering Scam | Investment Scam | FBI IC3 (Internet Crime Complaint Center) |
| 32 | Advance Fee Loan Scam | Investment Scam | FTC Consumer Alerts |
| 33 | Fake Online Store Scam | Shopping Scam | BBB Scam Tracker |
| 34 | Online Marketplace Buyer Scam | Shopping Scam | BBB Scam Tracker |
| 35 | Fake Job Offer Scam | Employment Scam | FTC Consumer Alerts |
| 36 | Mystery Shopper Check Scam | Employment Scam | FTC Consumer Alerts |
| 37 | Package Delivery Text Scam | Delivery Scam | FTC Consumer Alerts |
| 38 | Fake Charity / Disaster Relief Scam | Charity Scam | BBB Scam Tracker |
| 39 | Fake Rental Listing Scam | Rental Scam | BBB Scam Tracker |
| 40 | Video Call Deepfake Extortion Scam | AI Scam | FBI Internet Crime Complaint Center (IC3) |

## B. Had a real citation, now fails (3 entries — content rot or bot-blocking)

These are **not** the same problem as category A — they had a specific, real URL that presumably passed the gate at publish time. All three fail now with **HTTP 403**, not 404 — that's a strong signal of bot-blocking (a WAF rejecting this pipeline's request, the same false-negative pattern already documented once for Washington Times/McAfee in `scam-pipeline.js`'s own comments), not necessarily that the page is actually gone. **Check these in a real browser before concluding the source is dead** — don't treat a 403 here the same as category A's "never had a URL at all."

| id | Title | Failing URL(s) | HTTP status |
|---|---|---|---|
| 46 | Gold Bar & Bulk Cash Courier Scam | `fbi.gov/contact-us/field-offices/boston/news/fbi-boston-warns-of-increase-in-gold-bar-and-bulk-cash-courier-scams` | 403 |
| 48 | AI-Cloned Fake Vehicle Dealership Scam | `autofinancenews.net/allposts/risk-management/ai-cloning-scam-...`, `autoblog.com/news/ai-is-making-fake-car-dealerships-look-real-...` | 403 (both; the entry's 3rd cited source, wafb.com, still resolves fine) |
| 51 | Fake VPN App Malware Scam | `forbes.com/sites/daveywinder/2025/11/11/google-issues-critical-vpn-threat-warning-...` | 403 (the entry's other source, blog.google, still resolves fine) |

**Observation for later, not a fix here:** entries 48 and 51 each cite multiple sources, and the gate currently fails the *whole entry* if *any one* cited URL 403s — even though each still has at least one source that resolves fine. Whether "at least one must resolve" is the right bar instead of "every one must resolve" for multi-source entries is a real design question, not something to change silently while producing this list.
