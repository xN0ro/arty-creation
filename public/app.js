/* Arty! — Application v3 */
let currentUser=null,authToken=null,allKits=[],allEvents=[],allCategories=[],teamActivities=[],allBundles=[],cart=[],currentFilter='all',googleClientId='',adminEvents=[],adminBookings=[],eventRequests=[],adminOrders=[];
let catalogFilters={category:'all',badge:'all',difficulty:'all',stock:'all',search:'',priceMin:'',priceMax:'',sort:'featured'};

document.addEventListener('DOMContentLoaded',async()=>{
  document.addEventListener('mousedown',e=>{
    if(!e.target.closest('input, textarea, select, [contenteditable="true"]')){
      const a=document.activeElement;
      if(a && a!==document.body && typeof a.blur==='function') a.blur();
    }
  });
  authToken=localStorage.getItem('arty_token');
  const u=localStorage.getItem('arty_user'); if(u) currentUser=JSON.parse(u);
  const c=localStorage.getItem('arty_cart'); if(c) cart=JSON.parse(c);
  try{const r=await fetch('/api/config');const cfg=await r.json();googleClientId=cfg.googleClientId||''}catch{}
  if(authToken&&currentUser){try{const r=await fetch('/api/users/me',{headers:authH()});if(!r.ok)throw 0;currentUser=await r.json();localStorage.setItem('arty_user',JSON.stringify(currentUser))}catch{logout(1)}}
  await Promise.all([loadKits(),loadCategories(),loadEvents(),loadTeam(),loadBundles()]);
  initNavbar();updateAuthUI();updateCartUI();initGoogleSignIn();initAuthValidation();
  window.addEventListener('hashchange',handleRoute);handleRoute();
});

function authH(){return authToken?{'Authorization':'Bearer '+authToken,'Content-Type':'application/json'}:{'Content-Type':'application/json'}}
function navigate(h){window.location.hash=h}
function safeText(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function safeAttr(v){return safeText(v).replace(/'/g,'&#39;')}
function toMoney(v){return Number(v||0).toFixed(2)}
function normalizeKitTags(kit){
  const raw=kit?.tags??kit?.badges??[];
  if(Array.isArray(raw))return raw.map(t=>String(t).trim()).filter(Boolean);
  return String(raw||'').split(',').map(t=>t.trim()).filter(Boolean);
}
function uniqueList(values){return [...new Set(values.map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'))}

// ===== ROUTER =====
function handleRoute(){
  const h=window.location.hash||'#/';
  const toastEl=document.getElementById('toast');
  if(toastEl){toastEl.classList.remove('show');}
  if(document.activeElement && typeof document.activeElement.blur==='function') document.activeElement.blur();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('mainFooter').style.display='';
  document.getElementById('navLinks').classList.remove('open');
  document.getElementById('navAuth').classList.remove('open');

  if(h.startsWith('#/product/')){show('page-product');renderProductPage(parseInt(h.split('/')[2]));window.scrollTo(0,0)}
  else if(h.startsWith('#/event/')){show('page-event');renderEventPage(parseInt(h.split('/')[2]));window.scrollTo(0,0)}
  else if(h==='#/profile'){if(!currentUser){navigate('#/');openModal('auth');return}show('page-profile');renderProfilePage();window.scrollTo(0,0)}
  else if(h==='#/admin'){if(!currentUser||currentUser.role!=='admin'){navigate('#/');showToast('Accès admin requis','error');return}show('page-admin');document.getElementById('mainFooter').style.display='none';loadAdminData();window.scrollTo(0,0)}
  else if(h.startsWith('#/paintings')){show('page-paintings');renderPaintingsPage();window.scrollTo(0,0)}
  else if(h==='#/tutorials'){show('page-tutorials');renderTutorialsPage();window.scrollTo(0,0)}
  else if(h==='#/bundles'){show('page-bundles');renderBundlesPage();window.scrollTo(0,0)}
  else if(h==='#/checkout'){show('page-checkout');renderCheckoutPage();window.scrollTo(0,0)}
  else if(h==='#/privacy'){show('page-privacy');initScrollEffects();window.scrollTo(0,0)}
  else if(h==='#/policies'){show('page-policies');initScrollEffects();window.scrollTo(0,0)}
  else if(h.startsWith('#/party')){show('page-party');renderPartyPage();handlePartySection(h);window.scrollTo(0,0)}
  else if(h==='#/team'){show('page-party');renderPartyPage();setTimeout(scrollToTeamEvents,220)}
  else{show('page-home');renderHomePage();if(h.includes('contact'))setTimeout(()=>document.getElementById('contact')?.scrollIntoView({behavior:'smooth'}),200)}
}
function show(id){document.getElementById(id).classList.add('active')}
function scrollToSection(id){navigate('#/');setTimeout(()=>{const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth'})},200)}

// ===== HOME PAGE RENDERING =====
function renderHomePage(){
  renderHomePopularKits();
  renderHomeCats();
  renderHomeEvents();
  initScrollEffects();
}

function renderHomePopularKits(){
  const featured = allKits.filter(k=>k.featured).slice(0,5);
  const kits = featured.length >= 5 ? featured : allKits.slice(0,5);
  document.getElementById('homePopularKits').innerHTML = kits.map(k=>{
    const cat = allCategories.find(c=>c.id===k.categoryId);
    return `<div class="kit-card" onclick="navigate('#/product/${k.id}')">
      <div class="kit-card-img"><img src="${k.image}" alt="${k.name}" loading="lazy">${k.featured?'<span class="kit-card-badge">Populaire</span>':''}</div>
      <div class="kit-card-body"><div class="kit-card-category">${cat?cat.name:''}</div><h3 class="kit-card-title">${k.name}</h3><p class="kit-card-desc">${k.shortDesc||k.description}</p>
      <div class="kit-card-footer"><span class="kit-card-price">$${k.price.toFixed(2)}</span><span class="kit-card-meta">${k.difficulty}</span></div></div></div>`;
  }).join('');
}

function renderHomeCats(){
  document.getElementById('homeCatGrid').innerHTML=allCategories.map(c=>
    `<div class="cat-card" onclick="navigate('#/paintings?cat=${c.id}')"><img src="${c.image}" alt="${c.name}" loading="lazy"><div class="cat-card-overlay"><span class="cat-card-name">${c.name}</span></div></div>`
  ).join('');
}

function renderHomeEvents(){
  const grid = document.getElementById('homeEventsGrid');
  if(!grid) return;
  const upcoming = [...allEvents].sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,3);
  grid.innerHTML = upcoming.map(ev=>{
    const d = new Date(ev.date+'T00:00:00');
    const dateStr = d.toLocaleDateString('fr-CA',{weekday:'long',day:'numeric',month:'long'});
    const spotsLeft = ev.maxSpots - ev.bookedSpots;
    return `<div class="event-card" onclick="navigate('#/event/${ev.id}')" style="cursor:pointer">
      <div class="event-card-img"><img src="${ev.image}" loading="lazy"></div>
      <div class="event-card-body">
        <div class="event-card-date">${dateStr} · ${ev.time||''}</div>
        <h3 class="event-card-title">${ev.title}</h3>
        <p class="event-card-desc">${ev.description}</p>
        <div class="event-card-footer">
          <span class="event-card-price">$${ev.price.toFixed(2)}</span>
          <span class="event-card-spots">${spotsLeft} place${spotsLeft!==1?'s':''} restante${spotsLeft!==1?'s':''}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ===== NAVBAR =====
function initNavbar(){
  window.addEventListener('scroll',()=>document.getElementById('navbar').classList.toggle('scrolled',window.scrollY>60));
  document.addEventListener('click',e=>{
    if(!e.target.closest('.nav-dropdown'))document.querySelectorAll('.nav-dropdown-menu').forEach(m=>m.classList.remove('open'));
    const navLink=e.target.closest('.nav-links a');
    if(navLink){
      const parent=navLink.closest('.nav-has-submenu');
      if(parent){parent.classList.add('submenu-closing');setTimeout(()=>parent.classList.remove('submenu-closing'),350)}
      document.querySelectorAll('.nav-submenu').forEach(m=>m.classList.remove('open'));
      document.activeElement?.blur?.();
      document.getElementById('navLinks')?.classList.remove('open');
      document.getElementById('navAuth')?.classList.remove('open');
    }
  });
  document.querySelectorAll('.nav-links a[data-nav]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const s=a.dataset.nav;if(s==='home'){navigate('#/');window.scrollTo({top:0,behavior:'smooth'})}else scrollToSection(s)}));
}
function toggleMobile(){document.getElementById('navLinks').classList.toggle('open');document.getElementById('navAuth').classList.toggle('open')}
function toggleDropdown(){document.querySelector('.nav-dropdown-menu')?.classList.toggle('open')}
function updateAuthUI(){
  const a=document.getElementById('navAuth');
  const cartH=`<button class="btn-cart nav-cart-btn" onclick="openCart()" id="cartBtn" aria-label="Panier" style="${cart.length?'display:flex':'display:none'}"><span class="cart-icon">🛒</span><span id="cartCount" class="cart-count-badge">${cart.reduce((s,i)=>s+i.qty,0)}</span></button>`;
  if(currentUser){
    const av=currentUser.picture?`<img src="${currentUser.picture}">`:`${currentUser.name.charAt(0).toUpperCase()}`;
    const adm=currentUser.role==='admin'?`<a href="#/admin" class="admin-link">Admin</a>`:'';
    a.innerHTML=`${cartH}<div class="nav-dropdown"><div class="nav-user" onclick="toggleDropdown()"><div class="nav-user-avatar">${av}</div><span class="nav-user-name">${currentUser.name.split(' ')[0]}</span></div><div class="nav-dropdown-menu"><a href="#/profile">Mon Profil</a>${adm}<button class="logout-btn" onclick="logout()">Déconnexion</button></div></div>`;
  }else{a.innerHTML=`${cartH}<button class="btn btn-ghost btn-sm" onclick="openModal('auth')">Connexion</button><button class="btn btn-orange btn-sm" onclick="openModal('auth','register')">S'inscrire</button>`}
}

// ===== DATA =====
async function loadKits(){try{allKits=await(await fetch('/api/kits')).json()}catch{allKits=[]}}
async function loadCategories(){try{allCategories=await(await fetch('/api/categories')).json()}catch{allCategories=[]}}
async function loadEvents(){try{allEvents=await(await fetch('/api/events')).json()}catch{allEvents=[]}}
async function loadTeam(){try{teamActivities=await(await fetch('/api/team-activities')).json()}catch{teamActivities=[]}}
async function loadBundles(){try{allBundles=await(await fetch('/api/bundles')).json()}catch{allBundles=[]}}
async function loadAdminEvents(){try{adminEvents=await(await fetch('/api/admin/events',{headers:authH()})).json()}catch{adminEvents=[]}}
async function loadAdminBookings(){try{adminBookings=await(await fetch('/api/admin/bookings',{headers:authH()})).json()}catch{adminBookings=[]}}
async function loadAdminOrders(){try{adminOrders=await(await fetch('/api/admin/orders',{headers:authH()})).json()}catch{adminOrders=[]}}
async function loadEventRequests(){try{eventRequests=await(await fetch('/api/admin/event-requests',{headers:authH()})).json()}catch{eventRequests=[]}}
function formatEventDate(ev,withYear=false){
  if(!ev?.date)return 'Date à confirmer';
  const d=new Date(ev.date+'T00:00:00');
  return d.toLocaleDateString('fr-CA',{weekday:'long',day:'numeric',month:'long',year:withYear?'numeric':undefined});
}
function spotsLeft(ev){return Math.max(0,(parseInt(ev?.maxSpots)||0)-(parseInt(ev?.bookedSpots)||0))}
function eventIncludes(ev){
  const raw=ev?.includes||[];
  if(Array.isArray(raw))return raw.map(x=>String(x).trim()).filter(Boolean);
  return String(raw||'').split(',').map(x=>x.trim()).filter(Boolean);
}
function scrollToPartyEvents(){document.getElementById('partyEvents')?.scrollIntoView({behavior:'smooth',block:'start'})}
function scrollToEventRequest(){document.getElementById('privateEventRequest')?.scrollIntoView({behavior:'smooth',block:'start'})}
function scrollToTeamEvents(){document.getElementById('teamEvents')?.scrollIntoView({behavior:'smooth',block:'start'})}
function handlePartySection(hash){
  const q=hash.split('?')[1]||'';
  const section=new URLSearchParams(q).get('section');
  if(!section)return;
  setTimeout(()=>{
    if(section==='calendar')scrollToPartyEvents();
    if(section==='private')scrollToEventRequest();
    if(section==='team')scrollToTeamEvents();
  },240);
}
function prefillPrivateEventType(type){
  scrollToEventRequest();
  setTimeout(()=>{const el=document.getElementById('reqType');if(el)el.value=type;},260);
}

// ===== SCROLL =====
function initScrollEffects(){
  const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:.1});
  document.querySelectorAll('.fade-up,.stagger-children').forEach(el=>{el.classList.remove('visible');obs.observe(el)});
}

// ===== PAINTINGS PAGE =====
function renderPaintingsPage(){
  const params=new URLSearchParams((window.location.hash.split('?')[1]||''));
  catalogFilters={category:params.get('cat')||'all',badge:'all',difficulty:'all',stock:'all',search:'',priceMin:'',priceMax:'',sort:'featured'};
  renderCatalogFilterOptions();
  syncCatalogInputs();
  renderKitsGrid();
  initScrollEffects();
}

function renderCatalogFilterOptions(){
  const cats=document.getElementById('categoryFilterList');
  if(cats){
    const buttons=[`<button class="catalog-pill active" data-category="all" onclick="setCatalogFilter('category','all')">Tous <span>${allKits.length}</span></button>`]
      .concat(allCategories.map(c=>{
        const count=allKits.filter(k=>String(k.categoryId)===String(c.id)).length;
        return `<button class="catalog-pill" data-category="${safeAttr(c.id)}" onclick="setCatalogFilter('category','${safeAttr(c.id)}')">${safeText(c.name)} <span>${count}</span></button>`;
      }));
    cats.innerHTML=buttons.join('');
  }

  const badgeWrap=document.getElementById('badgeFilterList');
  if(badgeWrap){
    const badges=uniqueList(allKits.flatMap(k=>normalizeKitTags(k)));
    if(!badges.length){
      badgeWrap.innerHTML='<p class="filter-empty-note">Ajoutez des badges dans l\'admin: enfants, couple, cadeau, mini-kit, etc.</p>';
    }else{
      badgeWrap.innerHTML=`<button class="catalog-chip active" data-badge="all" onclick="setCatalogFilter('badge','all')">Tous</button>`+
        badges.map(b=>`<button class="catalog-chip" data-badge="${safeAttr(b)}" onclick="setCatalogFilter('badge','${safeAttr(b)}')">${safeText(b)}</button>`).join('');
    }
  }

  const diffWrap=document.getElementById('difficultyFilterList');
  if(diffWrap){
    const diffs=uniqueList(allKits.map(k=>k.difficulty||''));
    diffWrap.innerHTML=`<button class="catalog-chip active" data-difficulty="all" onclick="setCatalogFilter('difficulty','all')">Tous</button>`+
      diffs.map(d=>`<button class="catalog-chip" data-difficulty="${safeAttr(d)}" onclick="setCatalogFilter('difficulty','${safeAttr(d)}')">${safeText(d)}</button>`).join('');
  }
}

function setCatalogFilter(key,value){
  catalogFilters[key]=value;
  if(key==='category') currentFilter=value;
  syncCatalogInputs();
  renderKitsGrid();
}

function updateCatalogFromInput(key,el){
  catalogFilters[key]=el.type==='checkbox' ? (el.checked?'in':'all') : el.value;
  renderKitsGrid();
}

function syncCatalogInputs(){
  const search=document.getElementById('kitSearchInput'); if(search) search.value=catalogFilters.search||'';
  const sort=document.getElementById('kitSortSelect'); if(sort) sort.value=catalogFilters.sort||'featured';
  const min=document.getElementById('priceMinInput'); if(min) min.value=catalogFilters.priceMin||'';
  const max=document.getElementById('priceMaxInput'); if(max) max.value=catalogFilters.priceMax||'';
  const stock=document.getElementById('stockOnlyInput'); if(stock) stock.checked=catalogFilters.stock==='in';
  document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',String(b.dataset.category)===String(catalogFilters.category)));
  document.querySelectorAll('[data-badge]').forEach(b=>b.classList.toggle('active',String(b.dataset.badge)===String(catalogFilters.badge)));
  document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.toggle('active',String(b.dataset.difficulty)===String(catalogFilters.difficulty)));
}

function resetCatalogFilters(){
  catalogFilters={category:'all',badge:'all',difficulty:'all',stock:'all',search:'',priceMin:'',priceMax:'',sort:'featured'};
  currentFilter='all';
  syncCatalogInputs();
  renderKitsGrid();
}

function removeCatalogFilter(key){
  catalogFilters[key]=key==='sort'?'featured':'all';
  if(['search','priceMin','priceMax'].includes(key)) catalogFilters[key]='';
  syncCatalogInputs();
  renderKitsGrid();
}

function filterByCat(catId){
  catalogFilters.category=String(catId);
  currentFilter=String(catId);
  syncCatalogInputs();
  renderKitsGrid();
  document.getElementById('catalogResultsTop')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function getFilteredKits(){
  const q=(catalogFilters.search||'').toLowerCase().trim();
  const min=catalogFilters.priceMin!==''?parseFloat(catalogFilters.priceMin):null;
  const max=catalogFilters.priceMax!==''?parseFloat(catalogFilters.priceMax):null;
  let kits=allKits.filter(k=>{
    const cat=allCategories.find(c=>String(c.id)===String(k.categoryId));
    const tags=normalizeKitTags(k);
    const hay=[k.name,k.shortDesc,k.description,k.difficulty,cat?.name,...tags].join(' ').toLowerCase();
    if(catalogFilters.category!=='all' && String(k.categoryId)!==String(catalogFilters.category)) return false;
    if(catalogFilters.badge!=='all' && !tags.some(t=>t.toLowerCase()===String(catalogFilters.badge).toLowerCase())) return false;
    if(catalogFilters.difficulty!=='all' && String(k.difficulty)!==String(catalogFilters.difficulty)) return false;
    if(catalogFilters.stock==='in' && k.inStock===false) return false;
    if(q && !hay.includes(q)) return false;
    if(min!==null && Number(k.price||0)<min) return false;
    if(max!==null && Number(k.price||0)>max) return false;
    return true;
  });
  const sort=catalogFilters.sort||'featured';
  kits.sort((a,b)=>{
    if(sort==='price-asc') return Number(a.price||0)-Number(b.price||0);
    if(sort==='price-desc') return Number(b.price||0)-Number(a.price||0);
    if(sort==='name') return String(a.name||'').localeCompare(String(b.name||''),'fr');
    if(sort==='newest') return Number(b.id||0)-Number(a.id||0);
    return Number(!!b.featured)-Number(!!a.featured) || String(a.name||'').localeCompare(String(b.name||''),'fr');
  });
  return kits;
}

function renderActiveFilters(filtered){
  const wrap=document.getElementById('activeFilters');
  const result=document.getElementById('catalogResultText');
  if(result) result.textContent=`${filtered.length} produit${filtered.length!==1?'s':''} trouvé${filtered.length!==1?'s':''} sur ${allKits.length}`;
  if(!wrap) return;
  const chips=[];
  if(catalogFilters.category!=='all'){
    const cat=allCategories.find(c=>String(c.id)===String(catalogFilters.category));
    chips.push(`<button onclick="removeCatalogFilter('category')">Catégorie: ${safeText(cat?.name||catalogFilters.category)} ×</button>`);
  }
  if(catalogFilters.badge!=='all') chips.push(`<button onclick="removeCatalogFilter('badge')">Badge: ${safeText(catalogFilters.badge)} ×</button>`);
  if(catalogFilters.difficulty!=='all') chips.push(`<button onclick="removeCatalogFilter('difficulty')">Niveau: ${safeText(catalogFilters.difficulty)} ×</button>`);
  if(catalogFilters.stock==='in') chips.push(`<button onclick="removeCatalogFilter('stock')">En stock seulement ×</button>`);
  if(catalogFilters.search) chips.push(`<button onclick="removeCatalogFilter('search')">Recherche: ${safeText(catalogFilters.search)} ×</button>`);
  if(catalogFilters.priceMin) chips.push(`<button onclick="removeCatalogFilter('priceMin')">Min: $${safeText(catalogFilters.priceMin)} ×</button>`);
  if(catalogFilters.priceMax) chips.push(`<button onclick="removeCatalogFilter('priceMax')">Max: $${safeText(catalogFilters.priceMax)} ×</button>`);
  wrap.innerHTML=chips.length?chips.join(''):'<span class="active-filter-placeholder">Aucun filtre actif</span>';
}

function renderKitsGrid(){
  const g=document.getElementById('kitsGrid'); if(!g)return;
  const filtered=getFilteredKits();
  renderActiveFilters(filtered);
  g.classList.remove('visible');
  g.innerHTML=filtered.map(k=>{
    const cat=allCategories.find(c=>String(c.id)===String(k.categoryId));
    const tags=normalizeKitTags(k).slice(0,4);
    const img=k.image||'logoarty.png';
    const isInStock=k.inStock!==false;
    const stockLabel=isInStock?'En stock':'Épuisé';
    return `<div class="kit-card catalog-kit-card" onclick="navigate('#/product/${k.id}')">
      <div class="kit-card-img"><img src="${safeAttr(img)}" alt="${safeAttr(k.name)}" loading="lazy">${k.featured?'<span class="kit-card-badge">Populaire</span>':''}${!isInStock?'<span class="kit-stock-badge">Épuisé</span>':''}</div>
      <div class="kit-card-body">
        <div class="kit-card-category">${safeText(cat?cat.name:'Sans catégorie')}</div>
        <h3 class="kit-card-title">${safeText(k.name)}</h3>
        <p class="kit-card-desc">${safeText(k.shortDesc||k.description||'')}</p>
        <div class="kit-card-tags">${tags.map(t=>`<span>${safeText(t)}</span>`).join('')}</div>
        <div class="kit-card-footer"><span class="kit-card-price">$${toMoney(k.price)}</span><span class="kit-card-meta">${safeText(k.difficulty||stockLabel)}</span></div>
      </div>
    </div>`;
  }).join('');
  if(!filtered.length) g.innerHTML='<div class="empty-state catalog-empty"><div class="empty-state-icon">🎨</div><h3>Aucun produit trouvé</h3><p>Essayez de retirer un filtre ou de chercher un mot plus simple.</p><button class="btn btn-orange btn-sm" onclick="resetCatalogFilters()">Réinitialiser les filtres</button></div>';
  setTimeout(()=>g.classList.add('visible'),50);
}

function toggleCatalogFilters(){
  document.getElementById('catalogSidebar')?.classList.toggle('open');
}

// ===== PRODUCT PAGE =====
function renderProductPage(id){
  const kit=allKits.find(k=>k.id===id);const c=document.getElementById('productPageContent');
  if(!kit){c.innerHTML='<div class="empty-state" style="padding:60px 0"><div class="empty-state-icon">🎨</div><p>Kit non trouvé</p></div>';return}
  const cat=allCategories.find(ct=>ct.id===kit.categoryId);
  const imgs=kit.images?.length?kit.images:[kit.image];
  const thumbs=imgs.length>1?`<div class="product-thumbs">${imgs.map((img,i)=>`<img src="${img}" class="product-thumb${i===0?' active':''}" onclick="switchImg(this,'${img}')">`).join('')}</div>`:'';
  const inc=kit.includes?.length?`<div class="product-includes"><h3>Inclus dans ce kit</h3><ul>${kit.includes.map(i=>`<li>${i}</li>`).join('')}</ul></div>`:'';
  const kitTags=normalizeKitTags(kit);
  const productInStock=kit.inStock!==false;
  c.innerHTML=`<button class="product-back" onclick="navigate('#/paintings')">← Retour aux kits</button><div class="product-layout"><div class="product-gallery"><img src="${safeAttr(imgs[0]||'logoarty.png')}" class="product-main-img" id="pMainImg">${thumbs}</div><div class="product-info"><div class="product-cat">${safeText(cat?cat.name:'')}</div><h1>${safeText(kit.name)}</h1><div class="product-price">$${toMoney(kit.price)}</div><p class="product-desc">${safeText(kit.description||'')}</p><div class="product-tags"><span class="product-tag">${safeText(kit.difficulty||'')}</span><span class="product-tag">${productInStock?'En stock':'Épuisé'}</span>${kitTags.map(t=>`<span class="product-tag">${safeText(t)}</span>`).join('')}</div>${inc}<div class="product-qty-row"><label>Qté:</label><div class="qty-ctrl"><button class="qty-btn" onclick="chgQty(-1)">−</button><input class="qty-val" id="pQty" value="1" readonly><button class="qty-btn" onclick="chgQty(1)">+</button></div></div><div class="product-buttons"><button class="btn btn-orange" onclick="addToCart(${kit.id})" ${!productInStock?'disabled style="opacity:.4"':''}>${productInStock?'Ajouter au panier':'Épuisé'}</button><button class="btn btn-teal" onclick="buyNow(${kit.id})" ${!productInStock?'disabled style="opacity:.4"':''}>Acheter maintenant →</button></div></div></div>`;
}
function switchImg(th,src){document.getElementById('pMainImg').src=src;document.querySelectorAll('.product-thumb').forEach(t=>t.classList.remove('active'));th.classList.add('active')}
function chgQty(d){const i=document.getElementById('pQty');if(!i)return;i.value=Math.min(10,Math.max(1,parseInt(i.value)+d))}

// ===== EVENT DETAIL PAGE =====
function renderEventPage(id){
  const ev=allEvents.find(k=>k.id===id);
  const c=document.getElementById('eventPageContent');
  if(!ev){c.innerHTML='<div class="empty-state" style="padding:60px 0"><div class="empty-state-icon">📅</div><p>Événement non trouvé</p></div>';return}
  const left=spotsLeft(ev);
  const booked=parseInt(ev.bookedSpots)||0;
  const max=parseInt(ev.maxSpots)||0;
  const pct=max?Math.min(100,(booked/max)*100):0;
  const includes=eventIncludes(ev);
  c.innerHTML=`
    <button class="product-back" onclick="navigate('#/party')">← Retour aux événements</button>
    <div class="event-detail-modern">
      <div class="event-detail-media">
        <img src="${safeAttr(ev.image||'photoacceuil.jpg')}" alt="${safeAttr(ev.title)}" class="event-detail-img">
        <div class="event-detail-floating-card">
          <span>${left>0?left:'0'}</span>
          <small>place${left!==1?'s':''} disponible${left!==1?'s':''}</small>
        </div>
      </div>
      <div class="event-detail-info event-detail-modern-info">
        <div class="event-type-badge">${safeText(ev.eventType||'Atelier peinture')}</div>
        <div class="event-detail-date">${formatEventDate(ev,true)} · ${safeText(ev.time||'18:00')}</div>
        <h1>${safeText(ev.title)}</h1>
        <div class="product-price">$${toMoney(ev.price)} <span>/personne</span></div>
        <p class="product-desc">${safeText(ev.description||'Une activité créative Arty avec tout le matériel inclus.')}</p>
        <div class="event-detail-meta">
          <span class="event-meta-tag">⏱ ${safeText(ev.duration||'2 heures')}</span>
          <span class="event-meta-tag">📍 ${safeText(ev.location||'Lieu à confirmer')}</span>
          <span class="event-meta-tag">👥 Max ${max||20} personnes</span>
        </div>
        ${includes.length?`<div class="event-includes-box"><h3>Inclus dans l’événement</h3><ul>${includes.map(i=>`<li>${safeText(i)}</li>`).join('')}</ul></div>`:''}
        <div class="event-spots-info">
          <div class="event-spots-row"><span class="spots-text">${left>0?left+' place'+(left>1?'s':'')+' restante'+(left>1?'s':''):'Complet'}</span><span>${booked}/${max||0} réservé${booked>1?'s':''}</span></div>
          <div class="event-spots-bar"><div class="event-spots-bar-fill" style="width:${pct}%"></div></div>
        </div>
        ${ev.hostNote?`<p class="event-host-note">${safeText(ev.hostNote)}</p>`:''}
        <div class="event-detail-actions">
          <button class="btn btn-orange" onclick="openBooking(${ev.id})" ${left<=0?'disabled style="opacity:.45"':''}>${left<=0?'Complet':'Réserver ma place →'}</button>
          <button class="btn btn-ghost" onclick="navigate('#/party');setTimeout(scrollToEventRequest,250)">Demander un événement privé</button>
        </div>
      </div>
    </div>`;
}

// ===== PARTY PAGE EVENTS =====
function renderPartyPage(){
  renderPartyEvents();
  renderTeamPage();
  initScrollEffects();
}
function renderPartyEvents(){
  const partyGrid=document.getElementById('partyEventsGrid');
  const count=document.getElementById('eventPublishedCount');
  if(!partyGrid)return;
  const sorted=[...allEvents].sort((a,b)=>new Date((a.date||'')+'T'+(a.time||'00:00'))-new Date((b.date||'')+'T'+(b.time||'00:00')));
  if(count)count.textContent=String(sorted.length);
  partyGrid.innerHTML=sorted.map(ev=>{
    const left=spotsLeft(ev);
    const booked=parseInt(ev.bookedSpots)||0;
    const max=parseInt(ev.maxSpots)||0;
    const pct=max?Math.min(100,(booked/max)*100):0;
    return `<article class="event-card event-card-modern" onclick="navigate('#/event/${ev.id}')">
      <div class="event-card-img"><img src="${safeAttr(ev.image||'photoacceuil.jpg')}" alt="${safeAttr(ev.title)}" loading="lazy"><span class="event-card-type">${safeText(ev.eventType||'Atelier')}</span></div>
      <div class="event-card-body">
        <div class="event-card-date">${formatEventDate(ev)} · ${safeText(ev.time||'18:00')}</div>
        <h3 class="event-card-title">${safeText(ev.title)}</h3>
        <p class="event-card-desc">${safeText(ev.description||'Réservez votre place pour une activité peinture Arty.')}</p>
        <div class="event-card-mini-meta"><span>${safeText(ev.duration||'2 heures')}</span><span>${safeText(ev.location||'Lieu à confirmer')}</span></div>
        <div class="event-card-seatbar"><div style="width:${pct}%"></div></div>
        <div class="event-card-footer">
          <span class="event-card-price">$${toMoney(ev.price)}</span>
          <span class="event-card-spots ${left<=0?'is-full':''}">${left<=0?'Complet':left+' place'+(left>1?'s':'')}</span>
        </div>
        <button class="btn btn-orange btn-sm" onclick="event.stopPropagation();openBooking(${ev.id})" ${left<=0?'disabled style="opacity:.45"':''}>Réserver</button>
      </div>
    </article>`;
  }).join('');
  if(!sorted.length)partyGrid.innerHTML=`<div class="event-empty-card"><h3>Aucun événement publié pour le moment</h3><p>Vous pouvez quand même demander un événement privé pour un anniversaire, mariage, fête ou activité familiale.</p><button class="btn btn-orange" onclick="scrollToEventRequest()">Demander un événement →</button></div>`;
}
// ===== TEAM PAGE =====
function renderTeamPage(){
  const activities = [
    {
      icon:'🎨',
      title:'Peinture sur toile',
      subtitle:'Kits de peinture pour équipes',
      description:'Une activité artistique simple et amusante où chaque participant crée sa propre œuvre, avec tout le matériel livré directement à votre bureau.'
    },
    {
      icon:'👜',
      title:'Peinture sur tissu et bois',
      subtitle:'Activité créative à faire ensemble',
      description:'Personnalisez des objets en tissu ou en bois dans une ambiance collaborative, parfaite pour les team buildings et les journées de reconnaissance.'
    },
    {
      icon:'🌸',
      title:'Compositions avec fleurs séchées',
      subtitle:'Atelier décoratif personnalisé',
      description:'Création d’articles décoratifs avec fleurs séchées, comme des supports-bougies, bracelets, couronnes florales, cartes de vœux et autres petits objets personnalisés.'
    }
  ];
  document.getElementById('teamGrid').innerHTML = activities.map(a=>`
    <div class="team-card team-activity-card">
      <div class="team-activity-icon">${a.icon}</div>
      <div class="team-card-body">
        <div class="team-card-sub">${a.subtitle}</div>
        <h3>${a.title}</h3>
        <p>${a.description}</p>
      </div>
    </div>`).join('');
  initScrollEffects();
}

// ===== TUTORIALS PAGE =====
function renderTutorialsPage(){
  const kitsWithVideo = allKits.filter(k=>k.videoUrl && k.videoUrl.trim());
  const grid = document.getElementById('tutorialsGrid');
  if(!kitsWithVideo.length){grid.innerHTML='<div class="empty-state"><div class="empty-state-icon">🎬</div><p>Aucun tutoriel disponible pour le moment.</p></div>';initScrollEffects();return}
  grid.innerHTML = kitsWithVideo.map(k=>`<div class="tutorial-card">
    <div class="tutorial-video-wrap" onclick="playVideo(this,'${k.videoUrl}')">
      <img src="${k.image}" alt="${k.videoTitle||k.name}" loading="lazy">
      <div class="tutorial-play-btn"></div>
    </div>
    <div class="tutorial-body">
      <div class="tutorial-kit-name">Kit: ${k.name}</div>
      <h3 class="tutorial-title">${k.videoTitle||'Tutoriel '+k.name}</h3>
      <p class="tutorial-diff">${k.difficulty}</p>
    </div>
  </div>`).join('');
  initScrollEffects();
}
function playVideo(el,url){el.innerHTML=`<iframe src="${url}?autoplay=1" allow="autoplay;encrypted-media" allowfullscreen></iframe>`}

// ===== BUNDLES PAGE =====
function renderBundlesPage(){
  const allGrid = document.getElementById('bundlesGrid');
  const miniGrid = document.getElementById('miniBundlesGrid');
  const coupleGrid = document.getElementById('coupleBundlesGrid');
  const noMsg = document.getElementById('noBundles');

  if(!allBundles.length){
    [allGrid, miniGrid, coupleGrid].forEach(g=>{ if(g) g.innerHTML=''; });
    noMsg.style.display='block';
    initScrollEffects();
    return;
  }

  noMsg.style.display='none';
  const hasWords = (bundle, words) => {
    const txt = `${bundle.name||''} ${bundle.description||''} ${bundle.tag||''}`.toLowerCase();
    return words.some(w=>txt.includes(w));
  };
  const miniBundles = allBundles.filter(b=>hasWords(b,['mini']));
  const coupleBundles = allBundles.filter(b=>hasWords(b,['couple','duo','amoureux','soirée à deux','soiree a deux']));

  allGrid.innerHTML = allBundles.map(renderBundleCard).join('');
  miniGrid.innerHTML = miniBundles.length ? miniBundles.map(renderBundleCard).join('') : `<div class="bundle-empty-note">Ajoutez vos mini kits dans l'admin pour les afficher ici.</div>`;
  coupleGrid.innerHTML = coupleBundles.length ? coupleBundles.map(renderBundleCard).join('') : `<div class="bundle-empty-note">Ajoutez vos ensembles pour soirée en couple dans l'admin pour les afficher ici.</div>`;
  initScrollEffects();
}

function renderBundleCard(b){
  const kitNames = (b.kitIds||[]).map(id=>{const k=allKits.find(x=>x.id===id);return k?k.name:'Kit'});
  const price = Number(b.price)||0;
  const originalPrice = Number(b.originalPrice)||0;
  return `<div class="bundle-card">
    ${b.tag?`<div class="bundle-card-ribbon">${b.tag}</div>`:''}
    <div class="bundle-card-img"><img src="${b.image}" alt="${b.name}" loading="lazy"></div>
    <div class="bundle-card-body">
      <div class="bundle-card-tag">🎁 Ensemble de peinture</div>
      <h3>${b.name}</h3>
      <p class="bundle-card-desc">${b.description||''}</p>
      <div class="bundle-card-includes">${kitNames.map(n=>`<span>${n}</span>`).join('')}</div>
      <div class="bundle-card-footer">
        <div class="bundle-card-price">
          <span class="current">$${price.toFixed(2)}</span>
          ${originalPrice?`<span class="original">$${originalPrice.toFixed(2)}</span>`:''}
        </div>
        <button class="btn btn-orange btn-sm" onclick="addBundleToCart(${b.id})">Ajouter</button>
      </div>
    </div>
  </div>`;
}


// ===== PROFILE =====
async function renderProfilePage(){
  const c=document.getElementById('profilePageContent');if(!currentUser)return;
  const av=currentUser.picture?`<img src="${currentUser.picture}">`:`${currentUser.name.charAt(0).toUpperCase()}`;
  const badge=currentUser.role==='admin'?'<span class="profile-badge admin">Admin</span>':'<span class="profile-badge user">Membre</span>';
  const prov=currentUser.provider==='google'?'Google':'Courriel & mot de passe';
  c.innerHTML=`<div style="padding-top:20px"><div class="profile-header"><div class="profile-avatar">${av}</div><div class="profile-meta"><h2>${currentUser.name}</h2><p>${currentUser.email} · ${prov}</p>${badge}</div></div><div class="profile-tabs"><button class="profile-tab active" onclick="switchPTab('orders',this)">Commandes</button><button class="profile-tab" onclick="switchPTab('bookings',this)">Réservations</button><button class="profile-tab" onclick="switchPTab('settings',this)">Paramètres</button></div><div class="profile-panel active" id="panel-orders"><div class="profile-card"><h3>Historique des Commandes</h3><div id="ordersWrap"><p style="color:var(--text-faint)">Chargement...</p></div></div></div><div class="profile-panel" id="panel-bookings"><div class="profile-card"><h3>Mes Réservations</h3><div id="bookingsWrap"><p style="color:var(--text-faint)">Chargement...</p></div></div></div><div class="profile-panel" id="panel-settings"><div class="profile-card"><h3>Paramètres du Compte</h3><div class="form-group"><label>Nom</label><input type="text" id="profileName" value="${currentUser.name}"></div><div class="form-group"><label>Courriel</label><input type="email" value="${currentUser.email}" disabled style="opacity:.5"></div>${currentUser.provider==='local'?`<div class="form-group"><label>Mot de passe actuel</label><input type="password" id="pCurPw" placeholder="Requis pour changer"></div><div class="form-group"><label>Nouveau mot de passe</label><input type="password" id="pNewPw" placeholder="Laisser vide pour garder"></div>`:'<p style="font-size:.86rem;color:var(--text-light);margin:14px 0">Mot de passe géré par Google.</p>'}<button class="btn btn-teal" onclick="updateProfile()">Sauvegarder</button></div></div></div>`;
  try{const r=await fetch('/api/orders/mine',{headers:authH()});const orders=await r.json();document.getElementById('ordersWrap').innerHTML=orders.length?orders.map(o=>`<div class="order-item"><div><div class="order-id">${o.id}</div><div class="order-date">${new Date(o.createdAt).toLocaleDateString('fr-CA')}</div><div class="order-items-list">${o.items.map(i=>i.name+' ×'+i.qty).join(', ')}</div></div><div style="text-align:right"><div class="order-total">$${o.total.toFixed(2)}</div><span class="order-status">${o.status}</span></div></div>`).join(''):'<div class="empty-state"><div class="empty-state-icon">📦</div><p>Aucune commande</p></div>'}catch{}
  try{const r=await fetch('/api/bookings/mine',{headers:authH()});const bks=await r.json();document.getElementById('bookingsWrap').innerHTML=bks.length?bks.map(b=>`<div class="order-item"><div><div class="order-id">${b.event?.title||'Événement'}</div><div class="order-date">${b.event?.date||''} · ${b.guests} personne(s)</div></div><div><span class="order-status">${b.status}</span></div></div>`).join(''):'<div class="empty-state"><div class="empty-state-icon">🎫</div><p>Aucune réservation</p></div>'}catch{}
}
function switchPTab(t,btn){document.querySelectorAll('.profile-tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.profile-panel').forEach(p=>p.classList.remove('active'));btn.classList.add('active');document.getElementById('panel-'+t).classList.add('active')}
async function updateProfile(){const body={name:document.getElementById('profileName').value};if(currentUser.provider==='local'){const cp=document.getElementById('pCurPw')?.value,np=document.getElementById('pNewPw')?.value;if(np){body.currentPassword=cp;body.newPassword=np}}try{const r=await fetch('/api/users/me',{method:'PUT',headers:authH(),body:JSON.stringify(body)});const d=await r.json();if(!r.ok)return showToast(d.error,'error');currentUser=d.user;localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();showToast('Profil mis à jour!','success')}catch{showToast('Erreur','error')}}

// ===== CART & CHECKOUT =====
function normalizeCartId(id){return String(id)}
function cleanCart(){
  cart=(cart||[]).map(i=>({
    id:normalizeCartId(i.id),
    name:String(i.name||''),
    price:Number(i.price)||0,
    image:i.image||'',
    qty:Math.max(1,parseInt(i.qty)||1),
    type:i.type || (String(i.id).startsWith('bundle-')?'bundle':'kit')
  })).filter(i=>i.id&&i.name&&i.qty>0);
}
function addToCart(kitId){
  const kit=allKits.find(k=>String(k.id)===String(kitId));
  if(!kit)return;
  if(kit.inStock===false)return showToast('Ce produit est épuisé','error');
  const qty=parseInt(document.getElementById('pQty')?.value||1);
  const id=normalizeCartId(kit.id);
  const ex=cart.find(i=>String(i.id)===id);
  if(ex)ex.qty+=qty;
  else cart.push({id,name:kit.name,price:Number(kit.price)||0,image:kit.image,qty,type:'kit'});
  saveCart();updateCartUI();showToast(`${kit.name} ajouté au panier!`,'success');
}
function buyNow(id){addToCart(id);setTimeout(()=>goToCheckout(),250)}
function addBundleToCart(bundleId){
  const b=allBundles.find(x=>String(x.id)===String(bundleId));
  if(!b)return;
  const id='bundle-'+b.id;
  const ex=cart.find(i=>String(i.id)===id);
  if(ex)ex.qty+=1;
  else cart.push({id,name:b.name+' (Ensemble)',price:Number(b.price)||0,image:b.image,qty:1,type:'bundle'});
  saveCart();updateCartUI();showToast('Ensemble ajouté au panier!','success')
}
function removeFromCart(id){
  const sid=String(id);
  cart=cart.filter(i=>String(i.id)!==sid);
  saveCart();updateCartUI();renderCartItems();refreshCheckoutIfOpen();
}
function changeCartQty(id,delta){
  const item=cart.find(i=>String(i.id)===String(id));
  if(!item)return;
  item.qty=Math.max(1,(parseInt(item.qty)||1)+delta);
  saveCart();updateCartUI();renderCartItems();refreshCheckoutIfOpen();
}
function clearCart(){cart=[];saveCart();updateCartUI();renderCartItems();refreshCheckoutIfOpen()}
function saveCart(){cleanCart();localStorage.setItem('arty_cart',JSON.stringify(cart))}
function updateCartUI(){const n=cart.reduce((s,i)=>s+(parseInt(i.qty)||0),0);const b=document.getElementById('cartBtn'),c=document.getElementById('cartCount');if(b)b.style.display=n>0?'inline-flex':'none';if(c)c.textContent=n}
function getSubtotal(){return cart.reduce((s,i)=>s+(Number(i.price)||0)*(parseInt(i.qty)||0),0)}
function getTotal(){return getSubtotal()}
function openCart(){renderCartItems();document.getElementById('cartOverlay').classList.add('open');document.getElementById('cartSidebar').classList.add('open');document.body.style.overflow='hidden'}
function closeCart(){document.getElementById('cartOverlay').classList.remove('open');document.getElementById('cartSidebar').classList.remove('open');document.body.style.overflow=''}
function goToCheckout(){if(!cart.length)return showToast('Panier vide','error');closeCart();navigate('#/checkout')}
function renderCartItems(){
  const c=document.getElementById('cartItems'),f=document.getElementById('cartFooter');
  if(!c||!f)return;
  if(!cart.length){c.innerHTML='<div class="cart-empty"><div class="cart-empty-icon">Panier</div><p>Panier vide</p></div>';f.style.display='none';return}
  f.style.display='block';
  c.innerHTML=cart.map(i=>`<div class="cart-item">
    <img src="${safeAttr(i.image)}" class="cart-item-img" alt="${safeAttr(i.name)}">
    <div class="cart-item-info"><div class="cart-item-name">${safeText(i.name)}</div><div class="cart-item-price">$${toMoney(i.price)}</div>
      <div class="cart-qty-control"><button onclick="changeCartQty('${safeAttr(i.id)}',-1)">−</button><span>${i.qty}</span><button onclick="changeCartQty('${safeAttr(i.id)}',1)">+</button></div>
    </div>
    <button class="cart-item-remove" onclick="removeFromCart('${safeAttr(i.id)}')" aria-label="Retirer">×</button>
  </div>`).join('');
  document.getElementById('cartTotal').textContent=`$${getTotal().toFixed(2)}`;
}
function checkout(){goToCheckout()}
function refreshCheckoutIfOpen(){if((window.location.hash||'')==='#/checkout')renderCheckoutPage()}
function validateEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim())}
function renderCheckoutPage(){
  const c=document.getElementById('checkoutPageContent');
  if(!c)return;
  if(!cart.length){c.innerHTML=`<div class="checkout-empty"><div class="section-tag">Panier</div><h2 class="section-heading">Votre panier est <span class="accent">vide</span></h2><p class="section-sub">Ajoutez un kit ou un ensemble avant de continuer.</p><a href="#/paintings" class="btn btn-orange">Voir les kits →</a></div>`;return}
  const userBox=currentUser?`<div class="checkout-account-box connected"><strong>Connecté comme ${safeText(currentUser.name)}</strong><span>${safeText(currentUser.email)}</span></div>`:`<div class="checkout-account-box"><strong>Pas de compte?</strong><span>Vous pouvez créer un compte ou acheter comme invité. Le courriel est obligatoire pour recevoir la confirmation.</span><div class="checkout-account-actions"><button class="btn btn-orange btn-sm" onclick="openModal('auth','register')">Créer un compte</button><button class="btn btn-ghost btn-sm" onclick="openModal('auth','login')">Connexion</button></div></div>`;
  const summary=cart.map(i=>`<div class="checkout-line"><img src="${safeAttr(i.image)}" alt="${safeAttr(i.name)}"><div><strong>${safeText(i.name)}</strong><small>Qté ${i.qty} × $${toMoney(i.price)}</small></div><span>$${toMoney(i.price*i.qty)}</span></div>`).join('');
  c.innerHTML=`
    <div class="checkout-hero-clean">
      <div><div class="section-tag">Paiement</div><h2 class="section-heading">Finaliser votre <span class="accent">commande</span></h2><p>Un vrai parcours panier → informations → commande. Les cartes seront traitées plus tard par un fournisseur sécurisé comme Stripe, Square ou Moneris.</p></div>
      <button class="btn btn-ghost" onclick="navigate('#/paintings')">← Continuer à magasiner</button>
    </div>
    <div class="checkout-layout">
      <section class="checkout-card-main">
        <div class="checkout-step-title"><span>1</span><div><h3>Client</h3><p>Compte ou achat invité.</p></div></div>
        ${userBox}
        <div class="form-row"><div class="form-group"><label>Nom complet</label><input type="text" id="coName" value="${safeAttr(currentUser?.name||'')}" placeholder="Votre nom"></div><div class="form-group"><label>Courriel *</label><input type="email" id="coEmail" value="${safeAttr(currentUser?.email||'')}" placeholder="nom@exemple.com"></div></div>
        <div class="form-group"><label>Téléphone</label><input type="text" id="coPhone" placeholder="Optionnel"></div>
        <div class="checkout-step-title"><span>2</span><div><h3>Livraison</h3><p>Adresse pour recevoir les kits.</p></div></div>
        <div class="form-group"><label>Adresse complète *</label><input type="text" id="coAddress" placeholder="Numéro, rue, appartement"></div>
        <div class="form-row"><div class="form-group"><label>Ville</label><input type="text" id="coCity" placeholder="Ville"></div><div class="form-group"><label>Province</label><input type="text" id="coProvince" value="QC"></div></div>
        <div class="form-row"><div class="form-group"><label>Code postal</label><input type="text" id="coPostal" placeholder="A1A 1A1"></div><div class="form-group"><label>Pays</label><input type="text" id="coCountry" value="Canada"></div></div>
        <div class="form-group"><label>Note de livraison</label><textarea id="coNotes" placeholder="Instructions spéciales, date souhaitée, etc."></textarea></div>
        <div class="checkout-step-title"><span>3</span><div><h3>Paiement sécurisé</h3><p>Aucune carte n'est entrée dans Arty pour le moment.</p></div></div>
        <div class="payment-provider-box"><strong>Fournisseur de paiement à connecter</strong><p>La commande sera enregistrée en statut “en attente de paiement”. Quand Stripe/Square/Moneris sera branché, ce bouton redirigera vers leur page sécurisée.</p></div>
        <label class="checkout-policy-check"><input type="checkbox" id="coPolicyAccept"> J'accepte les <a href="#/policies">politiques d'achat</a> et la <a href="#/privacy">politique de confidentialité</a>.</label>
        <button class="btn btn-orange checkout-submit" onclick="placeOrder()">Créer la commande →</button>
      </section>
      <aside class="checkout-summary-card">
        <h3>Résumé</h3>${summary}
        <div class="checkout-total-row"><span>Sous-total</span><strong>$${toMoney(getSubtotal())}</strong></div>
        <div class="checkout-note-small">Taxes/livraison peuvent être ajoutées quand le fournisseur de paiement sera connecté.</div>
      </aside>
    </div>`;
}
async function placeOrder(){
  if(!cart.length)return showToast('Panier vide','error');
  const name=document.getElementById('coName')?.value.trim();
  const email=document.getElementById('coEmail')?.value.trim();
  const phone=document.getElementById('coPhone')?.value.trim();
  const address=document.getElementById('coAddress')?.value.trim();
  const city=document.getElementById('coCity')?.value.trim();
  const province=document.getElementById('coProvince')?.value.trim();
  const postal=document.getElementById('coPostal')?.value.trim();
  const country=document.getElementById('coCountry')?.value.trim();
  const notes=document.getElementById('coNotes')?.value.trim();
  if(!name)return showToast('Entrez votre nom','error');
  if(!email||!validateEmail(email))return showToast('Entrez un courriel valide','error');
  if(!address)return showToast('Entrez l’adresse de livraison','error');
  if(!document.getElementById('coPolicyAccept')?.checked)return showToast('Veuillez accepter les politiques avant de continuer','error');
  const payload={items:cart,total:getTotal(),customer:{name,email,phone},address:{line1:address,city,province,postal,country,notes},checkoutMode:currentUser?'account':'guest'};
  try{
    const r=await fetch('/api/orders',{method:'POST',headers:authH(),body:JSON.stringify(payload)});
    const d=await r.json();
    if(!r.ok)return showToast(d.error||'Erreur','error');
    cart=[];saveCart();updateCartUI();
    document.getElementById('successTitle').textContent='Commande reçue!';
    document.getElementById('successSubtitle').textContent='Nous avons enregistré votre commande.';
    document.getElementById('successOrderId').textContent=`Commande #${d.order.id}`;
    document.getElementById('successPaymentNote').innerHTML=d.payment?.redirectUrl?`Redirection vers paiement sécurisé...`:`Paiement: en attente. Le fournisseur de paiement sera connecté séparément.`;
    document.getElementById('successModal').classList.add('active');
    document.body.style.overflow='hidden';
    if(d.payment?.redirectUrl)setTimeout(()=>{window.location.href=d.payment.redirectUrl},700);
    renderCheckoutPage();
  }catch{showToast('Erreur lors de la commande','error')}
}

// ===== AUTH =====
function openModal(t,tab){
  document.getElementById(t+'Modal').classList.add('active');
  document.body.style.overflow='hidden';
  if(tab==='register')switchAuthTab('register');else if(t==='auth')switchAuthTab('login');
  if(t==='auth')setTimeout(()=>initGoogleSignIn(),120);
}
function closeModal(t){document.getElementById(t+'Modal').classList.remove('active');document.body.style.overflow=''}
function switchAuthTab(t){
  document.getElementById('tabLogin').classList.toggle('active',t==='login');
  document.getElementById('tabRegister').classList.toggle('active',t==='register');
  document.getElementById('loginForm').style.display=t==='login'?'block':'none';
  document.getElementById('registerForm').style.display=t==='register'?'block':'none';
  document.getElementById('authModalTitle').textContent=t==='login'?'Bienvenue':'Créer un compte';
  document.getElementById('authModalSub').textContent=t==='login'?'Connectez-vous à votre compte.':'Inscription rapide et sécurisée.';
  updatePasswordMatchUI();
}
async function doLogin(){
  const e=document.getElementById('loginEmail').value.trim().toLowerCase(),p=document.getElementById('loginPassword').value;
  if(!e||!p)return showToast('Remplissez tous les champs','error');
  try{const r=await fetch('/api/users/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p})});const d=await r.json();if(!r.ok)return showToast(d.error||'Connexion impossible','error');authToken=d.token;currentUser=d.user;localStorage.setItem('arty_token',authToken);localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();closeModal('auth');refreshCheckoutIfOpen();showToast(`Bienvenue, ${currentUser.name}!`,'success')}catch{showToast('Erreur de connexion','error')}
}
function initAuthValidation(){['regPassword','regPasswordConfirm'].forEach(id=>document.getElementById(id)?.addEventListener('input',updatePasswordMatchUI))}
function togglePasswordField(id,btn){const input=document.getElementById(id);if(!input)return;const show=input.type==='password';input.type=show?'text':'password';if(btn)btn.textContent=show?'Cacher':'Voir'}
function updatePasswordMatchUI(){
  const p=document.getElementById('regPassword')?.value||'';
  const c=document.getElementById('regPasswordConfirm')?.value||'';
  const f=document.getElementById('passwordFeedback');
  if(!f)return;
  f.classList.remove('ok','bad');
  if(!p&&!c){f.textContent='Utilisez au moins 6 caractères. Les deux mots de passe doivent être identiques.';return}
  if(p.length<6){f.textContent='Le mot de passe doit contenir au moins 6 caractères.';f.classList.add('bad');return}
  if(c&&p!==c){f.textContent='Les deux mots de passe ne sont pas identiques.';f.classList.add('bad');return}
  if(c&&p===c){f.textContent='Parfait, les mots de passe correspondent.';f.classList.add('ok');return}
  f.textContent='Confirmez le mot de passe pour éviter une erreur.';
}
async function doRegister(){
  const n=document.getElementById('regName').value.trim(),e=document.getElementById('regEmail').value.trim().toLowerCase(),p=document.getElementById('regPassword').value,pc=document.getElementById('regPasswordConfirm').value;
  if(!n||!e||!p||!pc)return showToast('Remplissez tous les champs','error');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))return showToast('Entrez un courriel valide','error');
  if(p.length<6)return showToast('Mot de passe: 6 caractères minimum','error');
  if(p!==pc){updatePasswordMatchUI();return showToast('Les mots de passe ne correspondent pas','error')}
  try{const r=await fetch('/api/users/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,password:p,confirmPassword:pc})});const d=await r.json();if(!r.ok)return showToast(d.error||'Inscription impossible','error');authToken=d.token;currentUser=d.user;localStorage.setItem('arty_token',authToken);localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();closeModal('auth');refreshCheckoutIfOpen();showToast(`Bienvenue chez Arty!, ${currentUser.name}!`,'success')}catch{showToast('Erreur','error')}
}
function logout(s){fetch('/api/users/logout',{method:'POST',headers:authH()}).catch(()=>{});authToken=null;currentUser=null;localStorage.removeItem('arty_token');localStorage.removeItem('arty_user');updateAuthUI();navigate('#/');if(!s)showToast('Déconnecté','success')}

// ===== GOOGLE =====
function googleIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`}
function initGoogleSignIn(retry=0){
  const w=document.getElementById('googleBtnWrap');if(!w)return;
  if(!googleClientId||googleClientId==='YOUR_GOOGLE_CLIENT_ID_HERE'){
    w.innerHTML=`<button class="google-btn google-btn-disabled" onclick="showToast('Google non configuré. Ajoutez GOOGLE_CLIENT_ID dans Render ou googleClientId dans db.json','error')">${googleIcon()}Continuer avec Google</button><div class="google-help">Google sera actif dès que le Client ID est configuré.</div>`;
    return;
  }
  if(!window.google?.accounts?.id){
    w.innerHTML=`<button class="google-btn google-btn-disabled" disabled>${googleIcon()}Chargement de Google...</button>`;
    if(retry<24)setTimeout(()=>initGoogleSignIn(retry+1),250);else w.innerHTML=`<button class="google-btn google-btn-disabled" onclick="showToast('Google ne s’est pas chargé. Vérifiez le domaine autorisé et le script Google.','error')">${googleIcon()}Google non disponible</button>`;
    return;
  }
  try{
    google.accounts.id.initialize({client_id:googleClientId,callback:handleGoogle,auto_select:false,cancel_on_tap_outside:true});
    w.innerHTML='';
    google.accounts.id.renderButton(w,{theme:'outline',size:'large',width:380,text:'continue_with',shape:'pill',locale:'fr'});
  }catch(err){
    console.error('Google init error',err);
    w.innerHTML=`<button class="google-btn google-btn-disabled" onclick="showToast('Google non disponible pour ce domaine. Vérifiez Authorized JavaScript origins.','error')">${googleIcon()}Google non disponible</button>`;
  }
}
async function handleGoogle(r){try{const res=await fetch('/api/users/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:r.credential})});const d=await res.json();if(!res.ok)return showToast(d.error||'Connexion Google impossible','error');authToken=d.token;currentUser=d.user;localStorage.setItem('arty_token',authToken);localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();closeModal('auth');refreshCheckoutIfOpen();showToast(`Bienvenue, ${currentUser.name}!`,'success')}catch{showToast('Échec Google','error')}}

// ===== BOOKING =====
function openBooking(eventId){
  const ev=allEvents.find(e=>e.id===eventId);
  if(!ev)return;
  const left=spotsLeft(ev);
  if(left<=0)return showToast('Cet événement est complet','error');
  document.getElementById('bookingEventTitle').textContent=ev.title;
  document.getElementById('bookingPrice').textContent=toMoney(ev.price);
  document.getElementById('bookingName').value=currentUser?.name||'';
  document.getElementById('bookingEmail').value=currentUser?.email||'';
  const phone=document.getElementById('bookingPhone');if(phone)phone.value='';
  const notes=document.getElementById('bookingNotes');if(notes)notes.value='';
  const sel=document.getElementById('bookingGuests');
  if(sel)sel.innerHTML=Array.from({length:Math.min(left,10)},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  const summary=document.getElementById('bookingSummaryText');
  if(summary)summary.textContent=`${formatEventDate(ev,true)} à ${ev.time||'18:00'} · ${left} place${left>1?'s':''} disponible${left>1?'s':''}`;
  document.getElementById('bookingModal').classList.add('active');
  document.getElementById('bookingModal').dataset.eid=eventId;
  document.body.style.overflow='hidden';
}
async function confirmBooking(){
  const modal=document.getElementById('bookingModal');
  const eid=modal.dataset.eid;
  const n=document.getElementById('bookingName').value.trim();
  const e=document.getElementById('bookingEmail').value.trim();
  const p=document.getElementById('bookingPhone')?.value.trim()||'';
  const g=document.getElementById('bookingGuests').value;
  const notes=document.getElementById('bookingNotes')?.value.trim()||'';
  if(!n||!e)return showToast('Remplissez nom et courriel','error');
  try{
    const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser?.id,eventId:eid,name:n,email:e,phone:p,guests:g,notes})});
    const d=await r.json();
    if(!r.ok)return showToast(d.error,'error');
    closeModal('booking');
    showToast('Réservation confirmée! 🎉','success');
    await loadEvents();
    handleRoute();
  }catch{showToast('Erreur de connexion','error')}
}
async function submitPrivateEventRequest(){
  const payload={
    name:document.getElementById('reqName')?.value.trim(),
    email:document.getElementById('reqEmail')?.value.trim(),
    phone:document.getElementById('reqPhone')?.value.trim(),
    eventType:document.getElementById('reqType')?.value,
    preferredDate:document.getElementById('reqDate')?.value,
    guests:document.getElementById('reqGuests')?.value,
    location:document.getElementById('reqLocation')?.value.trim(),
    budget:document.getElementById('reqBudget')?.value.trim(),
    message:document.getElementById('reqMessage')?.value.trim()
  };
  if(!payload.name||!payload.email||!payload.eventType)return showToast('Nom, courriel et type d’événement requis','error');
  try{
    const r=await fetch('/api/event-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json();
    if(!r.ok)return showToast(d.error,'error');
    showToast('Demande envoyée! Arty pourra vous répondre bientôt.','success');
    ['reqName','reqEmail','reqPhone','reqDate','reqGuests','reqLocation','reqBudget','reqMessage'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
    const type=document.getElementById('reqType');if(type)type.value='Anniversaire';
  }catch{showToast('Erreur de connexion','error')}
}
async function submitContact(){const n=document.getElementById('contactName').value,e=document.getElementById('contactEmail').value,m=document.getElementById('contactMessage').value;if(!n||!e||!m)return showToast('Remplissez tous les champs','error');try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,message:m})});const d=await r.json();if(!r.ok)return showToast(d.error,'error');showToast(d.message,'success');['contactName','contactEmail','contactMessage'].forEach(id=>document.getElementById(id).value='')}catch{showToast('Erreur','error')}}

// ===== ADMIN =====
async function loadAdminData(){try{await Promise.all([loadAdminEvents(),loadAdminBookings(),loadEventRequests(),loadAdminOrders()]);const r=await fetch('/api/admin/stats',{headers:authH()});const s=await r.json();document.getElementById('statKits').textContent=s.totalKits;document.getElementById('statCats').textContent=s.totalCategories;document.getElementById('statUsers').textContent=s.totalUsers;document.getElementById('statOrders').textContent=s.totalOrders}catch{}renderAdminKits();renderAdminCategories();renderAdminBundles();renderAdminEvents();renderAdminOrders()}
function switchAdminTab(t,btn){document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.getElementById('adminKitsPanel').style.display=t==='kits'?'block':'none';document.getElementById('adminCategoriesPanel').style.display=t==='categories'?'block':'none';document.getElementById('adminBundlesPanel').style.display=t==='bundles'?'block':'none';document.getElementById('adminEventsPanel').style.display=t==='events'?'block':'none';document.getElementById('adminOrdersPanel').style.display=t==='orders'?'block':'none'}
function renderAdminOrders(){
  const panel=document.getElementById('adminOrdersPanel');
  if(!panel)return;
  const rows=(adminOrders||[]).map(o=>{
    const cust=o.customer||{};
    const itemText=(o.items||[]).map(i=>`${safeText(i.name)} ×${i.qty}`).join('<br>');
    return `<tr><td><strong>${safeText(o.id)}</strong><br><span class="admin-muted">${new Date(o.createdAt).toLocaleDateString('fr-CA')}</span></td><td>${safeText(cust.name||'')}<br><span class="admin-muted">${safeText(cust.email||o.guestEmail||'')}</span></td><td>${itemText}</td><td>$${toMoney(o.total)}</td><td><span class="admin-status ${o.paymentStatus==='paid'?'ok':'out'}">${safeText(o.paymentStatus||'pending')}</span></td><td><select class="admin-status-select" onchange="updateOrderStatus('${safeAttr(o.id)}',this.value)"><option value="en attente de paiement" ${o.status==='en attente de paiement'?'selected':''}>En attente paiement</option><option value="payée" ${o.status==='payée'?'selected':''}>Payée</option><option value="préparation" ${o.status==='préparation'?'selected':''}>Préparation</option><option value="expédiée" ${o.status==='expédiée'?'selected':''}>Expédiée</option><option value="annulée" ${o.status==='annulée'?'selected':''}>Annulée</option></select></td></tr>`;
  }).join('');
  panel.innerHTML=`<div class="admin-form-card"><h3>Commandes clients</h3><p class="admin-help">Les commandes invitées et connectées restent sauvegardées dans la base persistante.</p></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Articles</th><th>Total</th><th>Paiement</th><th>Statut</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="admin-muted">Aucune commande pour le moment.</td></tr>'}</tbody></table></div>`;
}
async function updateOrderStatus(id,status){
  try{const r=await fetch(`/api/admin/orders/${encodeURIComponent(id)}/status`,{method:'PUT',headers:authH(),body:JSON.stringify({status})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Statut mis à jour','success');await loadAdminOrders();renderAdminOrders()}catch{showToast('Erreur','error')}
}

function renderAdminKits(){document.getElementById('adminKitsPanel').innerHTML=`<div class="admin-form-card"><h3 id="kitFormTitle">Ajouter un Kit</h3><input type="hidden" id="editKitId"><div class="form-row"><div class="form-group"><label>Nom</label><input type="text" id="aKitName" placeholder="Nom du kit"></div><div class="form-group"><label>Prix ($)</label><input type="number" id="aKitPrice" step="0.01" placeholder="29.99"></div></div><div class="form-group"><label>Description complète</label><textarea id="aKitDesc" placeholder="Description visible sur la page produit"></textarea></div><div class="form-group"><label>Courte description</label><input type="text" id="aKitShortDesc" placeholder="Petit résumé pour les cartes produit"></div><div class="form-row"><div class="form-group"><label>Catégorie</label><select id="aKitCat">${allCategories.map(c=>`<option value="${c.id}">${safeText(c.name)}</option>`).join('')}</select></div><div class="form-group"><label>Difficulté</label><select id="aKitDiff"><option>Débutant</option><option>Intermédiaire</option><option>Avancé</option><option>Enfants</option></select></div></div><div class="form-group"><label>Image URL</label><input type="text" id="aKitImg" placeholder="/images/kit.jpg ou URL"></div><div class="form-group"><label>Badges / tags de filtre</label><input type="text" id="aKitTags" placeholder="ex: enfants, cadeau, couple, mini-kit"><small class="admin-help">Séparez les badges par virgule. Ils deviennent automatiquement des filtres clients.</small></div><div class="admin-check-row"><label><input type="checkbox" id="aKitStock" checked> En stock</label><label><input type="checkbox" id="aKitFeatured"> Produit populaire</label></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-orange" onclick="saveKit()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetKitForm()" style="display:none" id="cancelKit">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Kit</th><th>Catégorie</th><th>Badges</th><th>Stock</th><th>Prix</th><th>Actions</th></tr></thead><tbody>${allKits.map(k=>{const cat=allCategories.find(c=>String(c.id)===String(k.categoryId));const tags=normalizeKitTags(k);return`<tr><td><strong>${safeText(k.name)}</strong><br><span class="admin-muted">${safeText(k.difficulty||'')}</span></td><td>${cat?safeText(cat.name):'-'}</td><td>${tags.length?tags.slice(0,3).map(t=>`<span class="admin-tag-mini">${safeText(t)}</span>`).join(''):'-'}</td><td>${k.inStock!==false?'<span class="admin-status ok">En stock</span>':'<span class="admin-status out">Épuisé</span>'}</td><td>$${toMoney(k.price)}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editKit(${k.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteKit(${k.id})">Supprimer</button></div></td></tr>`}).join('')}</tbody></table></div>`}
async function saveKit(){const eid=document.getElementById('editKitId').value;const p={name:document.getElementById('aKitName').value.trim(),price:document.getElementById('aKitPrice').value,description:document.getElementById('aKitDesc').value,shortDesc:document.getElementById('aKitShortDesc').value,categoryId:parseInt(document.getElementById('aKitCat').value),difficulty:document.getElementById('aKitDiff').value,image:document.getElementById('aKitImg').value,tags:document.getElementById('aKitTags').value.split(',').map(t=>t.trim()).filter(Boolean),inStock:document.getElementById('aKitStock').checked,featured:document.getElementById('aKitFeatured').checked};if(!p.name||!p.price)return showToast('Nom et prix requis','error');try{const r=await fetch(eid?`/api/admin/kits/${eid}`:'/api/admin/kits',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast(eid?'Modifié!':'Ajouté!','success');await loadKits();loadAdminData()}catch{showToast('Erreur','error')}}
function editKit(id){const k=allKits.find(x=>x.id===id);if(!k)return;document.getElementById('editKitId').value=k.id;document.getElementById('aKitName').value=k.name||'';document.getElementById('aKitPrice').value=k.price||'';document.getElementById('aKitDesc').value=k.description||'';document.getElementById('aKitShortDesc').value=k.shortDesc||'';document.getElementById('aKitCat').value=k.categoryId||'';document.getElementById('aKitDiff').value=k.difficulty||'Débutant';document.getElementById('aKitImg').value=k.image||'';document.getElementById('aKitTags').value=normalizeKitTags(k).join(', ');document.getElementById('aKitStock').checked=k.inStock!==false;document.getElementById('aKitFeatured').checked=!!k.featured;document.getElementById('kitFormTitle').textContent='Modifier le Kit';document.getElementById('cancelKit').style.display='inline-flex';window.scrollTo(0,0)}
function resetKitForm(){['editKitId','aKitName','aKitPrice','aKitDesc','aKitShortDesc','aKitImg','aKitTags'].forEach(id=>document.getElementById(id).value='');document.getElementById('aKitStock').checked=true;document.getElementById('aKitFeatured').checked=false;document.getElementById('kitFormTitle').textContent='Ajouter un Kit';document.getElementById('cancelKit').style.display='none'}
async function deleteKit(id){if(!confirm('Supprimer ce kit?'))return;await fetch(`/api/admin/kits/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadKits();loadAdminData()}

function renderAdminCategories(){document.getElementById('adminCategoriesPanel').innerHTML=`<div class="admin-form-card"><h3 id="catFormTitle">Ajouter une Catégorie</h3><input type="hidden" id="editCatId"><div class="form-row"><div class="form-group"><label>Nom</label><input type="text" id="aCatName"></div><div class="form-group"><label>Type</label><select id="aCatParent"><option value="individual">Individuel</option><option value="group">Groupe</option><option value="none">Autre</option></select></div></div><div class="form-group"><label>Image URL</label><input type="text" id="aCatImg"></div><div style="display:flex;gap:10px"><button class="btn btn-orange" onclick="saveCat()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetCatForm()" style="display:none" id="cancelCat">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Catégorie</th><th>Type</th><th>Actions</th></tr></thead><tbody>${allCategories.map(c=>`<tr><td><strong>${c.name}</strong></td><td>${c.parent}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editCat(${c.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteCat(${c.id})">Supprimer</button></div></td></tr>`).join('')}</tbody></table></div>`}
async function saveCat(){const eid=document.getElementById('editCatId').value;const p={name:document.getElementById('aCatName').value,parent:document.getElementById('aCatParent').value,image:document.getElementById('aCatImg').value};if(!p.name)return showToast('Nom requis','error');await fetch(eid?`/api/admin/categories/${eid}`:'/api/admin/categories',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});showToast(eid?'Modifié!':'Ajouté!','success');await loadCategories();loadAdminData()}
function editCat(id){const c=allCategories.find(x=>x.id===id);if(!c)return;document.getElementById('editCatId').value=c.id;document.getElementById('aCatName').value=c.name;document.getElementById('aCatParent').value=c.parent;document.getElementById('aCatImg').value=c.image||'';document.getElementById('catFormTitle').textContent='Modifier';document.getElementById('cancelCat').style.display='inline-flex'}
function resetCatForm(){['editCatId','aCatName','aCatImg'].forEach(id=>document.getElementById(id).value='');document.getElementById('catFormTitle').textContent='Ajouter une Catégorie';document.getElementById('cancelCat').style.display='none'}
async function deleteCat(id){if(!confirm('Supprimer?'))return;await fetch(`/api/admin/categories/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadCategories();loadAdminData()}

// Admin Bundles
function renderAdminBundles(){
  const kitOpts=allKits.map(k=>`<option value="${k.id}">${k.name} ($${k.price.toFixed(2)})</option>`).join('');
  document.getElementById('adminBundlesPanel').innerHTML=`<div class="admin-form-card"><h3 id="bunFormTitle">Ajouter un Bundle</h3><input type="hidden" id="editBunId"><div class="form-row"><div class="form-group"><label>Nom du Bundle</label><input type="text" id="aBunName" placeholder="Ex: Forfait Famille"></div><div class="form-group"><label>Prix Bundle ($)</label><input type="number" id="aBunPrice" step="0.01"></div></div><div class="form-group"><label>Description</label><textarea id="aBunDesc" placeholder="Décrivez le bundle..."></textarea></div><div class="form-row"><div class="form-group"><label>Prix Original ($)</label><input type="number" id="aBunOrigPrice" step="0.01" placeholder="Pour montrer l'économie"></div><div class="form-group"><label>Étiquette</label><input type="text" id="aBunTag" placeholder="Ex: Économisez 30$"></div></div><div class="form-group"><label>Image URL</label><input type="text" id="aBunImg"></div><div class="form-group"><label>Kits inclus (sélectionnez plusieurs avec Ctrl+clic)</label><select id="aBunKits" multiple style="min-height:100px">${kitOpts}</select></div><div style="display:flex;gap:10px"><button class="btn btn-orange" onclick="saveBun()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetBunForm()" style="display:none" id="cancelBun">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Bundle</th><th>Prix</th><th>Kits</th><th>Actions</th></tr></thead><tbody>${allBundles.map(b=>`<tr><td><strong>${b.name}</strong>${b.tag?` <span style="color:var(--orange);font-size:.75rem">${b.tag}</span>`:''}</td><td>$${b.price.toFixed(2)}</td><td>${(b.kitIds||[]).length} kits</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editBun(${b.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteBun(${b.id})">Supprimer</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
async function saveBun(){const eid=document.getElementById('editBunId').value;const sel=document.getElementById('aBunKits');const kitIds=Array.from(sel.selectedOptions).map(o=>parseInt(o.value));const p={name:document.getElementById('aBunName').value,price:document.getElementById('aBunPrice').value,description:document.getElementById('aBunDesc').value,originalPrice:document.getElementById('aBunOrigPrice').value,tag:document.getElementById('aBunTag').value,image:document.getElementById('aBunImg').value,kitIds};if(!p.name||!p.price)return showToast('Nom et prix requis','error');await fetch(eid?`/api/admin/bundles/${eid}`:'/api/admin/bundles',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});showToast(eid?'Modifié!':'Ajouté!','success');await loadBundles();loadAdminData()}
function editBun(id){const b=allBundles.find(x=>x.id===id);if(!b)return;document.getElementById('editBunId').value=b.id;document.getElementById('aBunName').value=b.name;document.getElementById('aBunPrice').value=b.price;document.getElementById('aBunDesc').value=b.description||'';document.getElementById('aBunOrigPrice').value=b.originalPrice||'';document.getElementById('aBunTag').value=b.tag||'';document.getElementById('aBunImg').value=b.image||'';const sel=document.getElementById('aBunKits');Array.from(sel.options).forEach(o=>{o.selected=(b.kitIds||[]).includes(parseInt(o.value))});document.getElementById('bunFormTitle').textContent='Modifier le Bundle';document.getElementById('cancelBun').style.display='inline-flex';window.scrollTo(0,0)}
function resetBunForm(){['editBunId','aBunName','aBunPrice','aBunDesc','aBunOrigPrice','aBunTag','aBunImg'].forEach(id=>document.getElementById(id).value='');const sel=document.getElementById('aBunKits');if(sel)Array.from(sel.options).forEach(o=>o.selected=false);document.getElementById('bunFormTitle').textContent='Ajouter un Bundle';document.getElementById('cancelBun').style.display='none'}
async function deleteBun(id){if(!confirm('Supprimer?'))return;await fetch(`/api/admin/bundles/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadBundles();loadAdminData()}

function renderAdminEvents(){
  const panel=document.getElementById('adminEventsPanel');
  const requestRows=eventRequests.map(r=>`<tr><td><strong>${safeText(r.name)}</strong><br><small>${safeText(r.email)} ${r.phone?'· '+safeText(r.phone):''}</small></td><td>${safeText(r.eventType)}<br><small>${r.preferredDate?safeText(r.preferredDate):'Date flexible'} · ${r.guests||'?'} pers.</small></td><td>${safeText(r.location||'À confirmer')}</td><td><span class="admin-status-badge">${safeText(r.status||'nouvelle')}</span></td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="updateEventRequestStatus(${r.id},'contactée')">Contactée</button><button class="admin-btn admin-btn-delete" onclick="deleteEventRequest(${r.id})">Supprimer</button></div></td></tr>`).join('');
  const bookingRows=adminBookings.slice(0,25).map(b=>`<tr><td><strong>${safeText(b.name)}</strong><br><small>${safeText(b.email)} ${b.phone?'· '+safeText(b.phone):''}</small></td><td>${safeText(b.event?.title||'Événement supprimé')}</td><td>${b.guests} place${b.guests>1?'s':''}</td><td>${new Date(b.bookedAt).toLocaleDateString('fr-CA')}</td><td>${safeText(b.status||'confirmée')}</td></tr>`).join('');
  const eventRows=adminEvents.map(e=>`<tr><td><strong>${safeText(e.title)}</strong><br><small>${safeText(e.eventType||'atelier')} · ${safeText(e.location||'Lieu à confirmer')}</small></td><td>${safeText(e.date||'')} ${safeText(e.time||'')}</td><td><span class="admin-status-badge ${e.status==='draft'?'draft':e.status==='cancelled'?'cancelled':''}">${safeText(e.status||'published')}</span></td><td>$${toMoney(e.price)}</td><td>${e.bookedSpots||0}/${e.maxSpots||0}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editEv(${e.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteEv(${e.id})">Supprimer</button></div></td></tr>`).join('');
  panel.innerHTML=`
    <div class="admin-event-dashboard">
      <div class="admin-event-card"><span>${adminEvents.filter(e=>(e.status||'published')==='published').length}</span><p>Événements publiés</p></div>
      <div class="admin-event-card"><span>${adminBookings.reduce((s,b)=>s+(parseInt(b.guests)||0),0)}</span><p>Places réservées</p></div>
      <div class="admin-event-card"><span>${eventRequests.filter(r=>(r.status||'nouvelle')==='nouvelle').length}</span><p>Nouvelles demandes privées</p></div>
    </div>
    <div class="admin-form-card admin-event-builder">
      <div class="admin-form-head"><div><h3 id="evFormTitle">Publier un événement</h3><p>Créez un atelier public avec date, prix, places et statut de publication.</p></div><button class="btn btn-ghost btn-sm" onclick="resetEvForm()">Nouveau</button></div>
      <input type="hidden" id="editEvId">
      <div class="form-row"><div class="form-group"><label>Titre</label><input type="text" id="aEvTitle" placeholder="Ex: Soirée peinture fleurs séchées"></div><div class="form-group"><label>Type</label><select id="aEvType"><option value="Atelier public">Atelier public</option><option value="Famille">Famille</option><option value="Couple">Couple</option><option value="Enfants">Enfants</option><option value="Privé">Privé</option></select></div></div>
      <div class="form-group"><label>Description</label><textarea id="aEvDesc" placeholder="Expliquez l’expérience, l’ambiance et ce qui est inclus."></textarea></div>
      <div class="form-row"><div class="form-group"><label>Date</label><input type="date" id="aEvDate"></div><div class="form-group"><label>Heure</label><input type="time" id="aEvTime" value="18:00"></div><div class="form-group"><label>Durée</label><input type="text" id="aEvDur" placeholder="2 heures"></div></div>
      <div class="form-row"><div class="form-group"><label>Prix / personne ($)</label><input type="number" id="aEvPrice" step="0.01"></div><div class="form-group"><label>Places max</label><input type="number" id="aEvSpots" min="1"></div><div class="form-group"><label>Statut</label><select id="aEvStatus"><option value="published">Publié</option><option value="draft">Brouillon</option><option value="cancelled">Annulé</option></select></div></div>
      <div class="form-row"><div class="form-group"><label>Lieu</label><input type="text" id="aEvLoc" placeholder="Studio Arty!, Montréal"></div><div class="form-group"><label>Image URL</label><input type="text" id="aEvImg" placeholder="/images/evenement.jpg ou URL"></div></div>
      <div class="form-group"><label>Inclus</label><input type="text" id="aEvIncludes" placeholder="Toile, peintures, pinceaux, tutoriel, collation"></div>
      <div class="form-group"><label>Note importante</label><input type="text" id="aEvHostNote" placeholder="Ex: Arrivez 10 minutes avant le début."></div>
      <label class="catalog-check" style="margin-bottom:16px"><input type="checkbox" id="aEvFeatured"> Mettre en avant</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-orange" onclick="saveEv()">Sauvegarder l’événement</button><button class="btn btn-ghost" onclick="resetEvForm()" style="display:none" id="cancelEv">Annuler</button></div>
    </div>
    <div class="admin-section-title"><h3>Événements publiables</h3><p>Un événement avec statut “Publié” sera visible aux clients et disponible à la réservation.</p></div>
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Événement</th><th>Date</th><th>Statut</th><th>Prix</th><th>Places</th><th>Actions</th></tr></thead><tbody>${eventRows||'<tr><td colspan="6">Aucun événement.</td></tr>'}</tbody></table></div>
    <div class="admin-section-title"><h3>Réservations récentes</h3><p>Les 25 dernières réservations de places.</p></div>
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Client</th><th>Événement</th><th>Places</th><th>Date</th><th>Statut</th></tr></thead><tbody>${bookingRows||'<tr><td colspan="5">Aucune réservation.</td></tr>'}</tbody></table></div>
    <div class="admin-section-title"><h3>Demandes d’événements privés</h3><p>Mariages, anniversaires, fêtes, groupes privés et demandes sur mesure.</p></div>
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Client</th><th>Projet</th><th>Lieu</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${requestRows||'<tr><td colspan="5">Aucune demande privée.</td></tr>'}</tbody></table></div>`;
}
async function saveEv(){
  const eid=document.getElementById('editEvId').value;
  const p={title:document.getElementById('aEvTitle').value,date:document.getElementById('aEvDate').value,description:document.getElementById('aEvDesc').value,time:document.getElementById('aEvTime').value,duration:document.getElementById('aEvDur').value,price:document.getElementById('aEvPrice').value,maxSpots:document.getElementById('aEvSpots').value,location:document.getElementById('aEvLoc').value,image:document.getElementById('aEvImg').value,eventType:document.getElementById('aEvType').value,status:document.getElementById('aEvStatus').value,includes:document.getElementById('aEvIncludes').value,hostNote:document.getElementById('aEvHostNote').value,featured:document.getElementById('aEvFeatured').checked};
  if(!p.title||!p.date)return showToast('Titre et date requis','error');
  const r=await fetch(eid?`/api/admin/events/${eid}`:'/api/admin/events',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)return showToast(d.error||'Erreur','error');
  showToast(eid?'Événement modifié!':'Événement publié!','success');
  await loadEvents();
  await loadAdminData();
}
function editEv(id){
  const e=adminEvents.find(x=>x.id===id);if(!e)return;
  document.getElementById('editEvId').value=e.id;
  document.getElementById('aEvTitle').value=e.title||'';
  document.getElementById('aEvType').value=e.eventType||'Atelier public';
  document.getElementById('aEvStatus').value=e.status||'published';
  document.getElementById('aEvDate').value=e.date||'';
  document.getElementById('aEvDesc').value=e.description||'';
  document.getElementById('aEvTime').value=e.time||'18:00';
  document.getElementById('aEvDur').value=e.duration||'';
  document.getElementById('aEvPrice').value=e.price||'';
  document.getElementById('aEvSpots').value=e.maxSpots||'';
  document.getElementById('aEvLoc').value=e.location||'';
  document.getElementById('aEvImg').value=e.image||'';
  document.getElementById('aEvIncludes').value=eventIncludes(e).join(', ');
  document.getElementById('aEvHostNote').value=e.hostNote||'';
  document.getElementById('aEvFeatured').checked=!!e.featured;
  document.getElementById('evFormTitle').textContent='Modifier l’événement';
  document.getElementById('cancelEv').style.display='inline-flex';
  document.querySelector('.admin-event-builder')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function resetEvForm(){['editEvId','aEvTitle','aEvDate','aEvDesc','aEvDur','aEvPrice','aEvSpots','aEvLoc','aEvImg','aEvIncludes','aEvHostNote'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});const t=document.getElementById('aEvTime');if(t)t.value='18:00';const type=document.getElementById('aEvType');if(type)type.value='Atelier public';const status=document.getElementById('aEvStatus');if(status)status.value='published';const feat=document.getElementById('aEvFeatured');if(feat)feat.checked=false;document.getElementById('evFormTitle').textContent='Publier un événement';document.getElementById('cancelEv').style.display='none'}
async function deleteEv(id){if(!confirm('Supprimer cet événement?'))return;await fetch(`/api/admin/events/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadEvents();await loadAdminData()}
async function updateEventRequestStatus(id,status){await fetch(`/api/admin/event-requests/${id}`,{method:'PATCH',headers:authH(),body:JSON.stringify({status})});showToast('Demande mise à jour','success');await loadAdminData()}
async function deleteEventRequest(id){if(!confirm('Supprimer cette demande?'))return;await fetch(`/api/admin/event-requests/${id}`,{method:'DELETE',headers:authH()});showToast('Demande supprimée','success');await loadAdminData()}

// ===== UTILS =====
let toastTimer=null;
function showToast(m,t='success'){
  const el=document.getElementById('toast');
  if(!el)return;
  clearTimeout(toastTimer);
  el.textContent=m||'';
  el.className=`toast ${t} show`;
  toastTimer=setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{ if(!el.classList.contains('show')){ el.textContent=''; el.className='toast'; } },320);
  },3200);
}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o){o.classList.remove('active');document.body.style.overflow=''}}));

/* =========================================================
   ADMIN PRO UPGRADE — analytics, inventory, discounts, refunds
   ========================================================= */
let adminAnalyticsPro=null,adminDiscounts=[],adminRefunds=[];

function getKitDisplayPrice(k){return Number(k?.effectivePrice ?? k?.salePrice ?? k?.price ?? 0)}
function kitPriceHTML(k,cls='kit-card-price'){
  const original=Number(k?.originalPrice ?? k?.price ?? 0);
  const sale=k?.salePrice!==null&&k?.salePrice!==undefined?Number(k.salePrice):null;
  const label=k?.discountLabel||'';
  if(sale!==null&&sale<original){return `<span class="${cls} price-sale"><span>$${toMoney(sale)}</span><small>$${toMoney(original)}</small></span>${label?`<span class="discount-pill">${safeText(label)}</span>`:''}`}
  return `<span class="${cls}">$${toMoney(original)}</span>${label?`<span class="discount-pill">${safeText(label)}</span>`:''}`;
}
function stockBadgeHTML(k){
  if(k?.inStock===false)return '<span class="kit-stock-badge">Épuisé</span>';
  if(k?.isLowStock)return `<span class="kit-stock-badge low">${safeText(k.stockLabel||'Stock limité')}</span>`;
  return '';
}
function stockTagText(k){
  if(k?.inStock===false)return 'Épuisé';
  if(k?.isLowStock)return k.stockLabel||'Stock limité';
  return 'En stock';
}

async function loadAdminAnalytics(){try{adminAnalyticsPro=await(await fetch('/api/admin/analytics',{headers:authH()})).json()}catch{adminAnalyticsPro=null}}
async function loadAdminDiscounts(){try{adminDiscounts=await(await fetch('/api/admin/discounts',{headers:authH()})).json()}catch{adminDiscounts=[]}}
async function loadAdminRefunds(){try{adminRefunds=await(await fetch('/api/admin/refunds',{headers:authH()})).json()}catch{adminRefunds=[]}}

async function loadAdminData(){
  try{
    await Promise.all([loadAdminEvents(),loadAdminBookings(),loadEventRequests(),loadAdminOrders(),loadAdminAnalytics(),loadAdminDiscounts(),loadAdminRefunds(),loadKits(),loadCategories(),loadBundles()]);
    document.getElementById('statRevenue').textContent=`$${toMoney(adminAnalyticsPro?.revenue||0)}`;
    document.getElementById('statOrders').textContent=adminAnalyticsPro?.ordersCount??(adminOrders||[]).length;
    document.getElementById('statKits').textContent=allKits.length;
    document.getElementById('statLowInventory').textContent=adminAnalyticsPro?.lowInventoryCount??0;
  }catch(e){console.warn(e)}
  renderAdminDashboard();renderAdminKits();renderAdminInventory();renderAdminDiscounts();renderAdminOrders();renderAdminCategories();renderAdminBundles();renderAdminEvents();
}
function switchAdminTab(t,btn){
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  const ids=['Dashboard','Kits','Inventory','Discounts','Orders','Events','Categories','Bundles'];
  ids.forEach(name=>{const el=document.getElementById(`admin${name}Panel`);if(el)el.style.display='none'});
  const map={dashboard:'Dashboard',kits:'Kits',inventory:'Inventory',discounts:'Discounts',orders:'Orders',events:'Events',categories:'Categories',bundles:'Bundles'};
  const panel=document.getElementById(`admin${map[t]||'Dashboard'}Panel`);if(panel)panel.style.display='block';
}

function renderHomePopularKits(){
  const featured=allKits.filter(k=>k.featured).slice(0,5);const kits=featured.length>=5?featured:allKits.slice(0,5);
  const el=document.getElementById('homePopularKits');if(!el)return;
  el.innerHTML=kits.map(k=>{const cat=allCategories.find(c=>String(c.id)===String(k.categoryId));return `<div class="kit-card" onclick="navigate('#/product/${k.id}')"><div class="kit-card-img"><img src="${safeAttr(k.image||'logoarty.png')}" alt="${safeAttr(k.name)}" loading="lazy">${k.featured?'<span class="kit-card-badge">Populaire</span>':''}${stockBadgeHTML(k)}</div><div class="kit-card-body"><div class="kit-card-category">${safeText(cat?cat.name:'')}</div><h3 class="kit-card-title">${safeText(k.name)}</h3><p class="kit-card-desc">${safeText(k.shortDesc||k.description||'')}</p><div class="kit-card-footer"><div>${kitPriceHTML(k)}</div><span class="kit-card-meta">${safeText(k.difficulty||'')}</span></div></div></div>`}).join('');
}
function getFilteredKits(){
  let kits=[...allKits];
  const q=(catalogFilters.search||'').toLowerCase().trim();
  if(q)kits=kits.filter(k=>`${k.name||''} ${k.description||''} ${k.shortDesc||''} ${normalizeKitTags(k).join(' ')}`.toLowerCase().includes(q));
  if(catalogFilters.category!=='all')kits=kits.filter(k=>String(k.categoryId)===String(catalogFilters.category));
  if(catalogFilters.badge!=='all')kits=kits.filter(k=>normalizeKitTags(k).map(t=>t.toLowerCase()).includes(String(catalogFilters.badge).toLowerCase()));
  if(catalogFilters.difficulty!=='all')kits=kits.filter(k=>String(k.difficulty||'')===String(catalogFilters.difficulty));
  if(catalogFilters.stock==='in')kits=kits.filter(k=>k.inStock!==false);
  const min=parseFloat(catalogFilters.priceMin),max=parseFloat(catalogFilters.priceMax);
  if(!Number.isNaN(min))kits=kits.filter(k=>getKitDisplayPrice(k)>=min);
  if(!Number.isNaN(max))kits=kits.filter(k=>getKitDisplayPrice(k)<=max);
  const sort=catalogFilters.sort||'featured';
  kits.sort((a,b)=>{if(sort==='price-asc')return getKitDisplayPrice(a)-getKitDisplayPrice(b);if(sort==='price-desc')return getKitDisplayPrice(b)-getKitDisplayPrice(a);if(sort==='name')return String(a.name||'').localeCompare(String(b.name||''),'fr');if(sort==='newest')return Number(b.id||0)-Number(a.id||0);return Number(!!b.featured)-Number(!!a.featured)||String(a.name||'').localeCompare(String(b.name||''),'fr')});
  return kits;
}
function renderKitsGrid(){
  const g=document.getElementById('kitsGrid');if(!g)return;const filtered=getFilteredKits();renderActiveFilters(filtered);g.classList.remove('visible');
  g.innerHTML=filtered.map(k=>{const cat=allCategories.find(c=>String(c.id)===String(k.categoryId));const tags=normalizeKitTags(k).slice(0,4);return `<div class="kit-card catalog-kit-card" onclick="navigate('#/product/${k.id}')"><div class="kit-card-img"><img src="${safeAttr(k.image||'logoarty.png')}" alt="${safeAttr(k.name)}" loading="lazy">${k.featured?'<span class="kit-card-badge">Populaire</span>':''}${stockBadgeHTML(k)}</div><div class="kit-card-body"><div class="kit-card-category">${safeText(cat?cat.name:'Sans catégorie')}</div><h3 class="kit-card-title">${safeText(k.name)}</h3><p class="kit-card-desc">${safeText(k.shortDesc||k.description||'')}</p><div class="kit-card-tags">${tags.map(t=>`<span>${safeText(t)}</span>`).join('')}</div><div class="kit-card-footer"><div>${kitPriceHTML(k)}</div><span class="kit-card-meta">${safeText(stockTagText(k))}</span></div></div></div>`}).join('');
  if(!filtered.length)g.innerHTML='<div class="empty-state catalog-empty"><div class="empty-state-icon">🎨</div><h3>Aucun produit trouvé</h3><p>Essayez de retirer un filtre ou de chercher un mot plus simple.</p><button class="btn btn-orange btn-sm" onclick="resetCatalogFilters()">Réinitialiser les filtres</button></div>';
  setTimeout(()=>g.classList.add('visible'),50);
}
function renderProductPage(id){
  const kit=allKits.find(k=>String(k.id)===String(id));const c=document.getElementById('productPageContent');
  if(!kit){c.innerHTML='<div class="empty-state" style="padding:60px 0"><div class="empty-state-icon">🎨</div><p>Kit non trouvé</p></div>';return}
  const cat=allCategories.find(ct=>String(ct.id)===String(kit.categoryId));const imgs=kit.images?.length?kit.images:[kit.image||'logoarty.png'];
  const thumbs=imgs.length>1?`<div class="product-thumbs">${imgs.map((img,i)=>`<img src="${safeAttr(img)}" class="product-thumb${i===0?' active':''}" onclick="switchImg(this,'${safeAttr(img)}')">`).join('')}</div>`:'';
  const inc=kit.includes?.length?`<div class="product-includes"><h3>Inclus dans ce kit</h3><ul>${kit.includes.map(i=>`<li>${safeText(i)}</li>`).join('')}</ul></div>`:'';
  const kitTags=normalizeKitTags(kit);const inStock=kit.inStock!==false;
  c.innerHTML=`<button class="product-back" onclick="navigate('#/paintings')">← Retour aux kits</button><div class="product-layout"><div class="product-gallery"><img src="${safeAttr(imgs[0])}" class="product-main-img" id="pMainImg">${thumbs}</div><div class="product-info"><div class="product-cat">${safeText(cat?cat.name:'')}</div><h1>${safeText(kit.name)}</h1><div class="product-price-wrap">${kitPriceHTML(kit,'product-price')}</div><p class="product-desc">${safeText(kit.description||'')}</p><div class="product-tags"><span class="product-tag">${safeText(kit.difficulty||'')}</span><span class="product-tag ${kit.isLowStock?'low-stock-tag':''}">${safeText(stockTagText(kit))}</span>${kitTags.map(t=>`<span class="product-tag">${safeText(t)}</span>`).join('')}</div>${inc}<div class="product-qty-row"><label>Qté:</label><div class="qty-ctrl"><button class="qty-btn" onclick="chgQty(-1)">−</button><input class="qty-val" id="pQty" value="1" readonly><button class="qty-btn" onclick="chgQty(1)">+</button></div></div><div class="product-buttons"><button class="btn btn-orange" onclick="addToCart(${kit.id})" ${!inStock?'disabled style="opacity:.4"':''}>${inStock?'Ajouter au panier':'Épuisé'}</button><button class="btn btn-teal" onclick="buyNow(${kit.id})" ${!inStock?'disabled style="opacity:.4"':''}>Acheter maintenant →</button></div></div></div>`;
}
function addToCart(kitId){
  const kit=allKits.find(k=>String(k.id)===String(kitId));if(!kit)return;if(kit.inStock===false)return showToast('Ce produit est épuisé','error');
  const qty=parseInt(document.getElementById('pQty')?.value||1);const id=normalizeCartId(kit.id);const ex=cart.find(i=>String(i.id)===id);const price=getKitDisplayPrice(kit);
  if(ex)ex.qty+=qty;else cart.push({id,name:kit.name,price,image:kit.image,qty,type:'kit',discountLabel:kit.discountLabel||'',originalPrice:kit.originalPrice||kit.price});
  saveCart();updateCartUI();showToast(`${kit.name} ajouté au panier!`,'success');
}
function renderCartItems(){
  const c=document.getElementById('cartItems'),f=document.getElementById('cartFooter');if(!c||!f)return;
  if(!cart.length){c.innerHTML='<div class="cart-empty"><div class="cart-empty-icon">Panier</div><p>Panier vide</p></div>';f.style.display='none';return}
  f.style.display='block';
  c.innerHTML=cart.map(i=>`<div class="cart-item"><img src="${safeAttr(i.image)}" class="cart-item-img" alt="${safeAttr(i.name)}"><div class="cart-item-info"><div class="cart-item-name">${safeText(i.name)}</div><div class="cart-item-price">$${toMoney(i.price)}${i.discountLabel?` <small>${safeText(i.discountLabel)}</small>`:''}</div><div class="cart-qty-control"><button onclick="changeCartQty('${safeAttr(i.id)}',-1)">−</button><span>${i.qty}</span><button onclick="changeCartQty('${safeAttr(i.id)}',1)">+</button></div></div><button class="cart-item-remove" onclick="removeFromCart('${safeAttr(i.id)}')" aria-label="Retirer">×</button></div>`).join('');
  document.getElementById('cartTotal').textContent=`$${toMoney(getTotal())}`;
}

function renderAdminDashboard(){
  const panel=document.getElementById('adminDashboardPanel');if(!panel)return;const a=adminAnalyticsPro||{};
  const max=Math.max(1,...(a.dailySales||[]).map(d=>Number(d.revenue)||0));
  const bars=(a.dailySales||[]).map(d=>`<div class="admin-sales-bar"><span style="height:${Math.max(5,(Number(d.revenue)||0)/max*100)}%"></span><small>${safeText(d.date)}</small></div>`).join('');
  const top=(a.topProducts||[]).map(p=>`<tr><td><strong>${safeText(p.name)}</strong></td><td>${p.qty}</td><td>$${toMoney(p.revenue)}</td></tr>`).join('');
  const low=(a.lowInventory||[]).slice(0,6).map(k=>`<div class="admin-alert-line"><strong>${safeText(k.name)}</strong><span>${safeText(k.stockLabel)}</span></div>`).join('')||'<p class="admin-muted">Aucune alerte stock.</p>';
  const latest=(a.latestOrders||[]).map(o=>`<div class="admin-order-mini"><strong>${safeText(o.id)}</strong><span>$${toMoney(o.total)} · ${safeText(o.status||'')}</span></div>`).join('')||'<p class="admin-muted">Aucune commande.</p>';
  panel.innerHTML=`<div class="admin-dashboard-grid"><div class="admin-pro-card big"><div class="admin-card-head"><h3>Ventes des 14 derniers jours</h3><span>$${toMoney(a.revenue||0)} total</span></div><div class="admin-sales-chart">${bars}</div></div><div class="admin-pro-card"><h3>Résumé</h3><div class="admin-kpi-list"><div><span>Aujourd’hui</span><strong>$${toMoney(a.todayRevenue||0)}</strong></div><div><span>Ce mois</span><strong>$${toMoney(a.monthRevenue||0)}</strong></div><div><span>Panier moyen</span><strong>$${toMoney(a.averageOrder||0)}</strong></div><div><span>Rabais donnés</span><strong>$${toMoney(a.discountTotal||0)}</strong></div><div><span>Remboursements</span><strong>$${toMoney(a.refundTotal||0)}</strong></div><div><span>Rabais actifs</span><strong>${a.activeDiscounts||0}</strong></div></div></div><div class="admin-pro-card"><h3>Alertes inventaire</h3>${low}</div><div class="admin-pro-card"><h3>Commandes récentes</h3>${latest}</div><div class="admin-pro-card big"><h3>Meilleurs produits</h3><div class="admin-table-wrap compact"><table class="admin-table"><thead><tr><th>Produit</th><th>Qté</th><th>Ventes</th></tr></thead><tbody>${top||'<tr><td colspan="3" class="admin-muted">Aucune vente.</td></tr>'}</tbody></table></div></div></div>`;
}

function renderAdminKits(){
  const panel=document.getElementById('adminKitsPanel');if(!panel)return;
  const rows=allKits.map(k=>{const cat=allCategories.find(c=>String(c.id)===String(k.categoryId));const tags=normalizeKitTags(k);return `<tr><td><strong>${safeText(k.name)}</strong><br><span class="admin-muted">${safeText(k.difficulty||'')}</span></td><td>${cat?safeText(cat.name):'-'}</td><td>${tags.length?tags.slice(0,3).map(t=>`<span class="admin-tag-mini">${safeText(t)}</span>`).join(''):'-'}</td><td><span class="admin-status ${k.inStock!==false?'ok':'out'}">${safeText(stockTagText(k))}</span></td><td>${kitPriceHTML(k)}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editKit(${k.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteKit(${k.id})">Supprimer</button></div></td></tr>`}).join('');
  panel.innerHTML=`<div class="admin-form-card"><div class="admin-form-head"><div><h3 id="kitFormTitle">Ajouter un produit</h3><p>Prix, image, badges de filtre, inventaire et seuil de stock bas.</p></div><button class="btn btn-ghost btn-sm" onclick="resetKitForm()">Nouveau</button></div><input type="hidden" id="editKitId"><div class="form-row"><div class="form-group"><label>Nom</label><input type="text" id="aKitName" placeholder="Nom du kit"></div><div class="form-group"><label>Prix régulier ($)</label><input type="number" id="aKitPrice" step="0.01" placeholder="29.99"></div><div class="form-group"><label>Prix barré optionnel ($)</label><input type="number" id="aKitCompare" step="0.01" placeholder="39.99"></div></div><div class="form-group"><label>Description complète</label><textarea id="aKitDesc" placeholder="Description visible sur la page produit"></textarea></div><div class="form-group"><label>Courte description</label><input type="text" id="aKitShortDesc" placeholder="Petit résumé pour les cartes produit"></div><div class="form-row"><div class="form-group"><label>Catégorie</label><select id="aKitCat">${allCategories.map(c=>`<option value="${c.id}">${safeText(c.name)}</option>`).join('')}</select></div><div class="form-group"><label>Difficulté</label><select id="aKitDiff"><option>Débutant</option><option>Intermédiaire</option><option>Avancé</option><option>Enfants</option></select></div></div><div class="form-group"><label>Image URL</label><input type="text" id="aKitImg" placeholder="/images/kit.jpg ou URL"></div><div class="form-group"><label>Badges / tags de filtre</label><input type="text" id="aKitTags" placeholder="ex: enfants, cadeau, couple, mini-kit"><small class="admin-help">Séparez par virgule. Ces badges deviennent des filtres clients.</small></div><div class="form-row"><div class="form-group"><label>Inventaire actuel</label><input type="number" id="aKitStockQty" min="0" placeholder="ex: 12"></div><div class="form-group"><label>Seuil stock bas</label><input type="number" id="aKitLowStock" min="0" value="3"></div></div><div class="admin-check-row"><label><input type="checkbox" id="aKitStock" checked> Visible / vendable</label><label><input type="checkbox" id="aKitFeatured"> Produit populaire</label></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-orange" onclick="saveKit()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetKitForm()" style="display:none" id="cancelKit">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produit</th><th>Catégorie</th><th>Badges</th><th>Stock</th><th>Prix</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Aucun produit.</td></tr>'}</tbody></table></div>`;
}
async function saveKit(){const eid=document.getElementById('editKitId').value;const p={name:document.getElementById('aKitName').value.trim(),price:document.getElementById('aKitPrice').value,compareAtPrice:document.getElementById('aKitCompare').value,description:document.getElementById('aKitDesc').value,shortDesc:document.getElementById('aKitShortDesc').value,categoryId:parseInt(document.getElementById('aKitCat').value),difficulty:document.getElementById('aKitDiff').value,image:document.getElementById('aKitImg').value,tags:document.getElementById('aKitTags').value.split(',').map(t=>t.trim()).filter(Boolean),stockQty:document.getElementById('aKitStockQty').value,lowStockThreshold:document.getElementById('aKitLowStock').value,inStock:document.getElementById('aKitStock').checked,featured:document.getElementById('aKitFeatured').checked};if(!p.name||!p.price)return showToast('Nom et prix requis','error');try{const r=await fetch(eid?`/api/admin/kits/${eid}`:'/api/admin/kits',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast(eid?'Produit modifié!':'Produit ajouté!','success');await loadAdminData()}catch{showToast('Erreur','error')}}
function editKit(id){const k=allKits.find(x=>String(x.id)===String(id));if(!k)return;document.getElementById('editKitId').value=k.id;document.getElementById('aKitName').value=k.name||'';document.getElementById('aKitPrice').value=k.originalPrice||k.price||'';document.getElementById('aKitCompare').value=k.compareAtPrice||'';document.getElementById('aKitDesc').value=k.description||'';document.getElementById('aKitShortDesc').value=k.shortDesc||'';document.getElementById('aKitCat').value=k.categoryId||'';document.getElementById('aKitDiff').value=k.difficulty||'Débutant';document.getElementById('aKitImg').value=k.image||'';document.getElementById('aKitTags').value=normalizeKitTags(k).join(', ');document.getElementById('aKitStockQty').value=k.stockQty??'';document.getElementById('aKitLowStock').value=k.lowStockThreshold??3;document.getElementById('aKitStock').checked=k.inStock!==false;document.getElementById('aKitFeatured').checked=!!k.featured;document.getElementById('kitFormTitle').textContent='Modifier le produit';document.getElementById('cancelKit').style.display='inline-flex';document.querySelector('#adminKitsPanel .admin-form-card')?.scrollIntoView({behavior:'smooth',block:'start'})}
function resetKitForm(){['editKitId','aKitName','aKitPrice','aKitCompare','aKitDesc','aKitShortDesc','aKitImg','aKitTags','aKitStockQty'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});const low=document.getElementById('aKitLowStock');if(low)low.value=3;const st=document.getElementById('aKitStock');if(st)st.checked=true;const feat=document.getElementById('aKitFeatured');if(feat)feat.checked=false;const title=document.getElementById('kitFormTitle');if(title)title.textContent='Ajouter un produit';const cancel=document.getElementById('cancelKit');if(cancel)cancel.style.display='none'}

function renderAdminInventory(){
  const panel=document.getElementById('adminInventoryPanel');if(!panel)return;
  const rows=allKits.map(k=>`<tr><td><strong>${safeText(k.name)}</strong><br><span class="admin-muted">${safeText(k.stockLabel||'')}</span></td><td><span class="inventory-num ${k.inStock===false?'out':k.isLowStock?'low':''}">${k.stockQty??'—'}</span></td><td>${k.lowStockThreshold??3}</td><td><span class="admin-status ${k.inStock!==false?'ok':'out'}">${safeText(stockTagText(k))}</span></td><td><div class="inventory-adjust"><input type="number" id="invQty${k.id}" value="1"><button onclick="adjustInventory(${k.id},'adjust',-1)">−</button><button onclick="adjustInventory(${k.id},'adjust',1)">+</button><button onclick="adjustInventory(${k.id},'set')">Fixer</button></div></td></tr>`).join('');
  panel.innerHTML=`<div class="admin-form-card"><h3>Inventaire</h3><p class="admin-help">Le site indique automatiquement “Épuisé” à 0 et “Stock limité” quand le produit atteint le seuil bas.</p></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produit</th><th>Stock</th><th>Seuil bas</th><th>Statut client</th><th>Ajustement rapide</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Aucun produit.</td></tr>'}</tbody></table></div>`;
}
async function adjustInventory(id,mode,sign=1){const input=document.getElementById(`invQty${id}`);const raw=parseInt(input?.value||0);if(!Number.isFinite(raw))return showToast('Quantité invalide','error');const quantity=mode==='set'?raw:raw*sign;try{const r=await fetch(`/api/admin/kits/${id}/inventory`,{method:'POST',headers:authH(),body:JSON.stringify({mode,quantity,reason:'Ajustement admin'})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Inventaire mis à jour','success');await loadAdminData()}catch{showToast('Erreur','error')}}

function renderAdminDiscounts(){
  const panel=document.getElementById('adminDiscountsPanel');if(!panel)return;
  const kitOptions=allKits.map(k=>`<option value="${k.id}">${safeText(k.name)}</option>`).join('');const catOptions=allCategories.map(c=>`<option value="${c.id}">${safeText(c.name)}</option>`).join('');
  const rows=adminDiscounts.map(d=>`<tr><td><strong>${safeText(d.title)}</strong><br><span class="admin-muted">${d.code?`Code: ${safeText(d.code)}`:'Automatique'}</span></td><td>${safeText(d.type)}</td><td>${d.type==='percent'?`${toMoney(d.value)}%`:d.type==='fixed'?`$${toMoney(d.value)}`:`Achetez ${d.buyQty||1}, obtenez ${d.freeQty||1}`}</td><td>${safeText(d.scope||'all')}</td><td><span class="admin-status ${d.active!==false?'ok':'out'}">${d.active!==false?'Actif':'Inactif'}</span></td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editDiscount(${d.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteDiscount(${d.id})">Supprimer</button></div></td></tr>`).join('');
  panel.innerHTML=`<div class="admin-form-card"><div class="admin-form-head"><div><h3 id="discountFormTitle">Créer un rabais</h3><p>Rabais automatique, code promo, pourcentage, montant fixe ou buy one get one free.</p></div><button class="btn btn-ghost btn-sm" onclick="resetDiscountForm()">Nouveau</button></div><input type="hidden" id="editDiscountId"><div class="form-row"><div class="form-group"><label>Nom du rabais</label><input id="aDisTitle" placeholder="Ex: Promo printemps 15%"></div><div class="form-group"><label>Code promo optionnel</label><input id="aDisCode" placeholder="PRINTEMPS15"></div></div><div class="form-row"><div class="form-group"><label>Type</label><select id="aDisType" onchange="toggleDiscountTypeFields()"><option value="percent">Pourcentage</option><option value="fixed">Montant fixe</option><option value="bogo">Buy one get one free</option></select></div><div class="form-group discount-value-field"><label>Valeur</label><input type="number" id="aDisValue" step="0.01" placeholder="15"></div><div class="form-group bogo-field" style="display:none"><label>Achetez</label><input type="number" id="aDisBuy" value="1" min="1"></div><div class="form-group bogo-field" style="display:none"><label>Obtenez gratuit</label><input type="number" id="aDisFree" value="1" min="1"></div></div><div class="form-row"><div class="form-group"><label>Appliquer à</label><select id="aDisScope"><option value="all">Tout le catalogue</option><option value="kits">Produits sélectionnés</option><option value="categories">Catégories</option><option value="tags">Badges / tags</option></select></div><div class="form-group"><label>Étiquette client</label><input id="aDisLabel" placeholder="Ex: 15% de rabais"></div></div><div class="form-row"><div class="form-group"><label>Produits</label><select id="aDisKits" multiple>${kitOptions}</select></div><div class="form-group"><label>Catégories</label><select id="aDisCats" multiple>${catOptions}</select></div><div class="form-group"><label>Tags</label><input id="aDisTags" placeholder="enfants, cadeau, couple"></div></div><div class="form-row"><div class="form-group"><label>Début</label><input type="date" id="aDisStart"></div><div class="form-group"><label>Fin</label><input type="date" id="aDisEnd"></div><div class="form-group"><label>Quantité minimum</label><input type="number" id="aDisMinQty" value="1" min="1"></div></div><label class="catalog-check" style="margin-bottom:16px"><input type="checkbox" id="aDisActive" checked> Rabais actif</label><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-orange" onclick="saveDiscount()">Sauvegarder le rabais</button><button class="btn btn-ghost" onclick="resetDiscountForm()" style="display:none" id="cancelDiscount">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Rabais</th><th>Type</th><th>Valeur</th><th>Portée</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Aucun rabais.</td></tr>'}</tbody></table></div>`;
}
function toggleDiscountTypeFields(){const type=document.getElementById('aDisType')?.value;document.querySelectorAll('.bogo-field').forEach(el=>el.style.display=type==='bogo'?'block':'none');document.querySelectorAll('.discount-value-field').forEach(el=>el.style.display=type==='bogo'?'none':'block')}
async function saveDiscount(){const id=document.getElementById('editDiscountId').value;const kits=Array.from(document.getElementById('aDisKits').selectedOptions).map(o=>parseInt(o.value));const cats=Array.from(document.getElementById('aDisCats').selectedOptions).map(o=>parseInt(o.value));const p={title:document.getElementById('aDisTitle').value,code:document.getElementById('aDisCode').value,type:document.getElementById('aDisType').value,value:document.getElementById('aDisValue').value,buyQty:document.getElementById('aDisBuy').value,freeQty:document.getElementById('aDisFree').value,scope:document.getElementById('aDisScope').value,kitIds:kits,categoryIds:cats,tags:document.getElementById('aDisTags').value,customerLabel:document.getElementById('aDisLabel').value,startsAt:document.getElementById('aDisStart').value,endsAt:document.getElementById('aDisEnd').value,minQty:document.getElementById('aDisMinQty').value,active:document.getElementById('aDisActive').checked};if(!p.title)return showToast('Nom du rabais requis','error');try{const r=await fetch(id?`/api/admin/discounts/${id}`:'/api/admin/discounts',{method:id?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Rabais sauvegardé','success');await loadAdminData()}catch{showToast('Erreur','error')}}
function editDiscount(id){const d=adminDiscounts.find(x=>String(x.id)===String(id));if(!d)return;document.getElementById('editDiscountId').value=d.id;document.getElementById('aDisTitle').value=d.title||'';document.getElementById('aDisCode').value=d.code||'';document.getElementById('aDisType').value=d.type||'percent';document.getElementById('aDisValue').value=d.value||'';document.getElementById('aDisBuy').value=d.buyQty||1;document.getElementById('aDisFree').value=d.freeQty||1;document.getElementById('aDisScope').value=d.scope||'all';document.getElementById('aDisTags').value=(d.tags||[]).join(', ');document.getElementById('aDisLabel').value=d.customerLabel||'';document.getElementById('aDisStart').value=d.startsAt||'';document.getElementById('aDisEnd').value=d.endsAt||'';document.getElementById('aDisMinQty').value=d.minQty||1;document.getElementById('aDisActive').checked=d.active!==false;Array.from(document.getElementById('aDisKits').options).forEach(o=>o.selected=(d.kitIds||[]).map(String).includes(String(o.value)));Array.from(document.getElementById('aDisCats').options).forEach(o=>o.selected=(d.categoryIds||[]).map(String).includes(String(o.value)));document.getElementById('discountFormTitle').textContent='Modifier le rabais';document.getElementById('cancelDiscount').style.display='inline-flex';toggleDiscountTypeFields();document.querySelector('#adminDiscountsPanel .admin-form-card')?.scrollIntoView({behavior:'smooth',block:'start'})}
function resetDiscountForm(){['editDiscountId','aDisTitle','aDisCode','aDisValue','aDisTags','aDisLabel','aDisStart','aDisEnd'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});const type=document.getElementById('aDisType');if(type)type.value='percent';const scope=document.getElementById('aDisScope');if(scope)scope.value='all';const buy=document.getElementById('aDisBuy');if(buy)buy.value=1;const free=document.getElementById('aDisFree');if(free)free.value=1;const min=document.getElementById('aDisMinQty');if(min)min.value=1;const act=document.getElementById('aDisActive');if(act)act.checked=true;['aDisKits','aDisCats'].forEach(id=>{const el=document.getElementById(id);if(el)Array.from(el.options).forEach(o=>o.selected=false)});const title=document.getElementById('discountFormTitle');if(title)title.textContent='Créer un rabais';const cancel=document.getElementById('cancelDiscount');if(cancel)cancel.style.display='none';toggleDiscountTypeFields()}
async function deleteDiscount(id){if(!confirm('Supprimer ce rabais?'))return;await fetch(`/api/admin/discounts/${id}`,{method:'DELETE',headers:authH()});showToast('Rabais supprimé','success');await loadAdminData()}

function renderAdminOrders(){
  const panel=document.getElementById('adminOrdersPanel');if(!panel)return;
  const rows=(adminOrders||[]).map(o=>{const cust=o.customer||{};const itemText=(o.items||[]).map(i=>`${safeText(i.name)} ×${i.qty}${i.discountAmount?` <span class="admin-muted">(-$${toMoney(i.discountAmount)})</span>`:''}`).join('<br>');return `<tr><td><strong>${safeText(o.id)}</strong><br><span class="admin-muted">${new Date(o.createdAt).toLocaleDateString('fr-CA')}</span></td><td>${safeText(cust.name||'')}<br><span class="admin-muted">${safeText(cust.email||o.guestEmail||'')}</span></td><td>${itemText}</td><td><strong>$${toMoney(o.total)}</strong><br>${o.discountTotal?`<span class="admin-muted">Rabais: $${toMoney(o.discountTotal)}</span>`:''}${o.refundedTotal?`<span class="admin-muted">Remb.: $${toMoney(o.refundedTotal)}</span>`:''}</td><td><span class="admin-status ${o.paymentStatus==='paid'?'ok':o.paymentStatus==='cancelled'?'out':'pending'}">${safeText(o.paymentStatus||'pending')}</span></td><td><select class="admin-status-select" onchange="updateOrderStatus('${safeAttr(o.id)}',this.value)"><option value="en attente de paiement" ${o.status==='en attente de paiement'?'selected':''}>En attente paiement</option><option value="payée" ${o.status==='payée'?'selected':''}>Payée</option><option value="préparation" ${o.status==='préparation'?'selected':''}>Préparation</option><option value="expédiée" ${o.status==='expédiée'?'selected':''}>Expédiée</option><option value="annulée" ${o.status==='annulée'?'selected':''}>Annulée</option><option value="remboursée" ${o.status==='remboursée'?'selected':''}>Remboursée</option></select><div class="admin-actions" style="margin-top:8px"><button class="admin-btn admin-btn-edit" onclick="createRefund('${safeAttr(o.id)}')">Rembourser</button></div></td></tr>`}).join('');
  const refundRows=(adminRefunds||[]).map(r=>`<tr><td><strong>${safeText(r.id)}</strong><br><span class="admin-muted">${new Date(r.createdAt).toLocaleDateString('fr-CA')}</span></td><td>${safeText(r.orderId)}</td><td>$${toMoney(r.amount)}</td><td>${safeText(r.reason||'')}</td><td><span class="admin-status ${r.status==='manual_refund_logged'?'pending':'ok'}">${safeText(r.status)}</span></td></tr>`).join('');
  panel.innerHTML=`<div class="admin-form-card"><h3>Commandes & remboursements</h3><p class="admin-help">Les commandes réduisent l’inventaire automatiquement. Si vous annulez ou remboursez avec retour stock, l’inventaire est remis.</p></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Articles</th><th>Total</th><th>Paiement</th><th>Statut / action</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="admin-muted">Aucune commande pour le moment.</td></tr>'}</tbody></table></div><div class="admin-section-title"><h3>Historique des remboursements</h3><p>Pour l’instant c’est un registre interne. Quand Stripe/Square/Moneris sera branché, l’action pourra déclencher le vrai remboursement.</p></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Remboursement</th><th>Commande</th><th>Montant</th><th>Raison</th><th>Statut</th></tr></thead><tbody>${refundRows||'<tr><td colspan="5" class="admin-muted">Aucun remboursement.</td></tr>'}</tbody></table></div>`;
}
async function updateOrderStatus(id,status){try{const r=await fetch(`/api/admin/orders/${encodeURIComponent(id)}/status`,{method:'PUT',headers:authH(),body:JSON.stringify({status})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Statut mis à jour','success');await loadAdminData()}catch{showToast('Erreur','error')}}
async function createRefund(orderId){const o=adminOrders.find(x=>String(x.id)===String(orderId));if(!o)return;const remaining=Math.max(0,Number(o.total||0)-Number(o.refundedTotal||0));const amount=prompt(`Montant à rembourser (max $${toMoney(remaining)})`,toMoney(remaining));if(amount===null)return;const reason=prompt('Raison du remboursement','Demande client')||'Remboursement';const restock=confirm('Remettre les produits en inventaire?');try{const r=await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/refund`,{method:'POST',headers:authH(),body:JSON.stringify({amount,reason,restock})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Remboursement enregistré','success');await loadAdminData()}catch{showToast('Erreur','error')}}
