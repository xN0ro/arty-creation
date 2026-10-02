'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { optimizeImageBuffer, optimizedFilePath } = require('../image-optimizer');

test('uploaded images are converted to WebP', async () => {
  const png = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: { r: 230, g: 120, b: 40, alpha: 1 }
    }
  }).png().toBuffer();

  const result = await optimizeImageBuffer(png);
  assert.equal(result.toString('ascii', 0, 4), 'RIFF');
  assert.equal(result.toString('ascii', 8, 12), 'WEBP');
});

test('optimized filenames are deterministic', () => {
  assert.equal(optimizedFilePath('/tmp/product-1.jpg'), '/tmp/product-1.optimized.webp');
});
