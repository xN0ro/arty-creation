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

// --- DB ---
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch { const d = { adminEmails:[], googleClientId:'', kits:[], events:[], users:[], orders:[], bookings:[] }; writeDB(d); return d; }
}
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

// --- Simple token store (in-memory, resets on restart) ---
const sessions = new Map();
function createToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, email: user.email, role: user.role || 'user' });
  return token;
}

// Auth middleware - extracts user from token
function auth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Not authenticated' });
  req.session = sessions.get(token);
  next();
}

// Admin middleware
function adminOnly(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Not authenticated' });
  const s = sessions.get(token);
  if (s.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  req.session = s;
  next();
}

// --- Google token verification ---
function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try {
          const info = JSON.parse(data);
          if (info.error) return reject(new Error(info.error_description || 'Invalid token'));
          resolve({ email: info.email, name: info.name || info.email.split('@')[0], picture: info.picture });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ===================== PUBLIC API =====================

app.get('/api/kits', (req, res) => res.json(readDB().kits));
app.get('/api/kits/:id', (req, res) => {
  const kit = readDB().kits.find(k => k.id === parseInt(req.params.id));
  kit ? res.json(kit) : res.status(404).json({ error: 'Kit not found' });
});
app.get('/api/events', (req, res) => res.json(readDB().events));
app.get('/api/events/:id', (req, res) => {
  const ev = readDB().events.find(e => e.id === parseInt(req.params.id));
  ev ? res.json(ev) : res.status(404).json({ error: 'Event not found' });
});

// --- Config (sends google client ID to frontend) ---
app.get('/api/config', (req, res) => {
  const db = readDB();
  res.json({ googleClientId: db.googleClientId || '' });
});

// --- Register (local) ---
app.post('/api/users/register', async (req, res) => {
  try {
    const db = readDB();
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
    if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const isAdmin = db.adminEmails.includes(email);
    const user = {
      id: Date.now(), name, email, password: hashed,
      role: isAdmin ? 'admin' : 'user',
      provider: 'local', picture: '',
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    writeDB(db);

    const token = createToken(user);
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, picture: user.picture, provider: user.provider };
    res.json({ success: true, token, user: safe });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Login (local) ---
app.post('/api/users/login', async (req, res) => {
  try {
    const db = readDB();
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = db.users.find(u => u.email === email && u.provider === 'local');
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = createToken(user);
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, picture: user.picture, provider: user.provider };
    res.json({ success: true, token, user: safe });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Google Sign-In ---
app.post('/api/users/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'No credential provided' });

    const gUser = await verifyGoogleToken(credential);
    const db = readDB();

    let user = db.users.find(u => u.email === gUser.email);
    if (!user) {
      const isAdmin = db.adminEmails.includes(gUser.email);
      user = {
        id: Date.now(), name: gUser.name, email: gUser.email,
        password: '', role: isAdmin ? 'admin' : 'user',
        provider: 'google', picture: gUser.picture || '',
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      writeDB(db);
    } else if (user.provider !== 'google') {
      // Link google to existing account
      user.provider = 'google';
      user.picture = gUser.picture || user.picture;
      writeDB(db);
    }

    const token = createToken(user);
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, picture: user.picture, provider: user.provider };
    res.json({ success: true, token, user: safe });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Google authentication failed: ' + err.message });
  }
});

// --- Logout ---
app.post('/api/users/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// --- Profile ---
app.get('/api/users/me', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, picture: user.picture, provider: user.provider, createdAt: user.createdAt });
});

app.put('/api/users/me', auth, async (req, res) => {
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const { name, currentPassword, newPassword } = req.body;
  if (name) db.users[idx].name = name;
  if (newPassword && db.users[idx].provider === 'local') {
    if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
    const match = await bcrypt.compare(currentPassword, db.users[idx].password);
    if (!match) return res.status(400).json({ error: 'Current password is wrong' });
    db.users[idx].password = await bcrypt.hash(newPassword, 10);
  }
  writeDB(db);
  const u = db.users[idx];
  res.json({ success: true, user: { id: u.id, name: u.name, email: u.email, role: u.role, picture: u.picture, provider: u.provider } });
});

// --- Orders ---
app.post('/api/orders', auth, (req, res) => {
  const db = readDB();
  const { items, address, total } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items' });
  const order = {
    id: 'ARTY-' + Date.now().toString(36).toUpperCase(),
    userId: req.session.userId,
    items, address: address || '',
    total: parseFloat(total) || 0,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  if (!db.orders) db.orders = [];
  db.orders.push(order);
  writeDB(db);
  res.json({ success: true, order });
});

app.get('/api/orders/mine', auth, (req, res) => {
  const db = readDB();
  const orders = (db.orders || []).filter(o => o.userId === req.session.userId);
  res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// --- Bookings ---
app.post('/api/bookings', (req, res) => {
  const db = readDB();
  const { userId, eventId, name, email, guests } = req.body;
  const event = db.events.find(e => e.id === parseInt(eventId));
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.bookedSpots >= event.maxSpots) return res.status(400).json({ error: 'Fully booked' });
  const booking = { id: Date.now(), userId: userId||null, eventId: parseInt(eventId), name, email, guests: parseInt(guests)||1, bookedAt: new Date().toISOString(), status: 'confirmed' };
  event.bookedSpots += booking.guests;
  db.bookings.push(booking);
  writeDB(db);
  res.json({ success: true, booking });
});

app.get('/api/bookings/mine', auth, (req, res) => {
  const db = readDB();
  const bookings = db.bookings.filter(b => b.userId === req.session.userId);
  const enriched = bookings.map(b => ({ ...b, event: db.events.find(e => e.id === b.eventId) }));
  res.json(enriched.sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt)));
});

// --- Contact ---
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message required' });
  console.log('Contact:', { name, email, subject, message });
  res.json({ success: true, message: 'Thank you! We\'ll get back to you soon.' });
});

// ===================== ADMIN API =====================

app.get('/api/admin/stats', adminOnly, (req, res) => {
  const db = readDB();
  res.json({ totalKits: db.kits.length, totalEvents: db.events.length, totalUsers: db.users.length, totalBookings: db.bookings.length, totalOrders: (db.orders||[]).length });
});

app.post('/api/admin/kits', adminOnly, (req, res) => {
  const db = readDB();
  const { name, description, shortDesc, price, category, image, images, videoUrl, videoTitle, difficulty, includes } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });
  const kit = {
    id: db.kits.length > 0 ? Math.max(...db.kits.map(k => k.id)) + 1 : 1,
    name, description: description||'', shortDesc: shortDesc||'', price: parseFloat(price),
    category: category||'general', image: image||'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600',
    images: images||[], videoUrl: videoUrl||'', videoTitle: videoTitle||'',
    difficulty: difficulty||'All Levels', includes: includes||[], inStock: true, featured: false
  };
  db.kits.push(kit); writeDB(db);
  res.json({ success: true, kit });
});

app.put('/api/admin/kits/:id', adminOnly, (req, res) => {
  const db = readDB();
  const idx = db.kits.findIndex(k => k.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.kits[idx] = { ...db.kits[idx], ...req.body, id: db.kits[idx].id };
  writeDB(db); res.json({ success: true, kit: db.kits[idx] });
});

app.delete('/api/admin/kits/:id', adminOnly, (req, res) => {
  const db = readDB();
  db.kits = db.kits.filter(k => k.id !== parseInt(req.params.id));
  writeDB(db); res.json({ success: true });
});

app.post('/api/admin/events', adminOnly, (req, res) => {
  const db = readDB();
  const { title, description, date, time, duration, location, price, maxSpots, image, category } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
  const event = {
    id: db.events.length > 0 ? Math.max(...db.events.map(e => e.id)) + 1 : 1,
    title, description: description||'', date, time: time||'18:00', duration: duration||'2 hours',
    location: location||'Arty! Studio Downtown', price: parseFloat(price)||0,
    maxSpots: parseInt(maxSpots)||20, bookedSpots: 0,
    image: image||'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=600',
    category: category||'social'
  };
  db.events.push(event); writeDB(db);
  res.json({ success: true, event });
});

app.put('/api/admin/events/:id', adminOnly, (req, res) => {
  const db = readDB();
  const idx = db.events.findIndex(e => e.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.events[idx] = { ...db.events[idx], ...req.body, id: db.events[idx].id };
  writeDB(db); res.json({ success: true, event: db.events[idx] });
});

app.delete('/api/admin/events/:id', adminOnly, (req, res) => {
  const db = readDB();
  db.events = db.events.filter(e => e.id !== parseInt(req.params.id));
  writeDB(db); res.json({ success: true });
});

// Catch-all
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Arty! server running on http://localhost:${PORT}`));