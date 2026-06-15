/* Arty! — Application v3 */
let currentUser=null,authToken=null,allKits=[],allEvents=[],allCategories=[],teamActivities=[],allBundles=[],cart=[],currentFilter='all',googleClientId='',adminEvents=[],adminBookings=[],eventRequests=[],adminOrders=[];
let paymentProvider='not_connected',stripeMode='test',stripePublishableKey='',stripeConfigured=false,stripeInstance=null,stripeElements=null,currentStripeOrder=null,currentStripePayment=null;
let bundleDealRules=[],bundleBuilderState={people:10,customText:'',selected:{},purpose:'group'},eventBuilderState={step:1,eventType:'wedding',guests:20,date:'',location:'',customText:'',selected:{},hostName:'',notes:''};
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
  try{const r=await fetch('/api/config');const cfg=await r.json();googleClientId=cfg.googleClientId||'';paymentProvider=cfg.paymentProvider||'not_connected';stripeMode=cfg.stripeMode||'test';stripePublishableKey=cfg.stripePublishableKey||'';stripeConfigured=!!cfg.stripeConfigured}catch{}
  if(authToken&&currentUser){try{const r=await fetch('/api/users/me',{headers:authH()});if(!r.ok)throw 0;currentUser=await r.json();localStorage.setItem('arty_user',JSON.stringify(currentUser))}catch{logout(1)}}
  await Promise.all([loadKits(),loadCategories(),loadEvents(),loadTeam(),loadBundles(),loadBundleDealRules()]);
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
  else if(h==='#/custom-photo'){show('page-custom-photo');renderCustomPhotoPage();window.scrollTo(0,0)}
  else if(h==='#/custom-bag'){show('page-custom-bag');renderCustomBagPage();window.scrollTo(0,0)}
  else if(h==='#/bundle-builder'){show('page-bundle-builder');renderBundleBuilderPage();window.scrollTo(0,0)}
  else if(h==='#/event-builder'){show('page-event-builder');renderEventBuilderPage();window.scrollTo(0,0)}
  else if(h==='#/tutorials'){show('page-tutorials');renderTutorialsPage();window.scrollTo(0,0)}
  else if(h==='#/bundles'){show('page-bundles');renderBundlesPage();window.scrollTo(0,0)}
  else if(h==='#/checkout'){show('page-checkout');renderCheckoutPage();window.scrollTo(0,0)}
  else if(h.startsWith('#/payment-complete')){show('page-checkout');renderPaymentCompletePage();window.scrollTo(0,0)}
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
async function loadBundleDealRules(){try{bundleDealRules=await(await fetch('/api/bundle-deals')).json()}catch{bundleDealRules=[]}}
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
    type:i.type || (String(i.id).startsWith('bundle-')?'bundle':'kit'),
    customData:i.customData||null,
    discountLabel:i.discountLabel||'',
    originalPrice:Number(i.originalPrice)||Number(i.price)||0
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
        <div class="checkout-step-title"><span>3</span><div><h3>Paiement sécurisé</h3><p>${stripeConfigured?'Paiement intégré avec Stripe. Vous restez sur le site Arty.':'Aucune carte n’est entrée dans Arty pour le moment.'}</p></div></div>
        <div class="payment-provider-box ${stripeConfigured?'stripe-ready':''}"><strong>${stripeConfigured?'Stripe connecté ('+safeText(stripeMode)+')':'Fournisseur de paiement à connecter'}</strong><p>${stripeConfigured?'Cliquez sur Continuer au paiement pour afficher le champ de carte sécurisé. Arty ne voit jamais le numéro complet de la carte.':'La commande sera enregistrée en statut “en attente de paiement”.'}</p></div>
        <div class="stripe-payment-panel" id="stripePaymentPanel" style="display:none">
          <div class="stripe-payment-head"><strong>Paiement par carte</strong><span id="stripeOrderLabel"></span></div>
          <div id="payment-element"></div>
          <div id="stripePaymentMessage" class="stripe-payment-message"></div>
          <button class="btn btn-orange checkout-submit" id="stripePayBtn" onclick="confirmStripePayment()">Payer maintenant →</button>
        </div>
        <label class="checkout-policy-check"><input type="checkbox" id="coPolicyAccept"> J'accepte les <a href="#/policies">politiques d'achat</a> et la <a href="#/privacy">politique de confidentialité</a>.</label>
        <button class="btn btn-orange checkout-submit" id="placeOrderBtn" onclick="placeOrder()">${stripeConfigured?'Continuer au paiement sécurisé →':'Créer la commande →'}</button>
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
  const btn=document.getElementById('placeOrderBtn');
  if(btn){btn.disabled=true;btn.textContent='Préparation du paiement...'}
  try{
    const r=await fetch('/api/orders',{method:'POST',headers:authH(),body:JSON.stringify(payload)});
    const d=await r.json();
    if(!r.ok){if(btn){btn.disabled=false;btn.textContent=stripeConfigured?'Continuer au paiement sécurisé →':'Créer la commande →'};return showToast(d.error||'Erreur','error')}
    if(d.payment?.provider==='stripe' && d.payment?.clientSecret){
      await mountStripePayment(d.order,d.payment);
      if(btn)btn.style.display='none';
      return;
    }
    cart=[];saveCart();updateCartUI();
    showOrderSuccess(d.order,'Paiement: en attente. Stripe n’est pas encore disponible pour cette commande.');
    renderCheckoutPage();
  }catch(err){
    console.error(err);
    showToast('Erreur lors de la commande','error');
    if(btn){btn.disabled=false;btn.textContent=stripeConfigured?'Continuer au paiement sécurisé →':'Créer la commande →'}
  }
}
function showOrderSuccess(order,paymentNote){
  document.getElementById('successTitle').textContent='Commande reçue!';
  document.getElementById('successSubtitle').textContent='Nous avons enregistré votre commande.';
  document.getElementById('successOrderId').textContent=`Commande #${order.id}`;
  document.getElementById('successPaymentNote').innerHTML=paymentNote||'';
  document.getElementById('successModal').classList.add('active');
  document.body.style.overflow='hidden';
}
async function mountStripePayment(order,payment){
  if(!window.Stripe)return showToast('Stripe ne s’est pas chargé. Rechargez la page.','error');
  if(!payment.publishableKey)return showToast('Clé publishable Stripe manquante','error');
  stripeInstance=Stripe(payment.publishableKey);
  currentStripeOrder=order;
  currentStripePayment=payment;
  const appearance={theme:'flat',variables:{colorPrimary:'#1B9AAA',colorText:'#2C2418',colorDanger:'#D44',borderRadius:'14px',fontFamily:'Outfit, sans-serif'}};
  stripeElements=stripeInstance.elements({clientSecret:payment.clientSecret,appearance,locale:'fr'});
  const paymentElement=stripeElements.create('payment',{layout:{type:'accordion',defaultCollapsed:false,radios:'always'},business:{name:'Arty Création'}});
  const panel=document.getElementById('stripePaymentPanel');
  const label=document.getElementById('stripeOrderLabel');
  const message=document.getElementById('stripePaymentMessage');
  if(label)label.textContent=`Commande ${order.id} · $${toMoney(order.total)}`;
  if(message)message.textContent='';
  if(panel)panel.style.display='block';
  paymentElement.mount('#payment-element');
  panel?.scrollIntoView({behavior:'smooth',block:'center'});
  showToast('Commande créée. Entrez la carte pour payer.','success');
}
async function confirmStripePayment(){
  if(!stripeInstance||!stripeElements||!currentStripeOrder||!currentStripePayment)return showToast('Paiement Stripe non prêt','error');
  const btn=document.getElementById('stripePayBtn');
  const msg=document.getElementById('stripePaymentMessage');
  if(btn){btn.disabled=true;btn.textContent='Paiement en cours...'}
  if(msg){msg.textContent='Traitement du paiement...';msg.className='stripe-payment-message'}
  try{
    const result=await stripeInstance.confirmPayment({
      elements:stripeElements,
      confirmParams:{return_url:window.location.origin+window.location.pathname+`#/payment-complete?order=${encodeURIComponent(currentStripeOrder.id)}`},
      redirect:'if_required'
    });
    if(result.error){
      if(msg){msg.textContent=result.error.message||'Paiement refusé';msg.className='stripe-payment-message error'}
      if(btn){btn.disabled=false;btn.textContent='Réessayer le paiement →'}
      return;
    }
    const pi=result.paymentIntent;
    const r=await fetch('/api/stripe/confirm-order',{method:'POST',headers:authH(),body:JSON.stringify({orderId:currentStripeOrder.id,paymentIntentId:pi?.id||currentStripePayment.paymentIntentId})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Paiement traité, mais confirmation serveur impossible');
    cart=[];saveCart();updateCartUI();
    showOrderSuccess(d.order||currentStripeOrder,'Paiement Stripe confirmé. La commande est maintenant marquée comme payée.');
    renderCheckoutPage();
  }catch(err){
    console.error(err);
    if(msg){msg.textContent=err.message||'Erreur de paiement';msg.className='stripe-payment-message error'}
    if(btn){btn.disabled=false;btn.textContent='Réessayer le paiement →'}
  }
}
function renderPaymentCompletePage(){
  const c=document.getElementById('checkoutPageContent');
  if(!c)return;
  c.innerHTML=`<div class="checkout-empty"><div class="section-tag">Paiement</div><h2 class="section-heading">Vérification du <span class="accent">paiement</span></h2><p class="section-sub">Si Stripe a demandé une vérification bancaire, la commande sera confirmée automatiquement par webhook. Vous pouvez vérifier le statut dans l’admin.</p><a href="#/" class="btn btn-orange">Retour à l’accueil</a></div>`;
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
let adminAnalyticsPro=null,adminDiscounts=[],adminRefunds=[],adminBundleDealRules=[];

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
async function loadAdminBundleDeals(){try{adminBundleDealRules=await(await fetch('/api/admin/bundle-deals',{headers:authH()})).json();bundleDealRules=adminBundleDealRules}catch{adminBundleDealRules=[]}}
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
  c.innerHTML=`<button class="product-back" onclick="navigate('#/paintings')">← Retour aux kits</button><div class="product-layout"><div class="product-gallery"><img src="${safeAttr(imgs[0])}" class="product-main-img" id="pMainImg">${thumbs}</div><div class="product-info"><div class="product-cat">${safeText(cat?cat.name:'')}</div><h1>${safeText(kit.name)}</h1><div class="product-price-wrap">${kitPriceHTML(kit,'product-price')}</div><p class="product-desc">${safeText(kit.description||'')}</p><div class="product-tags"><span class="product-tag">${safeText(kit.difficulty||'')}</span><span class="product-tag ${kit.isLowStock?'low-stock-tag':''}">${safeText(stockTagText(kit))}</span>${kitTags.map(t=>`<span class="product-tag">${safeText(t)}</span>`).join('')}</div>${inc}<div class="product-qty-row"><label>Qté:</label><div class="qty-ctrl"><button class="qty-btn" onclick="chgQty(-1)">−</button><input class="qty-val" id="pQty" value="1" readonly><button class="qty-btn" onclick="chgQty(1)">+</button></div></div><div class="product-buttons"><button class="btn btn-orange" onclick="addToCart(${kit.id})" ${!inStock?'disabled style="opacity:.4"':''}>${inStock?'Ajouter au panier':'Épuisé'}</button><button class="btn btn-teal" onclick="buyNow(${kit.id})" ${!inStock?'disabled style="opacity:.4"':''}>Acheter maintenant →</button><button class="btn btn-ghost" onclick="startBundleWithKit(${kit.id})">Créer un forfait avec ce kit</button></div></div></div>`;
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


// ===== CUSTOM PRODUCTS =====
let customPhotoState={image:'',size:'moyen',notes:''};
let customBagState={items:[],selectedId:null,notes:'',basePrice:34.99,extraImagePrice:6};
const customPhotoSizes={petit:{label:'Petit 11 x 14',price:49.99},moyen:{label:'Moyen 16 x 20',price:69.99},grand:{label:'Grand 18 x 24',price:89.99}};

function renderCustomPhotoPage(){
  const c=document.getElementById('customPhotoPageContent'); if(!c) return;
  const sizeCards=Object.entries(customPhotoSizes).map(([key,val])=>`<button class="custom-option-card ${customPhotoState.size===key?'active':''}" onclick="selectCustomPhotoSize('${key}')"><strong>${safeText(val.label)}</strong><span>$${toMoney(val.price)}</span></button>`).join('');
  c.innerHTML=`<div class="custom-hero text-center fade-up"><div class="section-tag">Produit personnalisé</div><h2 class="section-heading">Peinture de ta <span class="accent">propre photo</span></h2><p class="section-sub">Téléversez votre photo, choisissez le format de toile et voyez un aperçu avant d’ajouter au panier.</p></div>
    <div class="custom-layout fade-up">
      <section class="custom-builder-card">
        <div class="custom-block">
          <label class="custom-label">1. Téléverser une photo</label>
          <input type="file" id="customPhotoInput" accept="image/*" onchange="handleCustomPhotoUpload(event)">
          <p class="custom-helper">Formats acceptés: JPG, PNG, WEBP. Une photo claire donne le meilleur résultat.</p>
        </div>
        <div class="custom-block">
          <label class="custom-label">2. Choisir le format</label>
          <div class="custom-option-grid">${sizeCards}</div>
        </div>
        <div class="custom-block">
          <label class="custom-label">3. Notes</label>
          <textarea id="customPhotoNotes" placeholder="Ex: mettre le fond plus clair, garder le cadrage portrait..." oninput="customPhotoState.notes=this.value">${safeText(customPhotoState.notes||'')}</textarea>
        </div>
        <div class="custom-price-box"><span>Prix</span><strong>$${toMoney(getCustomPhotoPrice())}</strong></div>
        <div class="custom-actions-row"><button class="btn btn-orange" onclick="addCustomPhotoToCart()">Ajouter au panier →</button><button class="btn btn-ghost" onclick="buyCustomPhotoNow()">Acheter maintenant</button></div>
      </section>
      <aside class="custom-preview-card">
        <div class="custom-preview-head"><h3>Aperçu</h3><span>${safeText(customPhotoSizes[customPhotoState.size].label)}</span></div>
        <div class="canvas-mockup ${customPhotoState.image?'has-image':''}">${customPhotoState.image?`<img src="${safeAttr(customPhotoState.image)}" alt="Aperçu">`:'<div class="canvas-placeholder"><strong>Ajoutez une photo</strong><span>Le rendu s’affichera ici.</span></div>'}</div>
        <div class="custom-summary-box"><div><span>Produit</span><strong>Tableau personnalisé</strong></div><div><span>Format</span><strong>${safeText(customPhotoSizes[customPhotoState.size].label)}</strong></div><div><span>Prix</span><strong>$${toMoney(getCustomPhotoPrice())}</strong></div></div>
      </aside>
    </div>`;
  initScrollEffects();
}
function selectCustomPhotoSize(size){customPhotoState.size=size;renderCustomPhotoPage()}
function getCustomPhotoPrice(){return customPhotoSizes[customPhotoState.size]?.price||0}
function handleCustomPhotoUpload(event){
  const file=event.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{customPhotoState.image=String(reader.result||''); renderCustomPhotoPage();};
  reader.readAsDataURL(file);
}
function buildCanvasPreviewSvg(photoData,sizeLabel){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="100%" height="100%" fill="#f8f4ee"/><rect x="120" y="80" width="660" height="930" rx="28" fill="#845a34" opacity="0.18"/><rect x="150" y="110" width="600" height="870" rx="22" fill="#ffffff" stroke="#d9c7b3" stroke-width="28"/><image href="${photoData}" x="180" y="140" width="540" height="810" preserveAspectRatio="xMidYMid slice"/><rect x="150" y="110" width="600" height="870" rx="22" fill="none" stroke="#ffffff" stroke-width="8"/><text x="450" y="1070" font-family="Outfit, Arial" font-size="42" text-anchor="middle" fill="#5C4F3D">${sizeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function addCustomPhotoToCart(goCheckout=false){
  if(!customPhotoState.image) return showToast('Ajoutez une photo avant de continuer','error');
  const sizeInfo=customPhotoSizes[customPhotoState.size];
  const id=`custom-photo-${Date.now()}`;
  const preview=buildCanvasPreviewSvg(customPhotoState.image,sizeInfo.label);
  cart.push({id,name:`Tableau personnalisé (${sizeInfo.label})`,price:sizeInfo.price,image:preview,qty:1,type:'custom-photo',customData:{kind:'photo-canvas',size:customPhotoState.size,sizeLabel:sizeInfo.label,notes:customPhotoState.notes||'',sourceImage:customPhotoState.image}});
  saveCart(); updateCartUI(); showToast('Tableau personnalisé ajouté au panier','success');
  if(goCheckout) setTimeout(()=>goToCheckout(),200);
}
function buyCustomPhotoNow(){addCustomPhotoToCart(true)}

function renderCustomBagPage(){
  const c=document.getElementById('customBagPageContent'); if(!c) return;
  const selected=getSelectedBagItem();
  c.innerHTML=`<div class="custom-hero text-center fade-up"><div class="section-tag">Produit personnalisé</div><h2 class="section-heading">Créez votre <span class="accent">sac personnalisé</span></h2><p class="section-sub">Ajoutez vos images sur le gabarit du sac, placez-les, redimensionnez-les et voyez le prix final avant de commander.</p></div>
    <div class="custom-layout fade-up custom-layout-bag">
      <section class="custom-builder-card">
        <div class="custom-block">
          <label class="custom-label">1. Ajouter des images</label>
          <input type="file" id="customBagInput" accept="image/*" multiple onchange="handleCustomBagUpload(event)">
          <p class="custom-helper">Prix de base: $${toMoney(customBagState.basePrice)}. Chaque image ajoutée après la première: +$${toMoney(customBagState.extraImagePrice)}.</p>
        </div>
        <div class="custom-block">
          <label class="custom-label">2. Contrôles</label>
          <div class="custom-controls-panel">
            <div class="custom-control-row"><span>Image sélectionnée</span><strong>${selected?safeText(selected.name||'Image'): 'Aucune'}</strong></div>
            <div class="custom-control-row"><label>Taille</label><input type="range" min="40" max="220" value="${selected?selected.size:90}" ${selected?'':'disabled'} oninput="updateBagSelectedSize(this.value)"></div>
            <div class="custom-control-row"><label>Déplacer</label><small>Glissez directement l’image sur le sac.</small></div>
            <div class="custom-control-row"><button class="btn btn-ghost btn-sm" onclick="removeSelectedBagItem()" ${selected?'':'disabled'}>Supprimer l’image</button></div>
          </div>
        </div>
        <div class="custom-block">
          <label class="custom-label">3. Notes</label>
          <textarea id="customBagNotes" placeholder="Ex: centrer le logo, ajouter les deux photos en bas..." oninput="customBagState.notes=this.value">${safeText(customBagState.notes||'')}</textarea>
        </div>
        <div class="custom-price-box"><span>Prix du sac</span><strong>$${toMoney(getCustomBagPrice())}</strong></div>
        <div class="custom-actions-row"><button class="btn btn-orange" onclick="addCustomBagToCart()">Ajouter au panier →</button><button class="btn btn-ghost" onclick="buyCustomBagNow()">Acheter maintenant</button></div>
      </section>
      <aside class="custom-preview-card bag-preview-card">
        <div class="custom-preview-head"><h3>Rendu du sac</h3><span>${customBagState.items.length} image${customBagState.items.length>1?'s':''}</span></div>
        <div class="bag-stage" id="bagStage">
          <div class="bag-handle left"></div><div class="bag-handle right"></div>
          <div class="bag-body">
            <div class="bag-print-area" id="bagPrintArea">${renderBagLayersHTML()}</div>
          </div>
        </div>
        <div class="custom-summary-box"><div><span>Produit</span><strong>Sac personnalisé</strong></div><div><span>Images</span><strong>${customBagState.items.length}</strong></div><div><span>Prix</span><strong>$${toMoney(getCustomBagPrice())}</strong></div></div>
      </aside>
    </div>`;
  initScrollEffects();
}
function renderBagLayersHTML(){
  return customBagState.items.map(item=>`<div class="bag-layer ${customBagState.selectedId===item.id?'selected':''}" data-bag-id="${safeAttr(item.id)}" onmousedown="startBagDrag(event,'${safeAttr(item.id)}')" onclick="selectBagItem('${safeAttr(item.id)}')" style="left:${item.x}%;top:${item.y}%;width:${item.size}px;height:${item.size}px;"><img src="${safeAttr(item.src)}" alt="${safeAttr(item.name||'Image personnalisée')}"></div>`).join('') || '<div class="bag-placeholder"><strong>Ajoutez vos images</strong><span>Vous pourrez les déplacer et les agrandir sur le sac.</span></div>';
}
function getSelectedBagItem(){return customBagState.items.find(i=>i.id===customBagState.selectedId)||null}
function getCustomBagPrice(){const extras=Math.max(0,customBagState.items.length-1); return customBagState.basePrice + extras*customBagState.extraImagePrice}
function handleCustomBagUpload(event){
  const files=Array.from(event.target.files||[]); if(!files.length) return;
  files.forEach(file=>{const reader=new FileReader(); reader.onload=()=>{customBagState.items.push({id:`bag-${Date.now()}-${Math.floor(Math.random()*9999)}`,name:file.name,src:String(reader.result||''),x:30 + (customBagState.items.length*8)%28,y:20 + (customBagState.items.length*7)%40,size:90}); customBagState.selectedId=customBagState.items[customBagState.items.length-1].id; renderCustomBagPage();}; reader.readAsDataURL(file);});
  event.target.value='';
}
function selectBagItem(id){customBagState.selectedId=id; renderCustomBagPage()}
function updateBagSelectedSize(value){const item=getSelectedBagItem(); if(!item) return; item.size=Math.max(40,Math.min(220,parseInt(value)||90)); renderCustomBagPage()}
function removeSelectedBagItem(){ if(!customBagState.selectedId) return; customBagState.items=customBagState.items.filter(i=>i.id!==customBagState.selectedId); customBagState.selectedId=customBagState.items[0]?.id||null; renderCustomBagPage(); }
let bagDragState=null;
function startBagDrag(event,id){
  event.preventDefault(); event.stopPropagation();
  const item=customBagState.items.find(i=>i.id===id); const area=document.getElementById('bagPrintArea');
  if(!item||!area) return; customBagState.selectedId=id;
  const rect=area.getBoundingClientRect();
  bagDragState={id,startX:event.clientX,startY:event.clientY,originX:item.x,originY:item.y,rect};
  document.addEventListener('mousemove',onBagDragMove); document.addEventListener('mouseup',stopBagDrag);
}
function onBagDragMove(event){
  if(!bagDragState) return; const item=customBagState.items.find(i=>i.id===bagDragState.id); if(!item) return;
  const dx=((event.clientX-bagDragState.startX)/bagDragState.rect.width)*100;
  const dy=((event.clientY-bagDragState.startY)/bagDragState.rect.height)*100;
  item.x=Math.max(0,Math.min(100-(item.size/bagDragState.rect.width*100), bagDragState.originX+dx));
  item.y=Math.max(0,Math.min(100-(item.size/bagDragState.rect.height*100), bagDragState.originY+dy));
  const el=document.querySelector(`[data-bag-id="${CSS.escape(item.id)}"]`);
  if(el){el.style.left=item.x+'%'; el.style.top=item.y+'%';}
}
function stopBagDrag(){document.removeEventListener('mousemove',onBagDragMove); document.removeEventListener('mouseup',stopBagDrag); bagDragState=null; if((window.location.hash||'')==='#/custom-bag') renderCustomBagPage();}
function buildBagPreviewSvg(){
  const images=customBagState.items.map(item=>`<image href="${item.src}" x="${120 + item.x*4.1}" y="${260 + item.y*3.2}" width="${item.size*2.8}" height="${item.size*2.8}" preserveAspectRatio="xMidYMid meet"/>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100"><rect width="100%" height="100%" fill="#f8f4ee"/><path d="M250 220c0-90 60-150 200-150s200 60 200 150" fill="none" stroke="#d8b38a" stroke-width="28" stroke-linecap="round"/><path d="M310 220c0-55 38-98 140-98s140 43 140 98" fill="none" stroke="#efdfc9" stroke-width="18" stroke-linecap="round"/><rect x="160" y="220" width="580" height="680" rx="44" fill="#efe3d0" stroke="#d8b38a" stroke-width="8"/><rect x="240" y="320" width="420" height="420" rx="22" fill="#fffdfb" stroke="#eadfce" stroke-dasharray="10 10"/>${images}<text x="450" y="1010" font-family="Outfit, Arial" font-size="40" text-anchor="middle" fill="#5C4F3D">Sac personnalisé Arty</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function addCustomBagToCart(goCheckout=false){
  if(!customBagState.items.length) return showToast('Ajoutez au moins une image sur le sac','error');
  const id=`custom-bag-${Date.now()}`;
  const preview=buildBagPreviewSvg();
  cart.push({id,name:'Sac personnalisé',price:getCustomBagPrice(),image:preview,qty:1,type:'custom-bag',customData:{kind:'bag-design',notes:customBagState.notes||'',imageCount:customBagState.items.length,placements:customBagState.items.map(({name,src,x,y,size})=>({name,src,x,y,size}))}});
  saveCart(); updateCartUI(); showToast('Sac personnalisé ajouté au panier','success');
  if(goCheckout) setTimeout(()=>goToCheckout(),200);
}
function buyCustomBagNow(){addCustomBagToCart(true)}

// Override admin orders to show custom summaries
function renderAdminOrders(){
  const panel=document.getElementById('adminOrdersPanel');if(!panel)return;
  const rows=(adminOrders||[]).map(o=>{
    const cust=o.customer||{};
    const itemText=(o.items||[]).map(i=>{
      const custom=i.customData?.kind==='photo-canvas' ? `<div class="admin-muted">Format: ${safeText(i.customData.sizeLabel||'')}</div>` : i.customData?.kind==='bag-design' ? `<div class="admin-muted">Images: ${safeText(i.customData.imageCount||0)}</div>` : '';
      return `${safeText(i.name)} ×${i.qty}${custom}${i.discountAmount?` <span class="admin-muted">(-$${toMoney(i.discountAmount)})</span>`:''}`
    }).join('<br>');
    return `<tr><td><strong>${safeText(o.id)}</strong><br><span class="admin-muted">${new Date(o.createdAt).toLocaleDateString('fr-CA')}</span></td><td>${safeText(cust.name||'')}<br><span class="admin-muted">${safeText(cust.email||o.guestEmail||'')}</span></td><td>${itemText}</td><td><strong>$${toMoney(o.total)}</strong><br>${o.discountTotal?`<span class="admin-muted">Rabais: $${toMoney(o.discountTotal)}</span>`:''}${o.refundedTotal?`<span class="admin-muted">Remb.: $${toMoney(o.refundedTotal)}</span>`:''}</td><td><span class="admin-status ${o.paymentStatus==='paid'?'ok':o.paymentStatus==='cancelled'?'out':'pending'}">${safeText(o.paymentStatus||'pending')}</span></td><td><select class="admin-status-select" onchange="updateOrderStatus('${safeAttr(o.id)}',this.value)"><option value="en attente de paiement" ${o.status==='en attente de paiement'?'selected':''}>En attente paiement</option><option value="payée" ${o.status==='payée'?'selected':''}>Payée</option><option value="préparation" ${o.status==='préparation'?'selected':''}>Préparation</option><option value="expédiée" ${o.status==='expédiée'?'selected':''}>Expédiée</option><option value="annulée" ${o.status==='annulée'?'selected':''}>Annulée</option><option value="remboursée" ${o.status==='remboursée'?'selected':''}>Remboursée</option></select><div class="admin-actions" style="margin-top:8px"><button class="admin-btn admin-btn-edit" onclick="createRefund('${safeAttr(o.id)}')">Rembourser</button></div></td></tr>`
  }).join('');
  panel.innerHTML=`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Articles</th><th>Total</th><th>Paiement</th><th>Gestion</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="admin-muted">Aucune commande.</td></tr>'}</tbody></table></div>`;
}

/* ===== CUSTOM PRODUCTS PRO V2 — traced line art + real canvas editor ===== */
const traceProOptions = {
  photoThreshold: 48,
  photoDetail: 1.08,
  bagThreshold: 44,
  bagDetail: 1.05
};
let customPhotoTraceData = '';
let customPhotoSourceData = '';
let bagCanvasEditor = { canvas:null, ctx:null, dragging:false, resizing:false, selectedId:null, startX:0, startY:0, startItem:null, dpr:1 };

function renderCustomPhotoPage(){
  const c=document.getElementById('customPhotoPageContent'); if(!c) return;
  const currentSize = customPhotoSizes[customPhotoState.size] || customPhotoSizes.moyen;
  const sizeCards=Object.entries(customPhotoSizes).map(([key,val])=>`<button type="button" class="custom-option-card ${customPhotoState.size===key?'active':''}" onclick="selectCustomPhotoSizePro('${key}')"><strong>${safeText(val.label)}</strong><span>$${toMoney(val.price)}</span></button>`).join('');
  c.innerHTML=`<div class="custom-hero text-center fade-up"><div class="section-tag">Produit personnalisé</div><h2 class="section-heading">Peinture de ta <span class="accent">propre photo</span></h2><p class="section-sub">La photo est transformée en tracé noir et blanc, sans couleur, pour que le client puisse peindre par-dessus.</p></div>
    <div class="custom-layout fade-up">
      <section class="custom-builder-card pro-custom-panel">
        <div class="custom-step-banner"><strong>1</strong><div><h3>Ajouter la photo</h3><p>Le rendu final sera seulement en lignes noires sur fond blanc.</p></div></div>
        <div class="custom-block">
          <label class="custom-file-drop" for="customPhotoInputPro">
            <span>📷</span><strong>Choisir une photo</strong><small>JPG, PNG ou WEBP</small>
          </label>
          <input class="visually-hidden-file" type="file" id="customPhotoInputPro" accept="image/*" onchange="handleCustomPhotoUploadPro(event)">
        </div>
        <div class="custom-block">
          <label class="custom-label">2. Format de toile</label>
          <div class="custom-option-grid">${sizeCards}</div>
        </div>
        <div class="custom-block">
          <label class="custom-label">3. Qualité du tracé</label>
          <div class="trace-slider-grid">
            <label>Contraste <input type="range" min="20" max="90" value="${traceProOptions.photoThreshold}" oninput="updatePhotoTraceSetting('photoThreshold',this.value)"></label>
            <label>Détail <input type="range" min="70" max="145" value="${Math.round(traceProOptions.photoDetail*100)}" oninput="updatePhotoTraceSetting('photoDetail',this.value/100)"></label>
          </div>
          <p class="custom-helper">Plus le contraste est haut, moins il y a de lignes. Plus le détail est haut, plus le dessin est précis.</p>
        </div>
        <div class="custom-block">
          <label class="custom-label">Notes de production</label>
          <textarea id="customPhotoNotes" placeholder="Ex: garder le visage plus clair, enlever le fond, format portrait..." oninput="customPhotoState.notes=this.value">${safeText(customPhotoState.notes||'')}</textarea>
        </div>
        <div class="custom-price-box"><span>Prix final</span><strong id="customPhotoPrice">$${toMoney(currentSize.price)}</strong></div>
        <div class="custom-actions-row"><button class="btn btn-orange" onclick="addCustomPhotoToCartPro()">Ajouter au panier →</button><button class="btn btn-ghost" onclick="buyCustomPhotoNowPro()">Acheter maintenant</button></div>
      </section>
      <aside class="custom-preview-card custom-preview-pro">
        <div class="custom-preview-head"><h3>Rendu tracé</h3><span id="customPhotoSizeLabel">${safeText(currentSize.label)}</span></div>
        <div class="trace-preview-frame">
          <canvas id="customPhotoTraceCanvas" width="700" height="900" aria-label="Aperçu du tracé"></canvas>
          <div class="trace-empty ${customPhotoTraceData?'hidden':''}" id="customPhotoEmpty"><strong>Ajoutez une photo</strong><span>Le tracé noir et blanc s’affichera ici.</span></div>
        </div>
        <div class="custom-summary-box"><div><span>Produit</span><strong>Tableau photo à peinturer</strong></div><div><span>Rendu</span><strong>Tracé noir et blanc</strong></div><div><span>Prix</span><strong>$${toMoney(currentSize.price)}</strong></div></div>
      </aside>
    </div>`;
  initCustomPhotoCanvas();
  initScrollEffects();
}
function selectCustomPhotoSizePro(size){customPhotoState.size=size; const el=document.getElementById('customPhotoSizeLabel'); if(el)el.textContent=(customPhotoSizes[size]||customPhotoSizes.moyen).label; document.querySelectorAll('#customPhotoPageContent .custom-option-card').forEach(b=>b.classList.remove('active')); event?.currentTarget?.classList.add('active'); const p=document.getElementById('customPhotoPrice'); if(p)p.textContent='$'+toMoney(getCustomPhotoPrice());}
function updatePhotoTraceSetting(key,val){traceProOptions[key]=Number(val); if(customPhotoSourceData) makePhotoTracePreview(customPhotoSourceData);}
function handleCustomPhotoUploadPro(event){
  const file=event.target.files?.[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{customPhotoSourceData=String(reader.result||''); customPhotoState.image=customPhotoSourceData; makePhotoTracePreview(customPhotoSourceData);};
  reader.readAsDataURL(file);
}
function initCustomPhotoCanvas(){
  const canvas=document.getElementById('customPhotoTraceCanvas'); if(!canvas)return;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#fffdf9'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#eadfce'; ctx.lineWidth=18; ctx.strokeRect(26,26,canvas.width-52,canvas.height-52);
  if(customPhotoTraceData){
    const img=new Image();
    img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height);
    img.src=customPhotoTraceData;
    document.getElementById('customPhotoEmpty')?.classList.add('hidden');
  }
}
function makePhotoTracePreview(dataUrl){
  traceImageToLineArt(dataUrl,700,900,{threshold:traceProOptions.photoThreshold,detail:traceProOptions.photoDetail,transparent:false}).then(url=>{
    customPhotoTraceData=url;
    initCustomPhotoCanvas();
  }).catch(()=>showToast('Impossible de lire cette image','error'));
}
function addCustomPhotoToCartPro(goCheckout=false){
  if(!customPhotoTraceData)return showToast('Ajoutez une photo avant de continuer','error');
  const sizeInfo=customPhotoSizes[customPhotoState.size]||customPhotoSizes.moyen;
  const id=`custom-photo-${Date.now()}`;
  cart.push({id,name:`Tableau personnalisé à peindre (${sizeInfo.label})`,price:sizeInfo.price,image:customPhotoTraceData,qty:1,type:'custom-photo',customData:{kind:'photo-canvas-trace',size:customPhotoState.size,sizeLabel:sizeInfo.label,notes:customPhotoState.notes||'',traceImage:customPhotoTraceData,sourceImage:customPhotoSourceData||customPhotoState.image||''}});
  saveCart(); updateCartUI(); showToast('Tableau personnalisé ajouté au panier','success');
  if(goCheckout)setTimeout(()=>goToCheckout(),200);
}
function buyCustomPhotoNowPro(){addCustomPhotoToCartPro(true)}

function renderCustomBagPage(){
  const c=document.getElementById('customBagPageContent'); if(!c) return;
  c.innerHTML=`<div class="custom-hero text-center fade-up"><div class="section-tag">Produit personnalisé</div><h2 class="section-heading">Designer un <span class="accent">sac à peinturer</span></h2><p class="section-sub">Les images sont converties en tracés seulement. Le client reçoit un sac avec lignes à peindre, pas une impression couleur.</p></div>
    <div class="custom-layout fade-up custom-layout-bag">
      <section class="custom-builder-card pro-custom-panel">
        <div class="custom-step-banner"><strong>1</strong><div><h3>Ajouter les images</h3><p>Chaque image devient un tracé noir et blanc.</p></div></div>
        <div class="custom-block">
          <label class="custom-file-drop" for="customBagInputPro"><span>👜</span><strong>Ajouter des images au sac</strong><small>Vous pouvez en ajouter plusieurs.</small></label>
          <input class="visually-hidden-file" type="file" id="customBagInputPro" accept="image/*" multiple onchange="handleCustomBagUploadPro(event)">
        </div>
        <div class="custom-block">
          <label class="custom-label">Modifier l’image sélectionnée</label>
          <div class="custom-controls-panel">
            <div class="custom-control-row"><span>Image</span><strong id="bagSelectedLabel">Aucune</strong></div>
            <div class="custom-control-row"><label>Taille</label><input id="bagSizeSlider" type="range" min="45" max="240" value="120" oninput="updateBagSelectedSizePro(this.value)" disabled></div>
            <div class="custom-control-row"><label>Rotation</label><input id="bagRotateSlider" type="range" min="-30" max="30" value="0" oninput="updateBagSelectedRotationPro(this.value)" disabled></div>
            <div class="custom-control-row custom-btn-row"><button class="btn btn-ghost btn-sm" onclick="removeSelectedBagItemPro()">Supprimer</button><button class="btn btn-ghost btn-sm" onclick="sendBagSelectedForward()">Mettre devant</button></div>
          </div>
          <p class="custom-helper">Cliquez sur une image, puis glissez-la directement sur le sac. Les poignées ne causent plus de reload.</p>
        </div>
        <div class="custom-block">
          <label class="custom-label">Qualité du tracé</label>
          <div class="trace-slider-grid"><label>Contraste <input type="range" min="20" max="90" value="${traceProOptions.bagThreshold}" oninput="updateBagTraceSetting('bagThreshold',this.value)"></label><label>Détail <input type="range" min="70" max="145" value="${Math.round(traceProOptions.bagDetail*100)}" oninput="updateBagTraceSetting('bagDetail',this.value/100)"></label></div>
        </div>
        <div class="custom-block">
          <label class="custom-label">Notes de production</label>
          <textarea id="customBagNotes" placeholder="Ex: logo au centre, deux photos plus petites en bas..." oninput="customBagState.notes=this.value">${safeText(customBagState.notes||'')}</textarea>
        </div>
        <div class="custom-price-box"><span>Prix final</span><strong id="customBagPrice">$${toMoney(getCustomBagPrice())}</strong></div>
        <div class="custom-actions-row"><button class="btn btn-orange" onclick="addCustomBagToCartPro()">Ajouter au panier →</button><button class="btn btn-ghost" onclick="buyCustomBagNowPro()">Acheter maintenant</button></div>
      </section>
      <aside class="custom-preview-card bag-preview-card custom-preview-pro">
        <div class="custom-preview-head"><h3>Rendu sac</h3><span>Tracé à peinturer</span></div>
        <div class="bag-editor-shell">
          <canvas id="bagEditorCanvas" width="720" height="900" aria-label="Éditeur de sac personnalisé"></canvas>
        </div>
        <div class="custom-summary-box"><div><span>Produit</span><strong>Sac personnalisé à peindre</strong></div><div><span>Images</span><strong id="bagImageCount">${customBagState.items.length}</strong></div><div><span>Prix</span><strong id="bagSummaryPrice">$${toMoney(getCustomBagPrice())}</strong></div></div>
      </aside>
    </div>`;
  initBagCanvasEditor();
  initScrollEffects();
}

function initBagCanvasEditor(){
  const canvas=document.getElementById('bagEditorCanvas'); if(!canvas)return;
  bagCanvasEditor.canvas=canvas; bagCanvasEditor.ctx=canvas.getContext('2d'); bagCanvasEditor.selectedId=customBagState.selectedId||customBagState.items[0]?.id||null;
  customBagState.selectedId=bagCanvasEditor.selectedId;
  canvas.onpointerdown=bagPointerDown;
  canvas.onpointermove=bagPointerMove;
  canvas.onpointerup=bagPointerUp;
  canvas.onpointerleave=bagPointerUp;
  drawBagEditor();
  syncBagControls();
}
function getCanvasPoint(e){
  const rect=bagCanvasEditor.canvas.getBoundingClientRect();
  return {x:(e.clientX-rect.left)*(bagCanvasEditor.canvas.width/rect.width),y:(e.clientY-rect.top)*(bagCanvasEditor.canvas.height/rect.height)};
}
function drawRoundedRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function drawBagEditor(){
  const canvas=bagCanvasEditor.canvas,ctx=bagCanvasEditor.ctx; if(!canvas||!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f8f4ee';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.lineCap='round';
  ctx.strokeStyle='#d8b38a';ctx.lineWidth=24;ctx.beginPath();ctx.arc(360,220,125,Math.PI,0);ctx.stroke();
  ctx.strokeStyle='#efdfc9';ctx.lineWidth=14;ctx.beginPath();ctx.arc(360,220,82,Math.PI,0);ctx.stroke();
  ctx.fillStyle='#efe3d0';ctx.strokeStyle='#d8b38a';ctx.lineWidth=6;drawRoundedRect(ctx,150,210,420,590,34);ctx.fill();ctx.stroke();
  ctx.fillStyle='#fffdfb';ctx.strokeStyle='#e5d6c4';ctx.setLineDash([10,10]);drawRoundedRect(ctx,225,310,270,330,18);ctx.fill();ctx.stroke();ctx.setLineDash([]);
  ctx.font='700 18px Outfit, Arial';ctx.fillStyle='#b5a997';ctx.textAlign='center';ctx.fillText('ZONE À PEINDRE',360,295);
  for(const item of customBagState.items){
    const img=item._img;
    ctx.save();
    ctx.translate(item.x,item.y);
    ctx.rotate((Number(item.rotation)||0)*Math.PI/180);
    if(img&&img.complete)ctx.drawImage(img,-item.w/2,-item.h/2,item.w,item.h);
    if(item.id===customBagState.selectedId){
      ctx.strokeStyle='#1B9AAA';ctx.lineWidth=3;ctx.setLineDash([7,5]);ctx.strokeRect(-item.w/2,-item.h/2,item.w,item.h);ctx.setLineDash([]);
      ctx.fillStyle='#1B9AAA';ctx.beginPath();ctx.arc(item.w/2,item.h/2,8,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
}
function hitBagItem(pt){
  for(let i=customBagState.items.length-1;i>=0;i--){
    const item=customBagState.items[i];
    const dx=pt.x-item.x,dy=pt.y-item.y;
    if(Math.abs(dx)<=item.w/2+12 && Math.abs(dy)<=item.h/2+12)return item;
  }
  return null;
}
function bagPointerDown(e){
  if(!bagCanvasEditor.canvas)return;
  bagCanvasEditor.canvas.setPointerCapture?.(e.pointerId);
  const pt=getCanvasPoint(e),item=hitBagItem(pt);
  if(!item){customBagState.selectedId=null;syncBagControls();drawBagEditor();return}
  customBagState.selectedId=item.id;
  const cornerDist=Math.hypot(pt.x-(item.x+item.w/2),pt.y-(item.y+item.h/2));
  bagCanvasEditor.resizing=cornerDist<28;
  bagCanvasEditor.dragging=!bagCanvasEditor.resizing;
  bagCanvasEditor.startX=pt.x;bagCanvasEditor.startY=pt.y;bagCanvasEditor.startItem={...item};
  syncBagControls();drawBagEditor();
}
function bagPointerMove(e){
  if(!bagCanvasEditor.dragging&&!bagCanvasEditor.resizing)return;
  e.preventDefault();
  const item=customBagState.items.find(i=>i.id===customBagState.selectedId); if(!item)return;
  const pt=getCanvasPoint(e),dx=pt.x-bagCanvasEditor.startX,dy=pt.y-bagCanvasEditor.startY;
  if(bagCanvasEditor.resizing){
    const s=Math.max(50,Math.min(260,bagCanvasEditor.startItem.w+Math.max(dx,dy)));
    item.w=s; item.h=s;
  }else{
    item.x=Math.max(210,Math.min(510,bagCanvasEditor.startItem.x+dx));
    item.y=Math.max(300,Math.min(650,bagCanvasEditor.startItem.y+dy));
  }
  drawBagEditor();syncBagControls(false);
}
function bagPointerUp(){bagCanvasEditor.dragging=false;bagCanvasEditor.resizing=false}
function syncBagControls(updateSlider=true){
  const item=customBagState.items.find(i=>i.id===customBagState.selectedId);
  const label=document.getElementById('bagSelectedLabel'),slider=document.getElementById('bagSizeSlider'),rot=document.getElementById('bagRotateSlider');
  if(label)label.textContent=item?(item.name||'Image'):'Aucune';
  if(slider){slider.disabled=!item;if(item&&updateSlider)slider.value=Math.round(item.w);}
  if(rot){rot.disabled=!item;if(item&&updateSlider)rot.value=Math.round(item.rotation||0);}
  const cnt=document.getElementById('bagImageCount'); if(cnt)cnt.textContent=customBagState.items.length;
  const price='$'+toMoney(getCustomBagPrice());
  const priceEl=document.getElementById('customBagPrice');if(priceEl)priceEl.textContent=price;
  const sumEl=document.getElementById('bagSummaryPrice');if(sumEl)sumEl.textContent=price;
}
function updateBagSelectedSizePro(value){const item=customBagState.items.find(i=>i.id===customBagState.selectedId); if(!item)return; const s=Math.max(50,Math.min(260,parseInt(value)||120)); item.w=s;item.h=s;drawBagEditor();syncBagControls(false)}
function updateBagSelectedRotationPro(value){const item=customBagState.items.find(i=>i.id===customBagState.selectedId); if(!item)return; item.rotation=parseInt(value)||0;drawBagEditor();syncBagControls(false)}
function removeSelectedBagItemPro(){if(!customBagState.selectedId)return; customBagState.items=customBagState.items.filter(i=>i.id!==customBagState.selectedId);customBagState.selectedId=customBagState.items[0]?.id||null;drawBagEditor();syncBagControls();}
function sendBagSelectedForward(){const idx=customBagState.items.findIndex(i=>i.id===customBagState.selectedId);if(idx<0)return;const [item]=customBagState.items.splice(idx,1);customBagState.items.push(item);drawBagEditor();}
function updateBagTraceSetting(key,val){traceProOptions[key]=Number(val); showToast('Le nouveau réglage sera appliqué aux prochaines images','success')}
function handleCustomBagUploadPro(event){
  const files=Array.from(event.target.files||[]); if(!files.length)return;
  files.forEach((file,index)=>{
    const reader=new FileReader();
    reader.onload=async()=>{
      try{
        const traced=await traceImageToLineArt(String(reader.result||''),420,420,{threshold:traceProOptions.bagThreshold,detail:traceProOptions.bagDetail,transparent:true});
        const img=new Image();
        img.onload=()=>{drawBagEditor();};
        img.src=traced;
        const item={id:`bag-${Date.now()}-${Math.floor(Math.random()*99999)}`,name:file.name,src:traced,source:String(reader.result||''),x:320+(customBagState.items.length%3)*35,y:390+(customBagState.items.length%2)*55,w:125,h:125,rotation:0,_img:img};
        customBagState.items.push(item);customBagState.selectedId=item.id;
        drawBagEditor();syncBagControls();
      }catch{showToast('Impossible de convertir une image','error')}
    };
    reader.readAsDataURL(file);
  });
  event.target.value='';
}
function ensureBagImagesLoaded(){
  customBagState.items.forEach(item=>{
    if(!item._img&&item.src){const img=new Image();img.onload=drawBagEditor;img.src=item.src;item._img=img;}
  });
}
function getCustomBagPrice(){const extras=Math.max(0,(customBagState.items||[]).length-1); return Number(customBagState.basePrice||34.99)+extras*Number(customBagState.extraImagePrice||6)}
function addCustomBagToCartPro(goCheckout=false){
  if(!customBagState.items.length)return showToast('Ajoutez au moins une image sur le sac','error');
  ensureBagImagesLoaded();
  drawBagEditor();
  const preview=bagCanvasEditor.canvas?.toDataURL('image/png')||'';
  cart.push({id:`custom-bag-${Date.now()}`,name:'Sac personnalisé à peindre',price:getCustomBagPrice(),image:preview,qty:1,type:'custom-bag',customData:{kind:'bag-trace-design',notes:customBagState.notes||'',imageCount:customBagState.items.length,preview,placements:customBagState.items.map(({id,name,src,source,x,y,w,h,rotation})=>({id,name,traceImage:src,sourceImage:source,x,y,w,h,rotation}))}});
  saveCart();updateCartUI();showToast('Sac personnalisé ajouté au panier','success');
  if(goCheckout)setTimeout(()=>goToCheckout(),200);
}
function buyCustomBagNowPro(){addCustomBagToCartPro(true)}

function traceImageToLineArt(dataUrl,targetW,targetH,opts={}){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const src=document.createElement('canvas');src.width=targetW;src.height=targetH;
      const sctx=src.getContext('2d',{willReadFrequently:true});
      sctx.fillStyle='#fff';sctx.fillRect(0,0,targetW,targetH);
      const scale=Math.max(targetW/img.width,targetH/img.height);
      const w=img.width*scale,h=img.height*scale,x=(targetW-w)/2,y=(targetH-h)/2;
      sctx.drawImage(img,x,y,w,h);
      const data=sctx.getImageData(0,0,targetW,targetH);
      const pix=data.data,len=targetW*targetH;
      const gray=new Uint8ClampedArray(len);
      for(let i=0,j=0;i<pix.length;i+=4,j++)gray[j]=(pix[i]*.299+pix[i+1]*.587+pix[i+2]*.114)|0;
      const out=sctx.createImageData(targetW,targetH);
      const od=out.data, threshold=Number(opts.threshold)||48, detail=Number(opts.detail)||1;
      for(let yy=1;yy<targetH-1;yy++){
        for(let xx=1;xx<targetW-1;xx++){
          const idx=yy*targetW+xx;
          const gx=-gray[idx-targetW-1]-2*gray[idx-1]-gray[idx+targetW-1]+gray[idx-targetW+1]+2*gray[idx+1]+gray[idx+targetW+1];
          const gy=-gray[idx-targetW-1]-2*gray[idx-targetW]-gray[idx-targetW+1]+gray[idx+targetW-1]+2*gray[idx+targetW]+gray[idx+targetW+1];
          const mag=Math.sqrt(gx*gx+gy*gy)*detail;
          const oi=idx*4, edge=mag>threshold;
          if(opts.transparent){
            od[oi]=0;od[oi+1]=0;od[oi+2]=0;od[oi+3]=edge?245:0;
          }else{
            const v=edge?20:255;od[oi]=v;od[oi+1]=v;od[oi+2]=v;od[oi+3]=255;
          }
        }
      }
      if(!opts.transparent){
        for(let i=0;i<targetW*4;i+=4){od[i]=255;od[i+1]=255;od[i+2]=255;od[i+3]=255}
      }
      const outCanvas=document.createElement('canvas');outCanvas.width=targetW;outCanvas.height=targetH;
      const octx=outCanvas.getContext('2d');
      if(!opts.transparent){octx.fillStyle='#fffdf9';octx.fillRect(0,0,targetW,targetH);}
      octx.putImageData(out,0,0);
      if(!opts.transparent){
        octx.strokeStyle='#e8dccf';octx.lineWidth=Math.max(14,Math.round(targetW*.025));octx.strokeRect(octx.lineWidth/2,octx.lineWidth/2,targetW-octx.lineWidth,targetH-octx.lineWidth);
      }
      resolve(outCanvas.toDataURL('image/png'));
    };
    img.onerror=reject;
    img.src=dataUrl;
  });
}


// ===== CLIENT-CREATED BUNDLES & EVENT BUILDER =====
function startBundleWithKit(kitId){bundleBuilderState.selected[String(kitId)]=(bundleBuilderState.selected[String(kitId)]||0)+1;navigate('#/bundle-builder')}
function activeBundleRules(){return (bundleDealRules||[]).filter(r=>r.active!==false).sort((a,b)=>(Number(b.minQty)||0)-(Number(a.minQty)||0))}
function bestBundleRule(totalQty,purpose='group'){
  return activeBundleRules().find(r=>totalQty >= (Number(r.minQty)||1) && ((r.appliesTo||'all')==='all' || (r.appliesTo||'all')===purpose)) || null;
}
function selectedBuilderItems(state){return Object.entries(state.selected||{}).map(([id,qty])=>{const k=allKits.find(x=>String(x.id)===String(id));return k?{kit:k,qty:Number(qty)||0}:null}).filter(x=>x&&x.qty>0)}
function builderTotals(state,purpose){
  const items=selectedBuilderItems(state);const subtotal=items.reduce((s,i)=>s+(getKitDisplayPrice?getKitDisplayPrice(i.kit):Number(i.kit.effectivePrice||i.kit.price||0))*i.qty,0);const qty=items.reduce((s,i)=>s+i.qty,0);const rule=bestBundleRule(qty,purpose||state.purpose||'group');const percent=rule?Math.max(0,Number(rule.percent)||0):0;const customTextFee=(state.customText||'').trim()?Math.max(0,Number(rule?.customTextFee ?? 12)):0;const discount=subtotal*percent/100;return{items,qty,subtotal,rule,percent,customTextFee,total:Math.max(0,subtotal-discount+customTextFee),discount};
}
function kitPickerHTML(state,context){
  return `<div class="builder-kit-grid">${allKits.filter(k=>k.inStock!==false).map(k=>{const qty=state.selected[String(k.id)]||0;return `<article class="builder-kit-card ${qty?'selected':''}"><img src="${safeAttr(k.image||'logoarty.png')}" alt="${safeAttr(k.name)}"><div><strong>${safeText(k.name)}</strong><span>$${toMoney(getKitDisplayPrice?getKitDisplayPrice(k):k.price)}</span></div><div class="builder-qty"><button type="button" onclick="changeBuilderQty('${context}',${k.id},-1)">−</button><b>${qty}</b><button type="button" onclick="changeBuilderQty('${context}',${k.id},1)">+</button></div></article>`}).join('')}</div>`
}
function changeBuilderQty(context,kitId,delta){const s=context==='event'?eventBuilderState:bundleBuilderState;const key=String(kitId);s.selected[key]=Math.max(0,(Number(s.selected[key])||0)+delta);if(!s.selected[key])delete s.selected[key];context==='event'?renderEventBuilderPage():renderBundleBuilderPage()}
function setBundlePurpose(v){bundleBuilderState.purpose=v;renderBundleBuilderPage()}
function renderBundleBuilderPage(){
  const c=document.getElementById('bundleBuilderPageContent');if(!c)return;const t=builderTotals(bundleBuilderState,bundleBuilderState.purpose);const selected=t.items.map(i=>`<div class="builder-summary-line"><span>${safeText(i.kit.name)} ×${i.qty}</span><strong>$${toMoney((getKitDisplayPrice?getKitDisplayPrice(i.kit):i.kit.price)*i.qty)}</strong></div>`).join('')||'<p class="builder-muted">Sélectionnez au moins un produit.</p>';
  c.innerHTML=`<div class="builder-hero"><div><div class="section-tag">Forfait sur mesure</div><h2 class="section-heading">Créez votre <span class="accent">forfait Arty</span></h2><p>Les clients peuvent choisir eux-mêmes les kits, la quantité et une inscription souvenir. Le prix se calcule automatiquement avec les rabais configurés dans l’admin.</p></div><button class="btn btn-ghost" onclick="navigate('#/paintings')">Voir tous les produits</button></div><div class="client-builder-layout"><section class="builder-main-card"><div class="builder-purpose-row"><button class="builder-purpose ${bundleBuilderState.purpose==='group'?'active':''}" onclick="setBundlePurpose('group')">Groupe / amis</button><button class="builder-purpose ${bundleBuilderState.purpose==='event'?'active':''}" onclick="setBundlePurpose('event')">Événement</button><button class="builder-purpose ${bundleBuilderState.purpose==='wedding'?'active':''}" onclick="setBundlePurpose('wedding')">Mariage</button></div><div class="builder-form-row"><label>Nombre de personnes prévu</label><input type="number" min="1" value="${bundleBuilderState.people}" oninput="bundleBuilderState.people=Math.max(1,parseInt(this.value)||1)"></div><div class="builder-section-title"><h3>Choisir les produits</h3><span>${t.qty} kit${t.qty>1?'s':''} sélectionné${t.qty>1?'s':''}</span></div>${kitPickerHTML(bundleBuilderState,'bundle')}<div class="builder-form-row"><label>Inscription souvenir sur les peintures / cartons</label><input type="text" maxlength="90" value="${safeAttr(bundleBuilderState.customText||'')}" placeholder="Ex: Mariage Anna & David · 12 juillet 2026" oninput="bundleBuilderState.customText=this.value;renderBundleBuilderPage()"><small>Optionnel. Parfait pour mariages, anniversaires et événements corporatifs.</small></div></section><aside class="builder-summary-card"><div class="summary-art-badge">Arty</div><h3>Résumé du forfait</h3>${selected}<hr><div class="builder-summary-line"><span>Sous-total</span><strong>$${toMoney(t.subtotal)}</strong></div><div class="builder-summary-line discount"><span>${t.rule?safeText(t.rule.label||('Rabais '+t.percent+'%')):'Rabais quantité'}</span><strong>${t.rule?'- $'+toMoney(t.discount):'Aucun'}</strong></div>${t.customTextFee?`<div class="builder-summary-line"><span>Inscription personnalisée</span><strong>$${toMoney(t.customTextFee)}</strong></div>`:''}<div class="builder-total"><span>Total estimé</span><strong>$${toMoney(t.total)}</strong></div><button class="btn btn-orange" onclick="addClientBundleToCart()" ${!t.qty?'disabled style="opacity:.5"':''}>Ajouter au panier →</button><p class="builder-footnote">Le stock et le paiement sont vérifiés au checkout Stripe.</p></aside></div>`;initScrollEffects();
}
function addClientBundleToCart(goCheckout=false){const t=builderTotals(bundleBuilderState,bundleBuilderState.purpose);if(!t.qty)return showToast('Sélectionnez au moins un produit','error');const title=t.qty>=10?'Forfait groupe personnalisé':'Forfait personnalisé';const id=`client-bundle-${Date.now()}`;const img=t.items[0]?.kit?.image||'logoarty.png';cart.push({id,name:`${title} (${t.qty} kits)`,price:t.total,image:img,qty:1,type:'custom-bundle',customData:{kind:'client-bundle',purpose:bundleBuilderState.purpose,people:bundleBuilderState.people,customText:bundleBuilderState.customText||'',subtotal:t.subtotal,discount:t.discount,discountRule:t.rule||null,items:t.items.map(i=>({kitId:i.kit.id,name:i.kit.name,qty:i.qty,unitPrice:getKitDisplayPrice?getKitDisplayPrice(i.kit):Number(i.kit.price||0)}))}});saveCart();updateCartUI();showToast('Forfait ajouté au panier','success');if(goCheckout)setTimeout(()=>goToCheckout(),250)}
function setEventType(v){eventBuilderState.eventType=v;eventBuilderState.step=2;renderEventBuilderPage()}
function eventTypeLabel(t){return {wedding:'Mariage',birthday:'Anniversaire',corporate:'Entreprise / équipe',family:'Famille',friends:'Soirée entre amis',kids:'Enfants / école'}[t]||'Événement'}
function setEventStep(n){eventBuilderState.step=n;renderEventBuilderPage()}
function autoFillEventQty(){const ids=Object.keys(eventBuilderState.selected);if(!ids.length&&allKits[0])eventBuilderState.selected[String(allKits[0].id)]=Number(eventBuilderState.guests)||1;else ids.forEach(id=>eventBuilderState.selected[id]=Number(eventBuilderState.guests)||1);renderEventBuilderPage()}
function renderEventBuilderPage(){
 const c=document.getElementById('eventBuilderPageContent');if(!c)return;const t=builderTotals(eventBuilderState,eventBuilderState.eventType==='wedding'?'wedding':'event');const types=[['wedding','Mariage','Une activité souvenir pour les invités'],['birthday','Anniversaire','Une fête créative simple à organiser'],['corporate','Entreprise / équipe','Team building moderne'],['family','Famille','Moment chaleureux à la maison'],['friends','Entre amis','Soirée peinture relax'],['kids','Enfants','Activité facile et encadrée']];
 const step1=`<div class="event-builder-step"><h3>Choisissez le style d’événement</h3><div class="event-type-grid">${types.map(([id,title,sub])=>`<button class="event-type-card ${eventBuilderState.eventType===id?'active':''}" onclick="setEventType('${id}')"><span>${id==='wedding'?'💍':id==='birthday'?'🎂':id==='corporate'?'🏢':id==='family'?'🏡':id==='friends'?'🥂':'🎈'}</span><strong>${title}</strong><small>${sub}</small></button>`).join('')}</div></div>`;
 const step2=`<div class="event-builder-step"><h3>Détails de l’événement</h3><div class="form-row"><div class="form-group"><label>Nom du contact</label><input value="${safeAttr(eventBuilderState.hostName||currentUser?.name||'')}" oninput="eventBuilderState.hostName=this.value" placeholder="Votre nom"></div><div class="form-group"><label>Nombre d’invités</label><input type="number" min="1" value="${eventBuilderState.guests}" oninput="eventBuilderState.guests=Math.max(1,parseInt(this.value)||1)"></div></div><div class="form-row"><div class="form-group"><label>Date souhaitée</label><input type="date" value="${safeAttr(eventBuilderState.date||'')}" onchange="eventBuilderState.date=this.value"></div><div class="form-group"><label>Lieu</label><input value="${safeAttr(eventBuilderState.location||'')}" oninput="eventBuilderState.location=this.value" placeholder="Adresse, ville ou à confirmer"></div></div><button class="btn btn-teal" onclick="autoFillEventQty()">Préparer ${eventBuilderState.guests} kits automatiquement</button></div>`;
 const step3=`<div class="event-builder-step"><h3>Choisir les produits à peindre</h3><p class="builder-muted">Sélectionnez les kits que vous voulez recevoir pour l’événement. Vous pouvez mélanger plusieurs modèles.</p>${kitPickerHTML(eventBuilderState,'event')}<div class="builder-form-row"><label>Texte souvenir sur les peintures</label><input type="text" maxlength="90" value="${safeAttr(eventBuilderState.customText||'')}" placeholder="Ex: Mariage Anna & David · 12 juillet 2026" oninput="eventBuilderState.customText=this.value;renderEventBuilderPage()"><small>On garde le texte dans la commande pour préparer le travail personnalisé.</small></div><div class="form-group"><label>Notes spéciales</label><textarea oninput="eventBuilderState.notes=this.value" placeholder="Ex: couleurs du mariage, livraison avant une date précise...">${safeText(eventBuilderState.notes||'')}</textarea></div></div>`;
 const stepHTML=eventBuilderState.step===1?step1:eventBuilderState.step===2?step2:step3;const selected=t.items.map(i=>`<div class="builder-summary-line"><span>${safeText(i.kit.name)} ×${i.qty}</span><strong>$${toMoney((getKitDisplayPrice?getKitDisplayPrice(i.kit):i.kit.price)*i.qty)}</strong></div>`).join('')||'<p class="builder-muted">Aucun produit choisi.</p>';
 c.innerHTML=`<div class="event-builder-hero"><div class="event-sparkle">✦</div><div><div class="section-tag">Expérience Arty</div><h2 class="section-heading">Créez votre <span class="accent">événement</span> en quelques clics</h2><p>Un parcours animé pour construire un mariage, anniversaire ou événement d’équipe avec prix instantané.</p></div></div><div class="event-builder-progress"><button class="${eventBuilderState.step===1?'active':''}" onclick="setEventStep(1)">1. Style</button><button class="${eventBuilderState.step===2?'active':''}" onclick="setEventStep(2)">2. Détails</button><button class="${eventBuilderState.step===3?'active':''}" onclick="setEventStep(3)">3. Produits</button></div><div class="client-builder-layout"><section class="builder-main-card animated-builder">${stepHTML}<div class="builder-nav-actions"><button class="btn btn-ghost" onclick="setEventStep(Math.max(1,eventBuilderState.step-1))">← Retour</button><button class="btn btn-teal" onclick="setEventStep(Math.min(3,eventBuilderState.step+1))">Continuer →</button></div></section><aside class="builder-summary-card event-summary-card"><div class="summary-art-badge">${eventBuilderState.eventType==='wedding'?'💍':'🎨'}</div><h3>${safeText(eventTypeLabel(eventBuilderState.eventType))}</h3><div class="builder-summary-line"><span>Invités</span><strong>${eventBuilderState.guests}</strong></div><div class="builder-summary-line"><span>Date</span><strong>${eventBuilderState.date?safeText(eventBuilderState.date):'Flexible'}</strong></div>${selected}<hr><div class="builder-summary-line"><span>Sous-total</span><strong>$${toMoney(t.subtotal)}</strong></div><div class="builder-summary-line discount"><span>${t.rule?safeText(t.rule.label||('Rabais événement '+t.percent+'%')):'Rabais événement'}</span><strong>${t.rule?'- $'+toMoney(t.discount):'Aucun'}</strong></div>${t.customTextFee?`<div class="builder-summary-line"><span>Texte souvenir</span><strong>$${toMoney(t.customTextFee)}</strong></div>`:''}<div class="builder-total"><span>Total instantané</span><strong>$${toMoney(t.total)}</strong></div><button class="btn btn-orange" onclick="addEventPackageToCart()" ${!t.qty?'disabled style="opacity:.5"':''}>Ajouter l’événement au panier →</button><button class="btn btn-ghost" onclick="submitBuiltEventRequest()">Demander une validation</button></aside></div>`;initScrollEffects();
}
function addEventPackageToCart(){const t=builderTotals(eventBuilderState,eventBuilderState.eventType==='wedding'?'wedding':'event');if(!t.qty)return showToast('Choisissez au moins un produit pour l’événement','error');cart.push({id:`event-package-${Date.now()}`,name:`Événement ${eventTypeLabel(eventBuilderState.eventType)} (${t.qty} kits)`,price:t.total,image:t.items[0]?.kit?.image||'photoacceuil.jpg',qty:1,type:'custom-event-package',customData:{kind:'event-package',eventType:eventBuilderState.eventType,eventLabel:eventTypeLabel(eventBuilderState.eventType),guests:eventBuilderState.guests,date:eventBuilderState.date,location:eventBuilderState.location,hostName:eventBuilderState.hostName||currentUser?.name||'',customText:eventBuilderState.customText||'',notes:eventBuilderState.notes||'',subtotal:t.subtotal,discount:t.discount,discountRule:t.rule||null,items:t.items.map(i=>({kitId:i.kit.id,name:i.kit.name,qty:i.qty,unitPrice:getKitDisplayPrice?getKitDisplayPrice(i.kit):Number(i.kit.price||0)}))}});saveCart();updateCartUI();showToast('Événement ajouté au panier','success');setTimeout(()=>goToCheckout(),250)}
async function submitBuiltEventRequest(){const t=builderTotals(eventBuilderState,eventBuilderState.eventType==='wedding'?'wedding':'event');const payload={name:eventBuilderState.hostName||currentUser?.name||'Client',email:currentUser?.email||'',phone:'',eventType:eventTypeLabel(eventBuilderState.eventType),preferredDate:eventBuilderState.date,guests:eventBuilderState.guests,location:eventBuilderState.location,message:`Événement créé par le builder. Produits: ${t.items.map(i=>i.kit.name+' x'+i.qty).join(', ')}. Texte souvenir: ${eventBuilderState.customText||'aucun'}. Prix estimé: $${toMoney(t.total)}. Notes: ${eventBuilderState.notes||''}`};if(!payload.email)return showToast('Connectez-vous ou ajoutez votre courriel au checkout pour envoyer la demande','error');try{const r=await fetch('/api/event-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Demande envoyée à Arty','success')}catch{showToast('Erreur','error')}}

// Override admin tab system to include client bundle rules
const _oldSwitchAdminTab = typeof switchAdminTab==='function'?switchAdminTab:null;
function switchAdminTab(t,btn){
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');
  ['adminDashboardPanel','adminKitsPanel','adminInventoryPanel','adminDiscountsPanel','adminOrdersPanel','adminEventsPanel','adminCategoriesPanel','adminBundlesPanel','adminBundleDealsPanel'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none'});
  const map={dashboard:'adminDashboardPanel',kits:'adminKitsPanel',inventory:'adminInventoryPanel',discounts:'adminDiscountsPanel',orders:'adminOrdersPanel',events:'adminEventsPanel',categories:'adminCategoriesPanel',bundles:'adminBundlesPanel',bundleDeals:'adminBundleDealsPanel'};
  const el=document.getElementById(map[t]);if(el)el.style.display='block';
  if(t==='bundleDeals')renderAdminBundleDeals();
}
function renderAdminBundleDeals(){const panel=document.getElementById('adminBundleDealsPanel');if(!panel)return;const rows=(adminBundleDealRules||[]).map(r=>`<tr><td><strong>${safeText(r.label||'Rabais forfait')}</strong><br><span class="admin-muted">${safeText(r.appliesTo||'all')}</span></td><td>${r.minQty||1}+ kits</td><td>${toMoney(r.percent||0)}%</td><td>$${toMoney(r.customTextFee??12)}</td><td><span class="admin-status ${r.active!==false?'ok':'out'}">${r.active!==false?'Actif':'Inactif'}</span></td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editBundleDeal(${r.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteBundleDeal(${r.id})">Supprimer</button></div></td></tr>`).join('');panel.innerHTML=`<div class="admin-form-card"><h3 id="bundleDealFormTitle">Règles de forfait client</h3><p class="admin-help">Ces règles s’appliquent automatiquement quand un client crée un forfait ou un événement. Exemple: 10+ kits = 10%, 20+ kits mariage = 15%.</p><input type="hidden" id="editBundleDealId"><div class="form-row"><div class="form-group"><label>Nom visible</label><input id="bdLabel" placeholder="Ex: Rabais événement 10+"></div><div class="form-group"><label>S’applique à</label><select id="bdApplies"><option value="all">Tous</option><option value="group">Forfaits groupes</option><option value="event">Événements</option><option value="wedding">Mariages</option></select></div></div><div class="form-row"><div class="form-group"><label>Quantité minimum</label><input type="number" id="bdMinQty" min="1" value="10"></div><div class="form-group"><label>Rabais (%)</label><input type="number" id="bdPercent" step="0.1" value="10"></div></div><div class="form-row"><div class="form-group"><label>Frais texte personnalisé ($)</label><input type="number" id="bdTextFee" step="0.01" value="12"></div><div class="form-group"><label>Actif</label><select id="bdActive"><option value="true">Actif</option><option value="false">Inactif</option></select></div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-orange" onclick="saveBundleDeal()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetBundleDealForm()">Réinitialiser</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Règle</th><th>Minimum</th><th>Rabais</th><th>Texte</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="admin-muted">Aucune règle. Les forfaits fonctionneront sans rabais.</td></tr>'}</tbody></table></div>`}
function editBundleDeal(id){const r=(adminBundleDealRules||[]).find(x=>String(x.id)===String(id));if(!r)return;document.getElementById('editBundleDealId').value=r.id;document.getElementById('bdLabel').value=r.label||'';document.getElementById('bdApplies').value=r.appliesTo||'all';document.getElementById('bdMinQty').value=r.minQty||1;document.getElementById('bdPercent').value=r.percent||0;document.getElementById('bdTextFee').value=r.customTextFee??12;document.getElementById('bdActive').value=String(r.active!==false)}
function resetBundleDealForm(){['editBundleDealId','bdLabel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});if(document.getElementById('bdApplies'))document.getElementById('bdApplies').value='all';if(document.getElementById('bdMinQty'))document.getElementById('bdMinQty').value=10;if(document.getElementById('bdPercent'))document.getElementById('bdPercent').value=10;if(document.getElementById('bdTextFee'))document.getElementById('bdTextFee').value=12;if(document.getElementById('bdActive'))document.getElementById('bdActive').value='true'}
async function saveBundleDeal(){const id=document.getElementById('editBundleDealId')?.value;const payload={label:document.getElementById('bdLabel')?.value,appliesTo:document.getElementById('bdApplies')?.value,minQty:document.getElementById('bdMinQty')?.value,percent:document.getElementById('bdPercent')?.value,customTextFee:document.getElementById('bdTextFee')?.value,active:document.getElementById('bdActive')?.value==='true'};if(!payload.label)return showToast('Nom de règle requis','error');try{const r=await fetch(id?`/api/admin/bundle-deals/${id}`:'/api/admin/bundle-deals',{method:id?'PUT':'POST',headers:authH(),body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Règle sauvegardée','success');await loadAdminBundleDeals();renderAdminBundleDeals()}catch{showToast('Erreur','error')}}
async function deleteBundleDeal(id){if(!confirm('Supprimer cette règle?'))return;await fetch(`/api/admin/bundle-deals/${id}`,{method:'DELETE',headers:authH()});await loadAdminBundleDeals();renderAdminBundleDeals();showToast('Règle supprimée','success')}

// Improve admin order item display for client-created bundles/events
function renderAdminOrders(){
  const panel=document.getElementById('adminOrdersPanel');if(!panel)return;const refundRows=(adminRefunds||[]).map(r=>`<tr><td>${safeText(r.id)}</td><td>${safeText(r.orderId)}</td><td>$${toMoney(r.amount)}</td><td>${safeText(r.reason||'')}</td><td>${safeText(r.status||'noté')}</td></tr>`).join('');
  const rows=(adminOrders||[]).map(o=>{const cust=o.customer||{};const itemText=(o.items||[]).map(i=>{let details='';if(i.customData?.kind==='client-bundle')details=`<div class="admin-muted">Forfait client · ${(i.customData.items||[]).map(x=>safeText(x.name)+' x'+x.qty).join(', ')}${i.customData.customText?'<br>Texte: '+safeText(i.customData.customText):''}</div>`;if(i.customData?.kind==='event-package')details=`<div class="admin-muted">${safeText(i.customData.eventLabel||'Événement')} · ${safeText(i.customData.guests||'')} invités · ${safeText(i.customData.date||'date flexible')}<br>${(i.customData.items||[]).map(x=>safeText(x.name)+' x'+x.qty).join(', ')}${i.customData.customText?'<br>Texte souvenir: '+safeText(i.customData.customText):''}</div>`;if(i.customData?.kind==='photo-canvas-trace')details=`<div class="admin-muted">Format: ${safeText(i.customData.sizeLabel||'')}</div>`;if(i.customData?.kind==='bag-trace-design')details=`<div class="admin-muted">Images: ${safeText(i.customData.imageCount||0)}</div>`;return `${safeText(i.name)} ×${i.qty}${details}${i.discountAmount?` <span class="admin-muted">(-$${toMoney(i.discountAmount)})</span>`:''}`}).join('<br>');return `<tr><td><strong>${safeText(o.id)}</strong><br><span class="admin-muted">${new Date(o.createdAt).toLocaleDateString('fr-CA')}</span></td><td>${safeText(cust.name||'')}<br><span class="admin-muted">${safeText(cust.email||o.guestEmail||'')}</span></td><td>${itemText}</td><td><strong>$${toMoney(o.total)}</strong><br>${o.discountTotal?`<span class="admin-muted">Rabais: $${toMoney(o.discountTotal)}</span>`:''}${o.refundedTotal?`<span class="admin-muted">Remb.: $${toMoney(o.refundedTotal)}</span>`:''}</td><td><span class="admin-status ${o.paymentStatus==='paid'?'ok':o.paymentStatus==='cancelled'?'out':'pending'}">${safeText(o.paymentStatus||'pending')}</span></td><td><select class="admin-status-select" onchange="updateOrderStatus('${safeAttr(o.id)}',this.value)"><option value="en attente de paiement" ${o.status==='en attente de paiement'?'selected':''}>En attente paiement</option><option value="payée" ${o.status==='payée'?'selected':''}>Payée</option><option value="préparation" ${o.status==='préparation'?'selected':''}>Préparation</option><option value="expédiée" ${o.status==='expédiée'?'selected':''}>Expédiée</option><option value="annulée" ${o.status==='annulée'?'selected':''}>Annulée</option><option value="remboursée" ${o.status==='remboursée'?'selected':''}>Remboursée</option></select><div class="admin-actions" style="margin-top:8px"><button class="admin-btn admin-btn-edit" onclick="createRefund('${safeAttr(o.id)}')">Rembourser</button></div></td></tr>`}).join('');panel.innerHTML=`<div class="admin-form-card"><h3>Commandes & remboursements</h3><p class="admin-help">Les forfaits créés par les clients et les événements personnalisés apparaissent ici avec les quantités, textes souvenirs et détails.</p></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Articles</th><th>Total</th><th>Paiement</th><th>Statut / action</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="admin-muted">Aucune commande pour le moment.</td></tr>'}</tbody></table></div><div class="admin-section-title"><h3>Historique des remboursements</h3></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Remboursement</th><th>Commande</th><th>Montant</th><th>Raison</th><th>Statut</th></tr></thead><tbody>${refundRows||'<tr><td colspan="5" class="admin-muted">Aucun remboursement.</td></tr>'}</tbody></table></div>`;
}
