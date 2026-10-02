'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { optimizeImageBuffer, optimizedFilePath } = require('../image-optimizer');

test('uploaded images are converted to WebP', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=',
    'base64'
  );
  const result = await optimizeImageBuffer(png);
  assert.equal(result.toString('ascii', 0, 4), 'RIFF');
  assert.equal(result.toString('ascii', 8, 12), 'WEBP');
});

test('optimized filenames are deterministic', () => {
  assert.equal(optimizedFilePath('/tmp/product-1.jpg'), '/tmp/product-1.optimized.webp');
});
