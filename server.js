const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
  sessions: []
};

const APP_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = path.resolve(
  process.env.ARTY_DATA_DIR ||
  process.env.DATA_DIR ||
  process.env.RENDER_DISK_PATH ||
  APP_DATA_DIR
);
const DB_PATH = path.resolve(process.env.ARTY_DB_PATH || path.join(DATA_DIR, 'db.json'));
const DB_DIR = path.dirname(DB_PATH);
const DB_BACKUP_PATH = `${DB_PATH}.bak`;

function ensureDBDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
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
    sessions: Array.isArray(db.sessions) ? db.sessions : []
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
console.log(`Arty DB path: ${DB_PATH}`);

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
function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`, resp => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => { try { const i = JSON.parse(data); if (i.error) reject(new Error(i.error_description)); else resolve({ email:i.email, name:i.name||i.email.split('@')[0], picture:i.picture }); } catch(e){ reject(e); } });
    }).on('error', reject);
  });
}

// ========== PUBLIC ==========
app.get('/api/config', (req, res) => res.json({ googleClientId: readDB().googleClientId || '' }));
app.get('/api/kits', (req, res) => res.json(readDB().kits));
app.get('/api/kits/:id', (req, res) => { const k = readDB().kits.find(k => k.id === parseInt(req.params.id)); k ? res.json(k) : res.status(404).json({ error: 'Non trouvé' }); });
app.get('/api/categories', (req, res) => res.json(readDB().categories || []));
app.get('/api/events', (req, res) => res.json(readDB().events));
app.get('/api/team-activities', (req, res) => res.json(readDB().teamActivities || []));
app.get('/api/bundles', (req, res) => res.json(readDB().bundles || []));
app.get('/api/bundles/:id', (req, res) => { const b = (readDB().bundles||[]).find(b=>b.id===parseInt(req.params.id)); b ? res.json(b) : res.status(404).json({error:'Non trouvé'}); });

// ========== AUTH ==========
app.post('/api/users/register', async (req, res) => {
  try {
    const db = readDB(); const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe: 6+ caractères' });
    if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Courriel déjà utilisé' });
    const hashed = await bcrypt.hash(password, 10);
    const isAdmin = (db.adminEmails||[]).includes(email);
    const user = { id: Date.now(), name, email, password: hashed, role: isAdmin ? 'admin' : 'user', provider: 'local', picture: '', createdAt: new Date().toISOString() };
    db.users.push(user); writeDB(db);
    const token = createToken(user);
    res.json({ success: true, token, user: { id:user.id, name:user.name, email:user.email, role:user.role, picture:user.picture, provider:user.provider } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const db = readDB(); const { email, password } = req.body;
    const user = db.users.find(u => u.email === email && u.provider === 'local');
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
    let user = db.users.find(u => u.email === g.email);
    if (!user) {
      user = { id: Date.now(), name:g.name, email:g.email, password:'', role:(db.adminEmails||[]).includes(g.email)?'admin':'user', provider:'google', picture:g.picture||'', createdAt:new Date().toISOString() };
      db.users.push(user); writeDB(db);
    }
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

// ========== ORDERS & BOOKINGS ==========
app.post('/api/orders', auth, (req, res) => {
  const db = readDB(); const {items,address,total} = req.body;
  if(!items||!items.length) return res.status(400).json({error:'Aucun article'});
  const order = { id:'ARTY-'+Date.now().toString(36).toUpperCase(), userId:req.session.userId, items, address:address||'', total:parseFloat(total)||0, status:'confirmée', createdAt:new Date().toISOString() };
  if(!db.orders) db.orders=[]; db.orders.push(order); writeDB(db);
  res.json({success:true,order});
});
app.get('/api/orders/mine', auth, (req, res) => { const db=readDB(); res.json((db.orders||[]).filter(o=>o.userId===req.session.userId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))); });
app.post('/api/bookings', (req, res) => {
  const db=readDB(); const {userId,eventId,name,email,guests}=req.body;
  const ev=db.events.find(e=>e.id===parseInt(eventId)); if(!ev) return res.status(404).json({error:'Événement non trouvé'});
  if(ev.bookedSpots>=ev.maxSpots) return res.status(400).json({error:'Complet'});
  const b={id:Date.now(),userId:userId||null,eventId:parseInt(eventId),name,email,guests:parseInt(guests)||1,bookedAt:new Date().toISOString(),status:'confirmée'};
  ev.bookedSpots+=b.guests; db.bookings.push(b); writeDB(db);
  res.json({success:true,booking:b});
});
app.get('/api/bookings/mine', auth, (req, res) => { const db=readDB(); res.json(db.bookings.filter(b=>b.userId===req.session.userId).map(b=>({...b,event:db.events.find(e=>e.id===b.eventId)})).sort((a,b)=>new Date(b.bookedAt)-new Date(a.bookedAt))); });
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

// ========== ADMIN ==========
app.get('/api/admin/stats', adminOnly, (req, res) => { const db=readDB(); res.json({totalKits:db.kits.length,totalEvents:db.events.length,totalUsers:db.users.length,totalOrders:(db.orders||[]).length,totalCategories:(db.categories||[]).length}); });
app.get('/api/admin/storage', adminOnly, (req, res) => { res.json({ dbPath: DB_PATH, dataDir: DATA_DIR, backupPath: DB_BACKUP_PATH, usingPersistentPath: DB_DIR !== APP_DATA_DIR, dbExists: fs.existsSync(DB_PATH), backupExists: fs.existsSync(DB_BACKUP_PATH) }); });

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
app.post('/api/admin/events', adminOnly, (req, res) => { const db=readDB(); const {title,date}=req.body; if(!title||!date) return res.status(400).json({error:'Titre et date requis'}); const ev={id:db.events.length>0?Math.max(...db.events.map(e=>e.id))+1:1,...req.body,price:parseFloat(req.body.price)||0,maxSpots:parseInt(req.body.maxSpots)||20,bookedSpots:0}; db.events.push(ev); writeDB(db); res.json({success:true,event:ev}); });
app.put('/api/admin/events/:id', adminOnly, (req, res) => { const db=readDB(); const i=db.events.findIndex(e=>e.id===parseInt(req.params.id)); if(i===-1) return res.status(404).json({error:'Non trouvé'}); db.events[i]={...db.events[i],...req.body,id:db.events[i].id}; writeDB(db); res.json({success:true,event:db.events[i]}); });
app.delete('/api/admin/events/:id', adminOnly, (req, res) => { const db=readDB(); db.events=db.events.filter(e=>e.id!==parseInt(req.params.id)); writeDB(db); res.json({success:true}); });

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

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Arty! server → http://localhost:${PORT}`));