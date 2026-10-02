'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_DIMENSION = 1800;
const WEBP_QUALITY = 82;
const pending = new Map();
const notWorthOptimizing = new Set();

function isSupportedImageName(filename) {
  return /\.(?:jpe?g|png|webp|avif)$/i.test(String(filename || ''));
}

function optimizedFilePath(sourcePath) {
  const ext = path.extname(sourcePath);
  return sourcePath.slice(0, Math.max(0, sourcePath.length - ext.length)) + '.optimized.webp';
}

async function optimizeImageBuffer(buffer, options = {}) {
  return sharp(buffer, { limitInputPixels: options.limitInputPixels || MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: options.maxDimension || MAX_DIMENSION,
      height: options.maxDimension || MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: options.quality || WEBP_QUALITY, effort: 4, smartSubsample: true })
    .toBuffer();
}

async function ensureOptimizedFile(sourcePath) {
  if (notWorthOptimizing.has(sourcePath)) return '';
  const destination = optimizedFilePath(sourcePath);

  try {
    const [sourceStat, destinationStat] = await Promise.all([
      fs.promises.stat(sourcePath),
      fs.promises.stat(destination).catch(() => null)
    ]);
    if (!sourceStat.isFile()) return '';
    if (destinationStat?.isFile() && destinationStat.size < sourceStat.size) return destination;
    if (sourceStat.size < 180 * 1024) {
      notWorthOptimizing.add(sourcePath);
      return '';
    }
  } catch {
    return '';
  }

  if (pending.has(sourcePath)) return pending.get(sourcePath);

  const task = (async () => {
    const destination = optimizedFilePath(sourcePath);
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    try {
      await sharp(sourcePath, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4, smartSubsample: true })
        .toFile(temporary);

      const [sourceStat, optimizedStat] = await Promise.all([fs.promises.stat(sourcePath), fs.promises.stat(temporary)]);
      // Only keep a derivative when it saves a meaningful amount of bandwidth.
      if (optimizedStat.size >= sourceStat.size * 0.92) {
        await fs.promises.unlink(temporary).catch(() => {});
        notWorthOptimizing.add(sourcePath);
        return '';
      }

      await fs.promises.rename(temporary, destination);
      return destination;
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      notWorthOptimizing.add(sourcePath);
      console.warn('ARTY image optimization skipped:', path.basename(sourcePath), error.message);
      return '';
    } finally {
      pending.delete(sourcePath);
    }
  })();

  pending.set(sourcePath, task);
  return task;
}

function createOptimizedUploadMiddleware({ directory } = {}) {
  return async function optimizedUpload(req, res, next) {
    if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return next();
    const accepted = String(req.headers?.accept || '');
    if (!accepted.includes('image/webp') && accepted !== '*/*') return next();

    let filename = '';
    try { filename = decodeURIComponent(String(req.path || '')).replace(/^\/+/, ''); } catch { return next(); }
    if (!filename || filename.includes('/') || filename.includes('\\') || !isSupportedImageName(filename) || filename.endsWith('.optimized.webp')) return next();

    const sourcePath = path.join(directory, filename);
    try {
      const stat = await fs.promises.stat(sourcePath);
      if (!stat.isFile()) return next();
    } catch {
      return next();
    }

    const optimized = await ensureOptimizedFile(sourcePath);
    if (!optimized) return next();

    res.set('Vary', 'Accept');
    res.type('image/webp');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(optimized, { cacheControl: false });
  };
}

module.exports = {
  optimizeImageBuffer,
  ensureOptimizedFile,
  createOptimizedUploadMiddleware,
  optimizedFilePath,
  isSupportedImageName
};
