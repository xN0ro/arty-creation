const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { I18n, middleware: localeMiddleware, catalog: localizeCatalog, orderView: localizeOrder, translations: normalizeTranslations, withLocale } = require('./localization');

const app = express();
const PORT = process.env.PORT || 3000;

// Stripe webhooks need the raw body for signature verification. Keep this BEFORE json parsing.
app.post('/api/stripe/webhook', bodyParser.raw({ type: 'application/json', limit: '25mb' }), handleStripeWebhook);

// Custom products can include preview images, so allow larger JSON payloads.
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', localeMiddleware);

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
  passwordResetTokens: [],
  discounts: [],
  refunds: [],
  supportRequests: [],
  inventoryMovements: [],
  bundleDealRules: [],
  productTemplates: [],
  announcement: {
    enabled: true,
    message: 'Livraison gratuite pour toute commande de 75 $ et plus'
  }
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
const PRODUCT_UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Product images live beside the persistent JSON database so they survive deployments on Render.
app.use('/uploads', express.static(PRODUCT_UPLOADS_DIR, { fallthrough: true, maxAge: '7d' }));

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
      passwordResetTokens: db.passwordResetTokens.length,
      discounts: db.discounts.length,
      refunds: db.refunds.length,
      supportRequests: (db.supportRequests||[]).length,
      inventoryMovements: db.inventoryMovements.length,
      bundleDealRules: (db.bundleDealRules||[]).length,
      productTemplates: (db.productTemplates||[]).length
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
    kits: Array.isArray(db.kits) ? db.kits.map(({ tags, badges, difficulty, ...kit }) => kit) : [],
    events: Array.isArray(db.events) ? db.events : [],
    teamActivities: Array.isArray(db.teamActivities) ? db.teamActivities : [],
    bundles: Array.isArray(db.bundles) ? db.bundles : [],
    users: Array.isArray(db.users) ? db.users : [],
    orders: Array.isArray(db.orders) ? db.orders : [],
    bookings: Array.isArray(db.bookings) ? db.bookings : [],
    eventRequests: Array.isArray(db.eventRequests) ? db.eventRequests : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    passwordResetTokens: Array.isArray(db.passwordResetTokens) ? db.passwordResetTokens : [],
    discounts: Array.isArray(db.discounts) ? db.discounts : [],
    refunds: Array.isArray(db.refunds) ? db.refunds : [],
    supportRequests: Array.isArray(db.supportRequests) ? db.supportRequests : [],
    inventoryMovements: Array.isArray(db.inventoryMovements) ? db.inventoryMovements : [],
    bundleDealRules: Array.isArray(db.bundleDealRules) ? db.bundleDealRules : [],
    productTemplates: Array.isArray(db.productTemplates) ? db.productTemplates : [],
    announcement: db.announcement && typeof db.announcement === 'object'
      ? {
          enabled: db.announcement.enabled === true,
          message: String(db.announcement.message || '').replace(/\s+/g, ' ').trim().slice(0, 180),
          translations: normalizeTranslations(db.announcement.translations)
        }
      : { ...DEFAULT_DB.announcement }
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
  if (!s) return res.status(401).json({ error: I18n.t('Non authentifié') });
  req.session = s;
  next();
}
function adminOnly(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: I18n.t('Non authentifié') });
  if (s.role !== 'admin') return res.status(403).json({ error: I18n.t('Accès admin requis') });
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
    if (!expectedClientId) return reject(new Error(I18n.t('Google Client ID non configuré')));
    https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, resp => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try {
          const i = JSON.parse(data);
          if (i.error) return reject(new Error(i.error_description || i.error));
          if (i.aud !== expectedClientId) return reject(new Error(I18n.t('Client ID Google invalide pour ce site')));
          if (String(i.email_verified) !== 'true') return reject(new Error(I18n.t('Courriel Google non vérifié')));
          const email = String(i.email || '').trim().toLowerCase();
          if (!email) return reject(new Error(I18n.t('Courriel Google manquant')));
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
    stripeConfigured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY),
    ticketPaymentsConfigured: isTicketPaymentEnabled(),
    emailConfigured: transactionalEmailIsConfigured(),
    ticketEmailConfigured: ticketEmailIsConfigured(),
    announcement: db.announcement || DEFAULT_DB.announcement
  });
});
app.get('/api/announcement', (req, res) => res.json(readDB().announcement || DEFAULT_DB.announcement));
app.get('/api/storage-health', (req, res) => res.json({ ...getStorageHealth(), collectionCounts: getCollectionCountsSafe() }));
app.get('/api/kits', (req, res) => res.json(getPublicKits(readDB())));
app.get('/api/kits/:id', (req, res) => { const db = readDB(); const k = getPublicKits(db).find(k => k.id === parseInt(req.params.id)); k ? res.json(k) : res.status(404).json({ error: I18n.t('Non trouvé') }); });
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
app.get('/api/bundles/:id', (req, res) => { const b = (readDB().bundles||[]).find(b=>b.id===parseInt(req.params.id)); b ? res.json(b) : res.status(404).json({error:I18n.t('Non trouvé')}); });

// ========== AUTH ==========
function normalizeAccountAddress(raw = {}, existing = {}) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    line1: String(value.line1 ?? existing.line1 ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
    city: String(value.city ?? existing.city ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    province: String(value.province ?? existing.province ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    postal: String(value.postal ?? existing.postal ?? '').replace(/\s+/g, ' ').trim().slice(0, 20),
    country: String(value.country ?? existing.country ?? 'Canada').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Canada'
  };
}
function publicUserAccount(user) {
  return {
    id: user.id,
    locale: I18n.normalize(user.locale),
    name: user.name,
    email: user.email,
    role: user.role,
    picture: user.picture || '',
    provider: user.provider || 'local',
    linkedProviders: Array.isArray(user.linkedProviders) ? user.linkedProviders : [user.provider || 'local'],
    phone: String(user.phone || ''),
    defaultAddress: normalizeAccountAddress(user.defaultAddress),
    createdAt: user.createdAt || ''
  };
}
function cleanExpiredPasswordResets(db) {
  const now = Date.now();
  db.passwordResetTokens = (db.passwordResetTokens || []).filter(item => !item.usedAt && new Date(item.expiresAt || 0).getTime() > now);
}
app.post('/api/users/register', async (req, res) => {
  try {
    const db = readDB();
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = req.body.confirmPassword === undefined ? password : String(req.body.confirmPassword || '');
    if (!name || !email || !password || !confirmPassword) return res.status(400).json({ error: I18n.t('Tous les champs sont requis') });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: I18n.t('Courriel invalide') });
    if (password.length < 6) return res.status(400).json({ error: I18n.t('Mot de passe: 6+ caractères') });
    if (password !== confirmPassword) return res.status(400).json({ error: I18n.t('Les mots de passe ne correspondent pas') });
    db.users = db.users || [];
    if (db.users.find(u => String(u.email || '').toLowerCase() === email)) return res.status(400).json({ error: I18n.t('Courriel déjà utilisé') });
    const hashed = await bcrypt.hash(password, 10);
    const isAdmin = (db.adminEmails||[]).map(e=>String(e).toLowerCase()).includes(email);
    const user = { locale:req.locale, id: Date.now(), name, email, password: hashed, role: isAdmin ? 'admin' : 'user', provider: 'local', linkedProviders:['local'], picture: '', phone: '', defaultAddress: normalizeAccountAddress(), createdAt: new Date().toISOString() };
    db.users.push(user); writeDB(db);
    const token = createToken(user);
    const emailResult = await sendAccountWelcomeEmail(user);
    res.json({ success: true, token, user: publicUserAccount(user), emailStatus:emailResult.status });
  } catch (err) { console.error(err); res.status(500).json({ error: I18n.t('Erreur serveur') }); }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const db = readDB();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = (db.users || []).find(u => String(u.email || '').toLowerCase() === email && u.provider === 'local');
    if (!user) return res.status(401).json({ error: I18n.t('Courriel ou mot de passe invalide') });
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: I18n.t('Courriel ou mot de passe invalide') });
    user.locale = req.locale; writeDB(db);
    const token = createToken(user);
    const emailResult = await sendLoginAlertEmail(user);
    res.json({ success: true, token, user: publicUserAccount(user), emailStatus:emailResult.status });
  } catch (err) { console.error(err); res.status(500).json({ error: I18n.t('Erreur serveur') }); }
});

app.post('/api/users/google', async (req, res) => {
  try {
    const { credential } = req.body; if (!credential) return res.status(400).json({ error: I18n.t('Pas de credential') });
    const g = await verifyGoogleToken(credential); const db = readDB();
    db.users = db.users || [];
    let user = db.users.find(u => String(u.email || '').toLowerCase() === g.email);
    const isAdmin = (db.adminEmails||[]).map(e=>String(e).toLowerCase()).includes(g.email);
    const isNewAccount = !user;
    if (!user) {
      user = { id: Date.now(), name:g.name, email:g.email, password:'', role:isAdmin?'admin':'user', provider:'google', linkedProviders:['google'], picture:g.picture||'', phone:'', defaultAddress:normalizeAccountAddress(), createdAt:new Date().toISOString(), googleLinkedAt:new Date().toISOString() };
      db.users.push(user);
    } else {
      user.role = isAdmin ? 'admin' : (user.role || 'user');
      user.name = user.name || g.name;
      user.picture = user.picture || g.picture || '';
      user.linkedProviders = Array.from(new Set([...(user.linkedProviders || [user.provider || 'local']), 'google']));
      user.googleLinkedAt = user.googleLinkedAt || new Date().toISOString();
    }
    user.locale = req.locale; writeDB(db);
    const token = createToken(user);
    const emailResult = isNewAccount ? await sendAccountWelcomeEmail(user) : await sendLoginAlertEmail(user);
    res.json({ success: true, token, user: publicUserAccount(user), emailStatus:emailResult.status });
  } catch (err) { res.status(401).json({ error: I18n.t('Échec Google: ') + err.message }); }
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
app.post('/api/users/forgot-password', async (req, res) => {
  const genericResponse = { success:true, message:I18n.t('Si un compte utilisant ce courriel existe, un lien de réinitialisation a été envoyé.') };
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!validEmail(email)) return res.json(genericResponse);
    const db = readDB();
    cleanExpiredPasswordResets(db);
    const user = (db.users || []).find(item => String(item.email || '').toLowerCase() === email && item.provider === 'local');
    if (!user) { writeDB(db); return res.json(genericResponse); }
    const recent = (db.passwordResetTokens || []).find(item => item.userId === user.id && Date.now() - new Date(item.createdAt || 0).getTime() < 60000);
    if (recent) { writeDB(db); return res.json(genericResponse); }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    db.passwordResetTokens.push({
      tokenHash:hashToken(rawToken),
      userId:user.id,
      createdAt:now.toISOString(),
      expiresAt:new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      usedAt:''
    });
    writeDB(db);
    await sendPasswordResetEmail({ ...user, locale:req.locale }, rawToken);
    res.json(genericResponse);
  } catch (err) {
    console.error('Password reset request error:', err);
    res.json(genericResponse);
  }
});
app.post('/api/users/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    if (!token) return res.status(400).json({ error:I18n.t('Lien de réinitialisation invalide') });
    if (password.length < 6) return res.status(400).json({ error:I18n.t('Le mot de passe doit contenir au moins 6 caractères') });
    if (password !== confirmPassword) return res.status(400).json({ error:I18n.t('Les mots de passe ne correspondent pas') });
    const db = readDB();
    cleanExpiredPasswordResets(db);
    const tokenHash = hashToken(token);
    const reset = (db.passwordResetTokens || []).find(item => item.tokenHash === tokenHash && !item.usedAt);
    if (!reset) return res.status(400).json({ error:I18n.t('Ce lien est invalide ou expiré. Demandez un nouveau lien.') });
    const user = (db.users || []).find(item => item.id === reset.userId && item.provider === 'local');
    if (!user) return res.status(400).json({ error:I18n.t('Compte introuvable') });
    user.password = await bcrypt.hash(password, 10);
    reset.usedAt = new Date().toISOString();
    db.passwordResetTokens = (db.passwordResetTokens || []).filter(item => item.userId !== user.id || item.tokenHash === tokenHash);
    db.sessions = (db.sessions || []).filter(item => item.userId !== user.id);
    writeDB(db);
    const emailResult = await sendPasswordChangedEmail(user);
    res.json({ success:true, message:I18n.t('Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.'), emailStatus:emailResult.status });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error:I18n.t('Impossible de modifier le mot de passe') });
  }
});
app.put('/api/users/locale', auth, (req,res) => { const db=readDB(); const user=db.users.find(item=>item.id===req.session.userId); if(!user)return res.status(404).json({error:I18n.t('Compte introuvable')}); user.locale=req.locale; writeDB(db); res.json({success:true,locale:user.locale}); });
app.get('/api/admin/categories', adminOnly, (req,res) => res.json(readDB().categories || []));
app.get('/api/admin/announcement', adminOnly, (req,res) => res.json(readDB().announcement || {}));

app.get('/api/users/me', auth, (req, res) => { const u = readDB().users.find(u=>u.id===req.session.userId); if(!u) return res.status(404).json({error:I18n.t('Non trouvé')}); res.json(publicUserAccount(u)); });
app.put('/api/users/me', auth, async (req, res) => {
  const db = readDB(); const idx = db.users.findIndex(u=>u.id===req.session.userId); if(idx===-1) return res.status(404).json({error:I18n.t('Non trouvé')});
  const {name,currentPassword,newPassword,phone,defaultAddress} = req.body;
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  if(cleanName.length < 2 || cleanName.length > 80) return res.status(400).json({error:I18n.t('Entrez un nom valide')});
  db.users[idx].name = cleanName;
  db.users[idx].phone = String(phone || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  db.users[idx].defaultAddress = normalizeAccountAddress(defaultAddress, db.users[idx].defaultAddress);
  let passwordChanged = false;
  if(newPassword && db.users[idx].provider==='local') {
    if(!currentPassword) return res.status(400).json({error:I18n.t('Mot de passe actuel requis')});
    if(!(await bcrypt.compare(currentPassword,db.users[idx].password))) return res.status(400).json({error:I18n.t('Mot de passe actuel incorrect')});
    if(String(newPassword).length < 6) return res.status(400).json({error:I18n.t('Le nouveau mot de passe doit contenir au moins 6 caractères')});
    db.users[idx].password = await bcrypt.hash(newPassword,10);
    passwordChanged = true;
  }
  writeDB(db); const u=db.users[idx];
  const emailResult = passwordChanged ? await sendPasswordChangedEmail(u) : { status:'not_needed' };
  res.json({success:true,user:publicUserAccount(u),emailStatus:emailResult.status});
});


function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildOrderItems(db, rawItems = []) {
  const items = [];
  for (const raw of rawItems) {
    const rawId = String(raw.id || '').trim();
    const qty = Math.max(1, parseInt(raw.qty) || 1);
    if (!rawId) return { error: I18n.t('Article invalide') };

    if (rawId.startsWith('bundle-')) {
      const bundleId = parseInt(rawId.replace('bundle-', ''));
      const bundle = (db.bundles || []).find(b => b.id === bundleId);
      if (!bundle) return { error: I18n.msg`Ensemble non trouvé: ${rawId}` };
      items.push({ id: rawId, type: 'bundle', name: bundle.name, translations:bundle.translations, price: parseFloat(bundle.price) || 0, image: bundle.image || '', qty });
      continue;
    }

    const kitId = parseInt(rawId);
    const kit = (db.kits || []).find(k => k.id === kitId);
    if (!kit) return { error: I18n.msg`Kit non trouvé: ${rawId}` };
    if (kit.inStock === false) return { error: I18n.msg`${kit.name} est épuisé` };
    items.push({ id: String(kit.id), type: 'kit', name: kit.name,
      translations:kit.translations, price: parseFloat(kit.price) || 0, image: kit.image || '', qty });
  }
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return { items, subtotal };
}

// ========== ORDERS & BOOKINGS ==========
app.post('/api/orders', optionalAuth, async (req, res) => {
  const db = readDB();
  const { items: rawItems, customer = {}, address = {}, checkoutMode } = req.body;
  if (!Array.isArray(rawItems) || !rawItems.length) return res.status(400).json({ error: I18n.t('Aucun article') });

  const built = buildOrderItems(db, rawItems);
  if (built.error) return res.status(400).json({ error: built.error });

  const user = req.session?.userId ? (db.users || []).find(u => u.id === req.session.userId) : null;
  const customerName = String(customer.name || user?.name || '').trim();
  const customerEmail = String(customer.email || user?.email || '').trim().toLowerCase();
  const customerPhone = String(customer.phone || '').trim();

  if (!customerName) return res.status(400).json({ error: I18n.t('Nom requis') });
  if (!validEmail(customerEmail)) return res.status(400).json({ error: I18n.t('Courriel valide requis') });
  const needsShipping = built.items.some(item => item.type !== 'event-ticket');
  if (needsShipping && (!address || !String(address.line1 || '').trim())) return res.status(400).json({ error: I18n.t('Adresse de livraison requise') });

  const pricing = priceOrder(db, built.items);
  const hasEventTickets = pricing.items.some(item => item.type === 'event-ticket');
  if (hasEventTickets && !isTicketPaymentEnabled()) return res.status(503).json({ error: I18n.t('Le paiement sécurisé des billets doit être entièrement configuré avant la vente') });
  const orderId = 'ARTY-' + Date.now().toString(36).toUpperCase();
  const inventoryResult = reserveInventoryForItems(db, pricing.items, orderId);
  if (inventoryResult.error) return res.status(400).json({ error: inventoryResult.error });
  const eventSeatResult = reserveEventSeatsForItems(db, pricing.items);
  if (eventSeatResult.error) {
    releaseInventoryForItems(db, pricing.items, orderId, I18n.t('Réservation de billets impossible'));
    return res.status(400).json({ error: eventSeatResult.error });
  }

  const createdAt = new Date().toISOString();
  const order = {
    id: orderId,
    locale: req.locale,
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
    statusHistory: [{ from: '', to: 'en attente de paiement', at: createdAt, by: 'client' }],
    tracking: { carrier: '', number: '', url: '', estimatedDelivery: '', updatedAt: '' },
    paymentStatus: 'pending',
    paymentProvider: process.env.PAYMENT_PROVIDER || 'not_connected',
    paymentReference: '',
    inventoryReserved: true,
    inventoryRestocked: false,
    eventSeatsReserved: eventSeatResult.reserved > 0,
    eventSeatsReleased: false,
    ticketBookingIds: [],
    refundStatus: 'none',
    refundedTotal: 0,
    createdAt,
    updatedAt: createdAt
  };

  const stripeEnabled = isStripeEnabled();
  let payment = {
    status: 'provider_not_connected',
    provider: order.paymentProvider,
    redirectUrl: '',
    message: I18n.t('Le fournisseur de paiement n’est pas encore connecté. La commande est enregistrée en attente de paiement.')
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
        releaseInventoryForItems(db, order.items || [], order.id, I18n.t('Paiement Stripe non créé'));
        order.inventoryRestocked = true;
      }
      releaseEventSeatsForOrder(db, order);
      return res.status(500).json({ error: I18n.t('Paiement Stripe non disponible: ') + err.message });
    }
  }

  if (!db.orders) db.orders = [];
  db.orders.push(order);
  writeDB(db);

  res.json({ success: true, order, payment });
});
function customerOrderView(order) {
  const { paymentReference, stripe, inventoryReserved, inventoryRestocked, userId, ...safeOrder } = order;
  return {
    ...safeOrder,
    statusHistory: (order.statusHistory || []).map(entry => ({ from: entry.from || '', to: entry.to || '', at: entry.at || '' }))
  };
}
app.get('/api/orders/mine', auth, (req, res) => {
  const db=readDB();
  res.json((db.orders||[]).filter(o=>o.userId===req.session.userId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(customerOrderView));
});

const SUPPORT_TOPICS = ['commande', 'livraison', 'produit', 'paiement', 'événement', 'autre'];
const SUPPORT_STATUSES = ['nouvelle', 'en cours', 'répondue', 'fermée'];
function customerSupportView(request) {
  return {
    id: request.id,
    orderId: request.orderId || '',
    topic: request.topic,
    subject: request.subject,
    message: request.message,
    status: request.status,
    adminReply: request.adminReply || '',
    createdAt: request.createdAt,
    updatedAt: request.updatedAt || request.createdAt,
    repliedAt: request.repliedAt || ''
  };
}
app.get('/api/support-requests/mine', auth, (req, res) => {
  const db = readDB();
  res.json((db.supportRequests || []).filter(request => request.userId === req.session.userId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(customerSupportView));
});
app.post('/api/support-requests', auth, async (req, res) => {
  const db = readDB();
  const user = (db.users || []).find(item => item.id === req.session.userId);
  if (!user) return res.status(404).json({ error: I18n.t('Compte non trouvé') });
  const topic = String(req.body.topic || 'autre').trim().toLowerCase();
  const subject = String(req.body.subject || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const message = String(req.body.message || '').trim().slice(0, 2400);
  const orderId = String(req.body.orderId || '').trim().slice(0, 80);
  if (!SUPPORT_TOPICS.includes(topic)) return res.status(400).json({ error: I18n.t('Sujet de demande invalide') });
  if (subject.length < 4) return res.status(400).json({ error: I18n.t('Ajoutez un objet clair à votre demande') });
  if (message.length < 10) return res.status(400).json({ error: I18n.t('Ajoutez quelques détails à votre message') });
  if (orderId && !(db.orders || []).some(order => String(order.id) === orderId && order.userId === user.id)) return res.status(400).json({ error: I18n.t('Commande invalide') });
  const now = new Date().toISOString();
  const request = {
    id: `SUP-${Date.now().toString(36).toUpperCase()}`,
    locale: req.locale,
    userId: user.id,
    customer: { name: user.name, email: user.email },
    orderId,
    topic,
    subject,
    message,
    status: 'nouvelle',
    adminReply: '',
    createdAt: now,
    updatedAt: now,
    repliedAt: ''
  };
  db.supportRequests = db.supportRequests || [];
  db.supportRequests.push(request);
  writeDB(db);
  const [customerEmail, adminEmail] = await Promise.all([
    sendSupportRequestReceiptEmail(request),
    sendSupportRequestAdminEmail(request)
  ]);
  const latest = readDB();
  const saved = (latest.supportRequests || []).find(item => String(item.id) === String(request.id));
  if (saved) {
    saved.emailDelivery = {
      customer:customerEmail.status,
      admin:adminEmail.status,
      recipient:businessEmailAddress(supportEmailChannel(request)),
      sentAt:new Date().toISOString()
    };
    writeDB(latest);
  }
  res.json({ success: true, request: customerSupportView(saved || request), emailStatus:{ customer:customerEmail.status, admin:adminEmail.status } });
});

app.post('/api/stripe/confirm-order', optionalAuth, async (req, res) => {
  try {
    if (!isStripeEnabled()) return res.status(400).json({ error: I18n.t('Stripe n’est pas configuré') });
    const orderId = String(req.body.orderId || '').trim();
    const paymentIntentId = String(req.body.paymentIntentId || '').trim();
    if (!orderId || !paymentIntentId) return res.status(400).json({ error: I18n.t('Commande ou paiement manquant') });
    const db = readDB();
    const order = (db.orders || []).find(o => String(o.id) === orderId);
    if (!order) return res.status(404).json({ error: I18n.t('Commande non trouvée') });
    if (String(order.paymentReference || '') !== paymentIntentId) return res.status(400).json({ error: I18n.t('Paiement non associé à cette commande') });

    const pi = await retrieveStripePaymentIntent(paymentIntentId);
    const syncedOrder = syncOrderFromStripePaymentIntent(db, pi, 'client-confirm');
    if (syncedOrder?.paymentStatus === 'paid') ensurePaidOrderBookings(db, syncedOrder);
    if (syncedOrder?.paymentStatus === 'cancelled') { releaseEventSeatsForOrder(db, syncedOrder); cancelOrderTicketBookings(db, syncedOrder); }
    writeDB(db);
    const delivery = syncedOrder?.paymentStatus === 'paid' ? await deliverPaidOrderCommunications(syncedOrder.id, 'stripe-confirmation') : { status:'not_paid', tickets:[] };
    const latestDB = readDB();
    const updated = (latestDB.orders || []).find(o => String(o.id) === orderId) || order;
    res.json({ success: true, order: updated, stripeStatus: pi.status, emailStatus:delivery.status, tickets:delivery.tickets });
  } catch (err) {
    console.error('Stripe confirm-order error:', err);
    res.status(500).json({ error: I18n.t('Impossible de confirmer le paiement: ') + err.message });
  }
});

// ========== EVENT TICKETS & EMAIL DELIVERY ==========
const CODE39_PATTERNS = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
};
function escapeEmailHTML(value) { return String(value ?? '').replace(/[&<>\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[char])); }
function normalizePublicUrl() {
  const value = String(process.env.ARTY_PUBLIC_URL || process.env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(value) ? value : '';
}
function emailFromAddress() { return String(process.env.EMAIL_FROM || process.env.TICKET_EMAIL_FROM || '').trim(); }
const BUSINESS_EMAILS = {
  info: { env:'EMAIL_INFO', fallback:'info@creationarty.com' },
  contact: { env:'EMAIL_CONTACT', fallback:'contact@creationarty.com' },
  support: { env:'EMAIL_SUPPORT', fallback:'support@creationarty.com' },
  orders: { env:'EMAIL_ORDERS', fallback:'orders@creationarty.com' },
  events: { env:'EMAIL_EVENTS', fallback:'events@creationarty.com' }
};
function businessEmailAddress(channel = 'info') {
  const config = BUSINESS_EMAILS[channel] || BUSINESS_EMAILS.info;
  const configured = String(process.env[config.env] || '').trim().toLowerCase();
  return validEmail(configured) ? configured : config.fallback;
}
function emailReplyToAddress(channel = 'info') {
  if (validEmail(channel)) return String(channel).trim().toLowerCase();
  return businessEmailAddress(channel);
}
function transactionalEmailIsConfigured() { return Boolean(process.env.RESEND_API_KEY && emailFromAddress() && normalizePublicUrl()); }
function ticketEmailIsConfigured() { return transactionalEmailIsConfigured(); }
function emailDate(value = new Date()) {
  return new Date(value).toLocaleString(I18n.locale(), { dateStyle:'long', timeStyle:'short', timeZone:process.env.ARTY_TIME_ZONE || 'America/Toronto' });
}
function emailPanel(content, tone = 'neutral') {
  const palettes = {
    teal:{ background:'#eef9fa', border:'#c9e8eb', accent:'#168b9c' },
    orange:{ background:'#fff4e8', border:'#f3d3b3', accent:'#d97328' },
    neutral:{ background:'#f8f5f0', border:'#e9e1d7', accent:'#5e5144' },
    success:{ background:'#edf8f2', border:'#c8e8d5', accent:'#247a4d' }
  };
  const palette = palettes[tone] || palettes.neutral;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:separate;border:1px solid ${palette.border};border-radius:16px;background:${palette.background}"><tr><td style="padding:18px 20px;color:${palette.accent};font-size:14px;line-height:1.7">${content}</td></tr></table>`;
}
function emailTextPanel(value, tone = 'neutral') {
  return emailPanel(escapeEmailHTML(value || '').replace(/\n/g,'<br>'), tone);
}
function emailAmountSummary(label, value) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;border-collapse:separate;border-radius:16px;background:#173f46"><tr><td class="arty-total-label" style="padding:18px 20px;color:#d7f4f5;font-size:13px;font-weight:700;letter-spacing:.3px">${escapeEmailHTML(label)}</td><td class="arty-total-value" align="right" style="padding:18px 20px;color:#ffffff;font-size:20px;font-weight:800;white-space:nowrap">${escapeEmailHTML(value)}</td></tr></table>`;
}
function emailShell({ title, intro = '', content = '', ctaLabel = '', ctaUrl = '', footer = I18n.t('Vous recevez ce courriel parce qu’une action a été effectuée sur le site ARTY.'), preheader = '' }) {
  const siteUrl = normalizePublicUrl();
  const logoUrl = `${siteUrl}/logoarty.png`;
  const supportEmail = businessEmailAddress('support');
  const preview = escapeEmailHTML(preheader || intro || title);
  const action = ctaLabel && ctaUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto"><tr><td align="center" bgcolor="#e98136" style="border-radius:999px"><a href="${escapeEmailHTML(ctaUrl)}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-size:14px;font-weight:800;line-height:1;text-decoration:none">${escapeEmailHTML(ctaLabel)}</a></td></tr></table>` : '';
  return I18n.html`<!doctype html>
<html lang="${I18n.language()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${escapeEmailHTML(title)}</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}.arty-copy p{margin:0 0 16px}.arty-copy p:last-child{margin-bottom:0}.arty-copy a{color:#168b9c}.arty-copy strong{color:#332b22}
    @media only screen and (max-width:620px){.arty-shell{width:100%!important}.arty-pad{padding-left:22px!important;padding-right:22px!important}.arty-title{font-size:28px!important}.arty-tagline{display:none!important}.arty-logo{width:104px!important}.arty-footer-links{display:block!important;margin-top:10px!important}.arty-total-label,.arty-total-value{display:block!important;width:auto!important;text-align:left!important;padding-left:18px!important;padding-right:18px!important}.arty-total-label{padding-bottom:4px!important}.arty-total-value{padding-top:4px!important}}
  </style>
</head>
<body style="margin:0;padding:0;background:#f3eee7;font-family:Arial,'Helvetica Neue',sans-serif;color:#332b22">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preview}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3eee7" style="width:100%;background:#f3eee7">
    <tr><td align="center" style="padding:34px 14px">
      <table role="presentation" class="arty-shell" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:680px;border-collapse:separate;background:#ffffff;border:1px solid #e7ddd1;border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(51,43,34,.08)">
        <tr><td height="6" style="height:6px;background:#e98136;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td class="arty-pad" style="padding:18px 38px;background:#fffdf9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle"><a href="${escapeEmailHTML(siteUrl)}" style="text-decoration:none"><img class="arty-logo" src="${escapeEmailHTML(logoUrl)}" width="118" alt="ARTY Création" style="display:block;width:118px;max-width:100%;height:auto"></a></td>
            <td class="arty-tagline" align="right" valign="middle" style="color:#168b9c;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Créez. Partagez. Célébrez.</td>
          </tr></table>
        </td></tr>
        <tr><td class="arty-pad" style="padding:36px 40px 34px;background:#173f46;background-image:linear-gradient(135deg,#173f46 0%,#1c6670 100%);color:#ffffff">
          <div style="margin-bottom:11px;color:#ffc28a;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase">ARTY Création</div>
          <h1 class="arty-title" style="margin:0;color:#ffffff;font-size:34px;line-height:1.18;letter-spacing:-.5px">${escapeEmailHTML(title)}</h1>
          ${intro?`<p style="max-width:560px;margin:13px 0 0;color:#d8eef0;font-size:15px;line-height:1.65">${escapeEmailHTML(intro)}</p>`:''}
        </td></tr>
        <tr><td class="arty-pad" style="padding:34px 40px 38px;background:#ffffff">
          <div class="arty-copy" style="color:#5e5144;font-size:15px;line-height:1.75">${content}</div>
          ${action}
          <div style="margin-top:28px;padding-top:20px;border-top:1px solid #ece4da;color:#7a6e62;font-size:12px;line-height:1.65">${escapeEmailHTML(footer)}</div>
        </td></tr>
        <tr><td class="arty-pad" style="padding:22px 38px;background:#f8f4ee;border-top:1px solid #ece4da">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="top" style="color:#796c5f;font-size:11px;line-height:1.65"><strong style="color:#332b22">ARTY Création</strong><br>Kits créatifs et événements de peinture</td>
            <td class="arty-footer-links" align="right" valign="top" style="color:#796c5f;font-size:11px;line-height:1.65"><a href="${escapeEmailHTML(siteUrl)}" style="color:#168b9c;text-decoration:none">creationarty.com</a><br><a href="mailto:${escapeEmailHTML(supportEmail)}" style="color:#796c5f;text-decoration:none">${escapeEmailHTML(supportEmail)}</a></td>
          </tr></table>
        </td></tr>
      </table>
      <div style="padding:18px 10px 0;color:#94877a;font-size:10px;line-height:1.5">© ${new Date().getFullYear()} ARTY Création</div>
    </td></tr>
  </table>
</body>
</html>`;
}
function sendTransactionalEmail({ to, subject, html, idempotencyKey, replyTo = 'info' }) {
  const replyAddress = emailReplyToAddress(replyTo);
  return sendResendEmail({
    from:emailFromAddress(),
    to:[String(to || '').trim().toLowerCase()],
    subject,
    html,
    ...(replyAddress ? { reply_to:replyAddress } : {})
  }, idempotencyKey);
}
function sendAccountWelcomeEmail(user) {
  return withLocale(user.locale, () => {

  const profileUrl = `${normalizePublicUrl()}/?lang=${I18n.language()}#/profile`;
  return sendTransactionalEmail({
    to:user.email,
    subject:I18n.t('Bienvenue chez ARTY — votre compte est prêt'),
    idempotencyKey:`account-welcome-${user.id}`,
    replyTo:'support',
    html:emailShell({
      title:I18n.t('Bienvenue chez ARTY'),
      intro:I18n.t('Votre compte a été créé avec succès.'),
      preheader:I18n.t('Votre compte ARTY est prêt.'),
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(user.name)},</p><p>Vous pouvez maintenant consulter vos commandes, retrouver vos billets et contacter notre équipe depuis votre espace client.</p>`,
      ctaLabel:I18n.t('Accéder à mon compte'),
      ctaUrl:profileUrl,
      footer:I18n.t('Si vous n’avez pas créé ce compte, répondez à ce courriel pour nous prévenir.')
    })
  });

  });
}
function sendLoginAlertEmail(user) {
  return withLocale(user.locale, () => {

  const resetUrl = `${normalizePublicUrl()}/?lang=${I18n.language()}#/forgot-password`;
  return sendTransactionalEmail({
    to:user.email,
    subject:I18n.t('Nouvelle connexion à votre compte ARTY'),
    idempotencyKey:`login-${user.id}-${Date.now()}`,
    replyTo:'support',
    html:emailShell({
      title:I18n.t('Nouvelle connexion'),
      intro:I18n.t('Une connexion à votre compte ARTY vient d’être effectuée.'),
      preheader:I18n.t('Alerte de sécurité pour votre compte ARTY.'),
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(user.name)},</p>${emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">Date et heure</strong>${escapeEmailHTML(emailDate())}`,'teal')}<p>Si c’était bien vous, aucune action n’est nécessaire.</p>`,
      ctaLabel:I18n.t('Sécuriser mon compte'),
      ctaUrl:resetUrl,
      footer:I18n.t('Si vous ne reconnaissez pas cette connexion, modifiez immédiatement votre mot de passe.')
    })
  });

  });
}
function sendPasswordResetEmail(user, token) {
  return withLocale(user.locale, () => {

  const resetUrl = `${normalizePublicUrl()}/?lang=${I18n.language()}#/reset-password?token=${encodeURIComponent(token)}`;
  return sendTransactionalEmail({
    to:user.email,
    subject:I18n.t('Réinitialisation de votre mot de passe ARTY'),
    idempotencyKey:`password-reset-${hashToken(token).slice(0,24)}`,
    replyTo:'support',
    html:emailShell({
      title:I18n.t('Réinitialiser votre mot de passe'),
      intro:I18n.t('Nous avons reçu une demande de nouveau mot de passe.'),
      preheader:I18n.t('Votre lien sécurisé de réinitialisation ARTY.'),
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(user.name)},</p><p>Ce lien est valide pendant <strong>30 minutes</strong> et ne peut être utilisé qu’une seule fois.</p>`,
      ctaLabel:I18n.t('Créer un nouveau mot de passe'),
      ctaUrl:resetUrl,
      footer:I18n.t('Si vous n’avez pas demandé cette modification, ignorez ce courriel. Votre mot de passe actuel restera valide.')
    })
  });

  });
}
function sendPasswordChangedEmail(user) {
  return withLocale(user.locale, () => {

  return sendTransactionalEmail({
    to:user.email,
    subject:I18n.t('Votre mot de passe ARTY a été modifié'),
    idempotencyKey:`password-changed-${user.id}-${Date.now()}`,
    replyTo:'support',
    html:emailShell({
      title:I18n.t('Mot de passe modifié'),
      intro:I18n.t('La sécurité de votre compte a été mise à jour.'),
      preheader:I18n.t('Confirmation de modification de votre mot de passe ARTY.'),
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(user.name)},</p><p>Votre mot de passe a été modifié le <strong>${escapeEmailHTML(emailDate())}</strong>.</p>`,
      ctaLabel:I18n.t('Accéder au site ARTY'),
      ctaUrl:normalizePublicUrl(),
      footer:I18n.t('Si vous n’avez pas effectué cette modification, répondez immédiatement à ce courriel.')
    })
  });

  });
}
function createTicketCode(db, eventId) {
  const used = new Set((db.bookings || []).flatMap(booking => (booking.tickets || []).map(ticket => ticket.code)));
  let code = '';
  do { code = `ARTY-${eventId}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`; } while (used.has(code));
  return code;
}
function ensureBookingTickets(db, booking) {
  const total = Math.max(1, parseInt(booking.guests) || 1);
  const guestNames = Array.isArray(booking.guestNames) ? booking.guestNames : [];
  const groupTicket = booking.ticketMode === 'group';
  const ticketCount = groupTicket ? 1 : total;
  if (!Array.isArray(booking.tickets)) booking.tickets = [];
  let changed = false;
  while (booking.tickets.length < ticketCount) {
    const position = booking.tickets.length + 1;
    booking.tickets.push({
      id: `TKT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
      code: createTicketCode(db, booking.eventId),
      guestNumber: position,
      admissions: groupTicket ? total : 1,
      holderName: String(groupTicket ? booking.name : (guestNames[position - 1] || (position === 1 ? booking.name : I18n.msg`Invité ${position} de ${booking.name}`))).trim().slice(0, 120),
      status: 'valid',
      createdAt: booking.bookedAt || new Date().toISOString(),
      checkedInAt: '',
      checkedInBy: ''
    });
    changed = true;
  }
  return changed;
}
function ensureAllBookingTickets(db) {
  let changed = false;
  for (const booking of (db.bookings || [])) if (ensureBookingTickets(db, booking)) changed = true;
  return changed;
}
function findTicketRecord(db, value) {
  const needle = String(value || '').trim().toUpperCase();
  for (const booking of (db.bookings || [])) {
    ensureBookingTickets(db, booking);
    const ticket = (booking.tickets || []).find(item => String(item.id).toUpperCase() === needle || String(item.code).toUpperCase() === needle);
    if (ticket) return { booking, ticket, event: (db.events || []).find(event => event.id === booking.eventId) || null };
  }
  return null;
}
function ticketBarcodeSVG(rawCode) {
  const code = String(rawCode || '').toUpperCase().replace(/[^0-9A-Z. $/+%-]/g, '').slice(0, 80);
  const encoded = `*${code}*`, narrow = 2, wide = 5, quiet = 18, barHeight = 82;
  let x = quiet, bars = '';
  for (const char of encoded) {
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === 'w' ? wide : narrow;
      if (index % 2 === 0) bars += `<rect x="${x}" y="10" width="${width}" height="${barHeight}" fill="#17130f"/>`;
      x += width;
    }
    x += narrow;
  }
  const width = x + quiet;
  return I18n.html`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="122" viewBox="0 0 ${width} 122" role="img" aria-label="Billet ${escapeEmailHTML(code)}"><rect width="100%" height="100%" rx="8" fill="#fff"/>${bars}<text x="${width/2}" y="111" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" letter-spacing="1.2" fill="#17130f">${escapeEmailHTML(code)}</text></svg>`;
}
function publicTicketRecord(record) {
  if (!record) return null;
  const { booking, ticket, event } = record;
  return {
    ticket: { id: ticket.id, code: ticket.code, guestNumber: ticket.guestNumber, admissions:Math.max(1,parseInt(ticket.admissions)||1), holderName: ticket.holderName, status: ticket.status, checkedInAt: ticket.checkedInAt || '' },
    booking: { id: booking.id, name: booking.name, guests: booking.guests, status: booking.status, bookedAt: booking.bookedAt },
    event: event ? { translations:event.translations, id: event.id, title: event.title, date: event.date, time: event.time, duration: event.duration, location: event.location, image: event.image, hostNote: event.hostNote, status: event.status } : null
  };
}
function publicBookingView(booking, event) {
  return {
    ...booking,
    emailDelivery: { status: booking.emailDelivery?.status || 'not_sent', sentAt: booking.emailDelivery?.sentAt || '', attempts: booking.emailDelivery?.attempts || 0 },
    tickets: (booking.tickets || []).map(ticket => ({ id: ticket.id, code: ticket.code, guestNumber: ticket.guestNumber, admissions:Math.max(1,parseInt(ticket.admissions)||1), holderName: ticket.holderName, status: ticket.status, createdAt: ticket.createdAt, checkedInAt: ticket.checkedInAt || '' })),
    event: event || null
  };
}
function buildTicketEmailHTML(booking, event) {
  return withLocale(booking.locale, () => {
  event = localizeCatalog(event);

  const publicUrl = normalizePublicUrl();
  const ticketBlocks = (booking.tickets || []).map((ticket, index) => {
    const barcodeUrl = `${publicUrl}/api/tickets/${encodeURIComponent(ticket.code)}/barcode.svg`;
    const ticketUrl = `${publicUrl}/?lang=${I18n.language()}#/ticket/${encodeURIComponent(ticket.code)}`;
    const admissions = Math.max(1, parseInt(ticket.admissions) || 1);
    const ticketLabel = admissions > 1 ? I18n.msg`Accès pour ${admissions} personnes` : (booking.tickets.length > 1 ? I18n.msg`Billet ${index + 1} sur ${booking.tickets.length}` : I18n.t('Accès pour 1 personne'));
    return I18n.html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:separate;border:1px solid #dce9e9;border-radius:18px;background:#fffdf9;overflow:hidden"><tr><td height="5" style="height:5px;background:#e98136;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:22px"><div style="color:#168b9c;font-size:11px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase">${escapeEmailHTML(ticketLabel)}</div><div style="margin:6px 0 16px;color:#332b22;font-size:19px;font-weight:800">${escapeEmailHTML(ticket.holderName)}</div><a href="${escapeEmailHTML(ticketUrl)}" style="display:block;text-align:center;text-decoration:none"><img src="${escapeEmailHTML(barcodeUrl)}" width="430" style="display:block;width:430px;max-width:100%;height:auto;margin:0 auto" alt="Code-barres du billet ${escapeEmailHTML(ticket.code)}"></a><div style="margin-top:11px;text-align:center;color:#6f6255;font-family:monospace;font-size:12px;letter-spacing:.7px">${escapeEmailHTML(ticket.code)}</div><div style="margin-top:14px;text-align:center"><a href="${escapeEmailHTML(ticketUrl)}" style="color:#168b9c;font-size:12px;font-weight:800;text-decoration:none">Ouvrir ce billet en ligne</a></div></td></tr></table>`;
  }).join('');
  const eventDate = event?.date ? new Date(`${event.date}T00:00:00`).toLocaleDateString(I18n.locale(),{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : I18n.t('Date à confirmer');
  const eventDetails = I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22;font-size:17px">${escapeEmailHTML(event?.title || I18n.t('Événement ARTY'))}</strong><span style="color:#168b9c;font-weight:800">${escapeEmailHTML(eventDate)}</span><br>${escapeEmailHTML(event?.time || I18n.t('Heure à confirmer'))}${event?.location?`<br>${escapeEmailHTML(event.location)}`:''}<br><strong>Accès pour ${Math.max(1,Number(booking.guests)||1)} personne${Number(booking.guests)>1?'s':''}</strong>`;
  return emailShell({
    title:I18n.t('Votre billet est prêt'),
    intro:I18n.t('Présentez le code-barres à votre arrivée à l’événement.'),
    preheader:I18n.msg`Billet pour ${event?.title || I18n.t('votre événement ARTY')}`,
    content:I18n.html`<p>Bonjour ${escapeEmailHTML(booking.name)},</p>${emailPanel(eventDetails,'teal')}${ticketBlocks}<p style="color:#75695c;font-size:13px">Conservez ce courriel. Chaque code est unique et valide pour le nombre de personnes indiqué sur le billet.</p>`,
    ctaLabel:I18n.t('Voir mes billets'),
    ctaUrl:booking.userId?`${publicUrl}/?lang=${I18n.language()}#/profile`:((booking.tickets||[])[0]?`${publicUrl}/?lang=${I18n.language()}#/ticket/${encodeURIComponent(booking.tickets[0].code)}`:publicUrl),
    footer:I18n.t('Besoin d’aide pour votre billet? Répondez directement à ce courriel et notre équipe événements vous aidera.')
  });

  });
}
function sendResendEmail(payload, idempotencyKey) {
  if (process.env.ARTY_EMAIL_MODE === 'log') return Promise.resolve({ status: 'sent', id: `log-${Date.now()}` });
  if (!transactionalEmailIsConfigured()) return Promise.resolve({ status: 'not_configured', error: I18n.t('Configuration courriel incomplète') });
  const body = JSON.stringify(payload);
  return new Promise(resolve => {
    const request = https.request({ hostname:'api.resend.com', path:'/emails', method:'POST', headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body), 'Idempotency-Key':idempotencyKey } }, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        let parsed = {}; try { parsed = JSON.parse(data || '{}'); } catch {}
        if (response.statusCode >= 200 && response.statusCode < 300) resolve({ status:'sent', id:parsed.id || '' });
        else resolve({ status:'failed', error:String(parsed.message || parsed.error || I18n.msg`Erreur courriel ${response.statusCode}`).slice(0,300) });
      });
    });
    request.setTimeout(12000, () => request.destroy(new Error(I18n.t('Délai de livraison dépassé'))));
    request.on('error', error => resolve({ status:'failed', error:String(error.message || I18n.t('Erreur courriel')).slice(0,300) }));
    request.write(body); request.end();
  });
}
async function deliverBookingTickets(booking, event, reason = 'confirmation') {
  const attempt = Number(booking.emailDelivery?.attempts || 0) + 1;
  const result = await withLocale(booking.locale, () => sendTransactionalEmail({
    to: booking.email,
    subject: I18n.msg`Votre billet ARTY — ${localizeCatalog(event)?.title || I18n.t('Événement')}`,
    html: buildTicketEmailHTML(booking, event),
    idempotencyKey:`ticket-${reason}-${booking.id}-${attempt}`,
    replyTo:'events'
  }));
  booking.emailDelivery = { status:result.status, provider:'resend', providerId:result.id || '', error:result.error || '', attempts:attempt, lastAttemptAt:new Date().toISOString(), sentAt:result.status === 'sent' ? new Date().toISOString() : (booking.emailDelivery?.sentAt || '') };
  return result;
}

function eventTicketItems(order) {
  return (order?.items || []).filter(item => item.type === 'event-ticket');
}
function groupEventTicketItems(items) {
  const grouped = new Map();
  for (const item of (items || [])) {
    if (item.type !== 'event-ticket') continue;
    const eventId = Number(item.eventId || item.customData?.eventId);
    if (!eventId) continue;
    if (!grouped.has(eventId)) grouped.set(eventId, { eventId, qty:0, total:0 });
    const group = grouped.get(eventId), qty = Math.max(1, parseInt(item.qty) || 1);
    group.qty += qty;
    group.total += Number(item.lineTotal ?? ((Number(item.price) || 0) * qty)) || 0;
  }
  return [...grouped.values()];
}
function reserveEventSeatsForItems(db, items) {
  const groups = groupEventTicketItems(items);
  for (const group of groups) {
    const event = (db.events || []).find(item => Number(item.id) === group.eventId);
    if (!event || (event.status || 'published') !== 'published') return { error:I18n.t('Un événement du panier n’est plus disponible') };
    const available = Math.max(0, (parseInt(event.maxSpots) || 0) - (parseInt(event.bookedSpots) || 0));
    if (group.qty > available) return { error:I18n.msg`Il reste seulement ${available} billet${available > 1 ? 's' : ''} pour ${event.title}` };
  }
  for (const group of groups) {
    const event = (db.events || []).find(item => Number(item.id) === group.eventId);
    event.bookedSpots = (parseInt(event.bookedSpots) || 0) + group.qty;
    event.updatedAt = new Date().toISOString();
  }
  return { success:true, reserved:groups.reduce((sum,group) => sum + group.qty, 0) };
}
function releaseEventSeatsForOrder(db, order) {
  if (!order?.eventSeatsReserved || order.eventSeatsReleased) return false;
  for (const group of groupEventTicketItems(eventTicketItems(order))) {
    const event = (db.events || []).find(item => Number(item.id) === group.eventId);
    if (event) event.bookedSpots = Math.max(0, (parseInt(event.bookedSpots) || 0) - group.qty);
  }
  order.eventSeatsReleased = true;
  order.updatedAt = new Date().toISOString();
  return true;
}
function cancelOrderTicketBookings(db, order) {
  for (const booking of (db.bookings || []).filter(item => String(item.sourceOrderId || '') === String(order.id))) {
    booking.status = 'annulée';
    booking.updatedAt = new Date().toISOString();
    for (const ticket of (booking.tickets || [])) {
      ticket.status = 'cancelled';
      ticket.cancelledAt = booking.updatedAt;
    }
  }
}
function ensurePaidOrderBookings(db, order) {
  if (!order || order.paymentStatus !== 'paid') return [];
  db.bookings = db.bookings || [];
  const bookingIds = new Set((order.ticketBookingIds || []).map(String));
  for (const existing of db.bookings.filter(item => String(item.sourceOrderId || '') === String(order.id))) bookingIds.add(String(existing.id));
  for (const group of groupEventTicketItems(eventTicketItems(order))) {
    const existing = db.bookings.find(item => String(item.sourceOrderId || '') === String(order.id) && Number(item.eventId) === group.eventId);
    if (existing) { bookingIds.add(String(existing.id)); continue; }
    const event = (db.events || []).find(item => Number(item.id) === group.eventId);
    if (!event) continue;
    const bookedAt = order.paidAt || new Date().toISOString();
    const booking = {
      id:`BKG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      sourceOrderId:order.id,
      locale:I18n.normalize(order.locale),
      userId:order.userId || null,
      eventId:group.eventId,
      name:String(order.customer?.name || '').trim(),
      email:String(order.customer?.email || order.guestEmail || '').trim().toLowerCase(),
      phone:String(order.customer?.phone || '').trim(),
      guests:group.qty,
      ticketMode:'group',
      guestNames:[String(order.customer?.name || '').replace(/\s+/g,' ').trim().slice(0,120)],
      notes:'',
      total:money(group.total),
      bookedAt,
      status:'confirmée',
      paymentStatus:'paid',
      emailDelivery:{ status:'pending', attempts:0, sentAt:'', lastAttemptAt:'' },
      tickets:[]
    };
    ensureBookingTickets(db, booking);
    db.bookings.push(booking);
    bookingIds.add(String(booking.id));
  }
  order.ticketBookingIds = [...bookingIds];
  return db.bookings.filter(item => bookingIds.has(String(item.id)));
}
async function deliverPaidOrderTickets(orderId, reason = 'payment') {
  let db = readDB(), order = (db.orders || []).find(item => String(item.id) === String(orderId));
  if (!order || order.paymentStatus !== 'paid') return { status:'not_paid', tickets:[] };
  const issuedTickets = [];
  for (const bookingId of (order.ticketBookingIds || [])) {
    db = readDB();
    const booking = (db.bookings || []).find(item => String(item.id) === String(bookingId));
    const event = (db.events || []).find(item => Number(item.id) === Number(booking?.eventId));
    if (!booking || !event) continue;
    issuedTickets.push(...(booking.tickets || []).map(ticket => ({ id:ticket.id, code:ticket.code, admissions:Math.max(1,parseInt(ticket.admissions)||1), holderName:ticket.holderName, bookingId:booking.id, eventId:booking.eventId })));
    if (booking.emailDelivery?.status === 'sent') continue;
    await deliverBookingTickets(booking, event, reason);
    const latest = readDB(), saved = (latest.bookings || []).find(item => String(item.id) === String(booking.id));
    if (saved) { saved.emailDelivery = booking.emailDelivery; writeDB(latest); }
  }
  const finalDB = readDB();
  const statuses = (finalDB.bookings || []).filter(item => (order.ticketBookingIds || []).map(String).includes(String(item.id))).map(item => item.emailDelivery?.status || 'pending');
  return { status:statuses.length && statuses.every(status => status === 'sent') ? 'sent' : (statuses[0] || 'not_sent'), tickets:issuedTickets };
}

function orderEmailRecipient(order) {
  return String(order?.customer?.email || order?.guestEmail || '').trim().toLowerCase();
}
function orderEmailChannel(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.length && items.every(item => item.type === 'event-ticket') ? 'events' : 'orders';
}
function orderEmailItemsHTML(order) {
  order = localizeOrder(order);
  const rows = (order.items || []).map(item => {
    const qty = Math.max(1, Number(item.qty) || 1);
    const lineTotal = Number(item.lineTotal ?? ((Number(item.price) || 0) * qty));
    const quantityLabel = item.type === 'event-ticket' ? I18n.msg`Accès pour ${qty} personne${qty > 1 ? 's' : ''}` : I18n.msg`Quantité : ${qty}`;
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #ece4da;color:#332b22;font-size:14px;line-height:1.5"><strong>${escapeEmailHTML(item.name || I18n.t('Article ARTY'))}</strong><br><span style="color:#7a6e62;font-size:12px">${escapeEmailHTML(quantityLabel)}</span></td><td align="right" valign="top" style="padding:14px 0 14px 16px;border-bottom:1px solid #ece4da;color:#332b22;font-size:14px;font-weight:800;white-space:nowrap">${I18n.currency(money(lineTotal).toFixed(2))}</td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>`;
}
function buildOrderConfirmationEmailHTML(order) {
  return withLocale(order.locale, () => {
  order = localizeOrder(order);

  const address = order.address || {};
  const hasShipping = (order.items || []).some(item => item.type !== 'event-ticket');
  const addressBlock = hasShipping ? emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">Adresse de livraison</strong>${escapeEmailHTML(address.line1 || '')}<br>${escapeEmailHTML([address.city,address.province,address.postal].filter(Boolean).join(', '))}<br>${escapeEmailHTML(address.country || '')}`,'neutral') : '';
  return emailShell({
    title:I18n.t('Commande confirmée'),
    intro:I18n.msg`Votre paiement pour la commande ${order.id} a été confirmé.`,
    preheader:I18n.msg`Confirmation de la commande ${order.id}`,
    content:I18n.html`<p>Bonjour ${escapeEmailHTML(order.customer?.name || I18n.t('Client ARTY'))},</p>${emailPanel(I18n.html`<span style="color:#7a6e62;font-size:12px;text-transform:uppercase;letter-spacing:1px">Numéro de commande</span><br><strong style="color:#332b22;font-size:18px">${escapeEmailHTML(order.id)}</strong>`,'orange')}<div style="margin:20px 0">${orderEmailItemsHTML(order)}</div>${emailAmountSummary(I18n.t('Total payé'),`${I18n.currency(money(order.total).toFixed(2))} CAD`)}${addressBlock}<p>${hasShipping?I18n.t('Nous vous écrirons dès que votre commande sera expédiée.'):I18n.t('Votre billet est envoyé dans un courriel séparé et reste aussi disponible dans votre compte.')}</p>`,
    ctaLabel:order.userId ? I18n.t('Voir mes commandes') : I18n.t('Visiter ARTY'),
    ctaUrl:order.userId ? `${normalizePublicUrl()}/?lang=${I18n.language()}#/profile` : normalizePublicUrl(),
    footer:I18n.msg`Conservez ce courriel comme confirmation de la commande ${order.id}.`
  });

  });
}
async function deliverOrderConfirmation(orderId, reason = 'payment') {
  let db = readDB();
  const order = (db.orders || []).find(item => String(item.id) === String(orderId));
  if (!order || order.paymentStatus !== 'paid') return { status:'not_paid' };
  if (!validEmail(orderEmailRecipient(order))) return { status:'invalid_email' };
  const previous = order.emailDelivery?.confirmation || {};
  if (previous.status === 'sent') return { status:'sent', id:previous.providerId || '' };
  const attempt = Number(previous.attempts || 0) + 1;
  const result = await withLocale(order.locale, () => sendTransactionalEmail({
    to:orderEmailRecipient(order),
    subject:I18n.msg`Commande ARTY ${order.id} confirmée`,
    html:buildOrderConfirmationEmailHTML(order),
    idempotencyKey:`order-confirmation-${order.id}`,
    replyTo:orderEmailChannel(order)
  }));
  db = readDB();
  const saved = (db.orders || []).find(item => String(item.id) === String(orderId));
  if (saved) {
    saved.emailDelivery = saved.emailDelivery && typeof saved.emailDelivery === 'object' ? saved.emailDelivery : {};
    saved.emailDelivery.confirmation = { status:result.status, provider:'resend', providerId:result.id || '', error:result.error || '', attempts:attempt, reason, lastAttemptAt:new Date().toISOString(), sentAt:result.status === 'sent' ? new Date().toISOString() : (previous.sentAt || '') };
    writeDB(db);
  }
  return result;
}
function orderStatusEmailCopy(status) {
  return {
    'préparation':{ title:I18n.t('Votre commande est en préparation'), intro:I18n.t('Notre équipe prépare maintenant votre commande ARTY.') },
    'expédiée':{ title:I18n.t('Votre commande a été expédiée'), intro:I18n.t('Votre colis est maintenant en route.') },
    'livrée':{ title:I18n.t('Votre commande a été livrée'), intro:I18n.t('Votre commande ARTY est indiquée comme livrée.') },
    'annulée':{ title:I18n.t('Votre commande a été annulée'), intro:I18n.t('Le statut de votre commande a été mis à jour.') },
    'remboursée':{ title:I18n.t('Votre commande a été remboursée'), intro:I18n.t('Le remboursement de votre commande a été enregistré.') }
  }[status] || null;
}
async function deliverOrderStatusEmail(orderId, status, reason = 'status-update') {
  const db = readDB();
  const order = (db.orders || []).find(item => String(item.id) === String(orderId));
  const copy = withLocale(order?.locale, () => orderStatusEmailCopy(status));
  if (!order || !copy || !validEmail(orderEmailRecipient(order))) return { status:'not_needed' };
  const tracking = order.tracking || {};
  const trackingBlock = status === 'expédiée' ? emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">Suivi de livraison</strong>${tracking.carrier?I18n.html`Transporteur : ${escapeEmailHTML(tracking.carrier)}<br>`:''}${tracking.number?I18n.html`Numéro : ${escapeEmailHTML(tracking.number)}<br>`:''}${tracking.estimatedDelivery?I18n.msg`Livraison estimée : ${escapeEmailHTML(tracking.estimatedDelivery)}`:''}`,'teal') : '';
  return withLocale(order.locale, () => sendTransactionalEmail({
    to:orderEmailRecipient(order),
    subject:`${copy.title} — ${order.id}`,
    idempotencyKey:`order-status-${order.id}-${status}-${hashToken(JSON.stringify(tracking)).slice(0,12)}-${order.updatedAt}`,
    replyTo:orderEmailChannel(order),
    html:emailShell({
      title:copy.title,
      intro:copy.intro,
      preheader:I18n.msg`Mise à jour de la commande ${order.id}`,
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(order.customer?.name || I18n.t('Client ARTY'))},</p>${emailPanel(I18n.html`<span style="color:#7a6e62;font-size:12px;text-transform:uppercase;letter-spacing:1px">Commande</span><br><strong style="color:#332b22;font-size:18px">${escapeEmailHTML(order.id)}</strong>`,'orange')}${trackingBlock}`,
      ctaLabel:tracking.url && /^https?:\/\//i.test(tracking.url) ? I18n.t('Suivre mon colis') : (order.userId ? I18n.t('Voir ma commande') : I18n.t('Visiter ARTY')),
      ctaUrl:tracking.url && /^https?:\/\//i.test(tracking.url) ? tracking.url : (order.userId ? `${normalizePublicUrl()}/?lang=${I18n.language()}#/profile` : normalizePublicUrl()),
      footer:I18n.t('Pour toute question, répondez à ce courriel et indiquez votre numéro de commande.')
    })
  }));
}
function buildOrderAdminEmailHTML(order) {
  return withLocale(order.locale, () => {
  order = localizeOrder(order);

  const customer = order.customer || {};
  const address = order.address || {};
  const hasShipping = (order.items || []).some(item => item.type !== 'event-ticket');
  const shipping = hasShipping
    ? emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">Livraison</strong>${escapeEmailHTML(address.line1 || '')}<br>${escapeEmailHTML([address.city,address.province,address.postal].filter(Boolean).join(', '))}<br>${escapeEmailHTML(address.country || '')}${address.notes?I18n.html`<br><br><strong>Instructions :</strong> ${escapeEmailHTML(address.notes)}`:''}`,'neutral')
    : emailPanel(I18n.html('<strong>Commande numérique</strong><br>Billets d’événement, aucune livraison requise.'),'teal');
  return emailShell({
    title:I18n.t('Nouvelle commande payée'),
    intro:I18n.msg`La commande ${order.id} est prête à être traitée.`,
    preheader:I18n.msg`Nouvelle commande payée ${order.id}`,
    content:`${emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">Client</strong>${escapeEmailHTML(customer.name || '')}<br>${escapeEmailHTML(customer.email || order.guestEmail || '')}${customer.phone?`<br>${escapeEmailHTML(customer.phone)}`:''}`,'orange')}<div style="margin:20px 0">${orderEmailItemsHTML(order)}</div>${emailAmountSummary(I18n.t('Total payé'),`${I18n.currency(money(order.total).toFixed(2))} CAD`)}${shipping}`,
    ctaLabel:I18n.t('Ouvrir les commandes'),
    ctaUrl:`${normalizePublicUrl()}/?lang=${I18n.language()}#/admin`,
    footer:I18n.msg`Notification interne ARTY pour la commande ${order.id}.`
  });

  });
}
async function deliverOrderAdminNotification(orderId) {
  let db = readDB();
  const order = (db.orders || []).find(item => String(item.id) === String(orderId));
  if (!order || order.paymentStatus !== 'paid') return { status:'not_paid' };
  const previous = order.emailDelivery?.admin || {};
  if (previous.status === 'sent') return previous;
  const channel = orderEmailChannel(order);
  const result = await withLocale(order.locale, () => sendTransactionalEmail({
    to:businessEmailAddress(channel),
    subject:I18n.msg`Nouvelle commande payée — ${order.id}`,
    html:buildOrderAdminEmailHTML(order),
    idempotencyKey:`order-admin-paid-${order.id}`,
    replyTo:validEmail(orderEmailRecipient(order)) ? orderEmailRecipient(order) : channel
  }));
  db = readDB();
  const saved = (db.orders || []).find(item => String(item.id) === String(orderId));
  if (saved) {
    saved.emailDelivery = saved.emailDelivery && typeof saved.emailDelivery === 'object' ? saved.emailDelivery : {};
    saved.emailDelivery.admin = { status:result.status, recipient:businessEmailAddress(channel), providerId:result.id || '', error:result.error || '', sentAt:result.status === 'sent' ? new Date().toISOString() : '' };
    writeDB(db);
  }
  return result;
}
async function deliverPaidOrderCommunications(orderId, reason = 'payment') {
  const confirmation = await deliverOrderConfirmation(orderId, reason);
  const tickets = await deliverPaidOrderTickets(orderId, reason);
  const admin = await deliverOrderAdminNotification(orderId);
  return {
    status:tickets.tickets.length ? tickets.status : confirmation.status,
    confirmationStatus:confirmation.status,
    ticketStatus:tickets.status,
    adminStatus:admin.status,
    tickets:tickets.tickets
  };
}
function supportEmailChannel(request) {
  if (request?.orderId || ['commande','livraison','paiement'].includes(String(request?.topic || '').toLowerCase())) return 'orders';
  if (String(request?.topic || '').toLowerCase() === 'événement') return 'events';
  return 'support';
}
function sendSupportReplyEmail(request) {
  return withLocale(request.locale, () => {

  return sendTransactionalEmail({
    to:request.customer?.email,
    subject:I18n.msg`Réponse ARTY — ${request.subject}`,
    idempotencyKey:`support-reply-${request.id}-${hashToken(request.adminReply || '').slice(0,16)}`,
    replyTo:supportEmailChannel(request),
    html:emailShell({
      title:I18n.t('Notre équipe vous a répondu'),
      intro:request.subject,
      preheader:I18n.msg`Réponse à votre demande ${request.id}.`,
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(request.customer?.name || I18n.t('Client ARTY'))},</p>${emailTextPanel(request.adminReply,'teal')}`,
      ctaLabel:I18n.t('Voir la demande'),
      ctaUrl:`${normalizePublicUrl()}/?lang=${I18n.language()}#/profile`,
      footer:I18n.msg`Demande ${request.id}. Vous pouvez répondre à ce courriel ou ouvrir votre compte ARTY.`
    })
  });

  });
}
function sendSupportRequestReceiptEmail(request) {
  return withLocale(request.locale, () => {

  return sendTransactionalEmail({
    to:request.customer?.email,
    subject:I18n.msg`Demande reçue — ${request.id}`,
    idempotencyKey:`support-receipt-${request.id}`,
    replyTo:supportEmailChannel(request),
    html:emailShell({
      title:I18n.t('Votre demande est bien reçue'),
      intro:request.subject,
      preheader:I18n.msg`Confirmation de votre demande ${request.id}.`,
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(request.customer?.name || I18n.t('Client ARTY'))},</p><p>Notre équipe examinera votre message et vous répondra dès que possible.</p>${emailTextPanel(request.message,'neutral')}`,
      ctaLabel:I18n.t('Voir mes demandes'),
      ctaUrl:`${normalizePublicUrl()}/?lang=${I18n.language()}#/profile`,
      footer:I18n.msg`Demande ${request.id}. Vous pouvez répondre directement à ce courriel.`
    })
  });

  });
}
function sendSupportRequestAdminEmail(request) {
  return withLocale(request.locale, () => {

  const channel = supportEmailChannel(request);
  return sendTransactionalEmail({
    to:businessEmailAddress(channel),
    subject:I18n.msg`Nouvelle demande client — ${request.subject}`,
    idempotencyKey:`support-admin-${request.id}`,
    replyTo:request.customer?.email,
    html:emailShell({
      title:I18n.t('Nouvelle demande client'),
      intro:I18n.msg`${request.customer?.name || I18n.t('Un client')} a contacté ARTY.`,
      preheader:I18n.msg`Nouvelle demande ${request.id} à traiter.`,
      content:`${emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">Client</strong>${escapeEmailHTML(request.customer?.name || '')}<br>${escapeEmailHTML(request.customer?.email || '')}<br><br><strong>Catégorie :</strong> ${escapeEmailHTML(request.topic || 'autre')}${request.orderId?I18n.html`<br><strong>Commande :</strong> ${escapeEmailHTML(request.orderId)}`:''}`,'orange')}${emailTextPanel(request.message,'neutral')}`,
      ctaLabel:I18n.t('Ouvrir le service client'),
      ctaUrl:`${normalizePublicUrl()}/?lang=${I18n.language()}#/admin`,
      footer:I18n.msg`Demande ${request.id}. Répondez à ce courriel pour écrire directement au client.`
    })
  });

  });
}

app.post('/api/bookings', optionalAuth, async (req, res) => {
  const db = readDB();
  const { eventId, name, email, phone, guests, notes } = req.body;
  const guestCount = Math.max(1, parseInt(guests) || 1);
  if (!eventId || !name || !email) return res.status(400).json({ error: I18n.t('Nom, courriel et événement requis') });
  if (!validEmail(email)) return res.status(400).json({ error: I18n.t('Courriel invalide') });
  const ev = (db.events || []).find(e => e.id === parseInt(eventId));
  if (!ev) return res.status(404).json({ error: I18n.t('Événement non trouvé') });
  if ((ev.status || 'published') !== 'published') return res.status(400).json({ error: I18n.t('Cet événement n’est pas disponible à la réservation') });
  if (Number(ev.price) > 0) return res.status(402).json({ error: I18n.t('Ajoutez les billets au panier et complétez le paiement pour les recevoir') });
  const booked = parseInt(ev.bookedSpots) || 0;
  const max = parseInt(ev.maxSpots) || 0;
  const spotsLeft = Math.max(0, max - booked);
  if (spotsLeft <= 0) return res.status(400).json({ error: I18n.t('Complet') });
  if (guestCount > spotsLeft) return res.status(400).json({ error: I18n.msg`Il reste seulement ${spotsLeft} place${spotsLeft > 1 ? 's' : ''}` });
  const bookedAt = new Date().toISOString();
  const b = {
    locale:req.locale,
    id: `BKG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    userId: req.session?.userId || null,
    eventId: parseInt(eventId),
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    phone: String(phone || '').trim(),
    guests: guestCount,
    ticketMode:'group',
    notes: String(notes || '').trim(),
    guestNames:[String(name).replace(/\s+/g,' ').trim().slice(0,120)],
    total: Number(((Number(ev.price) || 0) * guestCount).toFixed(2)),
    bookedAt,
    status: 'confirmée',
    emailDelivery: { status:'pending', attempts:0, sentAt:'', lastAttemptAt:'' },
    tickets: []
  };
  if (!db.bookings) db.bookings = [];
  db.bookings.push(b);
  ensureBookingTickets(db, b);
  ev.bookedSpots = booked + guestCount;
  writeDB(db);
  await deliverBookingTickets(b, ev);
  const latestDB = readDB();
  const savedBooking = (latestDB.bookings || []).find(item => String(item.id) === String(b.id));
  if (savedBooking) { savedBooking.emailDelivery = b.emailDelivery; writeDB(latestDB); }
  res.json({ success: true, booking: publicBookingView(b, ev), emailStatus: b.emailDelivery.status });
});
app.get('/api/bookings/mine', auth, (req, res) => {
  const db = readDB();
  const changed = ensureAllBookingTickets(db); if (changed) writeDB(db);
  res.json((db.bookings || []).filter(b => b.userId === req.session.userId).map(b => publicBookingView(b, (db.events || []).find(e => e.id === b.eventId))).sort((a,b) => new Date(b.bookedAt) - new Date(a.bookedAt)));
});
app.get('/api/tickets/:code', (req, res) => {
  const db = readDB(); const record = findTicketRecord(db, req.params.code);
  if (!record) return res.status(404).json({ error:I18n.t('Billet non trouvé') });
  res.json(publicTicketRecord(record));
});
app.get('/api/tickets/:code/barcode.svg', (req, res) => {
  const db = readDB(); const record = findTicketRecord(db, req.params.code);
  if (!record) return res.status(404).type('text/plain').send(I18n.t('Billet non trouvé'));
  res.set('Cache-Control','private, no-store');
  res.type('image/svg+xml').send(ticketBarcodeSVG(record.ticket.code));
});
function eventRequestPath(value) {
  return ['inventory', 'custom', 'expert'].includes(String(value || '').trim()) ? String(value).trim() : 'expert';
}
function eventRequestPathLabel(value) {
  return { inventory:I18n.t('Kits du catalogue'), custom:I18n.t('Kit personnalisé'), expert:I18n.t('Accompagnement par un expert') }[eventRequestPath(value)];
}
function cleanEventRequestItems(db, rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.slice(0, 30).map(raw => {
    const kit = (db.kits || []).find(item => Number(item.id) === Number(raw.kitId));
    const quantity = Math.max(1, Math.min(1000, parseInt(raw.quantity ?? raw.qty) || 1));
    if (!kit || kit.inStock === false) return null;
    return { kitId:kit.id, name:String(kit.name || '').slice(0,160), quantity, image:String(kit.image || '').slice(0,1200) };
  }).filter(Boolean);
}
function cleanEventRequestImage(value) {
  const image = String(value || '');
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(image) && image.length <= 12_000_000 ? image : '';
}
function eventRequestLocation(address, fallback = '') {
  const parts = [address?.line1, address?.city, address?.province, address?.postal].map(value => String(value || '').trim()).filter(Boolean);
  return parts.join(', ') || String(fallback || '').trim();
}
function eventRequestEmailSummary(request) {
  const path = eventRequestPathLabel(request.servicePath);
  const selected = (request.inventoryItems || []).map(item => `${escapeEmailHTML(item.name)} × ${item.quantity}`).join('<br>');
  const solution = request.servicePath === 'inventory'
    ? (selected || I18n.t('Sélection à confirmer'))
    : request.servicePath === 'custom'
      ? I18n.msg`${escapeEmailHTML(request.customKit?.productLabel || request.customKit?.sizeLabel || I18n.t('Format à confirmer'))} · ${Math.max(1, Number(request.customKit?.quantity) || request.guests || 1)} kit(s)`
      : escapeEmailHTML(request.expertBrief || request.message || I18n.t('Concept à discuter avec le client'));
  return emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22;font-size:17px">${escapeEmailHTML(request.eventType)}</strong>${request.preferredDate ? escapeEmailHTML(request.preferredDate) : I18n.t('Date à confirmer')} · ${request.guests} personne${request.guests > 1 ? 's' : ''}<br>${escapeEmailHTML(request.location || I18n.t('Lieu à confirmer'))}<br><br><span style="color:#168b9c;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Solution choisie</span><br><strong>${escapeEmailHTML(path)}</strong><br>${solution}`,'teal');
}
function sendEventRequestReceiptEmail(request) {
  return withLocale(request.locale, () => {

  return sendTransactionalEmail({
    to:request.email,
    subject:I18n.msg`Demande d’événement ARTY ${request.reference}`,
    idempotencyKey:`event-request-receipt-${request.id}`,
    replyTo:'events',
    html:emailShell({
      title:I18n.t('Votre demande de devis est reçue'),
      intro:I18n.t('Notre équipe examinera votre projet et communiquera avec vous pour confirmer les détails et le prix.'),
      preheader:I18n.msg`Demande d’événement ${request.reference} reçue.`,
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(request.name)},</p>${eventRequestEmailSummary(request)}<p>Aucun paiement n’a été demandé. Un lien de paiement sécurisé pourra vous être envoyé seulement après votre accord sur le devis.</p>`,
      ctaLabel:I18n.t('Voir les événements ARTY'),
      ctaUrl:`${normalizePublicUrl()}/?lang=${I18n.language()}#/party`,
      footer:I18n.msg`Référence ${request.reference}. Répondez à ce courriel si vous souhaitez ajouter une précision.`
    })
  });

  });
}
function sendEventRequestAdminEmail(request) {
  return withLocale(request.locale, () => {

  const recipient = businessEmailAddress('events');
  if (!validEmail(recipient)) return Promise.resolve({ status:'not_configured' });
  return sendTransactionalEmail({
    to:recipient,
    subject:I18n.msg`Nouvelle demande d’événement — ${request.eventType}`,
    idempotencyKey:`event-request-admin-${request.id}`,
    replyTo:request.email,
    html:emailShell({
      title:I18n.t('Nouvelle demande d’événement'),
      intro:I18n.msg`${request.name} souhaite organiser : ${request.eventType}`,
      preheader:I18n.msg`Nouvelle demande ${request.reference} à traiter.`,
      content:`${eventRequestEmailSummary(request)}${emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">Client</strong>${escapeEmailHTML(request.name)}<br>${escapeEmailHTML(request.email)}${request.phone ? `<br>${escapeEmailHTML(request.phone)}` : ''}`,'orange')}`,
      ctaLabel:I18n.t('Ouvrir l’administration'),
      ctaUrl:`${normalizePublicUrl()}/?lang=${I18n.language()}#/admin`,
      footer:I18n.msg`Référence ${request.reference}. Les images et les détails complets sont disponibles dans l’administration ARTY.`
    })
  });

  });
}
async function deliverEventRequestEmails(request) {
  const [customer, admin] = await Promise.all([sendEventRequestReceiptEmail(request), sendEventRequestAdminEmail(request)]);
  return { customer:customer.status, admin:admin.status };
}
function publicEventQuoteView(request) {
  const customKit = request.customKit || {};
  return {
    reference:request.reference,
    eventName:request.eventType,
    preferredDate:request.preferredDate || '',
    eventTime:request.eventTime || '',
    guests:request.guests || 0,
    location:request.location || '',
    servicePath:request.servicePath || 'expert',
    servicePathLabel:eventRequestPathLabel(request.servicePath),
    inventoryItems:(request.inventoryItems || []).map(item => ({ name:item.name, quantity:item.quantity, image:item.image || '' })),
    customKit:request.servicePath === 'custom' ? { productLabel:customKit.productLabel || '', sizeLabel:customKit.sizeLabel || '', orientation:customKit.orientation || '', quantity:customKit.quantity || request.guests || 1, notes:customKit.notes || '' } : null,
    expertBrief:request.servicePath === 'expert' ? request.expertBrief || '' : '',
    quoteDescription:request.quoteDescription || '',
    quoteAmount:money(request.quoteAmount || 0),
    status:request.status || 'nouvelle',
    paymentStatus:request.quotePaymentStatus || 'not_created',
    paidAt:request.quotePaidAt || ''
  };
}
function findEventRequestByPaymentToken(db, token) {
  const candidate = hashToken(String(token || ''));
  return (db.eventRequests || []).find(request => request.paymentTokenHash && request.paymentTokenHash === candidate) || null;
}
function eventQuoteTokenIsValid(request) {
  if (!request?.paymentTokenHash) return false;
  if (!request.paymentLinkExpiresAt) return true;
  return new Date(request.paymentLinkExpiresAt).getTime() > Date.now();
}
function createStripePaymentIntentForEventQuote(request) {
  return stripeRequest('POST', '/v1/payment_intents', {
    amount:stripeAmountCents(request.quoteAmount),
    currency:'cad',
    'automatic_payment_methods[enabled]':'true',
    receipt_email:request.email || '',
    description:I18n.msg`Devis événement ARTY ${request.reference}`,
    'metadata[eventRequestId]':String(request.id),
    'metadata[eventRequestReference]':request.reference || '',
    'metadata[source]':'arty-event-quote'
  });
}
function syncEventRequestFromStripePaymentIntent(db, paymentIntent, source = 'stripe') {
  const requestId = paymentIntent?.metadata?.eventRequestId || '';
  const request = (db.eventRequests || []).find(item => String(item.id) === String(requestId) || String(item.paymentReference || '') === String(paymentIntent?.id || ''));
  if (!request) return null;
  request.paymentReference = paymentIntent.id || request.paymentReference || '';
  request.quotePaymentStatus = paymentIntent.status === 'succeeded' ? 'paid' : paymentIntent.status === 'processing' ? 'processing' : paymentIntent.status === 'canceled' ? 'cancelled' : paymentIntent.last_payment_error ? 'failed' : 'pending';
  request.paymentLastSyncedAt = new Date().toISOString();
  request.paymentLastSource = source;
  if (paymentIntent.status === 'succeeded') {
    request.status = 'payée';
    request.quotePaidAt = request.quotePaidAt || new Date().toISOString();
    request.paymentAmountReceived = money((Number(paymentIntent.amount_received) || 0) / 100);
  }
  request.updatedAt = new Date().toISOString();
  return request;
}
function sendEventQuotePaymentLinkEmail(request) {
  return withLocale(request.locale, () => {

  return sendTransactionalEmail({
    to:request.email,
    subject:I18n.msg`Votre devis ARTY est prêt — ${request.reference}`,
    idempotencyKey:`event-quote-link-${request.id}-${hashToken(request.paymentLinkUrl || '').slice(0,16)}`,
    replyTo:'events',
    html:emailShell({
      title:I18n.t('Votre devis personnalisé est prêt'),
      intro:I18n.msg`Nous avons préparé votre proposition pour ${request.eventType}.`,
      preheader:I18n.msg`Votre devis ${request.reference} est prêt.`,
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(request.name)},</p>${eventRequestEmailSummary(request)}${request.quoteDescription ? emailTextPanel(request.quoteDescription,'neutral') : ''}${emailAmountSummary(I18n.t('Montant du devis'),`${I18n.currency(money(request.quoteAmount).toFixed(2))} CAD`)}<p>Utilisez le bouton ci-dessous pour consulter le devis et effectuer le paiement sécurisé.</p>`,
      ctaLabel:I18n.t('Consulter et payer le devis'),
      ctaUrl:request.paymentLinkUrl,
      footer:I18n.msg`Référence ${request.reference}. Le lien est personnel et expire le ${new Date(request.paymentLinkExpiresAt).toLocaleDateString(I18n.locale())}.`
    })
  });

  });
}
function sendEventQuotePaidEmail(request) {
  return withLocale(request.locale, () => {

  return sendTransactionalEmail({
    to:request.email,
    subject:I18n.msg`Paiement reçu — devis ${request.reference}`,
    idempotencyKey:`event-quote-paid-${request.id}`,
    replyTo:'events',
    html:emailShell({
      title:I18n.t('Paiement reçu'),
      intro:I18n.t('Votre événement ARTY est maintenant confirmé pour la prochaine étape de préparation.'),
      preheader:I18n.msg`Paiement confirmé pour ${request.reference}.`,
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(request.name)},</p>${emailAmountSummary(I18n.t('Paiement reçu'),`${I18n.currency(money(request.quoteAmount).toFixed(2))} CAD`)}${emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">${escapeEmailHTML(request.eventType)}</strong>Référence ${escapeEmailHTML(request.reference)}`,'success')}<p>Notre équipe communiquera avec vous pour finaliser la production, la livraison et les détails de l’événement.</p>`,
      ctaLabel:I18n.t('Visiter ARTY'),
      ctaUrl:normalizePublicUrl(),
      footer:I18n.msg`Confirmation de paiement pour la demande ${request.reference}.`
    })
  });

  });
}
async function deliverEventQuotePaidEmail(requestId) {
  let db = readDB();
  const request = (db.eventRequests || []).find(item => String(item.id) === String(requestId));
  if (!request || request.quotePaymentStatus !== 'paid') return { status:'not_paid' };
  if (request.paidEmailDelivery?.status === 'sent') return request.paidEmailDelivery;
  const result = await sendEventQuotePaidEmail(request);
  db = readDB();
  const saved = (db.eventRequests || []).find(item => String(item.id) === String(requestId));
  if (saved) {
    saved.paidEmailDelivery = { status:result.status, providerId:result.id || '', error:result.error || '', sentAt:result.status === 'sent' ? new Date().toISOString() : '' };
    writeDB(db);
  }
  return result;
}

app.post('/api/event-requests', async (req, res) => {
  const db = readDB();
  const body = req.body || {};
  const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 240);
  const phone = String(body.phone || '').trim().slice(0, 80);
  const eventName = String(body.eventName || body.eventType || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const preferredDate = String(body.preferredDate || '').trim().slice(0, 20);
  const eventTime = String(body.eventTime || '').trim().slice(0, 20);
  const guests = Math.max(1, Math.min(1000, parseInt(body.guests) || 0));
  const address = {
    line1:String(body.address?.line1 || body.location || '').trim().slice(0, 240),
    city:String(body.address?.city || '').trim().slice(0, 120),
    province:String(body.address?.province || '').trim().slice(0, 80),
    postal:String(body.address?.postal || '').trim().slice(0, 30),
    country:String(body.address?.country || 'Canada').trim().slice(0, 80)
  };
  const servicePath = eventRequestPath(body.servicePath);
  if (!name || !validEmail(email) || !eventName || !guests || !address.line1) return res.status(400).json({ error:I18n.t('Nom, courriel, événement, nombre d’invités et adresse requis') });
  const inventoryItems = servicePath === 'inventory' ? cleanEventRequestItems(db, body.inventoryItems) : [];
  if (servicePath === 'inventory' && !inventoryItems.length) return res.status(400).json({ error:I18n.t('Choisissez au moins un kit du catalogue') });
  const rawCustom = body.customKit && typeof body.customKit === 'object' ? body.customKit : {};
  const customKit = servicePath === 'custom' ? {
    size:String(rawCustom.size || '').trim().slice(0, 40),
    sizeLabel:String(rawCustom.sizeLabel || '').trim().slice(0, 100),
    productType:['canvas','bag'].includes(String(rawCustom.productType || '')) ? String(rawCustom.productType) : 'canvas',
    productLabel:String(rawCustom.productLabel || rawCustom.sizeLabel || '').trim().slice(0, 140),
    orientation:String(rawCustom.orientation || '').trim().slice(0, 40),
    quantity:Math.max(1, Math.min(1000, parseInt(rawCustom.quantity) || guests)),
    notes:String(rawCustom.notes || '').trim().slice(0, 1800),
    imageCount:Math.max(0, Math.min(6, parseInt(rawCustom.imageCount) || 0)),
    textCount:Math.max(0, Math.min(50, parseInt(rawCustom.textCount) || 0)),
    elementCount:Math.max(1, Math.min(100, parseInt(rawCustom.elementCount) || 1)),
    paintedPreview:cleanEventRequestImage(rawCustom.paintedPreview),
    sourceImage:cleanEventRequestImage(rawCustom.sourceImage),
    traceImage:cleanEventRequestImage(rawCustom.traceImage)
  } : null;
  if (servicePath === 'custom' && (!customKit.sourceImage || !customKit.traceImage)) return res.status(400).json({ error:I18n.t('Terminez la création personnalisée dans le Studio ARTY') });
  const expertBrief = servicePath === 'expert' ? String(body.expertBrief || body.message || '').trim().slice(0, 3000) : '';
  if (servicePath === 'expert' && expertBrief.length < 10) return res.status(400).json({ error:I18n.t('Décrivez brièvement le concept que vous souhaitez créer') });
  const id = Date.now();
  const request = {
    id,
    reference:`EVT-${id.toString(36).toUpperCase()}`,
    locale:req.locale,
    name,
    email,
    phone,
    eventType:eventName,
    preferredDate,
    eventTime,
    guests,
    address,
    location:eventRequestLocation(address, body.location),
    servicePath,
    inventoryItems,
    customKit,
    expertBrief,
    message:String(body.notes || body.message || '').trim().slice(0, 3000),
    contactPreference:['email','phone'].includes(body.contactPreference) ? body.contactPreference : 'email',
    status:'nouvelle',
    adminNote:'',
    quoteAmount:0,
    quoteDescription:'',
    quotePaymentStatus:'not_created',
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  db.eventRequests = db.eventRequests || [];
  db.eventRequests.push(request);
  writeDB(db);
  const delivery = await deliverEventRequestEmails(request);
  res.json({ success:true, reference:request.reference, emailStatus:delivery.customer });
});

app.get('/api/event-quotes/:token', (req, res) => {
  const db = readDB();
  const request = findEventRequestByPaymentToken(db, req.params.token);
  if (!request || !eventQuoteTokenIsValid(request)) return res.status(404).json({ error:I18n.t('Ce lien de paiement est invalide ou expiré') });
  res.set('Cache-Control', 'private, no-store');
  res.json(publicEventQuoteView(request));
});
app.post('/api/event-quotes/:token/payment', async (req, res) => {
  try {
    if (!isStripeEnabled()) return res.status(503).json({ error:I18n.t('Le paiement Stripe n’est pas disponible') });
    const db = readDB();
    const request = findEventRequestByPaymentToken(db, req.params.token);
    if (!request || !eventQuoteTokenIsValid(request)) return res.status(404).json({ error:I18n.t('Ce lien de paiement est invalide ou expiré') });
    if (request.quotePaymentStatus === 'paid') return res.json({ success:true, paid:true, quote:publicEventQuoteView(request) });
    if (money(request.quoteAmount) < 0.5) return res.status(400).json({ error:I18n.t('Le montant du devis est invalide') });
    let paymentIntent = null;
    if (request.paymentReference) {
      try {
        const existing = await retrieveStripePaymentIntent(request.paymentReference);
        if (!['canceled','succeeded'].includes(existing.status) && Number(existing.amount) === stripeAmountCents(request.quoteAmount)) paymentIntent = existing;
        if (existing.status === 'succeeded') {
          syncEventRequestFromStripePaymentIntent(db, existing, 'payment-link-open');
          writeDB(db);
          await deliverEventQuotePaidEmail(request.id);
          return res.json({ success:true, paid:true, quote:publicEventQuoteView(request) });
        }
      } catch {}
    }
    if (!paymentIntent) paymentIntent = await createStripePaymentIntentForEventQuote(request);
    request.paymentReference = paymentIntent.id || '';
    request.quotePaymentStatus = paymentIntent.status === 'processing' ? 'processing' : 'pending';
    request.updatedAt = new Date().toISOString();
    writeDB(db);
    res.json({ success:true, publishableKey:process.env.STRIPE_PUBLISHABLE_KEY || '', clientSecret:paymentIntent.client_secret || '', paymentIntentId:paymentIntent.id || '', quote:publicEventQuoteView(request) });
  } catch (error) {
    console.error('Event quote payment error:', error);
    res.status(500).json({ error:I18n.t('Impossible de préparer le paiement: ') + error.message });
  }
});
app.post('/api/event-quotes/:token/confirm', async (req, res) => {
  try {
    const db = readDB();
    const request = findEventRequestByPaymentToken(db, req.params.token);
    if (!request || !eventQuoteTokenIsValid(request)) return res.status(404).json({ error:I18n.t('Ce lien de paiement est invalide ou expiré') });
    const paymentIntentId = String(req.body.paymentIntentId || '').trim();
    if (!paymentIntentId || paymentIntentId !== request.paymentReference) return res.status(400).json({ error:I18n.t('Paiement non associé à ce devis') });
    const paymentIntent = await retrieveStripePaymentIntent(paymentIntentId);
    const synced = syncEventRequestFromStripePaymentIntent(db, paymentIntent, 'client-confirm');
    writeDB(db);
    if (synced?.quotePaymentStatus === 'paid') await deliverEventQuotePaidEmail(synced.id);
    res.json({ success:true, paid:synced?.quotePaymentStatus === 'paid', quote:publicEventQuoteView(synced || request) });
  } catch (error) {
    console.error('Event quote confirmation error:', error);
    res.status(500).json({ error:I18n.t('Impossible de confirmer le paiement: ') + error.message });
  }
});
const CONTACT_CHANNELS = {
  get contact(){return I18n.t('Renseignements généraux')},
  get support(){return I18n.t('Service à la clientèle')},
  get orders(){return I18n.t('Commandes et livraison')},
  get events(){return I18n.t('Événements et groupes')}
};
function contactChannel(value) {
  const channel = String(value || 'contact').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CONTACT_CHANNELS, channel) ? channel : 'contact';
}
function sendContactReceiptEmail(contact) {
  return withLocale(contact.locale, () => {

  return sendTransactionalEmail({
    to:contact.email,
    subject:I18n.msg`Votre message à ARTY est bien reçu — ${contact.reference}`,
    idempotencyKey:`contact-receipt-${contact.id}`,
    replyTo:contact.channel,
    html:emailShell({
      title:I18n.t('Merci de nous avoir écrit'),
      intro:I18n.msg`Votre message a été transmis à notre équipe ${CONTACT_CHANNELS[contact.channel].toLowerCase()}.`,
      preheader:I18n.msg`Votre message ${contact.reference} est bien reçu.`,
      content:I18n.html`<p>Bonjour ${escapeEmailHTML(contact.name)},</p><p>Nous vous répondrons dès que possible.</p>${emailTextPanel(contact.message,'neutral')}`,
      footer:I18n.msg`Référence ${contact.reference}. Vous pouvez répondre directement à ce courriel.`
    })
  });

  });
}
function sendContactAdminEmail(contact) {
  return withLocale(contact.locale, () => {

  return sendTransactionalEmail({
    to:businessEmailAddress(contact.channel),
    subject:I18n.msg`Nouveau message — ${CONTACT_CHANNELS[contact.channel]}`,
    idempotencyKey:`contact-admin-${contact.id}`,
    replyTo:contact.email,
    html:emailShell({
      title:I18n.t('Nouveau message du site'),
      intro:CONTACT_CHANNELS[contact.channel],
      preheader:I18n.msg`Nouveau message ${contact.reference}.`,
      content:`${emailPanel(I18n.html`<strong style="display:block;margin-bottom:5px;color:#332b22">Client</strong>${escapeEmailHTML(contact.name)}<br>${escapeEmailHTML(contact.email)}`,'orange')}${emailTextPanel(contact.message,'neutral')}`,
      footer:I18n.msg`Référence ${contact.reference}. Répondez à ce courriel pour écrire directement au client.`
    })
  });

  });
}
app.post('/api/contact', async (req, res) => {
  const name = String(req.body?.name || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 240);
  const message = String(req.body?.message || '').trim().slice(0, 3000);
  const channel = contactChannel(req.body?.channel);
  if (!name || !validEmail(email) || message.length < 10) return res.status(400).json({ error:I18n.t('Ajoutez votre nom, un courriel valide et un message détaillé') });
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const contact = { locale:req.locale, id, reference:`MSG-${Date.now().toString(36).toUpperCase()}`, name, email, message, channel };
  const [customerEmail, adminEmail] = await Promise.all([sendContactReceiptEmail(contact), sendContactAdminEmail(contact)]);
  if (adminEmail.status !== 'sent') {
    console.error('Contact email delivery failed:', adminEmail.error || adminEmail.status);
    return res.status(503).json({ error:I18n.t('Votre message n’a pas pu être transmis. Écrivez-nous directement à ') + businessEmailAddress(channel) });
  }
  res.json({ success:true, message:I18n.t('Merci! Votre message a été envoyé à la bonne équipe.'), reference:contact.reference, emailStatus:customerEmail.status });
});


function normalizeTags(raw) {
  if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean);
  return String(raw || '').split(',').map(t => t.trim()).filter(Boolean);
}
function normalizeKitPayload(body, existing = {}) {
  const payload = { ...body, translations:normalizeTranslations(body.translations,existing.translations) };
  delete payload.tags;
  delete payload.badges;
  payload.price = parseFloat(body.price) || 0;
  payload.categoryId = body.categoryId ? parseInt(body.categoryId) : (existing.categoryId || null);
  payload.inStock = body.inStock === undefined ? (existing.inStock !== false) : (body.inStock === true || body.inStock === 'true');
  payload.featured = body.featured === undefined ? !!existing.featured : (body.featured === true || body.featured === 'true');
  payload.shortDesc = body.shortDesc || '';
  payload.description = body.description || '';
  payload.image = body.image || '';
  delete payload.difficulty;
  return payload;
}

function normalizeEventPayload(body, existing = {}) {
  const payload = { ...body, translations:normalizeTranslations(body.translations,existing.translations) };
  payload.title = body.title || existing.title || '';
  payload.description = body.description || '';
  payload.date = body.date || existing.date || '';
  payload.time = body.time || existing.time || '18:00';
  payload.duration = body.duration || existing.duration || I18n.t('2 heures');
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
app.get('/api/admin/kits', adminOnly, (req, res) => { const db=readDB(); res.json((db.kits||[]).map(k => enrichPublicKit(k, db))); });

app.get('/api/admin/orders', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.orders || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.get('/api/admin/support-requests', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.supportRequests || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.patch('/api/admin/support-requests/:id', adminOnly, async (req, res) => {
  const db = readDB();
  const request = (db.supportRequests || []).find(item => String(item.id) === String(req.params.id));
  if (!request) return res.status(404).json({ error: I18n.t('Demande non trouvée') });
  const previousReply = String(request.adminReply || '');
  const status = String(req.body.status || request.status || 'nouvelle').trim().toLowerCase();
  const adminReply = String(req.body.adminReply ?? request.adminReply ?? '').trim().slice(0, 2400);
  if (!SUPPORT_STATUSES.includes(status)) return res.status(400).json({ error: I18n.t('Statut invalide') });
  request.status = status;
  request.adminReply = adminReply;
  request.updatedAt = new Date().toISOString();
  if (adminReply && adminReply !== previousReply) request.repliedAt = request.updatedAt;
  writeDB(db);
  const emailResult = adminReply && adminReply !== previousReply ? await sendSupportReplyEmail(request) : { status:'not_needed' };
  res.json({ success: true, request, emailStatus:emailResult.status });
});
app.put('/api/admin/orders/:id/status', adminOnly, async (req, res) => {
  const db = readDB();
  const id = String(req.params.id || '');
  const i = (db.orders || []).findIndex(o => String(o.id) === id);
  if (i === -1) return res.status(404).json({ error: I18n.t('Commande non trouvée') });
  const allowed = ['en attente de paiement', 'payée', 'préparation', 'expédiée', 'livrée', 'annulée', 'remboursée'];
  const status = String(req.body.status || '').trim();
  if (!allowed.includes(status)) return res.status(400).json({ error: I18n.t('Statut invalide') });

  const order = db.orders[i];
  const oldStatus = order.status;
  order.status = status;
  const trackingInput = req.body.tracking && typeof req.body.tracking === 'object' ? req.body.tracking : {};
  const currentTracking = order.tracking && typeof order.tracking === 'object' ? order.tracking : {};
  const previousTracking = JSON.stringify([currentTracking.carrier || '', currentTracking.number || '', currentTracking.url || '', currentTracking.estimatedDelivery || '']);
  const trackingUrl = String(trackingInput.url ?? currentTracking.url ?? '').trim().slice(0, 500);
  if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) return res.status(400).json({ error: I18n.t('Le lien de suivi doit commencer par http:// ou https://') });
  order.tracking = {
    carrier: String(trackingInput.carrier ?? currentTracking.carrier ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    number: String(trackingInput.number ?? currentTracking.number ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
    url: trackingUrl,
    estimatedDelivery: String(trackingInput.estimatedDelivery ?? currentTracking.estimatedDelivery ?? '').trim().slice(0, 20),
    updatedAt: new Date().toISOString()
  };
  const trackingChanged = previousTracking !== JSON.stringify([order.tracking.carrier, order.tracking.number, order.tracking.url, order.tracking.estimatedDelivery]);
  if (status === 'payée') {
    order.paymentStatus = 'paid';
    order.paidAt = order.paidAt || new Date().toISOString();
    ensurePaidOrderBookings(db, order);
  }
  if (status === 'annulée') {
    order.paymentStatus = order.paymentStatus === 'paid' ? 'refund_needed' : 'cancelled';
    if (order.inventoryReserved && !order.inventoryRestocked) {
      releaseInventoryForItems(db, order.items || [], order.id, I18n.t('Commande annulée'));
      order.inventoryRestocked = true;
    }
    releaseEventSeatsForOrder(db, order);
    cancelOrderTicketBookings(db, order);
  }
  if (status === 'remboursée') order.refundStatus = 'refunded';
  order.statusHistory = order.statusHistory || [];
  if (oldStatus !== status) order.statusHistory.push({ from: oldStatus || '', to: status, at: new Date().toISOString(), by: req.session.email || 'admin' });
  if (status === 'expédiée' && !order.shippedAt) order.shippedAt = new Date().toISOString();
  if (status === 'livrée' && !order.deliveredAt) order.deliveredAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  writeDB(db);
  const delivery = status === 'payée' ? await deliverPaidOrderCommunications(order.id, 'admin-payment') : { status:'not_sent', tickets:[] };
  const statusDelivery = status !== 'payée' && (oldStatus !== status || (status === 'expédiée' && trackingChanged)) ? await deliverOrderStatusEmail(order.id, status, 'admin-status') : { status:'not_needed' };
  const latestOrder = (readDB().orders || []).find(item => String(item.id) === String(order.id)) || order;
  res.json({ success: true, order:latestOrder, emailStatus:delivery.status, statusEmailStatus:statusDelivery.status, tickets:delivery.tickets });
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
  if (!kit) return res.status(404).json({ error: I18n.t('Kit non trouvé') });
  const mode = String(req.body.mode || 'adjust');
  const qty = parseInt(req.body.quantity);
  if (!Number.isFinite(qty)) return res.status(400).json({ error: I18n.t('Quantité invalide') });
  const before = Number.isFinite(Number(kit.stockQty)) ? Number(kit.stockQty) : 0;
  const after = mode === 'set' ? Math.max(0, qty) : Math.max(0, before + qty);
  kit.stockQty = after;
  kit.inStock = after > 0;
  kit.updatedAt = new Date().toISOString();
  db.inventoryMovements = db.inventoryMovements || [];
  db.inventoryMovements.push({ id: Date.now(), kitId, kitName: kit.name, type: mode, quantity: mode === 'set' ? after - before : qty, before, after, reason: String(req.body.reason || I18n.t('Ajustement admin')), createdAt: new Date().toISOString(), by: req.session.email || 'admin' });
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
  if (!discount.title) return res.status(400).json({ error: I18n.t('Nom du rabais requis') });
  if (!discount.type) return res.status(400).json({ error: I18n.t('Type de rabais requis') });
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
  if (i === -1) return res.status(404).json({ error: I18n.t('Rabais non trouvé') });
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
  if (!order) return res.status(404).json({ error: I18n.t('Commande non trouvée') });
  const already = Number(order.refundedTotal || 0);
  const maxRefundable = Math.max(0, Number(order.total || 0) - already);
  let amount = parseFloat(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) amount = maxRefundable;
  amount = Math.min(maxRefundable, Number(amount.toFixed(2)));
  if (amount <= 0) return res.status(400).json({ error: I18n.t('Aucun montant remboursable') });

  const refund = {
    id: 'RF-' + Date.now().toString(36).toUpperCase(),
    orderId: order.id,
    amount,
    reason: String(req.body.reason || I18n.t('Remboursement admin')),
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
    releaseInventoryForItems(db, order.items || [], order.id, I18n.t('Remboursement / retour'));
    order.inventoryRestocked = true;
  }
  order.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, refund, order });
});

// Categories CRUD
app.post('/api/admin/categories', adminOnly, (req, res) => {
  const db=readDB(); const {name,slug,image,parent}=req.body;
  if(!name) return res.status(400).json({error:I18n.t('Nom requis')});
  const cat = { translations:normalizeTranslations(req.body.translations), id: (db.categories||[]).length>0 ? Math.max(...db.categories.map(c=>c.id))+1 : 1, name, slug:slug||name.toLowerCase().replace(/\s+/g,'-'), image:image||'', parent:parent||'none', order:(db.categories||[]).length+1 };
  if(!db.categories) db.categories=[]; db.categories.push(cat); writeDB(db);
  res.json({success:true,category:cat});
});
app.put('/api/admin/categories/:id', adminOnly, (req, res) => {
  const db=readDB(); const idx=(db.categories||[]).findIndex(c=>c.id===parseInt(req.params.id)); if(idx===-1) return res.status(404).json({error:I18n.t('Non trouvé')});
  db.categories[idx]={...db.categories[idx],...req.body,id:db.categories[idx].id}; writeDB(db);
  res.json({success:true,category:db.categories[idx]});
});
app.delete('/api/admin/categories/:id', adminOnly, (req, res) => { const db=readDB(); db.categories=(db.categories||[]).filter(c=>c.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });

app.put('/api/admin/announcement', adminOnly, (req, res) => {
  const db = readDB();
  const message = String(req.body.message || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const enabled = (req.body.enabled === true || req.body.enabled === 'true') && Boolean(message);
  db.announcement = { enabled, message, translations:normalizeTranslations(req.body.translations,db.announcement?.translations) };
  writeDB(db);
  res.json({ success: true, announcement: db.announcement });
});

const PRODUCT_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif'
};
function isValidUploadedImage(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mime === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'image/avif') return buffer.toString('ascii', 4, 12).includes('ftyp');
  return false;
}
app.post('/api/admin/product-images', adminOnly, (req, res) => {
  try {
    const dataUrl = String(req.body.dataUrl || '');
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|avif));base64,([a-z0-9+/=\r\n]+)$/i);
    if (!match || !PRODUCT_IMAGE_TYPES[match[1].toLowerCase()]) return res.status(400).json({ error: I18n.t('Format accepté: JPG, PNG, WEBP ou AVIF') });
    const mime = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: I18n.t('L’image doit faire moins de 10 Mo') });
    if (!isValidUploadedImage(buffer, mime)) return res.status(400).json({ error: I18n.t('Le fichier image est invalide') });
    fs.mkdirSync(PRODUCT_UPLOADS_DIR, { recursive: true });
    const filename = `product-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${PRODUCT_IMAGE_TYPES[mime]}`;
    fs.writeFileSync(path.join(PRODUCT_UPLOADS_DIR, filename), buffer, { flag: 'wx' });
    res.json({ success: true, url: `/uploads/${filename}` });
  } catch (err) {
    console.error('Product image upload failed:', err.message);
    res.status(500).json({ error: I18n.t('Impossible de téléverser l’image') });
  }
});

function normalizeProductTemplatePayload(body, existing = {}) {
  return {
    translations: normalizeTranslations(body.translations,existing.translations),
    name: String(body.name ?? existing.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    includes: normalizeProductIncludes(body.includes ?? existing.includes),
    sizeOptions: normalizeProductChoices(body.sizeOptions ?? existing.sizeOptions, 'size'),
    addOns: normalizeProductChoices(body.addOns ?? existing.addOns, 'addon')
  };
}
app.get('/api/admin/product-templates', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.productTemplates || []).slice().sort((a,b) => String(a.name).localeCompare(String(b.name), 'fr')));
});
app.post('/api/admin/product-templates', adminOnly, (req, res) => {
  const db = readDB();
  const template = { id: Date.now(), ...normalizeProductTemplatePayload(req.body), createdAt: new Date().toISOString() };
  if (!template.name) return res.status(400).json({ error: I18n.t('Nom du modèle requis') });
  db.productTemplates = db.productTemplates || [];
  db.productTemplates.push(template);
  writeDB(db);
  res.json({ success: true, template });
});
app.delete('/api/admin/product-templates/:id', adminOnly, (req, res) => {
  const db = readDB();
  const before = (db.productTemplates || []).length;
  db.productTemplates = (db.productTemplates || []).filter(template => String(template.id) !== String(req.params.id));
  if (db.productTemplates.length === before) return res.status(404).json({ error: I18n.t('Modèle non trouvé') });
  writeDB(db);
  res.json({ success: true });
});

// Kits CRUD
app.post('/api/admin/kits', adminOnly, (req, res) => {
  const db=readDB(); const {name,price}=req.body; if(!name||!price) return res.status(400).json({error:I18n.t('Nom et prix requis')});
  const kit = { id:db.kits.length>0?Math.max(...db.kits.map(k=>k.id))+1:1, name, ...normalizeKitPayload(req.body), createdAt:new Date().toISOString() };
  db.kits.push(kit); writeDB(db); res.json({success:true,kit});
});
app.put('/api/admin/kits/:id', adminOnly, (req, res) => { const db=readDB(); const i=db.kits.findIndex(k=>k.id===parseInt(req.params.id)); if(i===-1) return res.status(404).json({error:I18n.t('Non trouvé')}); db.kits[i]={...db.kits[i],...normalizeKitPayload(req.body, db.kits[i]),name:req.body.name||db.kits[i].name,id:db.kits[i].id}; writeDB(db); res.json({success:true,kit:db.kits[i]}); });
app.delete('/api/admin/kits/:id', adminOnly, (req, res) => { const db=readDB(); db.kits=db.kits.filter(k=>k.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });

// Events CRUD
app.get('/api/admin/events', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.events || []).sort((a,b) => new Date((b.date || '') + 'T' + (b.time || '00:00')) - new Date((a.date || '') + 'T' + (a.time || '00:00'))));
});
app.post('/api/admin/events', adminOnly, (req, res) => {
  const db = readDB();
  const { title, date } = req.body;
  if (!title || !date) return res.status(400).json({ error: I18n.t('Titre et date requis') });
  const ev = { id: (db.events || []).length > 0 ? Math.max(...db.events.map(e => e.id)) + 1 : 1, ...normalizeEventPayload(req.body), createdAt: new Date().toISOString() };
  if (!db.events) db.events = [];
  db.events.push(ev);
  writeDB(db);
  res.json({ success: true, event: ev });
});
app.put('/api/admin/events/:id', adminOnly, (req, res) => {
  const db = readDB();
  const i = (db.events || []).findIndex(e => e.id === parseInt(req.params.id));
  if (i === -1) return res.status(404).json({ error: I18n.t('Non trouvé') });
  db.events[i] = { ...db.events[i], ...normalizeEventPayload(req.body, db.events[i]), id: db.events[i].id };
  writeDB(db);
  res.json({ success: true, event: db.events[i] });
});
app.delete('/api/admin/events/:id', adminOnly, (req, res) => { const db=readDB(); db.events=(db.events||[]).filter(e=>e.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });
app.get('/api/admin/bookings', adminOnly, (req, res) => {
  const db = readDB();
  const changed = ensureAllBookingTickets(db); if (changed) writeDB(db);
  res.json((db.bookings || []).map(b => ({ ...b, event: (db.events || []).find(e => e.id === b.eventId) || null })).sort((a,b) => new Date(b.bookedAt) - new Date(a.bookedAt)));
});
function updateBookingAttendanceStatus(booking) {
  const checked = (booking.tickets || []).filter(ticket => ticket.status === 'checked_in').reduce((sum,ticket) => sum + Math.max(1,parseInt(ticket.admissions)||1), 0);
  booking.checkedInCount = checked;
  booking.status = checked === 0 ? 'confirmée' : (checked >= Math.max(1,parseInt(booking.guests)||1) ? 'présente' : 'arrivée partielle');
  booking.updatedAt = new Date().toISOString();
}
app.post('/api/admin/tickets/check-in', adminOnly, (req, res) => {
  const db = readDB(); const record = findTicketRecord(db, req.body.code);
  if (!record) return res.status(404).json({ error:I18n.t('Billet introuvable') });
  if (!record.event || record.event.status === 'cancelled') return res.status(400).json({ error:I18n.t('Cet événement est annulé ou indisponible') });
  if (record.ticket.status === 'cancelled') return res.status(400).json({ error:I18n.t('Ce billet a été annulé') });
  if (record.ticket.status === 'checked_in') return res.status(409).json({ error:I18n.t('Ce billet a déjà été validé'), record:publicTicketRecord(record) });
  record.ticket.status = 'checked_in'; record.ticket.checkedInAt = new Date().toISOString(); record.ticket.checkedInBy = req.session.email || 'admin';
  updateBookingAttendanceStatus(record.booking); writeDB(db);
  res.json({ success:true, record:publicTicketRecord(record) });
});
app.patch('/api/admin/tickets/:ticketId', adminOnly, (req, res) => {
  const db = readDB(); const record = findTicketRecord(db, req.params.ticketId);
  if (!record) return res.status(404).json({ error:I18n.t('Billet introuvable') });
  const checkedIn = req.body.checkedIn === true || req.body.checkedIn === 'true';
  if (checkedIn && (!record.event || record.event.status === 'cancelled')) return res.status(400).json({ error:I18n.t('Cet événement est annulé ou indisponible') });
  if (checkedIn && record.ticket.status === 'cancelled') return res.status(400).json({ error:I18n.t('Ce billet a été annulé') });
  record.ticket.status = checkedIn ? 'checked_in' : 'valid';
  record.ticket.checkedInAt = checkedIn ? new Date().toISOString() : '';
  record.ticket.checkedInBy = checkedIn ? (req.session.email || 'admin') : '';
  updateBookingAttendanceStatus(record.booking); writeDB(db);
  res.json({ success:true, record:publicTicketRecord(record) });
});
app.post('/api/admin/bookings/:id/resend-ticket', adminOnly, async (req, res) => {
  const db = readDB(); const booking = (db.bookings || []).find(item => String(item.id) === String(req.params.id));
  if (!booking) return res.status(404).json({ error:I18n.t('Réservation introuvable') });
  const event = (db.events || []).find(item => item.id === booking.eventId);
  if (!event) return res.status(404).json({ error:I18n.t('Événement introuvable') });
  ensureBookingTickets(db, booking);
  writeDB(db);
  const result = await deliverBookingTickets(booking, event, 'resend');
  const latestDB = readDB(); const savedBooking = (latestDB.bookings || []).find(item => String(item.id) === String(booking.id));
  if (savedBooking) { savedBooking.emailDelivery = booking.emailDelivery; writeDB(latestDB); }
  if (result.status !== 'sent') return res.status(503).json({ error:result.error || I18n.t('Courriel non envoyé'), emailStatus:result.status });
  res.json({ success:true, emailStatus:result.status, booking });
});
app.get('/api/admin/event-requests', adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.eventRequests || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.patch('/api/admin/event-requests/:id', adminOnly, (req, res) => {
  const db = readDB();
  const i = (db.eventRequests || []).findIndex(r => r.id === parseInt(req.params.id));
  if (i === -1) return res.status(404).json({ error: I18n.t('Non trouvé') });
  const current = db.eventRequests[i];
  const allowedStatuses = ['nouvelle','en étude','contactée','devis préparé','paiement prêt','payée','fermée'];
  const nextStatus = allowedStatuses.includes(String(req.body.status || '')) ? String(req.body.status) : current.status;
  const quoteAmount = req.body.quoteAmount === undefined ? Number(current.quoteAmount || 0) : money(Math.max(0, Number(req.body.quoteAmount) || 0));
  db.eventRequests[i] = {
    ...current,
    status:nextStatus,
    adminNote:String(req.body.adminNote ?? current.adminNote ?? '').trim().slice(0, 3000),
    quoteDescription:String(req.body.quoteDescription ?? current.quoteDescription ?? '').trim().slice(0, 3000),
    quoteAmount,
    updatedAt:new Date().toISOString()
  };
  writeDB(db);
  res.json({ success: true, request: db.eventRequests[i] });
});
app.post('/api/admin/event-requests/:id/payment-link', adminOnly, async (req, res) => {
  const db = readDB();
  const request = (db.eventRequests || []).find(item => item.id === parseInt(req.params.id));
  if (!request) return res.status(404).json({ error:I18n.t('Demande non trouvée') });
  if (!isStripeEnabled()) return res.status(503).json({ error:I18n.t('Stripe doit être configuré avant de créer un lien de paiement') });
  const quoteAmount = money(Math.max(0, Number(req.body.quoteAmount ?? request.quoteAmount) || 0));
  if (quoteAmount < 0.5) return res.status(400).json({ error:I18n.t('Entrez un montant de devis valide') });
  request.quoteAmount = quoteAmount;
  request.quoteDescription = String(req.body.quoteDescription ?? request.quoteDescription ?? '').trim().slice(0, 3000);
  request.adminNote = String(req.body.adminNote ?? request.adminNote ?? '').trim().slice(0, 3000);
  const rawToken = crypto.randomBytes(30).toString('hex');
  request.paymentTokenHash = hashToken(rawToken);
  request.paymentLinkCreatedAt = new Date().toISOString();
  request.paymentLinkExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  request.paymentLinkUrl = `${normalizePublicUrl()}/?lang=${I18n.language()}#/event-quote/${rawToken}`;
  request.paymentReference = '';
  request.quotePaymentStatus = 'ready';
  request.status = 'paiement prêt';
  request.updatedAt = new Date().toISOString();
  writeDB(db);
  const emailResult = await sendEventQuotePaymentLinkEmail(request);
  const latest = readDB();
  const saved = (latest.eventRequests || []).find(item => item.id === request.id);
  if (saved) {
    saved.quoteEmailDelivery = { status:emailResult.status, providerId:emailResult.id || '', error:emailResult.error || '', sentAt:emailResult.status === 'sent' ? new Date().toISOString() : '' };
    writeDB(latest);
  }
  res.json({ success:true, request:saved || request, paymentLink:request.paymentLinkUrl, emailStatus:emailResult.status });
});
app.delete('/api/admin/event-requests/:id', adminOnly, (req, res) => { const db=readDB(); db.eventRequests=(db.eventRequests||[]).filter(r=>r.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });

// Bundles CRUD
app.post('/api/admin/bundles', adminOnly, (req, res) => {
  const db=readDB(); if(!db.bundles) db.bundles=[];
  const {name,description,price,originalPrice,image,kitIds,tag}=req.body;
  if(!name||!price) return res.status(400).json({error:I18n.t('Nom et prix requis')});
  const bundle={id:db.bundles.length>0?Math.max(...db.bundles.map(b=>b.id))+1:1,name,description:description||'',price:parseFloat(price),originalPrice:parseFloat(originalPrice)||0,image:image||'',kitIds:kitIds||[],tag:tag||'',createdAt:new Date().toISOString()};
  db.bundles.push(bundle); writeDB(db);
  res.json({success:true,bundle});
});
app.put('/api/admin/bundles/:id', adminOnly, (req, res) => {
  const db=readDB(); const idx=(db.bundles||[]).findIndex(b=>b.id===parseInt(req.params.id));
  if(idx===-1) return res.status(404).json({error:I18n.t('Non trouvé')});
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
function normalizeProductImages(raw, fallback = '') {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(/\r?\n/);
  const cleaned = values.map(value => String(value || '').trim().slice(0, 1000)).filter(value => {
    if (!value || /^javascript:/i.test(value)) return false;
    return /^(https?:\/\/|\/|[a-z0-9_.-]+\/|[a-z0-9_.-]+$)/i.test(value);
  });
  const fallbackValue = String(fallback || '').trim();
  if (!cleaned.length && fallbackValue && !/^javascript:/i.test(fallbackValue)) cleaned.push(fallbackValue.slice(0, 1000));
  return [...new Set(cleaned)].slice(0, 10);
}
function normalizeProductIncludes(raw) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(/\r?\n/);
  return values.map(value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 24);
}
function normalizeProductChoices(raw, prefix) {
  if (!Array.isArray(raw)) return [];
  const used = new Set();
  return raw.slice(0, 16).map((choice, index) => {
    const label = String(choice?.label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label) return null;
    let id = String(choice?.id || `${prefix}-${index + 1}`).replace(/[^a-z0-9_-]/gi, '-').slice(0, 64) || `${prefix}-${index + 1}`;
    while (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    return {
      id,
      label,
      translations:normalizeTranslations(choice.translations),
      description: String(choice?.description || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      priceDelta: money(Math.max(0, Math.min(10000, Number(choice?.priceDelta) || 0)))
    };
  }).filter(Boolean);
}
function getStockQty(kit) {
  return isFiniteNumber(kit.stockQty) ? Number(kit.stockQty) : null;
}
function isKitAvailable(kit) {
  const stock = getStockQty(kit);
  return kit.inStock !== false && (stock === null || stock > 0);
}
function normalizeKitPayload(body, existing = {}) {
  const payload = { ...body, translations:normalizeTranslations(body.translations,existing.translations) };
  delete payload.tags;
  delete payload.badges;
  payload.price = parseFloat(body.price) || 0;
  payload.compareAtPrice = parseFloat(body.compareAtPrice) || parseFloat(body.originalPrice) || 0;
  payload.categoryId = body.categoryId ? parseInt(body.categoryId) : (existing.categoryId || null);
  payload.featured = body.featured === undefined ? !!existing.featured : (body.featured === true || body.featured === 'true');
  payload.shortDesc = body.shortDesc || '';
  payload.description = body.description || '';
  payload.images = normalizeProductImages(body.images ?? existing.images, body.image || existing.image || '');
  payload.image = payload.images[0] || '';
  payload.includes = normalizeProductIncludes(body.includes ?? existing.includes);
  payload.sizeOptions = normalizeProductChoices(body.sizeOptions ?? existing.sizeOptions, 'size');
  payload.addOns = normalizeProductChoices(body.addOns ?? existing.addOns, 'addon');
  delete payload.difficulty;
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
    translations:normalizeTranslations(body.translations,existing.translations),
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
      if (!best) best = { amount: 0, discount: d, label: I18n.field(d,'customerLabel') || I18n.msg`Achetez ${d.buyQty || 1}, obtenez ${d.freeQty || 1} gratuit` };
      continue;
    }
    let amount = 0;
    if (d.type === 'percent') amount = price * Math.min(100, Math.max(0, Number(d.value) || 0)) / 100;
    if (d.type === 'fixed') amount = Math.min(price, Math.max(0, Number(d.value) || 0));
    if (amount > (best?.amount || 0)) best = { amount, discount: d, label: I18n.field(d,'customerLabel') || I18n.field(d,'title') || I18n.t('Rabais') };
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
    stockLabel: !available ? I18n.t('Épuisé') : I18n.t('En stock'),
    salePrice,
    effectivePrice: salePrice ?? (Number(kit.price) || 0),
    originalPrice: Number(kit.price) || 0,
    discountLabel: best?.label || '',
    hasDiscount: !!(best && (best.amount > 0 || best.discount?.type === 'bogo'))
  };
}
function getPublicKits(db) {
  return (db.kits || []).map(k => {
    const enriched = enrichPublicKit(k, db);
    const { stockQty, lowStockThreshold, trackInventory, ...publicKit } = enriched;
    return publicKit;
  });
}
function buildOrderItems(db, rawItems = []) {
  const items = [];
  for (const raw of rawItems) {
    const rawId = String(raw.id || '').trim();
    const qty = Math.max(1, parseInt(raw.qty) || 1);
    if (!rawId) return { error: I18n.t('Article invalide') };

    if (rawId.startsWith('custom-photo-') || rawId.startsWith('custom-bag-') || String(raw.type || '').startsWith('custom-')) {
      const type = String(raw.type || (rawId.startsWith('custom-bag-') ? 'custom-bag' : 'custom-photo'));
      const name = String(raw.name || (type === 'custom-bag' ? I18n.t('Sac personnalisé') : I18n.t('Tableau personnalisé'))).trim();
      const unitPrice = Math.max(0, Number(raw.price) || Number(raw.unitPrice) || 0);
      if (!unitPrice) return { error: I18n.t('Prix invalide pour le produit personnalisé') };
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
      if (!bundle) return { error: I18n.msg`Ensemble non trouvé: ${rawId}` };
      items.push({ id: rawId, bundleId, type: 'bundle', name: bundle.name, translations:bundle.translations, unitPrice: parseFloat(bundle.price) || 0, price: parseFloat(bundle.price) || 0, image: bundle.image || '', qty, kitIds: bundle.kitIds || [] });
      continue;
    }

    const kitId = parseInt(rawId);
    const kit = (db.kits || []).find(k => k.id === kitId);
    if (!kit) return { error: I18n.msg`Kit non trouvé: ${rawId}` };
    if (!isKitAvailable(kit)) return { error: I18n.msg`${kit.name} est épuisé` };
    const stock = getStockQty(kit);
    if (stock !== null && qty > stock) return { error: I18n.msg`Il reste seulement ${stock} ${kit.name}` };
    items.push({ id: String(kit.id), kitId: kit.id, type: 'kit', categoryId: kit.categoryId, tags: kit.tags || [], name: kit.name,
      translations:kit.translations, unitPrice: parseFloat(kit.price) || 0, price: parseFloat(kit.price) || 0, image: kit.image || '', qty });
  }
  return { items };
}

function discountAmountForItem(discount, kitLike, item) {
  const qty = Number(item.qty) || 1;
  const unitPrice = Number(item.unitPrice) || Number(item.price) || 0;
  const line = unitPrice * qty;
  const discountUnitPrice = Number(item.discountBaseUnitPrice ?? unitPrice) || 0;
  const discountLine = discountUnitPrice * qty;
  if (!discountAppliesToKit(discount, kitLike)) return 0;
  if (qty < (discount.minQty || 1)) return 0;
  if (discount.type === 'percent') return discountLine * Math.min(100, Math.max(0, Number(discount.value) || 0)) / 100;
  if (discount.type === 'fixed') return Math.min(discountLine, Math.max(0, Number(discount.value) || 0) * qty);
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
    return { ...item, originalUnitPrice: Number(item.unitPrice) || 0, discountAmount: itemDiscount, discountLabel: I18n.field(best.discount,'customerLabel') || I18n.field(best.discount,'title') || '', lineSubtotal, lineTotal: money(lineSubtotal - itemDiscount) };
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
    if (!isKitAvailable(kit)) return { error: I18n.msg`${kit.name} est épuisé` };
    const stock = getStockQty(kit);
    if (stock !== null && qty > stock) return { error: I18n.msg`Inventaire insuffisant pour ${kit.name}. Reste: ${stock}` };
  }
  for (const [kitId, qty] of needs.entries()) {
    const kit = findKit(db, kitId);
    if (kit) updateKitStock(kit, -qty, db, orderId, I18n.t('Commande client'));
  }
  return { success: true };
}
function releaseInventoryForItems(db, items, orderId, reason = I18n.t('Retour stock')) {
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
function isTicketPaymentEnabled() {
  return isStripeEnabled() && Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || '').trim());
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
    if (!secret) return reject(new Error(I18n.t('STRIPE_SECRET_KEY manquant')));
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
    description: I18n.msg`Commande Arty ${order.id}`,
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
      releaseInventoryForItems(db, order.items || [], order.id, I18n.t('Paiement Stripe annulé'));
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
  if (!secret) return false;
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=').map(x => x.trim())).filter(p => p.length === 2));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  if (!Number.isFinite(Number(timestamp)) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
async function handleStripeWebhook(req, res) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!secret) return res.status(503).send('Stripe webhook is not configured');
    if (!verifyStripeSignature(req.body, req.headers['stripe-signature'], secret)) {
      return res.status(400).send('Webhook signature verification failed');
    }
    const event = JSON.parse(req.body.toString('utf8'));
    const db = readDB();
    const obj = event.data?.object || {};
    if (event.type && event.type.startsWith('payment_intent.')) {
      const order = syncOrderFromStripePaymentIntent(db, obj, 'webhook:' + event.type);
      const eventRequest = syncEventRequestFromStripePaymentIntent(db, obj, 'webhook:' + event.type);
      if (order?.paymentStatus === 'paid') ensurePaidOrderBookings(db, order);
      if (order?.paymentStatus === 'cancelled') { releaseEventSeatsForOrder(db, order); cancelOrderTicketBookings(db, order); }
      writeDB(db);
      if (order?.paymentStatus === 'paid') await deliverPaidOrderCommunications(order.id, 'stripe-webhook');
      if (eventRequest?.quotePaymentStatus === 'paid') await deliverEventQuotePaidEmail(eventRequest.id);
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
    const name = item.name || I18n.t('Produit');
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
    translations:normalizeTranslations(body.translations),
    appliesTo: ['all','group','event','wedding'].includes(body.appliesTo) ? body.appliesTo : 'all',
    minQty: Math.max(1, parseInt(body.minQty) || 1),
    percent: Math.max(0, Math.min(90, Number(body.percent) || 0)),
    customTextFee: Math.max(0, Number(body.customTextFee) || 0),
    active: body.active !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!rule.label) return res.status(400).json({ error: I18n.t('Nom de règle requis') });
  db.bundleDealRules = Array.isArray(db.bundleDealRules) && db.bundleDealRules.length ? db.bundleDealRules : defaultBundleDealRules();
  db.bundleDealRules.push(rule);
  writeDB(db);
  res.json({ success: true, rule });
});
app.put('/api/admin/bundle-deals/:id', adminOnly, (req, res) => {
  const db = readDB();
  db.bundleDealRules = Array.isArray(db.bundleDealRules) && db.bundleDealRules.length ? db.bundleDealRules : defaultBundleDealRules();
  const i = db.bundleDealRules.findIndex(r => String(r.id) === String(req.params.id));
  if (i === -1) return res.status(404).json({ error: I18n.t('Règle non trouvée') });
  const body = req.body || {};
  db.bundleDealRules[i] = {
    ...db.bundleDealRules[i],
    translations:normalizeTranslations(body.translations,db.bundleDealRules[i].translations),
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
    if (!isKitAvailable(kit)) return { error: I18n.msg`${kit.name} est épuisé` };
    const stock = getStockQty(kit);
    if (stock !== null && qty > stock) return { error: I18n.msg`Inventaire insuffisant pour ${kit.name}. Reste: ${stock}` };
  }
  for (const [kitId, qty] of needs.entries()) {
    const kit = findKit(db, kitId);
    if (!kit) continue;
    updateKitStock(kit, -qty, db, orderId, I18n.t('Commande / forfait client'));
  }
  return { success: true };
}

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
if (require.main === module) app.listen(PORT, () => console.log(`Arty! server → http://localhost:${PORT}`));

// ===== FINAL SERVER-SIDE PACKAGE PRICING OVERRIDE =====
// Do not trust client totals for custom bundles/events. Recalculate from kit prices and bundle deal rules.
function effectiveKitUnitPriceForPackage(db, kit) {
  const base = Number(kit?.price) || 0;
  const best = typeof getBestSingleKitDiscount === 'function' ? getBestSingleKitDiscount(db, kit) : null;
  const amount = best && Number(best.amount) > 0 ? Number(best.amount) : 0;
  return money(Math.max(0, base - amount));
}
function bestBundleDealRuleServer(db, totalQty, purpose) {
  const rules = (typeof getBundleDealRules === 'function' ? getBundleDealRules(db) : (db.bundleDealRules || []))
    .filter(r => r && r.active !== false)
    .sort((a,b)=>(Number(b.minQty)||0)-(Number(a.minQty)||0));
  return rules.find(r => totalQty >= (Number(r.minQty)||1) && ((r.appliesTo||'all') === 'all' || (r.appliesTo||'all') === purpose)) || null;
}
function calculateCustomPackageItem(db, raw, type) {
  const cd = raw.customData && typeof raw.customData === 'object' ? raw.customData : {};
  const purpose = type === 'custom-event-package'
    ? (cd.eventType === 'wedding' ? 'wedding' : 'event')
    : (['group','event','wedding'].includes(cd.purpose) ? cd.purpose : 'group');
  const rawItems = Array.isArray(cd.items) ? cd.items : [];
  const cleanItems = [];
  for (const rawItem of rawItems) {
    const kitId = parseInt(rawItem.kitId);
    const qty = Math.max(0, parseInt(rawItem.qty) || 0);
    if (!kitId || qty <= 0) continue;
    const kit = (db.kits || []).find(k => Number(k.id) === Number(kitId));
    if (!kit) return { error: I18n.msg`Kit non trouvé dans le forfait: ${kitId}` };
    if (!isKitAvailable(kit)) return { error: I18n.msg`${kit.name} est épuisé` };
    const unitPrice = effectiveKitUnitPriceForPackage(db, kit);
    cleanItems.push({ kitId: kit.id, name: kit.name,
      translations:kit.translations, qty, unitPrice, lineTotal: money(unitPrice * qty) });
  }
  const totalQty = cleanItems.reduce((s,i)=>s+i.qty,0);
  if (!totalQty) return { error: I18n.t('Sélectionnez au moins un produit pour le forfait') };
  const subtotal = money(cleanItems.reduce((s,i)=>s+i.lineTotal,0));
  const rule = bestBundleDealRuleServer(db, totalQty, purpose);
  const percent = rule ? Math.max(0, Math.min(90, Number(rule.percent)||0)) : 0;
  const discount = money(subtotal * percent / 100);
  const customText = String(cd.customText || '').trim().slice(0, 90);
  const customTextFee = customText ? money(Number(rule?.customTextFee ?? 12) || 0) : 0;
  const total = money(Math.max(0, subtotal - discount + customTextFee));
  const name = type === 'custom-event-package'
    ? I18n.msg`Événement ${String(cd.eventLabel || I18n.t('personnalisé')).trim()} (${totalQty} kits)`
    : I18n.msg`Forfait personnalisé (${totalQty} kits)`;
  return {
    id: String(raw.id || `${type}-${Date.now()}`),
    type,
    name,
    unitPrice: total,
    price: total,
    image: String(raw.image || '').trim(),
    qty: Math.max(1, parseInt(raw.qty) || 1),
    customData: {
      ...cd,
      purpose,
      customText,
      subtotal,
      discount,
      customTextFee,
      discountRule: rule || null,
      serverPriced: true,
      items: cleanItems
    }
  };
}
function resolveProductConfiguration(kit, raw) {
  const input = raw.customData && typeof raw.customData === 'object' ? raw.customData : {};
  const sizeOptions = Array.isArray(kit.sizeOptions) ? kit.sizeOptions : [];
  const addOns = Array.isArray(kit.addOns) ? kit.addOns : [];
  const requestedSizeId = String(input.sizeId || '').trim();
  const requestedAddOnIds = [...new Set(Array.isArray(input.addOnIds) ? input.addOnIds.map(id => String(id).trim()).filter(Boolean) : [])];
  let selectedSize = null;
  if (sizeOptions.length) {
    selectedSize = sizeOptions.find(option => String(option.id) === requestedSizeId);
    if (!selectedSize) return { error: I18n.msg`Choisissez un format valide pour ${kit.name}` };
  }
  const selectedAddOns = requestedAddOnIds.map(id => addOns.find(option => String(option.id) === id));
  if (selectedAddOns.some(option => !option)) return { error: I18n.msg`Une option choisie pour ${kit.name} n’est plus disponible` };
  const sizePrice = Math.max(0, Number(selectedSize?.priceDelta) || 0);
  const addOnPrice = selectedAddOns.reduce((sum, option) => sum + Math.max(0, Number(option.priceDelta) || 0), 0);
  const configured = Boolean(selectedSize || selectedAddOns.length);
  return {
    extraPrice: money(sizePrice + addOnPrice),
    customData: configured ? {
      kind: 'configured-kit',
      kitId: kit.id,
      sizeId: selectedSize?.id || '',
      sizeLabel: selectedSize?.label || '',
      addOnIds: selectedAddOns.map(option => option.id),
      addOnLabels: selectedAddOns.map(option => option.label),
      selectionLabel: [selectedSize?.label, ...selectedAddOns.map(option => option.label)].filter(Boolean).join(' · ')
    } : null
  };
}
function buildEventTicketItem(db, raw, qty) {
  const input = raw.customData && typeof raw.customData === 'object' ? raw.customData : {};
  const eventId = Number(input.eventId || /^event-ticket-(\d+)/.exec(String(raw.id || ''))?.[1]);
  const event = (db.events || []).find(item => Number(item.id) === eventId);
  if (!event || (event.status || 'published') !== 'published') return { error:I18n.t('Cet événement n’est plus disponible') };
  const cleanQty = Math.max(1, Math.min(10, parseInt(qty) || 1));
  const available = Math.max(0, (parseInt(event.maxSpots) || 0) - (parseInt(event.bookedSpots) || 0));
  if (cleanQty > available) return { error:I18n.msg`Il reste seulement ${available} billet${available > 1 ? 's' : ''} pour ${event.title}` };
  const unitPrice = money(Math.max(0, Number(event.price) || 0));
  return {
    id:`event-ticket-${event.id}`,
    eventId:event.id,
    type:'event-ticket',
    name:`Billet — ${event.title}`,
    translations:{en:{name:I18n.t('Billet — {0}',[localizeCatalog(event,'en').title],'en')}},
    unitPrice,
    price:unitPrice,
    image:String(event.image || '').trim(),
    qty:cleanQty,
    customData:{
      kind:'event-ticket',
      eventId:event.id,
      eventDate:event.date || '',
      eventTime:event.time || '',
      eventLocation:event.location || ''
    }
  };
}
function buildOrderItems(db, rawItems = []) {
  const items = [];
  for (const raw of rawItems) {
    const rawId = String(raw.id || '').trim();
    const rawType = String(raw.type || '').trim();
    const qty = Math.max(1, parseInt(raw.qty) || 1);
    if (!rawId) return { error: I18n.t('Article invalide') };

    if (rawType === 'event-ticket' || rawId.startsWith('event-ticket-')) {
      const built = buildEventTicketItem(db, raw, qty);
      if (built.error) return built;
      items.push(built);
      continue;
    }
    if (rawType === 'custom-bundle' || rawId.startsWith('client-bundle-')) {
      const built = calculateCustomPackageItem(db, { ...raw, qty }, 'custom-bundle');
      if (built.error) return built;
      items.push(built);
      continue;
    }
    if (rawType === 'custom-event-package' || rawId.startsWith('event-package-')) {
      const built = calculateCustomPackageItem(db, { ...raw, qty }, 'custom-event-package');
      if (built.error) return built;
      items.push(built);
      continue;
    }
    if (rawId.startsWith('custom-photo-') || rawId.startsWith('custom-bag-') || rawType === 'custom-photo' || rawType === 'custom-bag') {
      const type = rawType || (rawId.startsWith('custom-bag-') ? 'custom-bag' : 'custom-photo');
      const name = String(raw.name || (type === 'custom-bag' ? I18n.t('Sac personnalisé') : I18n.t('Tableau personnalisé'))).trim();
      const unitPrice = Math.max(0, Number(raw.price) || Number(raw.unitPrice) || 0);
      if (!unitPrice) return { error: I18n.t('Prix invalide pour le produit personnalisé') };
      items.push({ id: rawId, type, name, unitPrice: money(unitPrice), price: money(unitPrice), image: String(raw.image || '').trim(), qty, customData: raw.customData && typeof raw.customData === 'object' ? raw.customData : {} });
      continue;
    }
    if (rawId.startsWith('bundle-')) {
      const bundleId = parseInt(rawId.replace('bundle-', ''));
      const bundle = (db.bundles || []).find(b => Number(b.id) === Number(bundleId));
      if (!bundle) return { error: I18n.msg`Ensemble non trouvé: ${rawId}` };
      items.push({ id: rawId, bundleId, type: 'bundle', name: bundle.name, translations:bundle.translations, unitPrice: money(parseFloat(bundle.price) || 0), price: money(parseFloat(bundle.price) || 0), image: bundle.image || '', qty, kitIds: bundle.kitIds || [] });
      continue;
    }
    const configuredKitId = raw.customData && typeof raw.customData === 'object' ? raw.customData.kitId : null;
    const prefixedKitId = /^kit-(\d+)/.exec(rawId)?.[1];
    const kitId = parseInt(configuredKitId || prefixedKitId || rawId);
    const kit = (db.kits || []).find(k => Number(k.id) === Number(kitId));
    if (!kit) return { error: I18n.msg`Kit non trouvé: ${rawId}` };
    if (!isKitAvailable(kit)) return { error: I18n.msg`${kit.name} est épuisé` };
    const stock = getStockQty(kit);
    if (stock !== null && qty > stock) return { error: I18n.msg`Il reste seulement ${stock} ${kit.name}` };
    const configured = resolveProductConfiguration(kit, raw);
    if (configured.error) return configured;
    const basePrice = money(Math.max(0, Number(kit.price) || 0));
    const unitPrice = money(basePrice + configured.extraPrice);
    items.push({
      id: rawId,
      kitId: kit.id,
      type: 'kit',
      categoryId: kit.categoryId,
      name: kit.name,
      translations:kit.translations,
      unitPrice,
      price: unitPrice,
      discountBaseUnitPrice: basePrice,
      image: (Array.isArray(kit.images) && kit.images[0]) || kit.image || '',
      qty,
      customData: configured.customData
    });
  }
  return { items };
}

module.exports = { app, readDB, writeDB, publicTicketRecord, buildTicketEmailHTML, buildOrderConfirmationEmailHTML, sendAccountWelcomeEmail, sendLoginAlertEmail, sendPasswordResetEmail, sendPasswordChangedEmail, sendEventRequestReceiptEmail, sendEventQuotePaymentLinkEmail, sendEventQuotePaidEmail, sendSupportRequestReceiptEmail, sendSupportReplyEmail, sendContactReceiptEmail, deliverOrderStatusEmail };
