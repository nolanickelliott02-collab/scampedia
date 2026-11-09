'use strict';

// The app's phrase matching rule, word for word (VerifyGuard build 22,
// VGCore PhraseMatcher; the server's fusion/detectors/scampediaPhrase.js uses
// the same): case-insensitive, whole words only, and the phrase's last word may
// carry one common ending (-s, -es, -ed, -d, -ing, -ly). "irs" matches "The
// IRS says" but not "first"; "revoke" matches "revoked". Keep this in step
// with those two copies; the shared cases are tested on all three sides.
const ENDINGS = ['s', 'es', 'ed', 'd', 'ing', 'ly'];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function containsPhrase(text, phrase) {
  const needle = String(phrase ?? '').trim().toLowerCase();
  if (!needle) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(needle)}(?:${ENDINGS.join('|')})?($|[^\\p{L}\\p{N}])`, 'u');
  return re.test(String(text ?? '').toLowerCase());
}

module.exports = { containsPhrase, ENDINGS };
