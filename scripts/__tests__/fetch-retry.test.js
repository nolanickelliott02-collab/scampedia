'use strict';

// Phase 2 hardening: "retries with backoff for transient failures; no
// infinite retry loops." Uses a real local HTTP server (Node's built-in
// http module, no mocking library) so this exercises the actual fetch()
// path, not a stubbed-out version of it.

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithRetry } = require('../lib/scam-pipeline');

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function serverUrl(server) {
  return `http://127.0.0.1:${server.address().port}/`;
}

test('retries a transient 503 and eventually succeeds', async () => {
  let requestCount = 0;
  const server = await startServer((req, res) => {
    requestCount++;
    if (requestCount < 3) {
      res.writeHead(503).end('temporarily unavailable');
    } else {
      res.writeHead(200).end('ok');
    }
  });
  try {
    const res = await fetchWithRetry(serverUrl(server), {}, { retries: 3, baseDelayMs: 10 });
    assert.equal(res.status, 200);
    assert.equal(requestCount, 3, 'expected exactly 2 failures then a success (3 requests total)');
  } finally {
    server.close();
  }
});

test('gives up after exhausting the retry budget (no infinite loop) and returns the last failing response', async () => {
  let requestCount = 0;
  const server = await startServer((req, res) => {
    requestCount++;
    res.writeHead(503).end('always down');
  });
  try {
    const res = await fetchWithRetry(serverUrl(server), {}, { retries: 2, baseDelayMs: 10 });
    assert.equal(res.status, 503);
    assert.equal(requestCount, 3, 'expected exactly retries+1 = 3 attempts, not fewer or unbounded');
  } finally {
    server.close();
  }
});

test('does NOT retry a 4xx — the resource genuinely is not there', async () => {
  let requestCount = 0;
  const server = await startServer((req, res) => {
    requestCount++;
    res.writeHead(404).end('not found');
  });
  try {
    const res = await fetchWithRetry(serverUrl(server), {}, { retries: 3, baseDelayMs: 10 });
    assert.equal(res.status, 404);
    assert.equal(requestCount, 1, 'a 404 should fail fast, not consume the retry budget');
  } finally {
    server.close();
  }
});

test('retries a connection failure (server not listening) and eventually throws', { timeout: 10_000 }, async () => {
  // Port 1 is a real, universally-unreachable/reserved port on every
  // platform this runs on (privileged and never bound) — fails fast and
  // deterministically without depending on any external network state.
  await assert.rejects(
    () => fetchWithRetry('http://127.0.0.1:1/', {}, { retries: 2, baseDelayMs: 10, timeoutMs: 1000 }),
  );
});
