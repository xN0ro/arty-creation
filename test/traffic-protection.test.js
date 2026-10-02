'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createRateLimiter,
  createRequestSizeGuard,
  createUploadBandwidthGuard,
  safeFlatFilename
} = require('../traffic-protection');

function req(overrides = {}) {
  const headers = overrides.headers || {};
  return {
    ip: overrides.ip || '203.0.113.10',
    method: overrides.method || 'GET',
    path: overrides.path || '/',
    url: overrides.url || overrides.path || '/',
    headers,
    socket: { remoteAddress: overrides.ip || '203.0.113.10' }
  };
}
function res() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('fixed-window rate limiter blocks excess requests', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, scope: 'test' });
  const response = res();
  let passed = 0;
  limiter(req(), response, () => passed++);
  limiter(req(), response, () => passed++);
  limiter(req(), response, () => passed++);
  assert.equal(passed, 2);
  assert.equal(response.statusCode, 429);
});

test('request-size guard keeps large payloads on explicitly allowed routes only', () => {
  const guard = createRequestSizeGuard({ defaultMaxBytes: 100, largeMaxBytes: 1000, largeRoutes: ['/large'] });
  let normalPassed = false;
  const normalRes = res();
  guard(req({ path: '/normal', headers: { 'content-length': '101' } }), normalRes, () => { normalPassed = true; });
  assert.equal(normalPassed, false);
  assert.equal(normalRes.statusCode, 413);

  let largePassed = false;
  guard(req({ path: '/large', headers: { 'content-length': '900' } }), res(), () => { largePassed = true; });
  assert.equal(largePassed, true);
});

test('upload guard enforces a per-IP byte budget', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arty-bandwidth-'));
  fs.writeFileSync(path.join(dir, 'product.jpg'), Buffer.alloc(80));
  const guard = createUploadBandwidthGuard({ directory: dir, maxRequests: 10, maxBytes: 120, byteWindowMs: 60_000 });
  let passed = 0;
  guard(req({ path: '/product.jpg' }), res(), () => passed++);
  const blocked = res();
  guard(req({ path: '/product.jpg' }), blocked, () => passed++);
  assert.equal(passed, 1);
  assert.equal(blocked.statusCode, 429);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('flat upload filenames reject traversal and nested paths', () => {
  assert.equal(safeFlatFilename('/product.jpg'), 'product.jpg');
  assert.equal(safeFlatFilename('/../secret'), '');
  assert.equal(safeFlatFilename('/nested/file.jpg'), '');
});
