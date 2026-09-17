'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const realExpress = require('express');

const DEFAULT_STUDIO_CONFIG = {
  version: 1,
  products: [
    {
      id: 'canvas',
      type: 'canvas',
      active: true,
      nameFr: 'Toile rectangulaire',
      nameEn: 'Rectangular canvas',
      descriptionFr: 'Un canevas personnalisé à tracer et à peindre.',
      descriptionEn: 'A custom canvas to trace and paint.',
      templateImage: '',
      basePrice: 69.99,
      extraImagePrice: 0,
      sizes: [
        { id: 'petit', labelFr: '11 x 14', labelEn: '11 x 14', price: 49.99 },
        { id: 'moyen', labelFr: '16 x 20', labelEn: '16 x 20', price: 69.99 },
        { id: 'grand', labelFr: '18 x 24', labelEn: '18 x 24', price: 89.99 }
      ],
      options: [],
      printArea: { x: 3, y: 3, w: 94, h: 94 }
    },
    {
      id: 'bag',
      type: 'bag',
      active: true,
      nameFr: 'Sac en toile',
      nameEn: 'Canvas tote bag',
      descriptionFr: 'Un sac réutilisable avec votre création à peindre.',
      descriptionEn: 'A reusable tote bag with your custom design to paint.',
      templateImage: '',
      basePrice: 34.99,
      extraImagePrice: 6,
      sizes: [{ id: 'standard', labelFr: 'Format standard', labelEn: 'Standard size', price: 34.99 }],
      options: [],
      printArea: { x: 10, y: 13, w: 80, h: 81 }
    }
  ]
};

function resolveDbPath() {
  if (process.env.ARTY_DB_PATH) return path.resolve(process.env.ARTY_DB_PATH);
  const dataDir = process.env.ARTY_DATA_DIR || process.env.DATA_DIR || process.env.RENDER_DISK_PATH || (process.env.RENDER && fs.existsSync('/var/data') ? '/var/data' : path.join(__dirname, 'data'));
  return path.resolve(dataDir, 'db.json');
}

function readDb() {
  const dbPath = resolveDbPath();
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
  catch { return {}; }
}

function writeDb(db) {
  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${dbPath}.${process.pid}.${Date.now()}.studio.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbPath);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function adminOnly(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  const db = readDb();
  const hash = hashToken(token);
  const session = (db.sessions || []).find(item => item.tokenHash === hash && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now()));
  if (!session) return res.status(401).json({ error: 'Non authentifié' });
  if (session.role !== 'admin') return res.status(403).json({ error: 'Accès admin requis' });
  req.studioSession = session;
  next();
}

function text(value, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function num(value, fallback = 0, min = 0, max = 100000) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function slug(value, fallback = `product-${Date.now()}`) {
  const cleaned = String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return cleaned || fallback;
}
function normalizeSizes(raw, basePrice) {
  const list = Array.isArray(raw) ? raw : [];
  const out = list.slice(0, 20).map((size, index) => ({
    id: slug(size.id || size.labelFr || size.labelEn, `size-${index + 1}`),
    labelFr: text(size.labelFr || size.label || `Format ${index + 1}`, 80),
    labelEn: text(size.labelEn || size.labelFr || size.label || `Size ${index + 1}`, 80),
    price: num(size.price, basePrice, 0, 100000)
  })).filter(size => size.labelFr || size.labelEn);
  return out.length ? out : [{ id: 'standard', labelFr: 'Format standard', labelEn: 'Standard size', price: basePrice }];
}
function normalizeOptions(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 30).map((option, index) => ({
    id: slug(option.id || option.labelFr || option.labelEn, `option-${index + 1}`),
    labelFr: text(option.labelFr || option.label || `Option ${index + 1}`, 100),
    labelEn: text(option.labelEn || option.labelFr || option.label || `Option ${index + 1}`, 100),
    priceDelta: num(option.priceDelta, 0, 0, 100000),
    active: option.active !== false
  })).filter(option => option.labelFr || option.labelEn);
}
function normalizePrintArea(raw = {}) {
  const x = num(raw.x, 20, 0, 95);
  const y = num(raw.y, 20, 0, 95);
  const w = num(raw.w, 60, 5, 100 - x);
  const h = num(raw.h, 60, 5, 100 - y);
  return { x, y, w, h };
}
function normalizeProduct(raw = {}, index = 0) {
  const type = ['canvas', 'bag', 'template'].includes(raw.type) ? raw.type : 'template';
  const id = slug(raw.id || raw.nameFr || raw.nameEn, `product-${index + 1}`);
  const basePrice = num(raw.basePrice, type === 'bag' ? 34.99 : 49.99, 0, 100000);
  return {
    id,
    type,
    active: raw.active !== false,
    nameFr: text(raw.nameFr || raw.name || id, 100),
    nameEn: text(raw.nameEn || raw.nameFr || raw.name || id, 100),
    descriptionFr: text(raw.descriptionFr || raw.description || '', 260),
    descriptionEn: text(raw.descriptionEn || raw.descriptionFr || raw.description || '', 260),
    templateImage: text(raw.templateImage || '', 500),
    basePrice,
    extraImagePrice: num(raw.extraImagePrice, 0, 0, 10000),
    sizes: normalizeSizes(raw.sizes, basePrice),
    options: normalizeOptions(raw.options),
    printArea: normalizePrintArea(raw.printArea)
  };
}
function normalizeStudioConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : DEFAULT_STUDIO_CONFIG;
  let products = (Array.isArray(source.products) ? source.products : []).slice(0, 40).map(normalizeProduct);
  if (!products.length) products = DEFAULT_STUDIO_CONFIG.products.map((product, index) => normalizeProduct(product, index));
  const ids = new Set();
  products = products.map((product, index) => {
    let id = product.id;
    if (ids.has(id)) id = `${id}-${index + 1}`;
    ids.add(id);
    return { ...product, id };
  });
  return { version: 1, products };
}
function getStudioConfig() {
  const db = readDb();
  return normalizeStudioConfig(db.studioConfig || DEFAULT_STUDIO_CONFIG);
}

function installStudioRoutes(app) {
  if (app.__artyStudioRoutesInstalled) return;
  app.__artyStudioRoutesInstalled = true;

  app.get('/api/studio-config', (req, res) => res.json(getStudioConfig()));
  app.get('/api/admin/studio-config', adminOnly, (req, res) => res.json(getStudioConfig()));
  app.put('/api/admin/studio-config', adminOnly, (req, res) => {
    const db = readDb();
    const config = normalizeStudioConfig(req.body || {});
    db.studioConfig = config;
    writeDb(db);
    res.json({ success: true, config });
  });
}

function wrappedExpress(...args) {
  const app = realExpress(...args);
  const originalUse = app.use.bind(app);
  let useCount = 0;
  app.use = function (...useArgs) {
    const result = originalUse(...useArgs);
    useCount += 1;
    // server.js installs JSON, urlencoded, public static, then /api locale middleware.
    // Install our API immediately after those four middleware registrations.
    if (useCount === 4) installStudioRoutes(app);
    return result;
  };
  return app;
}

wrappedExpress.static = realExpress.static;
wrappedExpress.Router = realExpress.Router;
wrappedExpress.json = realExpress.json;
wrappedExpress.urlencoded = realExpress.urlencoded;
wrappedExpress.query = realExpress.query;
wrappedExpress.raw = realExpress.raw;
wrappedExpress.text = realExpress.text;

require.cache[require.resolve('express')].exports = wrappedExpress;
require('./server');
