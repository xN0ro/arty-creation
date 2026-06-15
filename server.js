const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Stripe webhooks need the raw body for signature verification. Keep this BEFORE json parsing.
app.post('/api/stripe/webhook', bodyParser.raw({ type: 'application/json', limit: '25mb' }), handleStripeWebhook);

// Custom products can include preview images, so allow larger JSON payloads.
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== DATABASE STORAGE ==========
// Render's regular filesystem is ephemeral, so use a persistent disk path in production.
// In Render, create a Persistent Disk and set ARTY_DATA_DIR to the disk mount path, for example /var/data.
const DEFAULT_DB = {
  adminEmails: [],
  googleClientId: '',
  categories: [],
  kits: [],
  events: [],
  teamActivities: [],
  bundles: [],
  users: [],
  orders: [],
  bookings: [],
  eventRequests: [],
  sessions: [],
  discounts: [],
  refunds: [],
  inventoryMovements: [],
  bundleDealRules: []
};

const APP_DATA_DIR = path.join(__dirname, 'data');
const RENDER_RECOMMENDED_DATA_DIR = '/var/data';

function canUseExistingDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return false;
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return false;
    const testFile = path.join(dirPath, `.arty-write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

function resolveDataDir() {
  if (process.env.ARTY_DB_PATH) return path.dirname(path.resolve(process.env.ARTY_DB_PATH));
  if (process.env.ARTY_DATA_DIR) return process.env.ARTY_DATA_DIR;
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.RENDER_DISK_PATH) return process.env.RENDER_DISK_PATH;

  // Extra safety: if the Render disk was mounted at /var/data but the env var was forgotten, use it automatically.
  if (process.env.RENDER && canUseExistingDir(RENDER_RECOMMENDED_DATA_DIR)) return RENDER_RECOMMENDED_DATA_DIR;

  return APP_DATA_DIR;
}

const DATA_DIR = path.resolve(resolveDataDir());
const DB_PATH = path.resolve(process.env.ARTY_DB_PATH || path.join(DATA_DIR, 'db.json'));
const DB_DIR = path.dirname(DB_PATH);
const DB_BACKUP_PATH = `${DB_PATH}.bak`;

function isLikelyPersistentPath() {
  return DB_DIR === RENDER_RECOMMENDED_DATA_DIR || DB_DIR.startsWith(`${RENDER_RECOMMENDED_DATA_DIR}/`);
}

function ensureDBDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function getStorageHealth() {
  const usingConfiguredPath = Boolean(process.env.ARTY_DB_PATH || process.env.ARTY_DATA_DIR || process.env.DATA_DIR || process.env.RENDER_DISK_PATH);
  const usingRender = Boolean(process.env.RENDER);
  const persistentPath = isLikelyPersistentPath();
  const safeOnRender = !usingRender || persistentPath;
  return {
    ok: safeOnRender,
    environment: usingRender ? 'render' : 'local',
    dbPath: DB_PATH,
    dataDir: DATA_DIR,
    backupPath: DB_BACKUP_PATH,
    dbExists: fs.existsSync(DB_PATH),
    backupExists: fs.existsSync(DB_BACKUP_PATH),
    usingConfiguredPath,
    usingRenderRecommendedDiskPath: persistentPath,
    warning: safeOnRender ? '' : 'Render is using an ephemeral app folder. Accounts will disappear after redeploy unless you attach a Persistent Disk at /var/data or set ARTY_DATA_DIR to the disk mount path.'
  };
}

function getCollectionCountsSafe() {
  try {
    if (!fs.existsSync(DB_PATH)) return {};
    const db = normalizeDB(safeReadJSON(DB_PATH));
    return {
      users: db.users.length,
      kits: db.kits.length,
      categories: db.categories.length,
      events: db.events.length,
      bookings: db.bookings.length,
      eventRequests: db.eventRequests.length,
      orders: db.orders.length,
      bundles: db.bundles.length,
      sessions: db.sessions.length,
      discounts: db.discounts.length,
      refunds: db.refunds.length,
      inventoryMovements: db.inventoryMovements.length,
      bundleDealRules: (db.bundleDealRules||[]).length
    };
  } catch (err) {
    return { error: err.message };
  }
}

function normalizeDB(db = {}) {
  return {
    ...DEFAULT_DB,
    ...db,
    adminEmails: Array.isArray(db.adminEmails) ? db.adminEmails : [],
    categories: Array.isArray(db.categories) ? db.categories : [],
    kits: Array.isArray(db.kits) ? db.kits : [],
    events: Array.isArray(db.events) ? db.events : [],
    teamActivities: Array.isArray(db.teamActivities) ? db.teamActivities : [],
    bundles: Array.isArray(db.bundles) ? db.bundles : [],
    users: Array.isArray(db.users) ? db.users : [],
    orders: Array.isArray(db.orders) ? db.orders : [],
    bookings: Array.isArray(db.bookings) ? db.bookings : [],
    eventRequests: Array.isArray(db.eventRequests) ? db.eventRequests : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    discounts: Array.isArray(db.discounts) ? db.discounts : [],
    refunds: Array.isArray(db.refunds) ? db.refunds : [],
    inventoryMovements: Array.isArray(db.inventoryMovements) ? db.inventoryMovements : [],
    bundleDealRules: Array.isArray(db.bundleDealRules) ? db.bundleDealRules : []
  };
}

function safeReadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeDB(data) {
  ensureDBDir();
  const normalized = normalizeDB(data);
  const tmpPath = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;

  // Keep a last-known-good backup before replacing the database.
  try {
    if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
  } catch (err) {
    console.warn('Could not create DB backup:', err.message);
  }

  fs.writeFileSync(tmpPath, JSON.stringify(normalized, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

function initializeDB() {
  ensureDBDir();

  if (fs.existsSync(DB_PATH)) {
    try {
      const db = normalizeDB(safeReadJSON(DB_PATH));
      writeDB(db);
      return;
    } catch (err) {
      console.error('DB file is unreadable. Trying backup...', err.message);
      if (fs.existsSync(DB_BACKUP_PATH)) {
        const backup = normalizeDB(safeReadJSON(DB_BACKUP_PATH));
        writeDB(backup);
        return;
      }
    }
  }

  // First deploy on a new persistent disk: seed from the app's bundled data/db.json if it exists.
  const bundledSeedPath = path.join(APP_DATA_DIR, 'db.json');
  if (fs.existsSync(bundledSeedPath) && bundledSeedPath !== DB_PATH) {
    try {
      writeDB(normalizeDB(safeReadJSON(bundledSeedPath)));
      console.log(`Arty DB seeded from ${bundledSeedPath}`);
      return;
    } catch (err) {
      console.warn('Could not seed DB from bundled data:', err.message);
    }
  }

  writeDB({ ...DEFAULT_DB });
}

function readDB() {
  try {
    return normalizeDB(safeReadJSON(DB_PATH));
  } catch (err) {
    console.error('Could not read DB. Trying backup...', err.message);
    if (fs.existsSync(DB_BACKUP_PATH)) {
      const backup = normalizeDB(safeReadJSON(DB_BACKUP_PATH));
      writeDB(backup);
      return backup;
    }
    const empty = { ...DEFAULT_DB };
    writeDB(empty);
    return empty;
  }
}

initializeDB();
const storageHealth = getStorageHealth();
console.log(`Arty DB path: ${DB_PATH}`);
console.log(`Arty storage status: ${storageHealth.ok ? 'persistent/safe' : 'ephemeral/not safe'}`);
if (storageHealth.warning) console.error(storageHealth.warning);

const SESSION_TTL_DAYS = parseInt(process.env.ARTY_SESSION_TTL_DAYS || '30', 10);
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cleanExpiredSessions(db) {
  const now = Date.now();
  const before = (db.sessions || []).length;
  db.sessions = (db.sessions || []).filter(s => !s.expiresAt || new Date(s.expiresAt).getTime() > now);
  return db.sessions.length !== before;
}

function createToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const db = readDB();
  cleanExpiredSessions(db);
  db.sessions.push({
    tokenHash: hashToken(token),
    userId: user.id,
    email: user.email,
    role: user.role || 'user',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  });
  writeDB(db);
  return token;
}

function getSession(req) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return null;
  const db = readDB();
  const tokenHash = hashToken(token);
  const session = (db.sessions || []).find(s => s.tokenHash === tokenHash);
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    db.sessions = (db.sessions || []).filter(s => s.tokenHash !== tokenHash);
    writeDB(db);
    return null;
  }
  return session;
}

function auth(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Non authentifié' });
  req.session = s;
  next();
}
function adminOnly(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Non authentifié' });
  if (s.role !== 'admin') return res.status(403).json({ error: 'Accès admin requis' });
  req.session = s;
  next();
}
function optionalAuth(req, res, next) {
  const s = getSession(req);
  if (s) req.session = s;
  next();
}
function getConfiguredGoogleClientId(db) {
  return String(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENTID || db?.googleClientId || '').trim();
}
function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const expectedClientId = getConfiguredGoogleClientId(readDB());
    if (!expectedClientId) return reject(new Error('Google Client ID non configuré'));
    https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, resp => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try {
          const i = JSON.parse(data);
          if (i.error) return reject(new Error(i.error_description || i.error));
          if (i.aud !== expectedClientId) return reject(new Error('Client ID Google invalide pour ce site'));
          if (String(i.email_verified) !== 'true') return reject(new Error('Courriel Google non vérifié'));
          const email = String(i.email || '').trim().toLowerCase();
          if (!email) return reject(new Error('Courriel Google manquant'));
          resolve({ email, name:i.name||email.split('@')[0], picture:i.picture||'' });
        } catch(e){ reject(e); }
      });
    }).on('error', reject);
  });
}

// ========== PUBLIC ==========
app.get('/api/config', (req, res) => {
  const db = readDB();
  const googleClientId = getConfiguredGoogleClientId(db);
  res.json({
    googleClientId,
    googleConfigured: Boolean(googleClientId),
    paymentProvider: process.env.PAYMENT_PROVIDER || 'not_connected',
    stripeMode: process.env.STRIPE_MODE || (String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? 'live' : 'test'),
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    stripeConfigured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY)
  });
});
app.get('/api/storage-health', (req, res) => res.json({ ...getStorageHealth(), collectionCounts: getCollectionCountsSafe() }));
app.get('/api/kits', (req, res) => res.json(getPublicKits(readDB())));
app.get('/api/kits/:id', (req, res) => { const db = readDB(); const k = getPublicKits(db).find(k => k.id === parseInt(req.params.id)); k ? res.json(k) : res.status(404).json({ error: 'Non trouvé' }); });
app.get('/api/categories', (req, res) => res.json(readDB().categories || []));
app.get('/api/events', (req, res) => {
  const now = new Date();
  const db = readDB();
  const events = (db.events || [])
    .filter(e => (e.status || 'published') === 'published')
    .sort((a,b) => new Date((a.date || '') + 'T' + (a.time || '00:00')) - new Date((b.date || '') + 'T' + (b.time || '00:00')));
  res.json(events);
});
app.get('/api/team-activities', (req, res) => res.json(readDB().teamActivities || []));
app.get('/api/bundles', (req, res) => res.json(readDB().bundles || []));
app.get('/api/bundles/:id', (req, res) => { const b = (readDB().bundles||[]).find(b=>b.id===parseInt(req.params.id)); b ? res.json(b) : res.status(404).json({error:'Non trouvé'}); });

// ========== AUTH ==========
app.post('/api/users/register', async (req, res) => {
  try {
    const db = readDB();
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = req.body.confirmPassword === undefined ? password : String(req.body.confirmPassword || '');
    if (!name || !email || !password || !confirmPassword) return res.status(400).json({ error: 'Tous les champs sont requis' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Courriel invalide' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe: 6+ caractères' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
    db.users = db.users || [];
    if (db.users.find(u => String(u.email || '').toLowerCase() === email)) return res.status(400).json({ error: 'Courriel déjà utilisé' });
    const hashed = await bcrypt.hash(password, 10);
    const isAdmin = (db.adminEmails||[]).map(e=>String(e).toLowerCase()).includes(email);
    const user = { id: Date.now(), name, email, password: hashed, role: isAdmin ? 'admin' : 'user', provider: 'local', linkedProviders:['local'], picture: '', createdAt: new Date().toISOString() };
    db.users.push(user); writeDB(db);
    const token = createToken(user);
    res.json({ success: true, token, user: { id:user.id, name:user.name, email:user.email, role:user.role, picture:user.picture, provider:user.provider } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const db = readDB();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = (db.users || []).find(u => String(u.email || '').toLowerCase() === email && u.provider === 'local');
    if (!user) return res.status(401).json({ error: 'Courriel ou mot de passe invalide' });
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Courriel ou mot de passe invalide' });
    const token = createToken(user);
    res.json({ success: true, token, user: { id:user.id, name:user.name, email:user.email, role:user.role, picture:user.picture, provider:user.provider } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/users/google', async (req, res) => {
  try {
    const { credential } = req.body; if (!credential) return res.status(400).json({ error: 'Pas de credential' });
    const g = await verifyGoogleToken(credential); const db = readDB();
    db.users = db.users || [];
    let user = db.users.find(u => String(u.email || '').toLowerCase() === g.email);
    const isAdmin = (db.adminEmails||[]).map(e=>String(e).toLowerCase()).includes(g.email);
    if (!user) {
      user = { id: Date.now(), name:g.name, email:g.email, password:'', role:isAdmin?'admin':'user', provider:'google', linkedProviders:['google'], picture:g.picture||'', createdAt:new Date().toISOString(), googleLinkedAt:new Date().toISOString() };
      db.users.push(user);
    } else {
      user.role = isAdmin ? 'admin' : (user.role || 'user');
      user.name = user.name || g.name;
      user.picture = user.picture || g.picture || '';
      user.linkedProviders = Array.from(new Set([...(user.linkedProviders || [user.provider || 'local']), 'google']));
      user.googleLinkedAt = user.googleLinkedAt || new Date().toISOString();
    }
    writeDB(db);
    const token = createToken(user);
    res.json({ success: true, token, user: { id:user.id, name:user.name, email:user.email, role:user.role, picture:user.picture, provider:user.provider } });
  } catch (err) { res.status(401).json({ error: 'Échec Google: ' + err.message }); }
});

app.post('/api/users/logout', (req, res) => {
  const t = req.headers['authorization']?.replace('Bearer ','');
  if (t) {
    const db = readDB();
    const tokenHash = hashToken(t);
    db.sessions = (db.sessions || []).filter(s => s.tokenHash !== tokenHash);
    writeDB(db);
  }
  res.json({success:true});
});
app.get('/api/users/me', auth, (req, res) => { const u = readDB().users.find(u=>u.id===req.session.userId); if(!u) return res.status(404).json({error:'Non trouvé'}); res.json({id:u.id,name:u.name,email:u.email,role:u.role,picture:u.picture,provider:u.provider,createdAt:u.createdAt}); });
app.put('/api/users/me', auth, async (req, res) => {
  const db = readDB(); const idx = db.users.findIndex(u=>u.id===req.session.userId); if(idx===-1) return res.status(404).json({error:'Non trouvé'});
  const {name,currentPassword,newPassword} = req.body;
  if(name) db.users[idx].name = name;
  if(newPassword && db.users[idx].provider==='local') {
    if(!currentPassword) return res.status(400).json({error:'Mot de passe actuel requis'});
    if(!(await bcrypt.compare(currentPassword,db.users[idx].password))) return res.status(400).json({error:'Mot de passe actuel incorrect'});
    db.users[idx].password = await bcrypt.hash(newPassword,10);
  }
  writeDB(db); const u=db.users[idx];
  res.json({success:true,user:{id:u.id,name:u.name,email:u.email,role:u.role,picture:u.picture,provider:u.provider}});
});


function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildOrderItems(db, rawItems = []) {
  const items = [];
  for (const raw of rawItems) {
    const rawId = String(raw.id || '').trim();
    const qty = Math.max(1, parseInt(raw.qty) || 1);
    if (!rawId) return { error: 'Article invalide' };

    if (rawId.startsWith('bundle-')) {
      const bundleId = parseInt(rawId.replace('bundle-', ''));
      const bundle = (db.bundles || []).find(b => b.id === bundleId);
      if (!bundle) return { error: `Ensemble non trouvé: ${rawId}` };
      items.push({ id: rawId, type: 'bundle', name: bundle.name, price: parseFloat(bundle.price) || 0, image: bundle.image || '', qty });
      continue;
    }

    const kitId = parseInt(rawId);
    const kit = (db.kits || []).find(k => k.id === kitId);
    if (!kit) return { error: `Kit non trouvé: ${rawId}` };
    if (kit.inStock === false) return { error: `${kit.name} est épuisé` };
    items.push({ id: String(kit.id), type: 'kit', name: kit.name, price: parseFloat(kit.price) || 0, image: kit.image || '', qty });
  }
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return { items, subtotal };
}

// ========== ORDERS & BOOKINGS ==========
app.post('/api/orders', optionalAuth, async (req, res) => {
  const db = readDB();
  const { items: rawItems, customer = {}, address = {}, checkoutMode } = req.body;
  if (!Array.isArray(rawItems) || !rawItems.length) return res.status(400).json({ error: 'Aucun article' });

  const built = buildOrderItems(db, rawItems);
  if (built.error) return res.status(400).json({ error: built.error });

  const user = req.session?.userId ? (db.users || []).find(u => u.id === req.session.userId) : null;
  const customerName = String(customer.name || user?.name || '').trim();
  const customerEmail = String(customer.email || user?.email || '').trim().toLowerCase();
  const customerPhone = String(customer.phone || '').trim();

  if (!customerName) return res.status(400).json({ error: 'Nom requis' });
  if (!validEmail(customerEmail)) return res.status(400).json({ error: 'Courriel valide requis' });
  if (!address || !String(address.line1 || '').trim()) return res.status(400).json({ error: 'Adresse de livraison requise' });

  const pricing = priceOrder(db, built.items);
  const orderId = 'ARTY-' + Date.now().toString(36).toUpperCase();
  const inventoryResult = reserveInventoryForItems(db, pricing.items, orderId);
  if (inventoryResult.error) return res.status(400).json({ error: inventoryResult.error });

  const order = {
    id: orderId,
    userId: user?.id || null,
    checkoutMode: user ? 'account' : (checkoutMode === 'guest' ? 'guest' : 'guest'),
    customer: { name: customerName, email: customerEmail, phone: customerPhone },
    guestEmail: user ? '' : customerEmail,
    items: pricing.items,
    address: {
      line1: String(address.line1 || '').trim(),
      city: String(address.city || '').trim(),
      province: String(address.province || '').trim(),
      postal: String(address.postal || '').trim(),
      country: String(address.country || 'Canada').trim(),
      notes: String(address.notes || '').trim()
    },
    subtotal: pricing.subtotal,
    discountTotal: pricing.discountTotal,
    discountsApplied: pricing.discountsApplied,
    total: pricing.total,
    status: 'en attente de paiement',
    paymentStatus: 'pending',
    paymentProvider: process.env.PAYMENT_PROVIDER || 'not_connected',
    paymentReference: '',
    inventoryReserved: true,
    inventoryRestocked: false,
    refundStatus: 'none',
    refundedTotal: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const stripeEnabled = isStripeEnabled();
  let payment = {
    status: 'provider_not_connected',
    provider: order.paymentProvider,
    redirectUrl: '',
    message: 'Payment provider not connected yet. Order saved as pending payment.'
  };

  if (stripeEnabled) {
    try {
      const pi = await createStripePaymentIntentForOrder(order);
      order.paymentProvider = 'stripe';
      order.paymentReference = pi.id || '';
      order.stripe = {
        paymentIntentId: pi.id || '',
        status: pi.status || '',
        clientSecretCreatedAt: new Date().toISOString()
      };
      payment = {
        status: 'requires_payment',
        provider: 'stripe',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        clientSecret: pi.client_secret || '',
        paymentIntentId: pi.id || '',
        message: 'Stripe payment ready.'
      };
    } catch (err) {
      console.error('Stripe PaymentIntent error:', err.message);
      if (order.inventoryReserved && !order.inventoryRestocked) {
        releaseInventoryForItems(db, order.items || [], order.id, 'Paiement Stripe non créé');
        order.inventoryRestocked = true;
      }
      return res.status(500).json({ error: 'Paiement Stripe non disponible: ' + err.message });
    }
  }

  if (!db.orders) db.orders = [];
  db.orders.push(order);
  writeDB(db);

  res.json({ success: true, order, payment });
});
app.get('/api/orders/mine', auth, (req, res) => { const db=readDB(); res.json((db.orders||[]).filter(o=>o.userId===req.session.userId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))); });

app.post('/api/stripe/confirm-order', optionalAuth, async (req, res) => {
  try {
    if (!isStripeEnabled()) return res.status(400).json({ error: 'Stripe n’est pas configuré' });
    const orderId = String(req.body.orderId || '').trim();
    const paymentIntentId = String(req.body.paymentIntentId || '').trim();
    if (!orderId || !paymentIntentId) return res.status(400).json({ error: 'Commande ou paiement manquant' });
    const db = readDB();
    const order = (db.orders || []).find(o => String(o.id) === orderId);
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
    if (String(order.paymentReference || '') !== paymentIntentId) return res.status(400).json({ error: 'Paiement non associé à cette commande' });

    const pi = await retrieveStripePaymentIntent(paymentIntentId);
    syncOrderFromStripePaymentIntent(db, pi, 'client-confirm');
    writeDB(db);
    const updated = (db.orders || []).find(o => String(o.id) === orderId) || order;
    res.json({ success: true, order: updated, stripeStatus: pi.status });
  } catch (err) {
    console.error('Stripe confirm-order error:', err);
    res.status(500).json({ error: 'Impossible de confirmer le paiement: ' + err.message });
  }
});
app.post('/api/bookings', (req, res) => {
  const db = readDB();
  const { userId, eventId, name, email, phone, guests, notes } = req.body;
  const guestCount = Math.max(1, parseInt(guests) || 1);
  if (!eventId || !name || !email) return res.status(400).json({ error: 'Nom, courriel et événement requis' });
  const ev = (db.events || []).find(e => e.id === parseInt(eventId));
  if (!ev) return res.status(404).json({ error: 'Événement non trouvé' });
  if ((ev.status || 'published') !== 'published') return res.status(400).json({ error: 'Cet événement n’est pas disponible à la réservation' });
  const booked = parseInt(ev.bookedSpots) || 0;
  const max = parseInt(ev.maxSpots) || 0;
  const spotsLeft = Math.max(0, max - booked);
  if (spotsLeft <= 0) return res.status(400).json({ error: 'Complet' });
  if (guestCount > spotsLeft) return res.status(400).json({ error: `Il reste seulement ${spotsLeft} place${spotsLeft > 1 ? 's' : ''}` });
  const b = {
    id: Date.now(),
    userId: userId || null,
    eventId: parseInt(eventId),
    name: String(name).trim(),
    email: String(email).trim(),
    phone: String(phone || '').trim(),
    guests: guestCount,
    notes: String(notes || '').trim(),
    bookedAt: new Date().toISOString(),
    status: 'confirmée'
  };
  if (!db.bookings) db.bookings = [];
  ev.bookedSpots = booked + guestCount;
  db.bookings.push(b);
  writeDB(db);
  res.json({ success: true, booking: b });
});
app.get('/api/bookings/mine', auth, (req, res) => {
  const db = readDB();
  res.json((db.bookings || []).filter(b => b.userId === req.session.userId).map(b => ({ ...b, event: (db.events || []).find(e => e.id === b.eventId) })).sort((a,b) => new Date(b.bookedAt) - new Date(a.bookedAt)));
});
app.post('/api/event-requests', (req, res) => {
  const db = readDB();
  const { name, email, phone, eventType, preferredDate, guests, location, budget, message } = req.body;
  if (!name || !email || !eventType) return res.status(400).json({ error: 'Nom, courriel et type d’événement requis' });
  const request = {
    id: Date.now(),
    name: String(name).trim(),
    email: String(email).trim(),
    phone: String(phone || '').trim(),
    eventType: String(eventType).trim(),
    preferredDate: String(preferredDate || '').trim(),
    guests: parseInt(guests) || 0,
    location: String(location || '').trim(),
    budget: String(budget || '').trim(),
    message: String(message || '').trim(),
    status: 'nouvelle',
    createdAt: new Date().toISOString()
  };
  if (!db.eventRequests) db.eventRequests = [];
  db.eventRequests.push(request);
  writeDB(db);
  res.json({ success: true, request });
});
app.post('/api/contact', (req, res) => { const {name,email,message}=req.body; if(!name||!email||!message) return res.status(400).json({error:'Champs requis'}); console.log('Contact:',req.body); res.json({success:true,message:'Merci! Nous vous répondrons bientôt.'}); });


function normalizeTags(raw) {
  if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean);
  return String(raw || '').split(',').map(t => t.trim()).filter(Boolean);
}
function normalizeKitPayload(body, existing = {}) {
  const payload = { ...body };
  payload.price = parseFloat(body.price) || 0;
  payload.categoryId = body.categoryId ? parseInt(body.categoryId) : (existing.categoryId || null);
  payload.tags = normalizeTags(body.tags ?? body.badges ?? existing.tags);
  payload.inStock = body.inStock === undefined ? (existing.inStock !== false) : (body.inStock === true || body.inStock === 'true');
  payload.featured = body.featured === undefined ? !!existing.featured : (body.featured === true || body.featured === 'true');
  payload.shortDesc = body.shortDesc || '';
  payload.description = body.description || '';
  payload.image = body.image || '';
  payload.difficulty = body.difficulty || existing.difficulty || 'Débutant';
  return payload;
}

function normalizeEventPayload(body, existing = {}) {
  const payload = { ...body };
  payload.title = body.title || existing.title || '';
  payload.description = body.description || '';
  payload.date = body.date || existing.date || '';
  payload.time = body.time || existing.time || '18:00';
  payload.duration = body.duration || existing.duration || '2 heures';
  payload.price = parseFloat(body.price) || 0;
  payload.maxSpots = parseInt(body.maxSpots) || existing.maxSpots || 20;
  payload.bookedSpots = parseInt(existing.bookedSpots) || 0;
  payload.location = body.location || '';
  payload.image = body.image || '';
  payload.eventType = body.eventType || existing.eventType || 'atelier';
  payload.status = body.status || existing.status || 'published';
  payload.featured = body.featured === true || body.featured === 'true';
  payload.includes = normalizeTags(body.includes ?? existing.includes);
  payload.hostNote = body.hostNote || '';
  return payload;
}

// ========== ADMIN ==========
app.get('/api/admin/stats', adminOnly, (req, res) => { const db=readDB(); const a=computeAdminAnalytics(db); res.json({totalKits:db.kits.length,totalEvents:db.events.length,totalUsers:db.users.length,totalOrders:(db.orders||[]).length,totalCategories:(db.categories||[]).length,totalDiscounts:(db.discounts||[]).length,totalRefunds:(db.refunds||[]).length,revenue:a.revenue,totalSales:a.revenue,lowInventoryCount:a.lowInventory.length}); });
app.get('/api/admin/storage', adminOnly, (req, res) => { res.json({ ...getStorageHealth(), collectionCounts: getCollectionCountsSafe() }); });

app.get('/api/admin/orders', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.orders || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.put('/api/admin/orders/:id/status', adminOnly, (req, res) => {
  const db = readDB();
  const id = String(req.params.id || '');
  const i = (db.orders || []).findIndex(o => String(o.id) === id);
  if (i === -1) return res.status(404).json({ error: 'Commande non trouvée' });
  const allowed = ['en attente de paiement', 'payée', 'préparation', 'expédiée', 'annulée', 'remboursée'];
  const status = String(req.body.status || '').trim();
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  const order = db.orders[i];
  const oldStatus = order.status;
  order.status = status;
  if (status === 'payée') order.paymentStatus = 'paid';
  if (status === 'annulée') {
    order.paymentStatus = order.paymentStatus === 'paid' ? 'refund_needed' : 'cancelled';
    if (order.inventoryReserved && !order.inventoryRestocked) {
      releaseInventoryForItems(db, order.items || [], order.id, 'Commande annulée');
      order.inventoryRestocked = true;
    }
  }
  if (status === 'remboursée') order.refundStatus = 'refunded';
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({ from: oldStatus || '', to: status, at: new Date().toISOString(), by: req.session.email || 'admin' });
  order.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, order });
});




app.get('/api/admin/analytics', adminOnly, (req, res) => {
  res.json(computeAdminAnalytics(readDB()));
});

app.get('/api/admin/inventory', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.kits || []).map(k => enrichPublicKit(k, db)).sort((a,b) => Number(a.stockQty ?? 999999) - Number(b.stockQty ?? 999999)));
});

app.post('/api/admin/kits/:id/inventory', adminOnly, (req, res) => {
  const db = readDB();
  const kitId = parseInt(req.params.id);
  const kit = (db.kits || []).find(k => k.id === kitId);
  if (!kit) return res.status(404).json({ error: 'Kit non trouvé' });
  const mode = String(req.body.mode || 'adjust');
  const qty = parseInt(req.body.quantity);
  if (!Number.isFinite(qty)) return res.status(400).json({ error: 'Quantité invalide' });
  const before = Number.isFinite(Number(kit.stockQty)) ? Number(kit.stockQty) : 0;
  const after = mode === 'set' ? Math.max(0, qty) : Math.max(0, before + qty);
  kit.stockQty = after;
  kit.inStock = after > 0;
  kit.updatedAt = new Date().toISOString();
  db.inventoryMovements = db.inventoryMovements || [];
  db.inventoryMovements.push({ id: Date.now(), kitId, kitName: kit.name, type: mode, quantity: mode === 'set' ? after - before : qty, before, after, reason: String(req.body.reason || 'Ajustement admin'), createdAt: new Date().toISOString(), by: req.session.email || 'admin' });
  writeDB(db);
  res.json({ success: true, kit: enrichPublicKit(kit, db) });
});

app.get('/api/admin/discounts', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.discounts || []).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
});
app.post('/api/admin/discounts', adminOnly, (req, res) => {
  const db = readDB();
  const discount = normalizeDiscountPayload(req.body);
  if (!discount.title) return res.status(400).json({ error: 'Nom du rabais requis' });
  if (!discount.type) return res.status(400).json({ error: 'Type de rabais requis' });
  discount.id = (db.discounts || []).length ? Math.max(...db.discounts.map(d => Number(d.id) || 0)) + 1 : 1;
  discount.createdAt = new Date().toISOString();
  discount.updatedAt = new Date().toISOString();
  db.discounts = db.discounts || [];
  db.discounts.push(discount);
  writeDB(db);
  res.json({ success: true, discount });
});
app.put('/api/admin/discounts/:id', adminOnly, (req, res) => {
  const db = readDB();
  const i = (db.discounts || []).findIndex(d => d.id === parseInt(req.params.id));
  if (i === -1) return res.status(404).json({ error: 'Rabais non trouvé' });
  db.discounts[i] = { ...db.discounts[i], ...normalizeDiscountPayload(req.body, db.discounts[i]), id: db.discounts[i].id, createdAt: db.discounts[i].createdAt, updatedAt: new Date().toISOString() };
  writeDB(db);
  res.json({ success: true, discount: db.discounts[i] });
});
app.delete('/api/admin/discounts/:id', adminOnly, (req, res) => {
  const db = readDB();
  db.discounts = (db.discounts || []).filter(d => d.id !== parseInt(req.params.id));
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/admin/refunds', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.refunds || []).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
});
app.post('/api/admin/orders/:id/refund', adminOnly, (req, res) => {
  const db = readDB();
  const order = (db.orders || []).find(o => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
  const already = Number(order.refundedTotal || 0);
  const maxRefundable = Math.max(0, Number(order.total || 0) - already);
  let amount = parseFloat(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) amount = maxRefundable;
  amount = Math.min(maxRefundable, Number(amount.toFixed(2)));
  if (amount <= 0) return res.status(400).json({ error: 'Aucun montant remboursable' });

  const refund = {
    id: 'RF-' + Date.now().toString(36).toUpperCase(),
    orderId: order.id,
    amount,
    reason: String(req.body.reason || 'Remboursement admin'),
    status: order.paymentProvider === 'not_connected' ? 'manual_refund_logged' : 'refund_requested',
    paymentProvider: order.paymentProvider || 'not_connected',
    restock: !!req.body.restock,
    createdAt: new Date().toISOString(),
    by: req.session.email || 'admin'
  };
  db.refunds = db.refunds || [];
  db.refunds.push(refund);
  order.refundedTotal = Number((already + amount).toFixed(2));
  order.refundStatus = order.refundedTotal >= Number(order.total || 0) ? 'refunded' : 'partial_refund';
  if (order.refundStatus === 'refunded') order.status = 'remboursée';
  if (refund.restock && order.inventoryReserved && !order.inventoryRestocked) {
    releaseInventoryForItems(db, order.items || [], order.id, 'Remboursement / retour');
    order.inventoryRestocked = true;
  }
  order.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, refund, order });
});

// Categories CRUD
app.post('/api/admin/categories', adminOnly, (req, res) => {
  const db=readDB(); const {name,slug,image,parent}=req.body;
  if(!name) return res.status(400).json({error:'Nom requis'});
  const cat = { id: (db.categories||[]).length>0 ? Math.max(...db.categories.map(c=>c.id))+1 : 1, name, slug:slug||name.toLowerCase().replace(/\s+/g,'-'), image:image||'', parent:parent||'none', order:(db.categories||[]).length+1 };
  if(!db.categories) db.categories=[]; db.categories.push(cat); writeDB(db);
  res.json({success:true,category:cat});
});
app.put('/api/admin/categories/:id', adminOnly, (req, res) => {
  const db=readDB(); const idx=(db.categories||[]).findIndex(c=>c.id===parseInt(req.params.id)); if(idx===-1) return res.status(404).json({error:'Non trouvé'});
  db.categories[idx]={...db.categories[idx],...req.body,id:db.categories[idx].id}; writeDB(db);
  res.json({success:true,category:db.categories[idx]});
});
app.delete('/api/admin/categories/:id', adminOnly, (req, res) => { const db=readDB(); db.categories=(db.categories||[]).filter(c=>c.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });

// Kits CRUD
app.post('/api/admin/kits', adminOnly, (req, res) => {
  const db=readDB(); const {name,price}=req.body; if(!name||!price) return res.status(400).json({error:'Nom et prix requis'});
  const kit = { id:db.kits.length>0?Math.max(...db.kits.map(k=>k.id))+1:1, name, ...normalizeKitPayload(req.body), createdAt:new Date().toISOString() };
  db.kits.push(kit); writeDB(db); res.json({success:true,kit});
});
app.put('/api/admin/kits/:id', adminOnly, (req, res) => { const db=readDB(); const i=db.kits.findIndex(k=>k.id===parseInt(req.params.id)); if(i===-1) return res.status(404).json({error:'Non trouvé'}); db.kits[i]={...db.kits[i],...normalizeKitPayload(req.body, db.kits[i]),name:req.body.name||db.kits[i].name,id:db.kits[i].id}; writeDB(db); res.json({success:true,kit:db.kits[i]}); });
app.delete('/api/admin/kits/:id', adminOnly, (req, res) => { const db=readDB(); db.kits=db.kits.filter(k=>k.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });

// Events CRUD
app.get('/api/admin/events', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.events || []).sort((a,b) => new Date((b.date || '') + 'T' + (b.time || '00:00')) - new Date((a.date || '') + 'T' + (a.time || '00:00'))));
});
app.post('/api/admin/events', adminOnly, (req, res) => {
  const db = readDB();
  const { title, date } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Titre et date requis' });
  const ev = { id: (db.events || []).length > 0 ? Math.max(...db.events.map(e => e.id)) + 1 : 1, ...normalizeEventPayload(req.body), createdAt: new Date().toISOString() };
  if (!db.events) db.events = [];
  db.events.push(ev);
  writeDB(db);
  res.json({ success: true, event: ev });
});
app.put('/api/admin/events/:id', adminOnly, (req, res) => {
  const db = readDB();
  const i = (db.events || []).findIndex(e => e.id === parseInt(req.params.id));
  if (i === -1) return res.status(404).json({ error: 'Non trouvé' });
  db.events[i] = { ...db.events[i], ...normalizeEventPayload(req.body, db.events[i]), id: db.events[i].id };
  writeDB(db);
  res.json({ success: true, event: db.events[i] });
});
app.delete('/api/admin/events/:id', adminOnly, (req, res) => { const db=readDB(); db.events=(db.events||[]).filter(e=>e.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });
app.get('/api/admin/bookings', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.bookings || []).map(b => ({ ...b, event: (db.events || []).find(e => e.id === b.eventId) || null })).sort((a,b) => new Date(b.bookedAt) - new Date(a.bookedAt)));
});
app.get('/api/admin/event-requests', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.eventRequests || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.patch('/api/admin/event-requests/:id', adminOnly, (req, res) => {
  const db = readDB();
  const i = (db.eventRequests || []).findIndex(r => r.id === parseInt(req.params.id));
  if (i === -1) return res.status(404).json({ error: 'Non trouvé' });
  db.eventRequests[i] = { ...db.eventRequests[i], status: req.body.status || db.eventRequests[i].status, adminNote: req.body.adminNote ?? db.eventRequests[i].adminNote };
  writeDB(db);
  res.json({ success: true, request: db.eventRequests[i] });
});
app.delete('/api/admin/event-requests/:id', adminOnly, (req, res) => { const db=readDB(); db.eventRequests=(db.eventRequests||[]).filter(r=>r.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });

// Bundles CRUD
app.post('/api/admin/bundles', adminOnly, (req, res) => {
  const db=readDB(); if(!db.bundles) db.bundles=[];
  const {name,description,price,originalPrice,image,kitIds,tag}=req.body;
  if(!name||!price) return res.status(400).json({error:'Nom et prix requis'});
  const bundle={id:db.bundles.length>0?Math.max(...db.bundles.map(b=>b.id))+1:1,name,description:description||'',price:parseFloat(price),originalPrice:parseFloat(originalPrice)||0,image:image||'',kitIds:kitIds||[],tag:tag||'',createdAt:new Date().toISOString()};
  db.bundles.push(bundle); writeDB(db);
  res.json({success:true,bundle});
});
app.put('/api/admin/bundles/:id', adminOnly, (req, res) => {
  const db=readDB(); const idx=(db.bundles||[]).findIndex(b=>b.id===parseInt(req.params.id));
  if(idx===-1) return res.status(404).json({error:'Non trouvé'});
  db.bundles[idx]={...db.bundles[idx],...req.body,id:db.bundles[idx].id,price:parseFloat(req.body.price)||db.bundles[idx].price};
  writeDB(db); res.json({success:true,bundle:db.bundles[idx]});
});
app.delete('/api/admin/bundles/:id', adminOnly, (req, res) => { const db=readDB(); db.bundles=(db.bundles||[]).filter(b=>b.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });



// ========== ADMIN PRO HELPERS: analytics, discounts, inventory ==========
function isFiniteNumber(v) { return Number.isFinite(Number(v)); }
function money(n) { return Number((Number(n) || 0).toFixed(2)); }
function parseIdList(raw) {
  if (Array.isArray(raw)) return raw.map(v => parseInt(v)).filter(Number.isFinite);
  return String(raw || '').split(',').map(v => parseInt(v.trim())).filter(Number.isFinite);
}
function parseStringList(raw) {
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
  return String(raw || '').split(',').map(v => v.trim()).filter(Boolean);
}
function getStockQty(kit) {
  return isFiniteNumber(kit.stockQty) ? Number(kit.stockQty) : null;
}
function isKitAvailable(kit) {
  const stock = getStockQty(kit);
  return kit.inStock !== false && (stock === null || stock > 0);
}
function normalizeKitPayload(body, existing = {}) {
  const payload = { ...body };
  payload.price = parseFloat(body.price) || 0;
  payload.compareAtPrice = parseFloat(body.compareAtPrice) || parseFloat(body.originalPrice) || 0;
  payload.categoryId = body.categoryId ? parseInt(body.categoryId) : (existing.categoryId || null);
  payload.tags = normalizeTags(body.tags ?? body.badges ?? existing.tags);
  payload.featured = body.featured === undefined ? !!existing.featured : (body.featured === true || body.featured === 'true');
  payload.shortDesc = body.shortDesc || '';
  payload.description = body.description || '';
  payload.image = body.image || '';
  payload.difficulty = body.difficulty || existing.difficulty || 'Débutant';
  payload.stockQty = isFiniteNumber(body.stockQty) ? Math.max(0, parseInt(body.stockQty)) : (isFiniteNumber(existing.stockQty) ? Math.max(0, parseInt(existing.stockQty)) : null);
  payload.lowStockThreshold = isFiniteNumber(body.lowStockThreshold) ? Math.max(0, parseInt(body.lowStockThreshold)) : (isFiniteNumber(existing.lowStockThreshold) ? Math.max(0, parseInt(existing.lowStockThreshold)) : 3);
  payload.trackInventory = body.trackInventory === undefined ? (existing.trackInventory !== false) : (body.trackInventory === true || body.trackInventory === 'true');
  const manualStock = body.inStock === undefined ? (existing.inStock !== false) : (body.inStock === true || body.inStock === 'true');
  payload.inStock = manualStock && (payload.stockQty === null || payload.stockQty > 0);
  return payload;
}
function normalizeDiscountPayload(body, existing = {}) {
  const type = String(body.type ?? existing.type ?? 'percent').trim();
  const codeRaw = String(body.code ?? existing.code ?? '').trim().toUpperCase();
  return {
    title: String(body.title ?? body.name ?? existing.title ?? '').trim(),
    code: codeRaw,
    type,
    value: parseFloat(body.value ?? existing.value ?? 0) || 0,
    scope: String(body.scope ?? existing.scope ?? 'all').trim(),
    kitIds: parseIdList(body.kitIds ?? existing.kitIds),
    categoryIds: parseIdList(body.categoryIds ?? existing.categoryIds),
    tags: parseStringList(body.tags ?? existing.tags).map(t => t.toLowerCase()),
    minQty: Math.max(1, parseInt(body.minQty ?? existing.minQty ?? 1) || 1),
    buyQty: Math.max(1, parseInt(body.buyQty ?? existing.buyQty ?? 1) || 1),
    freeQty: Math.max(1, parseInt(body.freeQty ?? existing.freeQty ?? 1) || 1),
    active: body.active === undefined ? (existing.active !== false) : (body.active === true || body.active === 'true'),
    startsAt: String(body.startsAt ?? existing.startsAt ?? '').trim(),
    endsAt: String(body.endsAt ?? existing.endsAt ?? '').trim(),
    customerLabel: String(body.customerLabel ?? existing.customerLabel ?? '').trim(),
    stackable: body.stackable === true || body.stackable === 'true'
  };
}
function isDiscountActive(discount, now = new Date()) {
  if (!discount || discount.active === false) return false;
  if (discount.startsAt && new Date(discount.startsAt) > now) return false;
  if (discount.endsAt && new Date(discount.endsAt + 'T23:59:59') < now) return false;
  return true;
}
function getActiveDiscounts(db) {
  return (db.discounts || []).filter(d => isDiscountActive(d));
}
function discountAppliesToKit(discount, kit) {
  const scope = discount.scope || 'all';
  if (scope === 'all') return true;
  if (scope === 'kits') return (discount.kitIds || []).map(Number).includes(Number(kit.id));
  if (scope === 'categories') return (discount.categoryIds || []).map(Number).includes(Number(kit.categoryId));
  if (scope === 'tags') {
    const kitTags = normalizeTags(kit.tags).map(t => t.toLowerCase());
    return (discount.tags || []).some(t => kitTags.includes(String(t).toLowerCase()));
  }
  return true;
}
function getBestSingleKitDiscount(db, kit) {
  const price = Number(kit.price) || 0;
  let best = null;
  for (const d of getActiveDiscounts(db)) {
    if (!discountAppliesToKit(d, kit)) continue;
    if (d.type === 'bogo') {
      if (!best) best = { amount: 0, discount: d, label: d.customerLabel || `Achetez ${d.buyQty || 1}, obtenez ${d.freeQty || 1} gratuit` };
      continue;
    }
    let amount = 0;
    if (d.type === 'percent') amount = price * Math.min(100, Math.max(0, Number(d.value) || 0)) / 100;
    if (d.type === 'fixed') amount = Math.min(price, Math.max(0, Number(d.value) || 0));
    if (amount > (best?.amount || 0)) best = { amount, discount: d, label: d.customerLabel || d.title || 'Rabais' };
  }
  return best;
}
function enrichPublicKit(kit, db) {
  const stockQty = getStockQty(kit);
  const lowStockThreshold = isFiniteNumber(kit.lowStockThreshold) ? Number(kit.lowStockThreshold) : 3;
  const available = isKitAvailable(kit);
  const best = getBestSingleKitDiscount(db, kit);
  const salePrice = best && best.amount > 0 ? money((Number(kit.price) || 0) - best.amount) : null;
  return {
    ...kit,
    stockQty,
    lowStockThreshold,
    inStock: available,
    isLowStock: available && stockQty !== null && stockQty > 0 && stockQty <= lowStockThreshold,
    stockLabel: !available ? 'Épuisé' : (stockQty !== null && stockQty <= lowStockThreshold ? `Stock limité: ${stockQty}` : 'En stock'),
    salePrice,
    effectivePrice: salePrice ?? (Number(kit.price) || 0),
    originalPrice: Number(kit.price) || 0,
    discountLabel: best?.label || '',
    hasDiscount: !!(best && (best.amount > 0 || best.discount?.type === 'bogo'))
  };
}
function getPublicKits(db) {
  return (db.kits || []).map(k => enrichPublicKit(k, db));
}
function buildOrderItems(db, rawItems = []) {
  const items = [];
  for (const raw of rawItems) {
    const rawId = String(raw.id || '').trim();
    const qty = Math.max(1, parseInt(raw.qty) || 1);
    if (!rawId) return { error: 'Article invalide' };

    if (rawId.startsWith('custom-photo-') || rawId.startsWith('custom-bag-') || String(raw.type || '').startsWith('custom-')) {
      const type = String(raw.type || (rawId.startsWith('custom-bag-') ? 'custom-bag' : 'custom-photo'));
      const name = String(raw.name || (type === 'custom-bag' ? 'Sac personnalisé' : 'Tableau personnalisé')).trim();
      const unitPrice = Math.max(0, Number(raw.price) || Number(raw.unitPrice) || 0);
      if (!unitPrice) return { error: 'Prix invalide pour le produit personnalisé' };
      items.push({
        id: rawId,
        type,
        name,
        unitPrice,
        price: unitPrice,
        image: String(raw.image || '').trim(),
        qty,
        customData: raw.customData && typeof raw.customData === 'object' ? raw.customData : {}
      });
      continue;
    }

    if (rawId.startsWith('bundle-')) {
      const bundleId = parseInt(rawId.replace('bundle-', ''));
      const bundle = (db.bundles || []).find(b => b.id === bundleId);
      if (!bundle) return { error: `Ensemble non trouvé: ${rawId}` };
      items.push({ id: rawId, bundleId, type: 'bundle', name: bundle.name, unitPrice: parseFloat(bundle.price) || 0, price: parseFloat(bundle.price) || 0, image: bundle.image || '', qty, kitIds: bundle.kitIds || [] });
      continue;
    }

    const kitId = parseInt(rawId);
    const kit = (db.kits || []).find(k => k.id === kitId);
    if (!kit) return { error: `Kit non trouvé: ${rawId}` };
    if (!isKitAvailable(kit)) return { error: `${kit.name} est épuisé` };
    const stock = getStockQty(kit);
    if (stock !== null && qty > stock) return { error: `Il reste seulement ${stock} ${kit.name}` };
    items.push({ id: String(kit.id), kitId: kit.id, type: 'kit', categoryId: kit.categoryId, tags: kit.tags || [], name: kit.name, unitPrice: parseFloat(kit.price) || 0, price: parseFloat(kit.price) || 0, image: kit.image || '', qty });
  }
  return { items };
}

function discountAmountForItem(discount, kitLike, item) {
  const qty = Number(item.qty) || 1;
  const unitPrice = Number(item.unitPrice) || Number(item.price) || 0;
  const line = unitPrice * qty;
  if (!discountAppliesToKit(discount, kitLike)) return 0;
  if (qty < (discount.minQty || 1)) return 0;
  if (discount.type === 'percent') return line * Math.min(100, Math.max(0, Number(discount.value) || 0)) / 100;
  if (discount.type === 'fixed') return Math.min(line, Math.max(0, Number(discount.value) || 0) * qty);
  if (discount.type === 'bogo') {
    const buy = Math.max(1, parseInt(discount.buyQty) || 1);
    const free = Math.max(1, parseInt(discount.freeQty) || 1);
    const cycle = buy + free;
    const freeUnits = Math.floor(qty / cycle) * free;
    return Math.min(line, freeUnits * unitPrice);
  }
  return 0;
}
function priceOrder(db, items = []) {
  const active = getActiveDiscounts(db);
  let subtotal = 0;
  let discountTotal = 0;
  const discountsApplied = [];
  const pricedItems = items.map(item => {
    const lineSubtotal = money((Number(item.unitPrice) || Number(item.price) || 0) * (Number(item.qty) || 1));
    subtotal += lineSubtotal;
    let kitLike = item;
    if (item.type === 'kit') kitLike = (db.kits || []).find(k => k.id === item.kitId) || item;
    let best = { amount: 0, discount: null };
    if (item.type === 'kit') {
      for (const d of active) {
        const amount = discountAmountForItem(d, kitLike, item);
        if (amount > best.amount) best = { amount, discount: d };
      }
    }
    const itemDiscount = money(Math.min(lineSubtotal, best.amount || 0));
    discountTotal += itemDiscount;
    if (best.discount && itemDiscount > 0) discountsApplied.push({ id: best.discount.id, title: best.discount.title, type: best.discount.type, amount: itemDiscount, itemId: item.id });
    return { ...item, originalUnitPrice: Number(item.unitPrice) || 0, discountAmount: itemDiscount, discountLabel: best.discount?.customerLabel || best.discount?.title || '', lineSubtotal, lineTotal: money(lineSubtotal - itemDiscount) };
  });
  subtotal = money(subtotal);
  discountTotal = money(discountTotal);
  return { items: pricedItems, subtotal, discountTotal, discountsApplied, total: money(subtotal - discountTotal) };
}
function findKit(db, kitId) { return (db.kits || []).find(k => Number(k.id) === Number(kitId)); }
function updateKitStock(kit, delta, db, orderId, reason) {
  const stock = getStockQty(kit);
  if (stock === null) return null;
  const before = stock;
  const after = Math.max(0, before + delta);
  kit.stockQty = after;
  kit.inStock = after > 0;
  kit.updatedAt = new Date().toISOString();
  db.inventoryMovements = db.inventoryMovements || [];
  db.inventoryMovements.push({ id: Date.now() + Math.floor(Math.random()*1000), orderId, kitId: kit.id, kitName: kit.name, type: delta < 0 ? 'sale' : 'restock', quantity: delta, before, after, reason, createdAt: new Date().toISOString() });
  return { before, after };
}
function reserveInventoryForItems(db, items, orderId) {
  const needs = new Map();
  for (const item of items) {
    const qty = Math.max(1, parseInt(item.qty) || 1);
    if (item.type === 'kit') needs.set(item.kitId, (needs.get(item.kitId) || 0) + qty);
    if (item.type === 'bundle') for (const kitId of (item.kitIds || [])) needs.set(kitId, (needs.get(kitId) || 0) + qty);
  }
  for (const [kitId, qty] of needs.entries()) {
    const kit = findKit(db, kitId);
    if (!kit) continue;
    if (!isKitAvailable(kit)) return { error: `${kit.name} est épuisé` };
    const stock = getStockQty(kit);
    if (stock !== null && qty > stock) return { error: `Inventaire insuffisant pour ${kit.name}. Reste: ${stock}` };
  }
  for (const [kitId, qty] of needs.entries()) {
    const kit = findKit(db, kitId);
    if (kit) updateKitStock(kit, -qty, db, orderId, 'Commande client');
  }
  return { success: true };
}
function releaseInventoryForItems(db, items, orderId, reason = 'Retour stock') {
  const needs = new Map();
  for (const item of items) {
    const qty = Math.max(1, parseInt(item.qty) || 1);
    if (item.type === 'kit') needs.set(item.kitId || parseInt(item.id), (needs.get(item.kitId || parseInt(item.id)) || 0) + qty);
    if (item.type === 'bundle') for (const kitId of (item.kitIds || [])) needs.set(kitId, (needs.get(kitId) || 0) + qty);
  }
  for (const [kitId, qty] of needs.entries()) {
    const kit = findKit(db, kitId);
    if (kit) updateKitStock(kit, qty, db, orderId, reason);
  }
}
function isStripeEnabled() {
  return String(process.env.PAYMENT_PROVIDER || '').toLowerCase() === 'stripe' && Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
}
function stripeAmountCents(amount) {
  return Math.max(50, Math.round((Number(amount) || 0) * 100));
}
function encodeStripeForm(params) {
  const body = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') body.append(key, String(value));
  });
  return body.toString();
}
function stripeRequest(method, endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return reject(new Error('STRIPE_SECRET_KEY manquant'));
    const body = method === 'GET' ? '' : encodeStripeForm(params);
    const req = https.request({
      hostname: 'api.stripe.com',
      path: endpoint,
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64'),
        'Stripe-Version': '2024-06-20',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) })
      }
    }, resp => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        let parsed = {};
        try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = { raw: data }; }
        if (resp.statusCode >= 400) return reject(new Error(parsed.error?.message || `Stripe error ${resp.statusCode}`));
        resolve(parsed);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
async function createStripePaymentIntentForOrder(order) {
  return stripeRequest('POST', '/v1/payment_intents', {
    amount: stripeAmountCents(order.total),
    currency: 'cad',
    'automatic_payment_methods[enabled]': 'true',
    receipt_email: order.customer?.email || order.guestEmail || '',
    description: `Commande Arty ${order.id}`,
    'metadata[orderId]': order.id,
    'metadata[customerEmail]': order.customer?.email || order.guestEmail || '',
    'metadata[source]': 'arty-creation'
  });
}
async function retrieveStripePaymentIntent(paymentIntentId) {
  return stripeRequest('GET', `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`);
}
function markOrderPaid(order, pi, source) {
  order.status = 'payée';
  order.paymentStatus = 'paid';
  order.paymentProvider = 'stripe';
  order.paymentReference = pi.id || order.paymentReference || '';
  order.stripe = { ...(order.stripe || {}), paymentIntentId: pi.id || '', status: pi.status || '', amountReceived: (Number(pi.amount_received) || 0) / 100, confirmedAt: new Date().toISOString(), source };
  order.paidAt = order.paidAt || new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({ from: order.status || '', to: 'payée', at: new Date().toISOString(), by: `stripe:${source}` });
}
function syncOrderFromStripePaymentIntent(db, pi, source = 'stripe') {
  const orderId = pi.metadata?.orderId || '';
  const order = (db.orders || []).find(o => String(o.id) === String(orderId) || String(o.paymentReference || '') === String(pi.id));
  if (!order) return null;
  order.paymentProvider = 'stripe';
  order.paymentReference = pi.id || order.paymentReference || '';
  order.stripe = { ...(order.stripe || {}), paymentIntentId: pi.id || '', status: pi.status || '', lastSyncedAt: new Date().toISOString() };
  if (pi.status === 'succeeded') {
    markOrderPaid(order, pi, source);
  } else if (pi.status === 'processing') {
    order.paymentStatus = 'processing';
    order.updatedAt = new Date().toISOString();
  } else if (['requires_payment_method', 'requires_action', 'requires_confirmation'].includes(pi.status)) {
    order.paymentStatus = 'pending';
    order.updatedAt = new Date().toISOString();
  } else if (['canceled'].includes(pi.status)) {
    order.paymentStatus = 'cancelled';
    order.status = 'annulée';
    if (order.inventoryReserved && !order.inventoryRestocked) {
      releaseInventoryForItems(db, order.items || [], order.id, 'Paiement Stripe annulé');
      order.inventoryRestocked = true;
    }
    order.updatedAt = new Date().toISOString();
  } else if (pi.last_payment_error) {
    order.paymentStatus = 'failed';
    order.stripe.lastPaymentError = pi.last_payment_error.message || '';
    order.updatedAt = new Date().toISOString();
  }
  return order;
}
function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!secret) return true;
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=').map(x => x.trim())).filter(p => p.length === 2));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
function handleStripeWebhook(req, res) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (secret && !verifyStripeSignature(req.body, req.headers['stripe-signature'], secret)) {
      return res.status(400).send('Webhook signature verification failed');
    }
    const event = JSON.parse(req.body.toString('utf8'));
    const db = readDB();
    const obj = event.data?.object || {};
    if (event.type && event.type.startsWith('payment_intent.')) {
      syncOrderFromStripePaymentIntent(db, obj, 'webhook:' + event.type);
      writeDB(db);
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    res.status(400).send('Webhook error: ' + err.message);
  }
}

function computeAdminAnalytics(db) {
  const orders = db.orders || [];
  const refunds = db.refunds || [];
  const now = new Date();
  const monthKey = now.toISOString().slice(0,7);
  const goodOrders = orders.filter(o => o.status !== 'annulée');
  const revenue = money(goodOrders.reduce((s,o)=>s+Number(o.total||0),0));
  const paidRevenue = money(orders.filter(o=>o.paymentStatus==='paid').reduce((s,o)=>s+Number(o.total||0),0));
  const monthOrders = goodOrders.filter(o => String(o.createdAt||'').slice(0,7) === monthKey);
  const todayKey = now.toISOString().slice(0,10);
  const todayOrders = goodOrders.filter(o => String(o.createdAt||'').slice(0,10) === todayKey);
  const statusCounts = orders.reduce((a,o)=>{const k=o.status||'nouvelle';a[k]=(a[k]||0)+1;return a;},{});
  const daily = [];
  for (let i=13;i>=0;i--) {
    const d = new Date(now); d.setDate(now.getDate()-i);
    const key = d.toISOString().slice(0,10);
    const dayOrders = goodOrders.filter(o => String(o.createdAt||'').slice(0,10) === key);
    daily.push({ date:key.slice(5), revenue: money(dayOrders.reduce((s,o)=>s+Number(o.total||0),0)), orders: dayOrders.length });
  }
  const productMap = {};
  for (const o of goodOrders) for (const item of (o.items||[])) {
    const name = item.name || 'Produit';
    if (!productMap[name]) productMap[name] = { name, qty:0, revenue:0 };
    productMap[name].qty += Number(item.qty)||0;
    productMap[name].revenue += Number(item.lineTotal ?? (Number(item.price||0)*Number(item.qty||0))) || 0;
  }
  const topProducts = Object.values(productMap).sort((a,b)=>b.revenue-a.revenue).slice(0,8).map(x=>({ ...x, revenue: money(x.revenue) }));
  const lowInventory = (db.kits||[]).map(k=>enrichPublicKit(k,db)).filter(k=>k.isLowStock || !k.inStock).sort((a,b)=>Number(a.stockQty??999)-Number(b.stockQty??999)).slice(0,20);
  const refundTotal = money(refunds.reduce((s,r)=>s+Number(r.amount||0),0));
  return {
    revenue,
    paidRevenue,
    pendingRevenue: money(orders.filter(o=>o.paymentStatus==='pending').reduce((s,o)=>s+Number(o.total||0),0)),
    monthRevenue: money(monthOrders.reduce((s,o)=>s+Number(o.total||0),0)),
    todayRevenue: money(todayOrders.reduce((s,o)=>s+Number(o.total||0),0)),
    ordersCount: orders.length,
    monthOrdersCount: monthOrders.length,
    todayOrdersCount: todayOrders.length,
    averageOrder: goodOrders.length ? money(revenue / goodOrders.length) : 0,
    discountTotal: money(goodOrders.reduce((s,o)=>s+Number(o.discountTotal||0),0)),
    refundTotal,
    statusCounts,
    dailySales: daily,
    topProducts,
    lowInventory,
    lowInventoryCount: lowInventory.length,
    activeDiscounts: (db.discounts||[]).filter(d=>isDiscountActive(d)).length,
    newEventRequests: (db.eventRequests||[]).filter(r=>(r.status||'nouvelle')==='nouvelle').length,
    bookingsCount: (db.bookings||[]).length,
    latestOrders: orders.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6)
  };
}

// ========== CLIENT-CREATED BUNDLE DEAL RULES ==========
function defaultBundleDealRules() {
  return [
    { id: 101, label: 'Rabais groupe 10+', appliesTo: 'all', minQty: 10, percent: 10, customTextFee: 12, active: true, createdAt: new Date().toISOString() },
    { id: 102, label: 'Rabais événement 20+', appliesTo: 'event', minQty: 20, percent: 15, customTextFee: 0, active: true, createdAt: new Date().toISOString() },
    { id: 103, label: 'Rabais mariage 30+', appliesTo: 'wedding', minQty: 30, percent: 18, customTextFee: 0, active: true, createdAt: new Date().toISOString() }
  ];
}
function getBundleDealRules(db) {
  if (!Array.isArray(db.bundleDealRules) || !db.bundleDealRules.length) return defaultBundleDealRules();
  return db.bundleDealRules;
}
app.get('/api/bundle-deals', (req, res) => {
  const db = readDB();
  res.json(getBundleDealRules(db).filter(r => r.active !== false).sort((a,b)=>(Number(a.minQty)||0)-(Number(b.minQty)||0)));
});
app.get('/api/admin/bundle-deals', adminOnly, (req, res) => {
  const db = readDB();
  res.json(getBundleDealRules(db).sort((a,b)=>(Number(a.minQty)||0)-(Number(b.minQty)||0)));
});
app.post('/api/admin/bundle-deals', adminOnly, (req, res) => {
  const db = readDB();
  const body = req.body || {};
  const rule = {
    id: Date.now(),
    label: String(body.label || '').trim(),
    appliesTo: ['all','group','event','wedding'].includes(body.appliesTo) ? body.appliesTo : 'all',
    minQty: Math.max(1, parseInt(body.minQty) || 1),
    percent: Math.max(0, Math.min(90, Number(body.percent) || 0)),
    customTextFee: Math.max(0, Number(body.customTextFee) || 0),
    active: body.active !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!rule.label) return res.status(400).json({ error: 'Nom de règle requis' });
  db.bundleDealRules = Array.isArray(db.bundleDealRules) && db.bundleDealRules.length ? db.bundleDealRules : defaultBundleDealRules();
  db.bundleDealRules.push(rule);
  writeDB(db);
  res.json({ success: true, rule });
});
app.put('/api/admin/bundle-deals/:id', adminOnly, (req, res) => {
  const db = readDB();
  db.bundleDealRules = Array.isArray(db.bundleDealRules) && db.bundleDealRules.length ? db.bundleDealRules : defaultBundleDealRules();
  const i = db.bundleDealRules.findIndex(r => String(r.id) === String(req.params.id));
  if (i === -1) return res.status(404).json({ error: 'Règle non trouvée' });
  const body = req.body || {};
  db.bundleDealRules[i] = {
    ...db.bundleDealRules[i],
    label: String(body.label ?? db.bundleDealRules[i].label).trim(),
    appliesTo: ['all','group','event','wedding'].includes(body.appliesTo) ? body.appliesTo : db.bundleDealRules[i].appliesTo,
    minQty: Math.max(1, parseInt(body.minQty) || db.bundleDealRules[i].minQty || 1),
    percent: Math.max(0, Math.min(90, Number(body.percent ?? db.bundleDealRules[i].percent) || 0)),
    customTextFee: Math.max(0, Number(body.customTextFee ?? db.bundleDealRules[i].customTextFee) || 0),
    active: body.active !== false,
    updatedAt: new Date().toISOString()
  };
  writeDB(db);
  res.json({ success: true, rule: db.bundleDealRules[i] });
});
app.delete('/api/admin/bundle-deals/:id', adminOnly, (req, res) => {
  const db = readDB();
  db.bundleDealRules = (Array.isArray(db.bundleDealRules) && db.bundleDealRules.length ? db.bundleDealRules : defaultBundleDealRules()).filter(r => String(r.id) !== String(req.params.id));
  writeDB(db);
  res.json({ success: true });
});

// Override inventory reservation so client-created bundles/events also reduce stock.
function reserveInventoryForItems(db, items, orderId) {
  const needs = new Map();
  function addNeed(kitId, qty) {
    if (!kitId) return;
    needs.set(Number(kitId), (needs.get(Number(kitId)) || 0) + Math.max(1, parseInt(qty) || 1));
  }
  for (const item of items) {
    const qty = Math.max(1, parseInt(item.qty) || 1);
    if (item.type === 'kit') addNeed(item.kitId, qty);
    if (item.type === 'bundle') for (const kitId of (item.kitIds || [])) addNeed(kitId, qty);
    const customItems = item.customData?.items || item.customData?.placements || [];
    if (['custom-bundle','custom-event-package'].includes(item.type) || item.customData?.kind === 'client-bundle' || item.customData?.kind === 'event-package') {
      for (const ci of customItems) addNeed(ci.kitId, (Number(ci.qty) || 1) * qty);
    }
  }
  for (const [kitId, qty] of needs.entries()) {
    const kit = findKit(db, kitId);
    if (!kit) continue;
    if (!isKitAvailable(kit)) return { error: `${kit.name} est épuisé` };
    const stock = getStockQty(kit);
    if (stock !== null && qty > stock) return { error: `Inventaire insuffisant pour ${kit.name}. Reste: ${stock}` };
  }
  for (const [kitId, qty] of needs.entries()) {
    const kit = findKit(db, kitId);
    if (!kit) continue;
    updateKitStock(kit, -qty, db, orderId, 'Commande / forfait client');
  }
  return { success: true };
}

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Arty! server → http://localhost:${PORT}`));