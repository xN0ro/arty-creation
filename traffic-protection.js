'use strict';

const fs = require('fs');
const path = require('path');

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

function tooManyMessage(req) {
  const language = String(req.headers?.['accept-language'] || '').toLowerCase();
  return language.startsWith('fr')
    ? 'Trop de requêtes. Veuillez réessayer dans quelques minutes.'
    : 'Too many requests. Please try again in a few minutes.';
}

function createRateLimiter({ windowMs = 60_000, max = 120, scope = 'default' } = {}) {
  const buckets = new Map();
  let nextSweep = Date.now() + windowMs;

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    if (now >= nextSweep) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      nextSweep = now + windowMs;
    }

    const key = `${scope}:${clientKey(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    if (typeof res.set === 'function') {
      res.set('RateLimit-Limit', String(max));
      res.set('RateLimit-Remaining', String(remaining));
      res.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    }

    if (bucket.count > max) {
      if (typeof res.set === 'function') res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: tooManyMessage(req) });
    }
    return next();
  };
}

function createSecurityHeaders() {
  return function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').toLowerCase();
    if (req.secure || forwardedProto === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    return next();
  };
}

function createRequestSizeGuard({
  defaultMaxBytes = 2 * 1024 * 1024,
  largeMaxBytes = 30 * 1024 * 1024,
  largeRoutes = []
} = {}) {
  const large = new Set(largeRoutes);
  return function requestSizeGuard(req, res, next) {
    const raw = req.headers?.['content-length'];
    if (raw === undefined) return next();
    const contentLength = Number(raw);
    if (!Number.isFinite(contentLength) || contentLength < 0) return res.status(400).json({ error: 'Invalid Content-Length' });
    const route = String(req.path || req.url || '').split('?')[0];
    const maxBytes = large.has(route) ? largeMaxBytes : defaultMaxBytes;
    if (contentLength > maxBytes) {
      return res.status(413).json({ error: tooManyMessage(req).replace(/Trop de requêtes[^.]*\.|Too many requests[^.]*\./, String(req.headers?.['accept-language'] || '').toLowerCase().startsWith('fr') ? 'Requête trop volumineuse.' : 'Request too large.') });
    }
    return next();
  };
}

function safeFlatFilename(reqPath) {
  let decoded = '';
  try { decoded = decodeURIComponent(String(reqPath || '')); } catch { return ''; }
  const clean = decoded.replace(/^\/+/, '');
  if (!clean || clean.includes('/') || clean.includes('\\') || clean === '.' || clean === '..') return '';
  return clean;
}

function createUploadBandwidthGuard({
  directory,
  requestWindowMs = 60_000,
  maxRequests = 180,
  byteWindowMs = 60 * 60 * 1000,
  maxBytes = 100 * 1024 * 1024
} = {}) {
  const requestLimiter = createRateLimiter({ windowMs: requestWindowMs, max: maxRequests, scope: 'uploads' });
  const byteBuckets = new Map();
  let nextSweep = Date.now() + byteWindowMs;

  return function uploadBandwidthGuard(req, res, next) {
    return requestLimiter(req, res, () => {
      if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return next();
      const file = safeFlatFilename(req.path);
      if (!file) return next();

      let stat;
      try {
        const fullPath = path.join(directory, file);
        stat = fs.statSync(fullPath);
        if (!stat.isFile()) return next();
      } catch {
        return next();
      }

      // Conditional browser requests normally become a 304 with no image body.
      if (req.headers?.['if-none-match'] || req.headers?.['if-modified-since']) return next();

      const now = Date.now();
      if (now >= nextSweep) {
        for (const [key, bucket] of byteBuckets) {
          if (bucket.resetAt <= now) byteBuckets.delete(key);
        }
        nextSweep = now + byteWindowMs;
      }

      const key = clientKey(req);
      let bucket = byteBuckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { bytes: 0, resetAt: now + byteWindowMs };
        byteBuckets.set(key, bucket);
      }

      if (bucket.bytes + stat.size > maxBytes) {
        if (typeof res.set === 'function') res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
        return res.status(429).send('Bandwidth limit reached. Please try again later.');
      }

      // Reserve the bytes before serving so concurrent requests cannot race around the quota.
      bucket.bytes += stat.size;
      return next();
    });
  };
}

module.exports = {
  createRateLimiter,
  createSecurityHeaders,
  createRequestSizeGuard,
  createUploadBandwidthGuard,
  safeFlatFilename
};
