'use strict';

// One normalized form per real-world value, so the same scam link, number or
// wallet always becomes the same entity (and the same keyed hash). Every repo
// has a copy of these rules (Scampedia JS, Dojo Python, VGCore Swift), and all
// of them must pass contracts/normalize-cases.json exactly. Returns null for
// anything that isn't a valid value of that type, so junk never becomes an
// entity.

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid', 'mc_eid',
  'igshid', 'yclid', 'twclid', 'ttclid', '_hsenc', '_hsmi',
]);
const isTrackingParam = (key) => /^utm_/i.test(key) || TRACKING_PARAMS.has(key.toLowerCase());

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,63}$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function parseHttpUrl(raw) {
  const value = raw.trim();
  const withScheme = SCHEME_RE.test(value) ? value : `https://${value}`;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!DOMAIN_RE.test(u.hostname)) return null;
  return u;
}

function domain(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase().replace(/\.+$/, '');
  const host = value.includes('/') || SCHEME_RE.test(value) ? parseHttpUrl(value)?.hostname : value;
  if (!host) return null;
  const bare = host.replace(/^www\./, '');
  return DOMAIN_RE.test(bare) ? bare : null;
}

function url(raw) {
  if (typeof raw !== 'string') return null;
  const u = parseHttpUrl(raw);
  if (!u) return null;
  const kept = [...u.searchParams].filter(([key]) => !isTrackingParam(key));
  const search = kept.length ? `?${new URLSearchParams(kept).toString()}` : '';
  return `${u.protocol}//${u.host}${u.pathname}${search}`;
}

// E.164. A number without a country code is read as US: 10 digits, or 11
// starting with 1. Anything else needs a leading +.
function phone(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const digits = value.replace(/\D/g, '');
  if (value.startsWith('+')) return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function email(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : null;
}

// Ethereum (0x) addresses are lowercased for matching. Bech32 (bc1) may be
// lowercased, but must not mix cases. Legacy Bitcoin (base58, starting 1 or
// 3) and Tron (T) addresses are case-sensitive, so their case is kept.
// (Nick's decision, 2026-11-06.)
const BECH32_RE = /^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{8,87}$/;
const BASE58 = '[1-9A-HJ-NP-Za-km-z]';
const LEGACY_BTC_RE = new RegExp(`^[13]${BASE58}{25,34}$`);
const TRON_RE = new RegExp(`^T${BASE58}{33}$`);

function cryptoWallet(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value.toLowerCase();
  if (/^bc1/i.test(value)) {
    if (value !== value.toLowerCase() && value !== value.toUpperCase()) return null;
    const lower = value.toLowerCase();
    return BECH32_RE.test(lower) ? lower : null;
  }
  if (LEGACY_BTC_RE.test(value) || TRON_RE.test(value)) return value;
  return null;
}

// $cashtag or @handle (Cash App, Venmo, Zelle names and similar).
function paymentHandle(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return /^[$@][a-z][a-z0-9_.-]{1,40}$/.test(value) ? value : null;
}

const BY_TYPE = {
  domain, url, phone, email, crypto_wallet: cryptoWallet, payment_handle: paymentHandle,
};

function normalize(type, raw) {
  const fn = BY_TYPE[type];
  if (!fn) throw new Error(`normalize: unknown entity type "${type}"`);
  return fn(raw);
}

module.exports = { normalize, domain, url, phone, email, cryptoWallet, paymentHandle, TRACKING_PARAMS };
