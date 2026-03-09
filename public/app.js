/* Arty! — Full SPA Application */

let currentUser=null, authToken=null, allKits=[], allEvents=[], currentFilter='all', calendarDate=new Date(), cart=[], googleClientId='';

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  authToken = localStorage.getItem('arty_token');
  const u = localStorage.getItem('arty_user');
  if (u) currentUser = JSON.parse(u);

  const c = localStorage.getItem('arty_cart');
  if (c) cart = JSON.parse(c);

  // Load config (google client ID)
  try { const r = await fetch('/api/config'); const d = await r.json(); googleClientId = d.googleClientId; } catch {}

  if (authToken && currentUser) {
    try { const r = await fetch('/api/users/me', { headers: authHeaders() }); if (!r.ok) throw 0; const d = await r.json(); currentUser = d; localStorage.setItem('arty_user', JSON.stringify(d)); } catch { logout(true); }
  }

  await loadKits(); await loadEvents(); initNavbar(); updateAuthUI(); updateCartUI(); initGoogleSignIn();
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
});

function authHeaders() { return authToken ? { 'Authorization': 'Bearer '+authToken, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }; }

// ===================== SPA ROUTER =====================
function navigate(hash) { window.location.hash = hash; }

function handleRoute() {
  const hash = window.location.hash || '#/';
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => p.classList.remove('active'));

  const footer = document.getElementById('mainFooter');
  footer.style.display = '';

  if (hash === '#/inventory') {
    document.getElementById('page-inventory').classList.add('active');
    renderInventory();
    window.scrollTo(0, 0);
  } else if (hash.startsWith('#/product/')) {
    // THIS is the missing product logic
    document.getElementById('page-product').classList.add('active');
    const id = parseInt(hash.split('/')[2]);
    renderProductPage(id);
    window.scrollTo(0, 0);
  } else if (hash === '#/profile') {
    // THIS is the missing profile logic
    if (!currentUser) { navigate('#/'); openModal('auth'); return; }
    document.getElementById('page-profile').classList.add('active');
    renderProfilePage();
    window.scrollTo(0, 0);
  } else if (hash === '#/admin') {
    if (!currentUser || currentUser.role !== 'admin') { navigate('#/'); showToast('Admin access required','error'); return; }
    document.getElementById('page-admin').classList.add('active');
    footer.style.display = 'none';
    loadAdminData();
    window.scrollTo(0, 0);
  } else {
    document.getElementById('page-home').classList.add('active');
    initScrollEffects();
    // Check if there's a section to scroll to
    const section = hash.replace('#/','');
    if (section && document.getElementById(section)) {
      setTimeout(() => document.getElementById(section).scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }
}

function scrollToSection(id) {
  if (window.location.hash !== '#/' && !window.location.hash.startsWith('#/'+id)) {
    navigate('#/');
    setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior:'smooth' }); }, 200);
  } else {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior:'smooth' });
  }
}

// ===================== NAVBAR =====================
function initNavbar() {
  window.addEventListener('scroll', () => document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 60));
  // Close dropdown on outside click
  document.addEventListener('click', e => { if (!e.target.closest('.nav-dropdown')) document.querySelectorAll('.nav-dropdown-menu').forEach(m => m.classList.remove('open')); });
}
function toggleMobile() { document.getElementById('navLinks').classList.toggle('open'); document.getElementById('navAuth').classList.toggle('open'); }

// Nav links with section scrolling
document.querySelectorAll('.nav-links a[data-nav]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const section = a.dataset.nav;
    document.getElementById('navLinks').classList.remove('open');
    document.getElementById('navAuth').classList.remove('open');
    if (section === 'home') { navigate('#/'); window.scrollTo({ top: 0, behavior:'smooth' }); }
    else scrollToSection(section);
  });
});

function toggleDropdown() {
  const menu = document.querySelector('.nav-dropdown-menu');
  if (menu) menu.classList.toggle('open');
}

function updateAuthUI() {
  const a = document.getElementById('navAuth');
  const cartH = `<button class="btn-cart" onclick="openCart()" id="cartBtn" style="${cart.length?'display:flex':'display:none'}">🛒 <span id="cartCount">${cart.reduce((s,i)=>s+i.qty,0)}</span></button>`;
  if (currentUser) {
    const avatar = currentUser.picture ? `<img src="${currentUser.picture}" alt="">` : currentUser.name.charAt(0).toUpperCase();
    const adminLink = currentUser.role === 'admin' ? `<a href="#/admin" class="admin-link">⚙️ Admin Panel</a>` : '';
    a.innerHTML = `${cartH}
      <div class="nav-dropdown">
        <div class="nav-user" onclick="toggleDropdown()">
          <div class="nav-user-avatar">${avatar}</div>
          <span class="nav-user-name">${currentUser.name.split(' ')[0]}</span>
        </div>
        <div class="nav-dropdown-menu">
          <a href="#/profile">👤 My Profile</a>
          ${adminLink}
          <button class="logout-btn" onclick="logout()">🚪 Logout</button>
        </div>
      </div>`;
  } else {
    a.innerHTML = `${cartH}<button class="btn btn-ghost btn-sm" onclick="openModal('auth')">Sign In</button><button class="btn btn-orange btn-sm" onclick="openModal('auth','register')">Join Free</button>`;
  }
}

// ===================== GOOGLE SIGN-IN =====================
function initGoogleSignIn() {
  if (!googleClientId || googleClientId === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    // No Google configured — show a placeholder button
    document.getElementById('googleBtnWrap').innerHTML = `<button class="google-btn" onclick="showToast('Google Sign-In not configured yet. Add your Client ID in data/db.json','error')" style="opacity:.5">
      <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Continue with Google</button>`;
    return;
  }
  try {
    google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleResponse });
    const wrap = document.getElementById('googleBtnWrap');
    wrap.innerHTML = '';
    google.accounts.id.renderButton(wrap, { theme:'filled_black', size:'large', width:380, text:'continue_with', shape:'pill' });
  } catch (e) {
    document.getElementById('googleBtnWrap').innerHTML = `<button class="google-btn" onclick="showToast('Google Sign-In failed to load','error')" style="opacity:.5">
      <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Continue with Google</button>`;
  }
}

async function handleGoogleResponse(response) {
  try {
    const r = await fetch('/api/users/google', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ credential: response.credential }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error,'error');
    authToken = d.token; currentUser = d.user;
    localStorage.setItem('arty_token', authToken);
    localStorage.setItem('arty_user', JSON.stringify(currentUser));
    updateAuthUI(); closeModal('auth');
    showToast(`Welcome, ${currentUser.name}!`,'success');
  } catch { showToast('Google sign-in failed','error'); }
}

// ===================== AUTH =====================
function openModal(type, tab) {
  document.getElementById(type+'Modal').classList.add('active'); document.body.style.overflow='hidden';
  if (tab==='register') switchAuthTab('register'); else if (type==='auth') switchAuthTab('login');
}
function closeModal(type) { document.getElementById(type+'Modal').classList.remove('active'); document.body.style.overflow=''; }
function switchAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active',tab==='login');
  document.getElementById('tabRegister').classList.toggle('active',tab==='register');
  document.getElementById('loginForm').style.display=tab==='login'?'block':'none';
  document.getElementById('registerForm').style.display=tab==='register'?'block':'none';
  document.getElementById('authModalTitle').textContent=tab==='login'?'Welcome Back':'Join Arty!';
  document.getElementById('authModalSub').textContent=tab==='login'?'Sign in to your account.':'Create your free account.';
}

async function doLogin() {
  const email=document.getElementById('loginEmail').value, pw=document.getElementById('loginPassword').value;
  if (!email||!pw) return showToast('Fill in all fields','error');
  try {
    const r=await fetch('/api/users/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})});
    const d=await r.json(); if(!r.ok) return showToast(d.error,'error');
    authToken=d.token; currentUser=d.user;
    localStorage.setItem('arty_token',authToken); localStorage.setItem('arty_user',JSON.stringify(currentUser));
    updateAuthUI(); closeModal('auth'); showToast(`Welcome back, ${currentUser.name}!`,'success');
  } catch { showToast('Connection error','error'); }
}

async function doRegister() {
  const name=document.getElementById('regName').value, email=document.getElementById('regEmail').value, pw=document.getElementById('regPassword').value;
  if (!name||!email||!pw) return showToast('Fill in all fields','error');
  try {
    const r=await fetch('/api/users/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password:pw})});
    const d=await r.json(); if(!r.ok) return showToast(d.error,'error');
    authToken=d.token; currentUser=d.user;
    localStorage.setItem('arty_token',authToken); localStorage.setItem('arty_user',JSON.stringify(currentUser));
    updateAuthUI(); closeModal('auth'); showToast(`Welcome to Arty!, ${currentUser.name}!`,'success');
  } catch(e) { console.error(e); showToast('Connection error','error'); }
}

function logout(silent) {
  fetch('/api/users/logout',{method:'POST',headers:authHeaders()}).catch(()=>{});
  authToken=null; currentUser=null;
  localStorage.removeItem('arty_token'); localStorage.removeItem('arty_user');
  updateAuthUI(); navigate('#/');
  if(!silent) showToast('Logged out','success');
}

// ===================== SCROLL =====================
function initScrollEffects() {
  const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:.1});
  document.querySelectorAll('.fade-up,.stagger-children').forEach(el=>obs.observe(el));
}

// ===================== KITS =====================
async function loadKits() {
  try { allKits = await (await fetch('/api/kits')).json(); } catch { allKits=[]; }
  renderKits(); renderTutorials(); initFilterButtons();
}
// Variable for the new inventory page filter
let inventoryFilter = 'all';

// Updated Home Page Render (Shows only 3 items)
function renderKits() {
  const g = document.getElementById('kitsGrid');
  if(!g) return;
  const f = currentFilter === 'all' ? allKits : allKits.filter(k => k.category === currentFilter);
  const top3 = f.slice(0, 3); // <--- Restricts to 3 items
  
  g.innerHTML = top3.map(k => `<div class="kit-card" onclick="navigate('#/product/${k.id}')">
    <div class="kit-card-img"><img src="${k.image}" alt="${k.name}" loading="lazy">${k.featured?'<span class="kit-card-badge">Featured</span>':''}</div>
    <div class="kit-card-body"><div class="kit-card-category">${k.category}</div><h3 class="kit-card-title">${k.name}</h3><p class="kit-card-desc">${k.shortDesc||k.description}</p>
    <div class="kit-card-footer"><span class="kit-card-price">$${k.price.toFixed(2)}</span><span class="kit-card-meta"><span class="kit-card-dot" style="background:${k.inStock?'#1B9AAA':'#FF6B6B'}"></span>${k.inStock?'In Stock':'Sold Out'} · ${k.difficulty}</span></div></div></div>`).join('');
  setTimeout(() => g.classList.add('visible'), 50);
}

// New Full Inventory Render
function renderInventory() {
  const g = document.getElementById('inventoryGrid');
  if(!g) return;
  const f = inventoryFilter === 'all' ? allKits : allKits.filter(k => k.category === inventoryFilter);
  
  g.innerHTML = f.map(k => `<div class="kit-card" onclick="navigate('#/product/${k.id}')">
    <div class="kit-card-img"><img src="${k.image}" alt="${k.name}" loading="lazy">${k.featured?'<span class="kit-card-badge">Featured</span>':''}</div>
    <div class="kit-card-body"><div class="kit-card-category">${k.category}</div><h3 class="kit-card-title">${k.name}</h3><p class="kit-card-desc">${k.shortDesc||k.description}</p>
    <div class="kit-card-footer"><span class="kit-card-price">$${k.price.toFixed(2)}</span><span class="kit-card-meta"><span class="kit-card-dot" style="background:${k.inStock?'#1B9AAA':'#FF6B6B'}"></span>${k.inStock?'In Stock':'Sold Out'} · ${k.difficulty}</span></div></div></div>`).join('');
  setTimeout(() => g.classList.add('visible'), 50);
}
function initFilterButtons() {
  // Home page filters
  document.querySelectorAll('#kitsFilter .filter-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#kitsFilter .filter-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); 
      currentFilter = b.dataset.filter;
      document.getElementById('kitsGrid').classList.remove('visible');
      setTimeout(() => renderKits(), 100);
    });
  });

  // Inventory page filters
  document.querySelectorAll('#inventoryFilter .filter-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#inventoryFilter .filter-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); 
      inventoryFilter = b.dataset.filter;
      document.getElementById('inventoryGrid').classList.remove('visible');
      setTimeout(() => renderInventory(), 100);
    });
  });
}

// ===================== PRODUCT PAGE =====================
function renderProductPage(id) {
  const kit=allKits.find(k=>k.id===id);
  const c=document.getElementById('productPageContent');
  if (!kit) { c.innerHTML='<div class="empty-state"><div class="empty-state-icon">🎨</div><p>Kit not found</p></div>'; return; }

  const imgs = kit.images && kit.images.length ? kit.images : [kit.image];
  const thumbs = imgs.length > 1 ? `<div class="product-thumbs">${imgs.map((img,i)=>`<img src="${img}" class="product-thumb${i===0?' active':''}" onclick="switchProductImg(this,'${img}')">`).join('')}</div>` : '';
  const includes = kit.includes && kit.includes.length ? `<div class="product-includes"><h3>What's Included</h3><ul>${kit.includes.map(i=>`<li>${i}</li>`).join('')}</ul></div>` : '';
  const video = kit.videoUrl ? `<div class="product-video"><h3>🎬 ${kit.videoTitle||'Tutorial'}</h3><div class="product-video-wrap"><iframe src="${kit.videoUrl}" allow="autoplay;encrypted-media" allowfullscreen></iframe></div></div>` : '';

  c.innerHTML=`
    <button class="product-back" onclick="navigate('#/')">← Back to Shop</button>
    <div class="product-layout">
      <div class="product-gallery"><img src="${imgs[0]}" class="product-main-img" id="productMainImg">${thumbs}</div>
      <div class="product-info">
        <div class="product-cat">${kit.category}</div>
        <h1>${kit.name}</h1>
        <div class="product-price">$${kit.price.toFixed(2)}</div>
        <p class="product-desc">${kit.description}</p>
        <div class="product-tags"><span class="product-tag">📦 ${kit.difficulty}</span><span class="product-tag">${kit.inStock?'✅ In Stock':'❌ Sold Out'}</span>${kit.videoUrl?'<span class="product-tag">🎬 Tutorial</span>':''}</div>
        ${includes}
        <div class="product-qty-row"><label>Qty:</label><div class="qty-ctrl"><button class="qty-btn" onclick="changeQty(-1)">−</button><input class="qty-val" id="productQty" value="1" readonly><button class="qty-btn" onclick="changeQty(1)">+</button></div></div>
        <div class="product-buttons">
          <button class="btn btn-orange" onclick="addToCart(${kit.id})" ${!kit.inStock?'disabled style="opacity:.4"':''}>${kit.inStock?'🛒 Add to Cart':'Sold Out'}</button>
          <button class="btn btn-teal" onclick="buyNow(${kit.id})" ${!kit.inStock?'disabled style="opacity:.4"':''}>Buy Now →</button>
        </div>
        ${video}
      </div>
    </div>`;
}

function switchProductImg(thumb, src) {
  document.getElementById('productMainImg').src = src;
  document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
}

function changeQty(d) { const i=document.getElementById('productQty'); if(!i)return; i.value=Math.min(10,Math.max(1,parseInt(i.value)+d)); }

// ===================== PROFILE PAGE =====================
async function renderProfilePage() {
  const c=document.getElementById('profilePageContent');
  if (!currentUser) return;
  const avatar=currentUser.picture?`<img src="${currentUser.picture}">`:`${currentUser.name.charAt(0).toUpperCase()}`;
  const badge=currentUser.role==='admin'?'<span class="profile-badge admin">Admin</span>':'<span class="profile-badge user">Member</span>';
  const provider=currentUser.provider==='google'?'Connected with Google':'Email & Password';

  c.innerHTML=`
    <div class="profile-header">
      <div class="profile-avatar">${avatar}</div>
      <div class="profile-meta"><h2>${currentUser.name}</h2><p>${currentUser.email} · ${provider}</p>${badge}</div>
    </div>
    <div class="profile-tabs">
      <button class="profile-tab active" onclick="switchProfileTab('orders',this)">Orders</button>
      <button class="profile-tab" onclick="switchProfileTab('bookings',this)">Bookings</button>
      <button class="profile-tab" onclick="switchProfileTab('settings',this)">Settings</button>
    </div>
    <div class="profile-panel active" id="panel-orders"><div class="profile-card"><h3>Order History</h3><div id="ordersListWrap"><p style="color:var(--w30)">Loading...</p></div></div></div>
    <div class="profile-panel" id="panel-bookings"><div class="profile-card"><h3>My Bookings</h3><div id="bookingsListWrap"><p style="color:var(--w30)">Loading...</p></div></div></div>
    <div class="profile-panel" id="panel-settings"><div class="profile-card"><h3>Account Settings</h3>
      <div class="form-group"><label>Name</label><input type="text" id="profileName" value="${currentUser.name}"></div>
      <div class="form-group"><label>Email</label><input type="email" value="${currentUser.email}" disabled style="opacity:.5"></div>
      ${currentUser.provider==='local'?`<div class="form-group"><label>Current Password</label><input type="password" id="profileCurrentPw" placeholder="Required to change password"></div><div class="form-group"><label>New Password</label><input type="password" id="profileNewPw" placeholder="Leave blank to keep current"></div>`:'<p style="font-size:.88rem;color:var(--w30);margin:16px 0">Password managed by Google.</p>'}
      <button class="btn btn-teal" onclick="updateProfile()">Save Changes</button>
    </div></div>`;

  // Load orders
  try {
    const r=await fetch('/api/orders/mine',{headers:authHeaders()});
    const orders=await r.json();
    document.getElementById('ordersListWrap').innerHTML = orders.length ? orders.map(o=>`<div class="order-item"><div><div class="order-id">${o.id}</div><div class="order-date">${new Date(o.createdAt).toLocaleDateString()}</div><div class="order-items-list">${o.items.map(i=>i.name+' ×'+i.qty).join(', ')}</div></div><div style="text-align:right"><div class="order-total">$${o.total.toFixed(2)}</div><span class="order-status">${o.status}</span></div></div>`).join('') : '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No orders yet</p></div>';
  } catch { document.getElementById('ordersListWrap').innerHTML='<p style="color:var(--w30)">Could not load orders.</p>'; }

  // Load bookings
  try {
    const r=await fetch('/api/bookings/mine',{headers:authHeaders()});
    const bookings=await r.json();
    document.getElementById('bookingsListWrap').innerHTML = bookings.length ? bookings.map(b=>`<div class="order-item"><div><div class="order-id">${b.event?.title||'Event'}</div><div class="order-date">${b.event?.date||''} · ${b.guests} guest(s)</div></div><div><span class="order-status">${b.status}</span></div></div>`).join('') : '<div class="empty-state"><div class="empty-state-icon">🎫</div><p>No bookings yet</p></div>';
  } catch { document.getElementById('bookingsListWrap').innerHTML='<p style="color:var(--w30)">Could not load bookings.</p>'; }
}

function switchProfileTab(tab, btn) {
  document.querySelectorAll('.profile-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.profile-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-'+tab).classList.add('active');
}

async function updateProfile() {
  const body = { name: document.getElementById('profileName').value };
  if (currentUser.provider==='local') {
    const cp=document.getElementById('profileCurrentPw').value, np=document.getElementById('profileNewPw').value;
    if (np) { body.currentPassword=cp; body.newPassword=np; }
  }
  try {
    const r=await fetch('/api/users/me',{method:'PUT',headers:authHeaders(),body:JSON.stringify(body)});
    const d=await r.json(); if(!r.ok) return showToast(d.error,'error');
    currentUser=d.user; localStorage.setItem('arty_user',JSON.stringify(currentUser));
    updateAuthUI(); showToast('Profile updated!','success');
  } catch { showToast('Error updating profile','error'); }
}

// ===================== CART =====================
function addToCart(kitId) {
  const kit=allKits.find(k=>k.id===kitId); if(!kit)return;
  const qty=parseInt(document.getElementById('productQty')?.value||1);
  const ex=cart.find(i=>i.id===kitId);
  if(ex) ex.qty+=qty; else cart.push({id:kit.id,name:kit.name,price:kit.price,image:kit.image,qty});
  saveCart(); updateCartUI(); showToast(`${kit.name} added to cart!`,'success');
}
function buyNow(id) { addToCart(id); setTimeout(()=>checkout(),300); }
function removeFromCart(id) { cart=cart.filter(i=>i.id!==id); saveCart(); updateCartUI(); renderCartItems(); }
function clearCart() { cart=[]; saveCart(); updateCartUI(); renderCartItems(); }
function saveCart() { localStorage.setItem('arty_cart',JSON.stringify(cart)); }
function updateCartUI() {
  const cnt=cart.reduce((s,i)=>s+i.qty,0);
  const btn=document.getElementById('cartBtn'), el=document.getElementById('cartCount');
  if(btn) btn.style.display=cnt>0?'flex':'none';
  if(el) el.textContent=cnt;
}
function getCartTotal() { return cart.reduce((s,i)=>s+i.price*i.qty,0); }
function openCart() { renderCartItems(); document.getElementById('cartOverlay').classList.add('open'); document.getElementById('cartSidebar').classList.add('open'); document.body.style.overflow='hidden'; }
function closeCart() { document.getElementById('cartOverlay').classList.remove('open'); document.getElementById('cartSidebar').classList.remove('open'); document.body.style.overflow=''; }
function renderCartItems() {
  const c=document.getElementById('cartItems'), f=document.getElementById('cartFooter');
  if(!cart.length) { c.innerHTML='<div class="cart-empty"><div class="cart-empty-icon">🛒</div><p>Cart is empty</p></div>'; f.style.display='none'; return; }
  f.style.display='block';
  c.innerHTML=cart.map(i=>`<div class="cart-item"><img src="${i.image}" class="cart-item-img"><div class="cart-item-info"><div class="cart-item-name">${i.name}</div><div class="cart-item-price">$${i.price.toFixed(2)}</div><div class="cart-item-qty">Qty: ${i.qty}</div></div><button class="cart-item-remove" onclick="removeFromCart(${i.id})">✕</button></div>`).join('');
  document.getElementById('cartTotal').textContent=`$${getCartTotal().toFixed(2)}`;
}

// ===================== CHECKOUT =====================
function checkout() {
  if(!cart.length) return showToast('Cart is empty','error');
  if(!currentUser) { closeCart(); openModal('auth'); showToast('Sign in to checkout','error'); return; }
  closeCart();
  document.getElementById('checkoutSummary').innerHTML=cart.map(i=>`<div class="checkout-summary-item"><span>${i.name} × ${i.qty}</span><span>$${(i.price*i.qty).toFixed(2)}</span></div>`).join('');
  document.getElementById('checkoutTotal').textContent=`$${getCartTotal().toFixed(2)}`;
  document.getElementById('checkoutName').value=currentUser.name;
  document.getElementById('checkoutEmail').value=currentUser.email;
  document.getElementById('checkoutModal').classList.add('active'); document.body.style.overflow='hidden';
}

async function placeOrder() {
  const addr=document.getElementById('checkoutAddress').value, card=document.getElementById('checkoutCard').value;
  if(!addr) return showToast('Enter shipping address','error');
  if(!card) return showToast('Enter payment details','error');
  try {
    const r=await fetch('/api/orders',{method:'POST',headers:authHeaders(),body:JSON.stringify({items:cart,address:addr,total:getCartTotal()})});
    const d=await r.json(); if(!r.ok) return showToast(d.error,'error');
    closeModal('checkout'); cart=[]; saveCart(); updateCartUI();
    ['checkoutName','checkoutEmail','checkoutAddress','checkoutCard','checkoutExpiry','checkoutCVC'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('successOrderId').textContent=`Order #${d.order.id}`;
    document.getElementById('successModal').classList.add('active'); document.body.style.overflow='hidden';
  } catch { showToast('Order failed','error'); }
}

// ===================== EVENTS =====================
async function loadEvents() {
  try { allEvents = await (await fetch('/api/events')).json(); } catch { allEvents=[]; }
  renderEvents(); renderCalendar();
}
function renderEvents() {
  document.getElementById('eventsList').innerHTML=[...allEvents].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(ev=>{
    const d=new Date(ev.date+'T00:00:00'), ds=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), sl=ev.maxSpots-ev.bookedSpots, pct=(ev.bookedSpots/ev.maxSpots)*100;
    return `<div class="event-card"><div class="event-card-img"><img src="${ev.image}" loading="lazy"></div><div class="event-card-body"><div class="event-card-date">📅 ${ds} · ${ev.time}</div><h3 class="event-card-title">${ev.title}</h3><p class="event-card-desc">${ev.description}</p><div class="event-card-meta"><span>⏱ ${ev.duration}</span><span>📍 ${ev.location}</span></div></div><div class="event-card-action"><div class="event-price">$${ev.price.toFixed(2)}</div><div class="spots-left">${sl} left</div><div class="spots-bar"><div class="spots-bar-fill" style="width:${pct}%"></div></div><button class="btn btn-teal btn-sm" onclick="openBooking(${ev.id})" ${sl<=0?'disabled style="opacity:.4"':''}>${sl<=0?'Full':'Book'}</button></div></div>`;
  }).join('');
}
function renderCalendar() {
  const g=document.getElementById('calGrid'), y=calendarDate.getFullYear(), m=calendarDate.getMonth();
  document.getElementById('calMonthYear').textContent=calendarDate.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  let h=['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>`<div class="cal-day-name">${d}</div>`).join('');
  const fd=new Date(y,m,1).getDay(), dim=new Date(y,m+1,0).getDate(), today=new Date();
  const evd=allEvents.map(e=>new Date(e.date+'T00:00:00')).filter(d=>d.getMonth()===m&&d.getFullYear()===y).map(d=>d.getDate());
  for(let i=0;i<fd;i++) h+='<div class="cal-day"></div>';
  for(let d=1;d<=dim;d++) h+=`<div class="cal-day${d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear()?' today':''}${evd.includes(d)?' has-event':''}">${d}</div>`;
  g.innerHTML=h;
}
function changeMonth(d) { calendarDate.setMonth(calendarDate.getMonth()+d); renderCalendar(); }

// ===================== TUTORIALS =====================
function renderTutorials() {
  document.getElementById('tutorialsGrid').innerHTML=allKits.filter(k=>k.videoUrl).map(k=>`<div class="tutorial-card"><div class="tutorial-video-wrap" onclick="playVideo(this,'${k.videoUrl}')"><img src="${k.image}" loading="lazy"><div class="tutorial-play-btn"></div></div><div class="tutorial-body"><div class="tutorial-kit-link">Kit: ${k.name}</div><h3 class="tutorial-title">${k.videoTitle}</h3><p class="tutorial-difficulty">${k.difficulty}</p></div></div>`).join('');
  setTimeout(()=>document.getElementById('tutorialsGrid').classList.add('visible'),100);
}
function playVideo(el,url) { el.innerHTML=`<iframe src="${url}?autoplay=1" allow="autoplay;encrypted-media" allowfullscreen></iframe>`; }

// ===================== BOOKINGS =====================
function openBooking(eventId) {
  if(!currentUser) { openModal('auth'); showToast('Sign in to book','error'); return; }
  const ev=allEvents.find(e=>e.id===eventId); if(!ev) return;
  document.getElementById('bookingEventTitle').textContent=ev.title;
  document.getElementById('bookingPrice').textContent=ev.price.toFixed(2);
  document.getElementById('bookingName').value=currentUser.name;
  document.getElementById('bookingEmail').value=currentUser.email;
  document.getElementById('bookingModal').classList.add('active'); document.body.style.overflow='hidden';
  document.getElementById('bookingModal').dataset.eventId=eventId;
}
async function confirmBooking() {
  const eid=document.getElementById('bookingModal').dataset.eventId;
  const n=document.getElementById('bookingName').value, e=document.getElementById('bookingEmail').value, g=document.getElementById('bookingGuests').value;
  if(!n||!e) return showToast('Fill in name and email','error');
  try {
    const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser?.id,eventId:eid,name:n,email:e,guests:g})});
    const d=await r.json(); if(!r.ok) return showToast(d.error,'error');
    closeModal('booking'); showToast('Booking confirmed!','success'); loadEvents();
  } catch { showToast('Connection error','error'); }
}

// ===================== CONTACT =====================
async function submitContact() {
  const n=document.getElementById('contactName').value, e=document.getElementById('contactEmail').value, s=document.getElementById('contactSubject').value, m=document.getElementById('contactMessage').value;
  if(!n||!e||!m) return showToast('Fill in name, email, message','error');
  try {
    const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,subject:s,message:m})});
    const d=await r.json(); if(!r.ok) return showToast(d.error,'error');
    showToast(d.message,'success'); ['contactName','contactEmail','contactSubject','contactMessage'].forEach(id=>document.getElementById(id).value='');
  } catch { showToast('Error','error'); }
}

// ===================== ADMIN =====================
async function loadAdminData() {
  try {
    const r=await fetch('/api/admin/stats',{headers:authHeaders()}); const s=await r.json();
    document.getElementById('statKits').textContent=s.totalKits; document.getElementById('statEvents').textContent=s.totalEvents;
    document.getElementById('statUsers').textContent=s.totalUsers; document.getElementById('statOrders').textContent=s.totalOrders||0;
  } catch {}
  renderAdminKits(); renderAdminEvents();
}
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t=>t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('adminKitsPanel').style.display=tab==='kits'?'block':'none';
  document.getElementById('adminEventsPanel').style.display=tab==='events'?'block':'none';
}
function renderAdminKits() {
  document.getElementById('adminKitsTable').innerHTML=allKits.map(k=>`<tr><td><strong>${k.name}</strong></td><td>${k.category}</td><td>$${k.price.toFixed(2)}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editKit(${k.id})">Edit</button><button class="admin-btn admin-btn-delete" onclick="deleteKit(${k.id})">Delete</button></div></td></tr>`).join('');
}
async function saveKit() {
  const eid=document.getElementById('editKitId').value;
  const p={name:document.getElementById('adminKitName').value,price:document.getElementById('adminKitPrice').value,description:document.getElementById('adminKitDesc').value,category:document.getElementById('adminKitCategory').value,difficulty:document.getElementById('adminKitDifficulty').value,image:document.getElementById('adminKitImage').value,videoUrl:document.getElementById('adminKitVideo').value,videoTitle:document.getElementById('adminKitVideoTitle').value};
  if(!p.name||!p.price) return showToast('Name and price required','error');
  try {
    const r=await fetch(eid?`/api/admin/kits/${eid}`:'/api/admin/kits',{method:eid?'PUT':'POST',headers:authHeaders(),body:JSON.stringify(p)});
    const d=await r.json(); if(d.error) return showToast(d.error,'error');
    showToast(eid?'Updated!':'Added!','success'); resetKitForm(); loadKits(); loadAdminData();
  } catch { showToast('Error','error'); }
}
function editKit(id) {
  const k=allKits.find(x=>x.id===id); if(!k) return;
  document.getElementById('editKitId').value=k.id; document.getElementById('adminKitName').value=k.name; document.getElementById('adminKitPrice').value=k.price; document.getElementById('adminKitDesc').value=k.description; document.getElementById('adminKitCategory').value=k.category; document.getElementById('adminKitDifficulty').value=k.difficulty; document.getElementById('adminKitImage').value=k.image||''; document.getElementById('adminKitVideo').value=k.videoUrl||''; document.getElementById('adminKitVideoTitle').value=k.videoTitle||'';
  document.getElementById('kitFormTitle').textContent='Edit Kit'; document.getElementById('cancelKitEdit').style.display='inline-flex'; window.scrollTo(0,0);
}
function resetKitForm() { ['editKitId','adminKitName','adminKitPrice','adminKitDesc','adminKitImage','adminKitVideo','adminKitVideoTitle'].forEach(id=>document.getElementById(id).value=''); document.getElementById('kitFormTitle').textContent='Add New Kit'; document.getElementById('cancelKitEdit').style.display='none'; }
async function deleteKit(id) { if(!confirm('Delete?')) return; try { await fetch(`/api/admin/kits/${id}`,{method:'DELETE',headers:authHeaders()}); showToast('Deleted','success'); loadKits(); loadAdminData(); } catch { showToast('Error','error'); } }

function renderAdminEvents() {
  document.getElementById('adminEventsTable').innerHTML=allEvents.map(e=>`<tr><td><strong>${e.title}</strong></td><td>${e.date}</td><td>$${e.price.toFixed(2)}</td><td>${e.bookedSpots}/${e.maxSpots}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editEvent(${e.id})">Edit</button><button class="admin-btn admin-btn-delete" onclick="deleteEvent(${e.id})">Delete</button></div></td></tr>`).join('');
}
async function saveEvent() {
  const eid=document.getElementById('editEventId').value;
  const p={title:document.getElementById('adminEventTitle').value,description:document.getElementById('adminEventDesc').value,date:document.getElementById('adminEventDate').value,time:document.getElementById('adminEventTime').value,duration:document.getElementById('adminEventDuration').value,price:document.getElementById('adminEventPrice').value,maxSpots:document.getElementById('adminEventMaxSpots').value,image:document.getElementById('adminEventImage').value,category:document.getElementById('adminEventCategory').value};
  if(!p.title||!p.date) return showToast('Title and date required','error');
  try {
    const r=await fetch(eid?`/api/admin/events/${eid}`:'/api/admin/events',{method:eid?'PUT':'POST',headers:authHeaders(),body:JSON.stringify(p)});
    const d=await r.json(); if(d.error) return showToast(d.error,'error');
    showToast(eid?'Updated!':'Added!','success'); resetEventForm(); loadEvents(); loadAdminData();
  } catch { showToast('Error','error'); }
}
function editEvent(id) {
  const e=allEvents.find(x=>x.id===id); if(!e) return;
  document.getElementById('editEventId').value=e.id; document.getElementById('adminEventTitle').value=e.title; document.getElementById('adminEventDesc').value=e.description; document.getElementById('adminEventDate').value=e.date; document.getElementById('adminEventTime').value=e.time; document.getElementById('adminEventDuration').value=e.duration; document.getElementById('adminEventPrice').value=e.price; document.getElementById('adminEventMaxSpots').value=e.maxSpots; document.getElementById('adminEventImage').value=e.image||''; document.getElementById('adminEventCategory').value=e.category;
  document.getElementById('eventFormTitle').textContent='Edit Event'; document.getElementById('cancelEventEdit').style.display='inline-flex'; window.scrollTo(0,0);
}
function resetEventForm() { ['editEventId','adminEventTitle','adminEventDesc','adminEventDate','adminEventDuration','adminEventPrice','adminEventMaxSpots','adminEventImage'].forEach(id=>document.getElementById(id).value=''); document.getElementById('adminEventTime').value='18:00'; document.getElementById('eventFormTitle').textContent='Add New Event'; document.getElementById('cancelEventEdit').style.display='none'; }
async function deleteEvent(id) { if(!confirm('Delete?')) return; try { await fetch(`/api/admin/events/${id}`,{method:'DELETE',headers:authHeaders()}); showToast('Deleted','success'); loadEvents(); loadAdminData(); } catch { showToast('Error','error'); } }

// ===================== TOAST =====================
function showToast(msg,type='success') { const t=document.getElementById('toast'); t.textContent=msg; t.className=`toast ${type} show`; setTimeout(()=>t.classList.remove('show'),3500); }

// ===================== MODAL CLOSE =====================
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o){o.classList.remove('active');document.body.style.overflow=''}}));