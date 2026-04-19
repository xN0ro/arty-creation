/* Arty! — Application Complète */
let currentUser=null,authToken=null,allKits=[],allEvents=[],allCategories=[],teamActivities=[],cart=[],currentFilter='all',googleClientId='';

document.addEventListener('DOMContentLoaded',async()=>{
  authToken=localStorage.getItem('arty_token');
  const u=localStorage.getItem('arty_user'); if(u) currentUser=JSON.parse(u);
  const c=localStorage.getItem('arty_cart'); if(c) cart=JSON.parse(c);
  try{const r=await fetch('/api/config');googleClientId=(await r.json()).googleClientId}catch{}
  if(authToken&&currentUser){try{const r=await fetch('/api/users/me',{headers:authH()});if(!r.ok)throw 0;currentUser=await r.json();localStorage.setItem('arty_user',JSON.stringify(currentUser))}catch{logout(1)}}
  await Promise.all([loadKits(),loadCategories(),loadEvents(),loadTeam()]);
  initNavbar();updateAuthUI();updateCartUI();initGoogleSignIn();
  window.addEventListener('hashchange',handleRoute);handleRoute();
});

function authH(){return authToken?{'Authorization':'Bearer '+authToken,'Content-Type':'application/json'}:{'Content-Type':'application/json'}}
function navigate(h){window.location.hash=h}

// ===== ROUTER =====
function handleRoute(){
  const h=window.location.hash||'#/';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('mainFooter').style.display='';
  // Close mobile
  document.getElementById('navLinks').classList.remove('open');
  document.getElementById('navAuth').classList.remove('open');

  if(h.startsWith('#/product/')){show('page-product');renderProductPage(parseInt(h.split('/')[2]));window.scrollTo(0,0)}
  else if(h==='#/profile'){if(!currentUser){navigate('#/');openModal('auth');return}show('page-profile');renderProfilePage();window.scrollTo(0,0)}
  else if(h==='#/admin'){if(!currentUser||currentUser.role!=='admin'){navigate('#/');showToast('Accès admin requis','error');return}show('page-admin');document.getElementById('mainFooter').style.display='none';loadAdminData();window.scrollTo(0,0)}
  else if(h==='#/paintings'){show('page-paintings');renderPaintingsPage();window.scrollTo(0,0)}
  else if(h==='#/party'){show('page-party');initScrollEffects();window.scrollTo(0,0)}
  else if(h==='#/team'){show('page-team');renderTeamPage();window.scrollTo(0,0)}
  else{show('page-home');renderHomeCats();initScrollEffects();if(h.includes('contact'))setTimeout(()=>document.getElementById('contact')?.scrollIntoView({behavior:'smooth'}),200)}
}
function show(id){document.getElementById(id).classList.add('active')}
function scrollToSection(id){navigate('#/');setTimeout(()=>{const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth'})},200)}

// ===== NAVBAR =====
function initNavbar(){
  window.addEventListener('scroll',()=>document.getElementById('navbar').classList.toggle('scrolled',window.scrollY>60));
  document.addEventListener('click',e=>{if(!e.target.closest('.nav-dropdown'))document.querySelectorAll('.nav-dropdown-menu').forEach(m=>m.classList.remove('open'))});
  document.querySelectorAll('.nav-links a[data-nav]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const s=a.dataset.nav;if(s==='home'){navigate('#/');window.scrollTo({top:0,behavior:'smooth'})}else scrollToSection(s)}));
}
function toggleMobile(){document.getElementById('navLinks').classList.toggle('open');document.getElementById('navAuth').classList.toggle('open')}
function toggleDropdown(){document.querySelector('.nav-dropdown-menu')?.classList.toggle('open')}
function updateAuthUI(){
  const a=document.getElementById('navAuth');
  const cartH=`<button class="btn-cart" onclick="openCart()" id="cartBtn" style="${cart.length?'display:flex':'display:none'}">🛒 <span id="cartCount">${cart.reduce((s,i)=>s+i.qty,0)}</span></button>`;
  if(currentUser){
    const av=currentUser.picture?`<img src="${currentUser.picture}">`:`${currentUser.name.charAt(0).toUpperCase()}`;
    const adm=currentUser.role==='admin'?`<a href="#/admin" class="admin-link">⚙️ Admin</a>`:'';
    a.innerHTML=`${cartH}<div class="nav-dropdown"><div class="nav-user" onclick="toggleDropdown()"><div class="nav-user-avatar">${av}</div><span class="nav-user-name">${currentUser.name.split(' ')[0]}</span></div><div class="nav-dropdown-menu"><a href="#/profile">👤 Mon Profil</a>${adm}<button class="logout-btn" onclick="logout()">🚪 Déconnexion</button></div></div>`;
  }else{a.innerHTML=`${cartH}<button class="btn btn-ghost btn-sm" onclick="openModal('auth')">Connexion</button><button class="btn btn-orange btn-sm" onclick="openModal('auth','register')">S'inscrire</button>`}
}

// ===== DATA =====
async function loadKits(){try{allKits=await(await fetch('/api/kits')).json()}catch{allKits=[]}}
async function loadCategories(){try{allCategories=await(await fetch('/api/categories')).json()}catch{allCategories=[]}}
async function loadEvents(){try{allEvents=await(await fetch('/api/events')).json()}catch{allEvents=[]}}
async function loadTeam(){try{teamActivities=await(await fetch('/api/team-activities')).json()}catch{teamActivities=[]}}

// ===== SCROLL =====
function initScrollEffects(){
  const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:.1});
  document.querySelectorAll('.fade-up,.stagger-children').forEach(el=>{el.classList.remove('visible');obs.observe(el)});
}

// ===== HOME CATEGORIES =====
function renderHomeCats(){
  document.getElementById('homeCatGrid').innerHTML=allCategories.map(c=>`<div class="cat-card" onclick="navigate('#/paintings?cat=${c.id}')"><img src="${c.image}" alt="${c.name}" loading="lazy"><div class="cat-card-overlay"><span class="cat-card-name">${c.name}</span></div></div>`).join('');
  initScrollEffects();
}

// ===== PAINTINGS PAGE =====
function renderPaintingsPage(){
  // Categories grid
  document.getElementById('paintingsCatGrid').innerHTML=allCategories.map(c=>`<div class="cat-card" onclick="filterByCat(${c.id})"><img src="${c.image}" alt="${c.name}" loading="lazy"><div class="cat-card-overlay"><span class="cat-card-name">${c.name}</span></div></div>`).join('');
  // Filter buttons from categories
  const filterWrap=document.getElementById('kitsFilter');
  filterWrap.innerHTML=`<button class="filter-btn active" data-filter="all">Tous</button>`+allCategories.map(c=>`<button class="filter-btn" data-filter="${c.id}">${c.name}</button>`).join('');
  filterWrap.querySelectorAll('.filter-btn').forEach(b=>b.addEventListener('click',()=>{filterWrap.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentFilter=b.dataset.filter;renderKitsGrid()}));
  // Check URL for cat param
  const params=new URLSearchParams(window.location.hash.split('?')[1]);
  const catParam=params.get('cat');
  if(catParam){currentFilter=catParam;filterWrap.querySelectorAll('.filter-btn').forEach(b=>{b.classList.toggle('active',b.dataset.filter===catParam)})}
  else{currentFilter='all'}
  renderKitsGrid();initScrollEffects();
}
function filterByCat(catId){currentFilter=String(catId);const fw=document.getElementById('kitsFilter');fw.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===String(catId)));renderKitsGrid();document.getElementById('kitsFilter').scrollIntoView({behavior:'smooth'})}
function renderKitsGrid(){
  const g=document.getElementById('kitsGrid');
  const filtered=currentFilter==='all'?allKits:allKits.filter(k=>String(k.categoryId)===currentFilter);
  g.innerHTML=filtered.map(k=>{const cat=allCategories.find(c=>c.id===k.categoryId);return`<div class="kit-card" onclick="navigate('#/product/${k.id}')"><div class="kit-card-img"><img src="${k.image}" alt="${k.name}" loading="lazy">${k.featured?'<span class="kit-card-badge">Populaire</span>':''}</div><div class="kit-card-body"><div class="kit-card-category">${cat?cat.name:''}</div><h3 class="kit-card-title">${k.name}</h3><p class="kit-card-desc">${k.shortDesc||k.description}</p><div class="kit-card-footer"><span class="kit-card-price">$${k.price.toFixed(2)}</span><span class="kit-card-meta">${k.difficulty}</span></div></div></div>`}).join('');
  setTimeout(()=>g.classList.add('visible'),50);
}

// ===== PRODUCT PAGE =====
function renderProductPage(id){
  const kit=allKits.find(k=>k.id===id);const c=document.getElementById('productPageContent');
  if(!kit){c.innerHTML='<div class="empty-state"><div class="empty-state-icon">🎨</div><p>Kit non trouvé</p></div>';return}
  const cat=allCategories.find(ct=>ct.id===kit.categoryId);
  const imgs=kit.images?.length?kit.images:[kit.image];
  const thumbs=imgs.length>1?`<div class="product-thumbs">${imgs.map((img,i)=>`<img src="${img}" class="product-thumb${i===0?' active':''}" onclick="switchImg(this,'${img}')">`).join('')}</div>`:'';
  const inc=kit.includes?.length?`<div class="product-includes"><h3>Inclus dans ce kit</h3><ul>${kit.includes.map(i=>`<li>${i}</li>`).join('')}</ul></div>`:'';
  c.innerHTML=`<button class="product-back" onclick="navigate('#/paintings')">← Retour aux kits</button><div class="product-layout"><div class="product-gallery"><img src="${imgs[0]}" class="product-main-img" id="pMainImg">${thumbs}</div><div class="product-info"><div class="product-cat">${cat?cat.name:''}</div><h1>${kit.name}</h1><div class="product-price">$${kit.price.toFixed(2)}</div><p class="product-desc">${kit.description}</p><div class="product-tags"><span class="product-tag">📦 ${kit.difficulty}</span><span class="product-tag">${kit.inStock?'✅ En stock':'❌ Épuisé'}</span></div>${inc}<div class="product-qty-row"><label>Qté:</label><div class="qty-ctrl"><button class="qty-btn" onclick="chgQty(-1)">−</button><input class="qty-val" id="pQty" value="1" readonly><button class="qty-btn" onclick="chgQty(1)">+</button></div></div><div class="product-buttons"><button class="btn btn-orange" onclick="addToCart(${kit.id})" ${!kit.inStock?'disabled style="opacity:.4"':''}>${kit.inStock?'🛒 Ajouter au panier':'Épuisé'}</button><button class="btn btn-teal" onclick="buyNow(${kit.id})" ${!kit.inStock?'disabled style="opacity:.4"':''}>Acheter →</button></div></div></div>`;
}
function switchImg(th,src){document.getElementById('pMainImg').src=src;document.querySelectorAll('.product-thumb').forEach(t=>t.classList.remove('active'));th.classList.add('active')}
function chgQty(d){const i=document.getElementById('pQty');if(!i)return;i.value=Math.min(10,Math.max(1,parseInt(i.value)+d))}

// ===== TEAM PAGE =====
function renderTeamPage(){
  document.getElementById('teamGrid').innerHTML=teamActivities.map(a=>`<div class="team-card"><div class="team-card-img"><img src="${a.image}" loading="lazy"></div><div class="team-card-body"><div class="team-card-sub">${a.subtitle}</div><h3>${a.title}</h3><p>${a.description}</p></div></div>`).join('');
  initScrollEffects();
}

// ===== PROFILE =====
async function renderProfilePage(){
  const c=document.getElementById('profilePageContent');if(!currentUser)return;
  const av=currentUser.picture?`<img src="${currentUser.picture}">`:`${currentUser.name.charAt(0).toUpperCase()}`;
  const badge=currentUser.role==='admin'?'<span class="profile-badge admin">Admin</span>':'<span class="profile-badge user">Membre</span>';
  const prov=currentUser.provider==='google'?'Google':'Courriel & mot de passe';
  c.innerHTML=`<div style="padding-top:20px"><div class="profile-header"><div class="profile-avatar">${av}</div><div class="profile-meta"><h2>${currentUser.name}</h2><p>${currentUser.email} · ${prov}</p>${badge}</div></div><div class="profile-tabs"><button class="profile-tab active" onclick="switchPTab('orders',this)">Commandes</button><button class="profile-tab" onclick="switchPTab('bookings',this)">Réservations</button><button class="profile-tab" onclick="switchPTab('settings',this)">Paramètres</button></div><div class="profile-panel active" id="panel-orders"><div class="profile-card"><h3>Historique</h3><div id="ordersWrap"><p style="color:var(--text-faint)">Chargement...</p></div></div></div><div class="profile-panel" id="panel-bookings"><div class="profile-card"><h3>Mes Réservations</h3><div id="bookingsWrap"><p style="color:var(--text-faint)">Chargement...</p></div></div></div><div class="profile-panel" id="panel-settings"><div class="profile-card"><h3>Paramètres du Compte</h3><div class="form-group"><label>Nom</label><input type="text" id="profileName" value="${currentUser.name}"></div><div class="form-group"><label>Courriel</label><input type="email" value="${currentUser.email}" disabled style="opacity:.5"></div>${currentUser.provider==='local'?`<div class="form-group"><label>Mot de passe actuel</label><input type="password" id="pCurPw" placeholder="Requis pour changer"></div><div class="form-group"><label>Nouveau mot de passe</label><input type="password" id="pNewPw" placeholder="Laisser vide pour garder"></div>`:'<p style="font-size:.86rem;color:var(--text-light);margin:14px 0">Mot de passe géré par Google.</p>'}<button class="btn btn-teal" onclick="updateProfile()">Sauvegarder</button></div></div></div>`;
  try{const r=await fetch('/api/orders/mine',{headers:authH()});const orders=await r.json();document.getElementById('ordersWrap').innerHTML=orders.length?orders.map(o=>`<div class="order-item"><div><div class="order-id">${o.id}</div><div class="order-date">${new Date(o.createdAt).toLocaleDateString('fr-CA')}</div><div class="order-items-list">${o.items.map(i=>i.name+' ×'+i.qty).join(', ')}</div></div><div style="text-align:right"><div class="order-total">$${o.total.toFixed(2)}</div><span class="order-status">${o.status}</span></div></div>`).join(''):'<div class="empty-state"><div class="empty-state-icon">📦</div><p>Aucune commande</p></div>'}catch{}
  try{const r=await fetch('/api/bookings/mine',{headers:authH()});const bks=await r.json();document.getElementById('bookingsWrap').innerHTML=bks.length?bks.map(b=>`<div class="order-item"><div><div class="order-id">${b.event?.title||'Événement'}</div><div class="order-date">${b.event?.date||''} · ${b.guests} personne(s)</div></div><div><span class="order-status">${b.status}</span></div></div>`).join(''):'<div class="empty-state"><div class="empty-state-icon">🎫</div><p>Aucune réservation</p></div>'}catch{}
}
function switchPTab(t,btn){document.querySelectorAll('.profile-tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.profile-panel').forEach(p=>p.classList.remove('active'));btn.classList.add('active');document.getElementById('panel-'+t).classList.add('active')}
async function updateProfile(){
  const body={name:document.getElementById('profileName').value};
  if(currentUser.provider==='local'){const cp=document.getElementById('pCurPw').value,np=document.getElementById('pNewPw').value;if(np){body.currentPassword=cp;body.newPassword=np}}
  try{const r=await fetch('/api/users/me',{method:'PUT',headers:authH(),body:JSON.stringify(body)});const d=await r.json();if(!r.ok)return showToast(d.error,'error');currentUser=d.user;localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();showToast('Profil mis à jour!','success')}catch{showToast('Erreur','error')}
}

// ===== CART =====
function addToCart(kitId){const kit=allKits.find(k=>k.id===kitId);if(!kit)return;const qty=parseInt(document.getElementById('pQty')?.value||1);const ex=cart.find(i=>i.id===kitId);if(ex)ex.qty+=qty;else cart.push({id:kit.id,name:kit.name,price:kit.price,image:kit.image,qty});saveCart();updateCartUI();showToast(`${kit.name} ajouté!`,'success')}
function buyNow(id){addToCart(id);setTimeout(()=>checkout(),300)}
function removeFromCart(id){cart=cart.filter(i=>i.id!==id);saveCart();updateCartUI();renderCartItems()}
function clearCart(){cart=[];saveCart();updateCartUI();renderCartItems()}
function saveCart(){localStorage.setItem('arty_cart',JSON.stringify(cart))}
function updateCartUI(){const n=cart.reduce((s,i)=>s+i.qty,0);const b=document.getElementById('cartBtn'),c=document.getElementById('cartCount');if(b)b.style.display=n>0?'flex':'none';if(c)c.textContent=n}
function getTotal(){return cart.reduce((s,i)=>s+i.price*i.qty,0)}
function openCart(){renderCartItems();document.getElementById('cartOverlay').classList.add('open');document.getElementById('cartSidebar').classList.add('open');document.body.style.overflow='hidden'}
function closeCart(){document.getElementById('cartOverlay').classList.remove('open');document.getElementById('cartSidebar').classList.remove('open');document.body.style.overflow=''}
function renderCartItems(){
  const c=document.getElementById('cartItems'),f=document.getElementById('cartFooter');
  if(!cart.length){c.innerHTML='<div class="cart-empty"><div class="cart-empty-icon">🛒</div><p>Panier vide</p></div>';f.style.display='none';return}
  f.style.display='block';
  c.innerHTML=cart.map(i=>`<div class="cart-item"><img src="${i.image}" class="cart-item-img"><div class="cart-item-info"><div class="cart-item-name">${i.name}</div><div class="cart-item-price">$${i.price.toFixed(2)}</div><div class="cart-item-qty">Qté: ${i.qty}</div></div><button class="cart-item-remove" onclick="removeFromCart(${i.id})">✕</button></div>`).join('');
  document.getElementById('cartTotal').textContent=`$${getTotal().toFixed(2)}`;
}

// ===== CHECKOUT =====
function checkout(){if(!cart.length)return showToast('Panier vide','error');if(!currentUser){closeCart();openModal('auth');return showToast('Connectez-vous','error')}closeCart();document.getElementById('checkoutSummary').innerHTML=cart.map(i=>`<div class="checkout-summary-item"><span>${i.name} × ${i.qty}</span><span>$${(i.price*i.qty).toFixed(2)}</span></div>`).join('');document.getElementById('checkoutTotal').textContent=`$${getTotal().toFixed(2)}`;document.getElementById('checkoutName').value=currentUser.name;document.getElementById('checkoutEmail').value=currentUser.email;document.getElementById('checkoutModal').classList.add('active');document.body.style.overflow='hidden'}
async function placeOrder(){const addr=document.getElementById('checkoutAddress').value,card=document.getElementById('checkoutCard').value;if(!addr)return showToast('Entrez l\'adresse','error');if(!card)return showToast('Entrez la carte','error');try{const r=await fetch('/api/orders',{method:'POST',headers:authH(),body:JSON.stringify({items:cart,address:addr,total:getTotal()})});const d=await r.json();if(!r.ok)return showToast(d.error,'error');closeModal('checkout');cart=[];saveCart();updateCartUI();['checkoutName','checkoutEmail','checkoutAddress','checkoutCard','checkoutExpiry','checkoutCVC'].forEach(id=>document.getElementById(id).value='');document.getElementById('successOrderId').textContent=`Commande #${d.order.id}`;document.getElementById('successModal').classList.add('active');document.body.style.overflow='hidden'}catch{showToast('Erreur','error')}}

// ===== AUTH =====
function openModal(t,tab){document.getElementById(t+'Modal').classList.add('active');document.body.style.overflow='hidden';if(tab==='register')switchAuthTab('register');else if(t==='auth')switchAuthTab('login')}
function closeModal(t){document.getElementById(t+'Modal').classList.remove('active');document.body.style.overflow=''}
function switchAuthTab(t){document.getElementById('tabLogin').classList.toggle('active',t==='login');document.getElementById('tabRegister').classList.toggle('active',t==='register');document.getElementById('loginForm').style.display=t==='login'?'block':'none';document.getElementById('registerForm').style.display=t==='register'?'block':'none';document.getElementById('authModalTitle').textContent=t==='login'?'Bienvenue':'Créer un Compte';document.getElementById('authModalSub').textContent=t==='login'?'Connectez-vous.':'Inscrivez-vous gratuitement.'}
async function doLogin(){const e=document.getElementById('loginEmail').value,p=document.getElementById('loginPassword').value;if(!e||!p)return showToast('Remplissez tout','error');try{const r=await fetch('/api/users/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p})});const d=await r.json();if(!r.ok)return showToast(d.error,'error');authToken=d.token;currentUser=d.user;localStorage.setItem('arty_token',authToken);localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();closeModal('auth');showToast(`Bienvenue, ${currentUser.name}!`,'success')}catch{showToast('Erreur de connexion','error')}}
async function doRegister(){const n=document.getElementById('regName').value,e=document.getElementById('regEmail').value,p=document.getElementById('regPassword').value;if(!n||!e||!p)return showToast('Remplissez tout','error');try{const r=await fetch('/api/users/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,password:p})});const d=await r.json();if(!r.ok)return showToast(d.error,'error');authToken=d.token;currentUser=d.user;localStorage.setItem('arty_token',authToken);localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();closeModal('auth');showToast(`Bienvenue chez Arty!, ${currentUser.name}!`,'success')}catch{showToast('Erreur','error')}}
function logout(s){fetch('/api/users/logout',{method:'POST',headers:authH()}).catch(()=>{});authToken=null;currentUser=null;localStorage.removeItem('arty_token');localStorage.removeItem('arty_user');updateAuthUI();navigate('#/');if(!s)showToast('Déconnecté','success')}

// ===== GOOGLE =====
function initGoogleSignIn(){
  const w=document.getElementById('googleBtnWrap');
  if(!googleClientId||googleClientId==='YOUR_GOOGLE_CLIENT_ID_HERE'){w.innerHTML=`<button class="google-btn" onclick="showToast('Google non configuré. Ajoutez votre Client ID dans data/db.json','error')" style="opacity:.6"><svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Continuer avec Google</button>`;return}
  try{google.accounts.id.initialize({client_id:googleClientId,callback:handleGoogle});w.innerHTML='';google.accounts.id.renderButton(w,{theme:'outline',size:'large',width:380,text:'continue_with',shape:'pill',locale:'fr'})}catch{w.innerHTML='<button class="google-btn" style="opacity:.5" onclick="showToast(\'Google non disponible\',\'error\')">Continuer avec Google</button>'}
}
async function handleGoogle(r){try{const res=await fetch('/api/users/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:r.credential})});const d=await res.json();if(!res.ok)return showToast(d.error,'error');authToken=d.token;currentUser=d.user;localStorage.setItem('arty_token',authToken);localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();closeModal('auth');showToast(`Bienvenue, ${currentUser.name}!`,'success')}catch{showToast('Échec Google','error')}}

// ===== BOOKING =====
function openBooking(eventId){if(!currentUser){openModal('auth');return showToast('Connectez-vous','error')}const ev=allEvents.find(e=>e.id===eventId);if(!ev)return;document.getElementById('bookingEventTitle').textContent=ev.title;document.getElementById('bookingPrice').textContent=ev.price.toFixed(2);document.getElementById('bookingName').value=currentUser.name;document.getElementById('bookingEmail').value=currentUser.email;document.getElementById('bookingModal').classList.add('active');document.getElementById('bookingModal').dataset.eid=eventId;document.body.style.overflow='hidden'}
async function confirmBooking(){const eid=document.getElementById('bookingModal').dataset.eid,n=document.getElementById('bookingName').value,e=document.getElementById('bookingEmail').value,g=document.getElementById('bookingGuests').value;if(!n||!e)return showToast('Remplissez','error');try{const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser?.id,eventId:eid,name:n,email:e,guests:g})});const d=await r.json();if(!r.ok)return showToast(d.error,'error');closeModal('booking');showToast('Réservation confirmée!','success');loadEvents()}catch{showToast('Erreur','error')}}
async function submitContact(){const n=document.getElementById('contactName').value,e=document.getElementById('contactEmail').value,m=document.getElementById('contactMessage').value;if(!n||!e||!m)return showToast('Remplissez tout','error');try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,message:m})});const d=await r.json();if(!r.ok)return showToast(d.error,'error');showToast(d.message,'success');['contactName','contactEmail','contactMessage'].forEach(id=>document.getElementById(id).value='')}catch{showToast('Erreur','error')}}

// ===== ADMIN =====
let adminTab='kits';
async function loadAdminData(){
  try{const r=await fetch('/api/admin/stats',{headers:authH()});const s=await r.json();document.getElementById('statKits').textContent=s.totalKits;document.getElementById('statCats').textContent=s.totalCategories;document.getElementById('statUsers').textContent=s.totalUsers;document.getElementById('statOrders').textContent=s.totalOrders}catch{}
  renderAdminKits();renderAdminCategories();renderAdminEvents();
}
function switchAdminTab(t,btn){document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');adminTab=t;document.getElementById('adminKitsPanel').style.display=t==='kits'?'block':'none';document.getElementById('adminCategoriesPanel').style.display=t==='categories'?'block':'none';document.getElementById('adminEventsPanel').style.display=t==='events'?'block':'none'}

// Admin Kits
function renderAdminKits(){
  const p=document.getElementById('adminKitsPanel');
  p.innerHTML=`<div class="admin-form-card"><h3 id="kitFormTitle">Ajouter un Kit</h3><input type="hidden" id="editKitId"><div class="form-row"><div class="form-group"><label>Nom</label><input type="text" id="aKitName"></div><div class="form-group"><label>Prix</label><input type="number" id="aKitPrice" step="0.01"></div></div><div class="form-group"><label>Description</label><textarea id="aKitDesc"></textarea></div><div class="form-row"><div class="form-group"><label>Catégorie</label><select id="aKitCat">${allCategories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></div><div class="form-group"><label>Difficulté</label><select id="aKitDiff"><option>Débutant</option><option>Intermédiaire</option><option>Avancé</option><option>Enfants</option></select></div></div><div class="form-group"><label>Image URL</label><input type="text" id="aKitImg"></div><div style="display:flex;gap:10px"><button class="btn btn-orange" onclick="saveKit()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetKitForm()" style="display:none" id="cancelKit">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Kit</th><th>Catégorie</th><th>Prix</th><th>Actions</th></tr></thead><tbody>${allKits.map(k=>{const cat=allCategories.find(c=>c.id===k.categoryId);return`<tr><td><strong>${k.name}</strong></td><td>${cat?cat.name:'-'}</td><td>$${k.price.toFixed(2)}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editKit(${k.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteKit(${k.id})">Supprimer</button></div></td></tr>`}).join('')}</tbody></table></div>`;
}
async function saveKit(){const eid=document.getElementById('editKitId').value;const p={name:document.getElementById('aKitName').value,price:document.getElementById('aKitPrice').value,description:document.getElementById('aKitDesc').value,categoryId:parseInt(document.getElementById('aKitCat').value),difficulty:document.getElementById('aKitDiff').value,image:document.getElementById('aKitImg').value};if(!p.name||!p.price)return showToast('Nom et prix requis','error');try{const r=await fetch(eid?`/api/admin/kits/${eid}`:'/api/admin/kits',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});const d=await r.json();if(d.error)return showToast(d.error,'error');showToast(eid?'Modifié!':'Ajouté!','success');await loadKits();loadAdminData()}catch{showToast('Erreur','error')}}
function editKit(id){const k=allKits.find(x=>x.id===id);if(!k)return;document.getElementById('editKitId').value=k.id;document.getElementById('aKitName').value=k.name;document.getElementById('aKitPrice').value=k.price;document.getElementById('aKitDesc').value=k.description||'';document.getElementById('aKitCat').value=k.categoryId;document.getElementById('aKitDiff').value=k.difficulty;document.getElementById('aKitImg').value=k.image||'';document.getElementById('kitFormTitle').textContent='Modifier le Kit';document.getElementById('cancelKit').style.display='inline-flex';window.scrollTo(0,0)}
function resetKitForm(){['editKitId','aKitName','aKitPrice','aKitDesc','aKitImg'].forEach(id=>document.getElementById(id).value='');document.getElementById('kitFormTitle').textContent='Ajouter un Kit';document.getElementById('cancelKit').style.display='none'}
async function deleteKit(id){if(!confirm('Supprimer?'))return;try{await fetch(`/api/admin/kits/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadKits();loadAdminData()}catch{showToast('Erreur','error')}}

// Admin Categories
function renderAdminCategories(){
  const p=document.getElementById('adminCategoriesPanel');
  p.innerHTML=`<div class="admin-form-card"><h3 id="catFormTitle">Ajouter une Catégorie</h3><input type="hidden" id="editCatId"><div class="form-row"><div class="form-group"><label>Nom</label><input type="text" id="aCatName"></div><div class="form-group"><label>Type</label><select id="aCatParent"><option value="individual">Individuel</option><option value="group">Groupe</option><option value="none">Autre</option></select></div></div><div class="form-group"><label>Image URL</label><input type="text" id="aCatImg"></div><div style="display:flex;gap:10px"><button class="btn btn-orange" onclick="saveCat()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetCatForm()" style="display:none" id="cancelCat">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Catégorie</th><th>Type</th><th>Image</th><th>Actions</th></tr></thead><tbody>${allCategories.map(c=>`<tr><td><strong>${c.name}</strong></td><td>${c.parent}</td><td>${c.image?'✅':'—'}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editCat(${c.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteCat(${c.id})">Supprimer</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
async function saveCat(){const eid=document.getElementById('editCatId').value;const p={name:document.getElementById('aCatName').value,parent:document.getElementById('aCatParent').value,image:document.getElementById('aCatImg').value};if(!p.name)return showToast('Nom requis','error');try{const r=await fetch(eid?`/api/admin/categories/${eid}`:'/api/admin/categories',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});const d=await r.json();if(d.error)return showToast(d.error,'error');showToast(eid?'Modifié!':'Ajouté!','success');await loadCategories();loadAdminData()}catch{showToast('Erreur','error')}}
function editCat(id){const c=allCategories.find(x=>x.id===id);if(!c)return;document.getElementById('editCatId').value=c.id;document.getElementById('aCatName').value=c.name;document.getElementById('aCatParent').value=c.parent;document.getElementById('aCatImg').value=c.image||'';document.getElementById('catFormTitle').textContent='Modifier la Catégorie';document.getElementById('cancelCat').style.display='inline-flex'}
function resetCatForm(){['editCatId','aCatName','aCatImg'].forEach(id=>document.getElementById(id).value='');document.getElementById('catFormTitle').textContent='Ajouter une Catégorie';document.getElementById('cancelCat').style.display='none'}
async function deleteCat(id){if(!confirm('Supprimer?'))return;try{await fetch(`/api/admin/categories/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadCategories();loadAdminData()}catch{showToast('Erreur','error')}}

// Admin Events
function renderAdminEvents(){
  const p=document.getElementById('adminEventsPanel');
  p.innerHTML=`<div class="admin-form-card"><h3 id="evFormTitle">Ajouter un Événement</h3><input type="hidden" id="editEvId"><div class="form-row"><div class="form-group"><label>Titre</label><input type="text" id="aEvTitle"></div><div class="form-group"><label>Date</label><input type="date" id="aEvDate"></div></div><div class="form-group"><label>Description</label><textarea id="aEvDesc"></textarea></div><div class="form-row"><div class="form-group"><label>Prix</label><input type="number" id="aEvPrice" step="0.01"></div><div class="form-group"><label>Places max</label><input type="number" id="aEvSpots"></div></div><div class="form-group"><label>Image URL</label><input type="text" id="aEvImg"></div><div style="display:flex;gap:10px"><button class="btn btn-orange" onclick="saveEv()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetEvForm()" style="display:none" id="cancelEv">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Événement</th><th>Date</th><th>Prix</th><th>Actions</th></tr></thead><tbody>${allEvents.map(e=>`<tr><td><strong>${e.title}</strong></td><td>${e.date}</td><td>$${e.price.toFixed(2)}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editEv(${e.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteEv(${e.id})">Supprimer</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
async function saveEv(){const eid=document.getElementById('editEvId').value;const p={title:document.getElementById('aEvTitle').value,date:document.getElementById('aEvDate').value,description:document.getElementById('aEvDesc').value,price:document.getElementById('aEvPrice').value,maxSpots:document.getElementById('aEvSpots').value,image:document.getElementById('aEvImg').value};if(!p.title||!p.date)return showToast('Titre et date requis','error');try{const r=await fetch(eid?`/api/admin/events/${eid}`:'/api/admin/events',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});const d=await r.json();if(d.error)return showToast(d.error,'error');showToast(eid?'Modifié!':'Ajouté!','success');await loadEvents();loadAdminData()}catch{showToast('Erreur','error')}}
function editEv(id){const e=allEvents.find(x=>x.id===id);if(!e)return;document.getElementById('editEvId').value=e.id;document.getElementById('aEvTitle').value=e.title;document.getElementById('aEvDate').value=e.date;document.getElementById('aEvDesc').value=e.description||'';document.getElementById('aEvPrice').value=e.price;document.getElementById('aEvSpots').value=e.maxSpots;document.getElementById('aEvImg').value=e.image||'';document.getElementById('evFormTitle').textContent='Modifier';document.getElementById('cancelEv').style.display='inline-flex'}
function resetEvForm(){['editEvId','aEvTitle','aEvDate','aEvDesc','aEvPrice','aEvSpots','aEvImg'].forEach(id=>document.getElementById(id).value='');document.getElementById('evFormTitle').textContent='Ajouter un Événement';document.getElementById('cancelEv').style.display='none'}
async function deleteEv(id){if(!confirm('Supprimer?'))return;try{await fetch(`/api/admin/events/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadEvents();loadAdminData()}catch{showToast('Erreur','error')}}

// ===== UTILS =====
function showToast(m,t='success'){const el=document.getElementById('toast');el.textContent=m;el.className=`toast ${t} show`;setTimeout(()=>el.classList.remove('show'),3500)}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o){o.classList.remove('active');document.body.style.overflow=''}}));