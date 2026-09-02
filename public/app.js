/* Arty! — Application v3 */
let currentUser=null,authToken=null,allKits=[],allEvents=[],allCategories=[],teamActivities=[],allBundles=[],cart=[],currentFilter='all',googleClientId='',adminEvents=[],adminBookings=[],eventRequests=[],adminOrders=[];
let paymentProvider='not_connected',stripeMode='test',stripePublishableKey='',stripeConfigured=false,ticketPaymentsConfigured=false,stripeInstance=null,stripeElements=null,currentStripeOrder=null,currentStripePayment=null;
let bundleDealRules=[],bundleBuilderState={people:10,customText:'',selected:{},purpose:'group'},eventBuilderState={step:1,eventType:'wedding',guests:20,date:'',location:'',customText:'',selected:{},hostName:'',notes:''};
let catalogFilters={category:'all',stock:'all',search:'',priceMin:'',priceMax:'',sort:'featured'};
let siteAnnouncement={enabled:false,message:''},ticketEmailConfigured=false,lastTicketEmailStatus='',adminGuestEventId='';

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
  try{const r=await fetch('/api/config');const cfg=await r.json();googleClientId=cfg.googleClientId||'';paymentProvider=cfg.paymentProvider||'not_connected';stripeMode=cfg.stripeMode||'test';stripePublishableKey=cfg.stripePublishableKey||'';stripeConfigured=!!cfg.stripeConfigured;ticketPaymentsConfigured=!!cfg.ticketPaymentsConfigured;ticketEmailConfigured=!!cfg.ticketEmailConfigured;siteAnnouncement=cfg.announcement||siteAnnouncement}catch{}
  if(authToken&&currentUser){try{const r=await fetch('/api/users/me',{headers:authH()});if(!r.ok)throw 0;currentUser=await r.json();localStorage.setItem('arty_user',JSON.stringify(currentUser))}catch{logout(1)}}
  await Promise.all([loadKits(),loadCategories(),loadEvents(),loadTeam(),loadBundles(),loadBundleDealRules()]);
  initNavbar();updateAuthUI();updateCartUI();renderSiteAnnouncement();initGoogleSignIn();initAuthValidation();
  window.addEventListener('hashchange',handleRoute);handleRoute();
});

function authH(){return authToken?{'Authorization':'Bearer '+authToken,'Content-Type':'application/json'}:{'Content-Type':'application/json'}}
function navigate(h){window.location.hash=h}
function safeText(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function safeAttr(v){return safeText(v).replace(/'/g,'&#39;')}
function toMoney(v){return Number(v||0).toFixed(2)}

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
  else if(h.startsWith('#/ticket/')){show('page-ticket');renderPublicTicket(decodeURIComponent(h.split('/').slice(2).join('/')));window.scrollTo(0,0)}
  else if(h==='#/profile'){if(!currentUser){navigate('#/');openModal('auth');return}show('page-profile');renderProfilePage();window.scrollTo(0,0)}
  else if(h==='#/admin'){if(!currentUser||currentUser.role!=='admin'){navigate('#/');showToast('Accès admin requis','error');return}show('page-admin');document.getElementById('mainFooter').style.display='none';loadAdminData();window.scrollTo(0,0)}
  else if(h.startsWith('#/paintings')){show('page-paintings');renderPaintingsPage();window.scrollTo(0,0)}
  else if(h==='#/custom-photo'){show('page-custom-photo');renderCustomPhotoPage();window.scrollTo(0,0)}
  else if(h==='#/custom-bag'){show('page-custom-bag');renderCustomBagPage();window.scrollTo(0,0)}
  else if(h==='#/bundle-builder'){show('page-bundle-builder');renderBundleBuilderPage();window.scrollTo(0,0)}
  else if(h==='#/event-builder'){show('page-event-builder');renderEventBuilderPage();window.scrollTo(0,0)}
  else if(h==='#/tutorials'){show('page-tutorials');renderTutorialsPage();window.scrollTo(0,0)}
  else if(h==='#/checkout'){show('page-checkout');renderCheckoutPage();window.scrollTo(0,0)}
  else if(h.startsWith('#/payment-complete')){show('page-checkout');renderPaymentCompletePage();window.scrollTo(0,0)}
  else if(h==='#/privacy'){show('page-privacy');initScrollEffects();window.scrollTo(0,0)}
  else if(h==='#/policies'){show('page-policies');initScrollEffects();window.scrollTo(0,0)}
  else if(h.startsWith('#/party')){show('page-party');renderPartyPage();handlePartySection(h);window.scrollTo(0,0)}
  else if(h==='#/team'){show('page-party');renderPartyPage();setTimeout(scrollToTeamEvents,220)}
  else{show('page-home');renderHomePage();if(h.includes('contact'))setTimeout(()=>document.getElementById('contact')?.scrollIntoView({behavior:'smooth'}),200)}
}
function show(id){
  const el=document.getElementById(id);
  if(!el){
    console.warn('Page container missing:',id);
    const home=document.getElementById('page-home');
    if(home){home.classList.add('active');try{renderHomePage()}catch(e){console.error(e)}}
    return;
  }
  el.classList.add('active');
}
function renderSiteAnnouncement(){
  const bar=document.getElementById('siteAnnouncement');
  const message=document.getElementById('siteAnnouncementMessage');
  if(!bar||!message)return;
  const visible=siteAnnouncement?.enabled===true&&String(siteAnnouncement?.message||'').trim().length>0;
  message.textContent=visible?String(siteAnnouncement.message).trim():'';
  bar.hidden=!visible;
  document.body.classList.toggle('has-site-announcement',visible);
}
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
      <div class="kit-card-footer"><span class="kit-card-price">$${k.price.toFixed(2)}</span></div></div></div>`;
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
  catalogFilters={category:params.get('cat')||'all',stock:'all',search:'',priceMin:'',priceMax:'',sort:'featured'};
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
}

function resetCatalogFilters(){
  catalogFilters={category:'all',stock:'all',search:'',priceMin:'',priceMax:'',sort:'featured'};
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
    const hay=[k.name,k.shortDesc,k.description,cat?.name].join(' ').toLowerCase();
    if(catalogFilters.category!=='all' && String(k.categoryId)!==String(catalogFilters.category)) return false;
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
    const img=k.image||'logoarty.png';
    const isInStock=k.inStock!==false;
    return `<div class="kit-card catalog-kit-card" onclick="navigate('#/product/${k.id}')">
      <div class="kit-card-img"><img src="${safeAttr(img)}" alt="${safeAttr(k.name)}" loading="lazy">${k.featured?'<span class="kit-card-badge">Populaire</span>':''}${!isInStock?'<span class="kit-stock-badge">Épuisé</span>':''}</div>
      <div class="kit-card-body">
        <div class="kit-card-category">${safeText(cat?cat.name:'Sans catégorie')}</div>
        <h3 class="kit-card-title">${safeText(k.name)}</h3>
        <p class="kit-card-desc">${safeText(k.shortDesc||k.description||'')}</p>
        <div class="kit-card-footer"><span class="kit-card-price">$${toMoney(k.price)}</span></div>
      </div>
    </div>`;
  }).join('');
  if(!filtered.length) g.innerHTML='<div class="empty-state catalog-empty"><h3>Aucun produit trouvé</h3><p>Essayez de retirer un filtre ou de chercher un mot plus simple.</p><button class="btn btn-orange btn-sm" onclick="resetCatalogFilters()">Réinitialiser les filtres</button></div>';
  setTimeout(()=>g.classList.add('visible'),50);
}

function toggleCatalogFilters(){
  document.getElementById('catalogSidebar')?.classList.toggle('open');
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
          <button class="btn btn-orange" onclick="openBooking(${ev.id})" ${left<=0?'disabled style="opacity:.45"':''}>${left<=0?'Complet':'Réserver mes billets →'}</button>
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
        <button class="btn btn-orange btn-sm" onclick="event.stopPropagation();openBooking(${ev.id})" ${left<=0?'disabled style="opacity:.45"':''}>Réserver des billets</button>
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
    </div>
  </div>`).join('');
  initScrollEffects();
}
function playVideo(el,url){el.innerHTML=`<iframe src="${url}?autoplay=1" allow="autoplay;encrypted-media" allowfullscreen></iframe>`}


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
function buyNow(id){if(addToCart(id)!==false)setTimeout(()=>goToCheckout(),250)}
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
  const hasEventTickets=cart.some(item=>item.type==='event-ticket'),needsShipping=cart.some(item=>item.type!=='event-ticket'),ticketOnly=hasEventTickets&&!needsShipping;
  const savedAddress=currentUser?.defaultAddress||{};
  const checkoutName=currentUser?.name||'',checkoutEmail=currentUser?.email||'',checkoutPhone=currentUser?.phone||'';
  const userBox=currentUser?`<div class="checkout-account-box connected"><strong>Connecté comme ${safeText(currentUser.name)}</strong><span>${safeText(currentUser.email)}</span></div>`:`<div class="checkout-account-box"><strong>Pas de compte?</strong><span>Vous pouvez créer un compte ou acheter comme invité. Le courriel est obligatoire pour recevoir la confirmation.</span><div class="checkout-account-actions"><button class="btn btn-orange btn-sm" onclick="openModal('auth','register')">Créer un compte</button><button class="btn btn-ghost btn-sm" onclick="openModal('auth','login')">Connexion</button></div></div>`;
  const summary=cart.map(i=>`<div class="checkout-line"><img src="${safeAttr(i.image)}" alt="${safeAttr(i.name)}"><div><strong>${safeText(i.name)}</strong>${configuredKitDetailsHTML(i,'checkout-config-details')}<small>${i.type==='event-ticket'?`${i.qty} personne${i.qty>1?'s':''}`:`Qté ${i.qty}`} × $${toMoney(i.price)}</small></div><span>$${toMoney(i.price*i.qty)}</span></div>`).join('');
  const shippingStep=needsShipping?`<div class="checkout-step-title"><span>2</span><div><h3>Livraison</h3><p>Adresse pour recevoir les produits physiques.</p></div></div>
        <div class="form-group"><label>Adresse complète *</label><input type="text" id="coAddress" value="${safeAttr(savedAddress.line1||'')}" placeholder="Numéro, rue, appartement"></div>
        <div class="form-row"><div class="form-group"><label>Ville</label><input type="text" id="coCity" value="${safeAttr(savedAddress.city||'')}" placeholder="Ville"></div><div class="form-group"><label>Province</label><input type="text" id="coProvince" value="${safeAttr(savedAddress.province||'QC')}"></div></div>
        <div class="form-row"><div class="form-group"><label>Code postal</label><input type="text" id="coPostal" value="${safeAttr(savedAddress.postal||'')}" placeholder="A1A 1A1"></div><div class="form-group"><label>Pays</label><input type="text" id="coCountry" value="${safeAttr(savedAddress.country||'Canada')}"></div></div>
        <div class="form-group"><label>Note de livraison</label><textarea id="coNotes" placeholder="Instructions spéciales pour la livraison"></textarea></div>`:`<div class="checkout-step-title"><span>2</span><div><h3>Billets électroniques</h3><p>Aucune adresse de livraison n’est nécessaire.</p></div></div><div class="checkout-ticket-delivery"><strong>Vos billets sont protégés jusqu’au paiement.</strong><p>Après confirmation du paiement, les billets avec leurs codes d’entrée seront créés et envoyés au courriel indiqué ci-dessus.</p></div>`;
  const paymentUnavailable=hasEventTickets&&!ticketPaymentsConfigured;
  c.innerHTML=`
    <div class="checkout-hero-clean">
      <div><div class="section-tag">Paiement</div><h2 class="section-heading">Finaliser votre <span class="accent">commande</span></h2><p>${hasEventTickets?'Les billets sont émis uniquement après la confirmation du paiement.':'Vérifiez vos coordonnées, votre livraison et le résumé avant de payer.'}</p></div>
      <button class="btn btn-ghost" onclick="navigate('${ticketOnly?'#/party':'#/paintings'}')">← Continuer à magasiner</button>
    </div>
    <div class="checkout-layout">
      <section class="checkout-card-main">
        <div class="checkout-step-title"><span>1</span><div><h3>Client</h3><p>Compte ou achat invité.</p></div></div>
        ${userBox}
        <div class="form-row"><div class="form-group"><label>Nom complet</label><input type="text" id="coName" value="${safeAttr(checkoutName)}" placeholder="Votre nom"></div><div class="form-group"><label>Courriel *</label><input type="email" id="coEmail" value="${safeAttr(checkoutEmail)}" placeholder="nom@exemple.com"></div></div>
        <div class="form-group"><label>Téléphone</label><input type="text" id="coPhone" value="${safeAttr(checkoutPhone)}" placeholder="Optionnel"></div>
        ${shippingStep}
        <div class="checkout-step-title"><span>3</span><div><h3>Paiement sécurisé</h3><p>${paymentUnavailable?'Le paiement et sa confirmation automatique doivent être configurés avant la vente de billets.':stripeConfigured?'Paiement intégré avec Stripe. ARTY ne reçoit jamais le numéro complet de la carte.':'Le paiement en ligne n’est pas encore connecté.'}</p></div></div>
        <div class="payment-provider-box ${stripeConfigured&&!paymentUnavailable?'stripe-ready':''} ${paymentUnavailable?'payment-required':''}"><strong>${paymentUnavailable?'Paiement des billets indisponible':stripeConfigured?'Paiement sécurisé par Stripe':'Paiement en ligne indisponible'}</strong><p>${paymentUnavailable?'La commande ne peut pas être passée et aucun billet ne sera créé tant que la confirmation sécurisée du paiement n’est pas active.':stripeConfigured?'Cliquez sur Continuer au paiement pour afficher le formulaire sécurisé.':'La commande sera enregistrée en attente de paiement.'}</p></div>
        <div class="stripe-payment-panel" id="stripePaymentPanel" style="display:none">
          <div class="stripe-payment-head"><strong>Paiement par carte</strong><span id="stripeOrderLabel"></span></div>
          <div id="payment-element"></div>
          <div id="stripePaymentMessage" class="stripe-payment-message"></div>
          <button class="btn btn-orange checkout-submit" id="stripePayBtn" onclick="confirmStripePayment()">Payer maintenant →</button>
        </div>
        <label class="checkout-policy-check"><input type="checkbox" id="coPolicyAccept"> J'accepte les <a href="#/policies">politiques d'achat</a> et la <a href="#/privacy">politique de confidentialité</a>.</label>
        <button class="btn btn-orange checkout-submit" id="placeOrderBtn" onclick="placeOrder()" ${paymentUnavailable?'disabled':''}>${paymentUnavailable?'Paiement requis pour acheter les billets':stripeConfigured?'Continuer au paiement sécurisé →':'Créer la commande →'}</button>
      </section>
      <aside class="checkout-summary-card">
        <h3>Résumé</h3>${summary}
        <div class="checkout-total-row"><span>Sous-total</span><strong>$${toMoney(getSubtotal())}</strong></div>
        <div class="checkout-note-small">${hasEventTickets?(needsShipping?'Les accès seront envoyés après paiement. Les produits physiques seront livrés à l’adresse indiquée.':'Un seul billet par événement indiquera le nombre total de personnes admises.'):'Les taxes et frais de livraison applicables sont confirmés au paiement.'}</div>
      </aside>
    </div>`;
}
async function placeOrder(){
  if(!cart.length)return showToast('Panier vide','error');
  const hasEventTickets=cart.some(item=>item.type==='event-ticket'),needsShipping=cart.some(item=>item.type!=='event-ticket');
  const name=document.getElementById('coName')?.value.trim();
  const email=document.getElementById('coEmail')?.value.trim();
  const phone=document.getElementById('coPhone')?.value.trim();
  const address=document.getElementById('coAddress')?.value.trim()||'';
  const city=document.getElementById('coCity')?.value.trim()||'';
  const province=document.getElementById('coProvince')?.value.trim()||'';
  const postal=document.getElementById('coPostal')?.value.trim()||'';
  const country=document.getElementById('coCountry')?.value.trim()||'';
  const notes=document.getElementById('coNotes')?.value.trim()||'';
  if(!name)return showToast('Entrez votre nom','error');
  if(!email||!validateEmail(email))return showToast('Entrez un courriel valide','error');
  if(needsShipping&&!address)return showToast('Entrez l’adresse de livraison','error');
  if(hasEventTickets&&!ticketPaymentsConfigured)return showToast('Le paiement sécurisé doit être entièrement configuré avant de vendre des billets','error');
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
    const issuedTicket=Array.isArray(d.tickets)?d.tickets[0]:null;
    if(issuedTicket?.code){
      lastTicketEmailStatus=d.emailStatus||'';
      currentStripeOrder=null;currentStripePayment=null;stripeElements=null;
      showToast('Paiement confirmé. Vos billets sont prêts.','success');
      navigate(`#/ticket/${encodeURIComponent(issuedTicket.code)}`);
      return;
    }
    if((d.order?.paymentStatus||'')!=='paid'){
      showToast('Paiement en traitement. Les billets seront envoyés après confirmation.','success');
      navigate(`#/payment-complete?order=${encodeURIComponent(currentStripeOrder.id)}`);
      return;
    }
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
  c.innerHTML=`<div class="checkout-empty"><div class="section-tag">Paiement</div><h2 class="section-heading">Vérification du <span class="accent">paiement</span></h2><p class="section-sub">Votre banque peut prendre un moment pour confirmer le paiement. Si votre commande contient des billets, ils seront créés et envoyés par courriel uniquement après cette confirmation.</p><a href="#/profile" class="btn btn-orange">Voir mon compte</a></div>`;
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
  const sel=document.getElementById('bookingGuests');
  if(sel)sel.innerHTML=Array.from({length:Math.min(left,10)},(_,i)=>`<option value="${i+1}">${i+1} personne${i?'s':''}</option>`).join('');
  const summary=document.getElementById('bookingSummaryText');
  if(summary)summary.textContent=`${formatEventDate(ev,true)} à ${ev.time||'18:00'} · ${left} place${left>1?'s':''} disponible${left>1?'s':''}`;
  document.getElementById('bookingModal').classList.add('active');
  document.getElementById('bookingModal').dataset.eid=eventId;
  updateBookingTotal();
  document.body.style.overflow='hidden';
}
function updateBookingTotal(){const modal=document.getElementById('bookingModal'),eventId=parseInt(modal?.dataset.eid),event=allEvents.find(item=>item.id===eventId),guests=Math.max(1,parseInt(document.getElementById('bookingGuests')?.value)||1),total=document.getElementById('bookingTotal');if(total)total.textContent=toMoney((Number(event?.price)||0)*guests)}
function confirmBooking(){
  const modal=document.getElementById('bookingModal');
  const eid=modal.dataset.eid;
  const g=document.getElementById('bookingGuests').value;
  const button=document.getElementById('bookingSubmitButton');
  const event=allEvents.find(item=>String(item.id)===String(eid));if(!event)return showToast('Événement introuvable','error');
  const qty=Math.max(1,parseInt(g)||1),id=`event-ticket-${event.id}`,existing=cart.find(item=>String(item.id)===id),combined=(Number(existing?.qty)||0)+qty;
  if(combined>spotsLeft(event))return showToast(`Il reste seulement ${spotsLeft(event)} billet${spotsLeft(event)>1?'s':''}`,'error');
  if(button){button.disabled=true;button.textContent='Ajout au panier...'}
  const item={id,name:`Billet — ${event.title}`,price:Number(event.price)||0,image:event.image||'logoarty.png',qty,type:'event-ticket',customData:{kind:'event-ticket',eventId:event.id,eventDate:event.date||'',eventTime:event.time||'',eventLocation:event.location||''}};
  if(existing)existing.qty=combined;else cart.push(item);
  saveCart();updateCartUI();closeModal('booking');showToast(`Accès pour ${qty} personne${qty>1?'s':''} ajouté au panier`,'success');setTimeout(openCart,120);
  if(button){button.disabled=false;button.textContent='Ajouter au panier'}
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

async function deleteKit(id){if(!confirm('Supprimer ce kit?'))return;await fetch(`/api/admin/kits/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadKits();loadAdminData()}

function renderAdminCategories(){document.getElementById('adminCategoriesPanel').innerHTML=`<div class="admin-form-card"><h3 id="catFormTitle">Ajouter une Catégorie</h3><input type="hidden" id="editCatId"><div class="form-row"><div class="form-group"><label>Nom</label><input type="text" id="aCatName"></div><div class="form-group"><label>Type</label><select id="aCatParent"><option value="individual">Individuel</option><option value="group">Groupe</option><option value="none">Autre</option></select></div></div><div class="form-group"><label>Image URL</label><input type="text" id="aCatImg"></div><div style="display:flex;gap:10px"><button class="btn btn-orange" onclick="saveCat()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetCatForm()" style="display:none" id="cancelCat">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Catégorie</th><th>Type</th><th>Actions</th></tr></thead><tbody>${allCategories.map(c=>`<tr><td><strong>${c.name}</strong></td><td>${c.parent}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editCat(${c.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteCat(${c.id})">Supprimer</button></div></td></tr>`).join('')}</tbody></table></div>`}
async function saveCat(){const eid=document.getElementById('editCatId').value;const p={name:document.getElementById('aCatName').value,parent:document.getElementById('aCatParent').value,image:document.getElementById('aCatImg').value};if(!p.name)return showToast('Nom requis','error');await fetch(eid?`/api/admin/categories/${eid}`:'/api/admin/categories',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});showToast(eid?'Modifié!':'Ajouté!','success');await loadCategories();loadAdminData()}
function editCat(id){const c=allCategories.find(x=>x.id===id);if(!c)return;document.getElementById('editCatId').value=c.id;document.getElementById('aCatName').value=c.name;document.getElementById('aCatParent').value=c.parent;document.getElementById('aCatImg').value=c.image||'';document.getElementById('catFormTitle').textContent='Modifier';document.getElementById('cancelCat').style.display='inline-flex'}
function resetCatForm(){['editCatId','aCatName','aCatImg'].forEach(id=>document.getElementById(id).value='');document.getElementById('catFormTitle').textContent='Ajouter une Catégorie';document.getElementById('cancelCat').style.display='none'}
async function deleteCat(id){if(!confirm('Supprimer?'))return;await fetch(`/api/admin/categories/${id}`,{method:'DELETE',headers:authH()});showToast('Supprimé','success');await loadCategories();loadAdminData()}


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
let adminAnalyticsPro=null,adminDiscounts=[],adminRefunds=[],adminBundleDealRules=[],adminProductTemplates=[];

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
  return '';
}
function stockTagText(k){
  if(k?.inStock===false)return 'Épuisé';
  return 'En stock';
}

async function loadAdminAnalytics(){try{adminAnalyticsPro=await(await fetch('/api/admin/analytics',{headers:authH()})).json()}catch{adminAnalyticsPro=null}}
async function loadAdminDiscounts(){try{adminDiscounts=await(await fetch('/api/admin/discounts',{headers:authH()})).json()}catch{adminDiscounts=[]}}
async function loadAdminBundleDeals(){try{adminBundleDealRules=await(await fetch('/api/admin/bundle-deals',{headers:authH()})).json();bundleDealRules=adminBundleDealRules}catch{adminBundleDealRules=[]}}
async function loadAdminRefunds(){try{adminRefunds=await(await fetch('/api/admin/refunds',{headers:authH()})).json()}catch{adminRefunds=[]}}
async function loadAdminAnnouncement(){try{siteAnnouncement=await(await fetch('/api/announcement')).json();renderSiteAnnouncement()}catch{siteAnnouncement={enabled:false,message:''}}}
async function loadAdminKits(){try{const r=await fetch('/api/admin/kits',{headers:authH()});if(!r.ok)throw new Error();allKits=await r.json()}catch{await loadKits()}}
async function loadAdminProductTemplates(){try{const r=await fetch('/api/admin/product-templates',{headers:authH()});if(!r.ok)throw new Error();adminProductTemplates=await r.json()}catch{adminProductTemplates=[]}}

async function loadAdminData(){
  try{
    await Promise.all([loadAdminEvents(),loadAdminBookings(),loadEventRequests(),loadAdminOrders(),loadAdminAnalytics(),loadAdminDiscounts(),loadAdminRefunds(),loadAdminAnnouncement(),loadAdminKits(),loadAdminProductTemplates(),loadCategories()]);
    document.getElementById('statRevenue').textContent=`$${toMoney(adminAnalyticsPro?.revenue||0)}`;
    document.getElementById('statOrders').textContent=adminAnalyticsPro?.ordersCount??(adminOrders||[]).length;
    document.getElementById('statKits').textContent=allKits.length;
    document.getElementById('statLowInventory').textContent=adminAnalyticsPro?.lowInventoryCount??0;
  }catch(e){console.warn(e)}
  renderAdminDashboard();renderAdminKits();renderAdminInventory();renderAdminDiscounts();renderAdminOrders();renderAdminCategories();renderAdminEvents();renderAdminAnnouncement();
}
function switchAdminTab(t,btn){
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  const ids=['Dashboard','Kits','Inventory','Discounts','Orders','Events','Categories','Announcement'];
  ids.forEach(name=>{const el=document.getElementById(`admin${name}Panel`);if(el)el.style.display='none'});
  const map={dashboard:'Dashboard',kits:'Kits',inventory:'Inventory',discounts:'Discounts',orders:'Orders',events:'Events',categories:'Categories',announcement:'Announcement'};
  const panel=document.getElementById(`admin${map[t]||'Dashboard'}Panel`);if(panel)panel.style.display='block';
}

function renderHomePopularKits(){
  const featured=allKits.filter(k=>k.featured).slice(0,5);const kits=featured.length>=5?featured:allKits.slice(0,5);
  const el=document.getElementById('homePopularKits');if(!el)return;
  el.innerHTML=kits.map(k=>{const cat=allCategories.find(c=>String(c.id)===String(k.categoryId));return `<div class="kit-card" onclick="navigate('#/product/${k.id}')"><div class="kit-card-img"><img src="${safeAttr(k.image||'logoarty.png')}" alt="${safeAttr(k.name)}" loading="lazy">${k.featured?'<span class="kit-card-badge">Populaire</span>':''}${stockBadgeHTML(k)}</div><div class="kit-card-body"><div class="kit-card-category">${safeText(cat?cat.name:'')}</div><h3 class="kit-card-title">${safeText(k.name)}</h3><p class="kit-card-desc">${safeText(k.shortDesc||k.description||'')}</p><div class="kit-card-footer"><div>${kitPriceHTML(k)}</div></div></div></div>`}).join('');
}
function getFilteredKits(){
  let kits=[...allKits];
  const q=(catalogFilters.search||'').toLowerCase().trim();
  if(q)kits=kits.filter(k=>`${k.name||''} ${k.description||''} ${k.shortDesc||''}`.toLowerCase().includes(q));
  if(catalogFilters.category!=='all')kits=kits.filter(k=>String(k.categoryId)===String(catalogFilters.category));
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
  g.innerHTML=filtered.map(k=>{const cat=allCategories.find(c=>String(c.id)===String(k.categoryId));return `<div class="kit-card catalog-kit-card" onclick="navigate('#/product/${k.id}')"><div class="kit-card-img"><img src="${safeAttr(k.image||'logoarty.png')}" alt="${safeAttr(k.name)}" loading="lazy">${k.featured?'<span class="kit-card-badge">Populaire</span>':''}${stockBadgeHTML(k)}</div><div class="kit-card-body"><div class="kit-card-category">${safeText(cat?cat.name:'Sans catégorie')}</div><h3 class="kit-card-title">${safeText(k.name)}</h3><p class="kit-card-desc">${safeText(k.shortDesc||k.description||'')}</p><div class="kit-card-footer"><div>${kitPriceHTML(k)}</div></div></div></div>`}).join('');
  if(!filtered.length)g.innerHTML='<div class="empty-state catalog-empty"><h3>Aucun produit trouvé</h3><p>Essayez de retirer un filtre ou de chercher un mot plus simple.</p><button class="btn btn-orange btn-sm" onclick="resetCatalogFilters()">Réinitialiser les filtres</button></div>';
  setTimeout(()=>g.classList.add('visible'),50);
}
function productImageList(kit){
  const images=Array.isArray(kit?.images)?kit.images.filter(Boolean):[];
  if(!images.length&&kit?.image)images.push(kit.image);
  return images.length?images:['logoarty.png'];
}
function productChoicePrice(price){
  const amount=Number(price)||0;
  return amount>0?`+ $${toMoney(amount)}`:'Inclus';
}
function readProductSelection(kit){
  const sizes=Array.isArray(kit?.sizeOptions)?kit.sizeOptions:[];
  const addOns=Array.isArray(kit?.addOns)?kit.addOns:[];
  const sizeId=document.querySelector('input[name="productSize"]:checked')?.value||'';
  const size=sizes.find(option=>String(option.id)===String(sizeId))||null;
  const selectedIds=Array.from(document.querySelectorAll('.product-addon-input:checked')).map(input=>String(input.value));
  const selectedAddOns=addOns.filter(option=>selectedIds.includes(String(option.id)));
  const extraPrice=(Number(size?.priceDelta)||0)+selectedAddOns.reduce((sum,option)=>sum+(Number(option.priceDelta)||0),0);
  return {size,addOns:selectedAddOns,extraPrice};
}
function updateProductPrice(kitId){
  const kit=allKits.find(item=>String(item.id)===String(kitId));if(!kit)return;
  const selection=readProductSelection(kit);
  const price=getKitDisplayPrice(kit)+selection.extraPrice;
  const regular=(Number(kit.originalPrice??kit.price)||0)+selection.extraPrice;
  const priceEl=document.getElementById('productConfiguredPrice');if(priceEl)priceEl.textContent=`$${toMoney(price)}`;
  const compareEl=document.getElementById('productConfiguredCompare');
  if(compareEl){compareEl.textContent=`$${toMoney(regular)}`;compareEl.style.display=regular>price?'inline':'none'}
  const summary=document.getElementById('productSelectionSummary');
  if(summary){const labels=[selection.size?.label,...selection.addOns.map(option=>option.label)].filter(Boolean);summary.textContent=labels.length?labels.join(' · '):'Configuration standard'}
}
function switchProductImage(button){
  const main=document.getElementById('pMainImg'),thumbs=Array.from(document.querySelectorAll('.product-thumb'));
  if(main){main.src=button.dataset.image||main.src;main.alt=button.dataset.alt||main.alt}
  thumbs.forEach(thumb=>{const active=thumb===button;thumb.classList.toggle('active',active);thumb.setAttribute('aria-pressed',String(active))});
  const counter=document.getElementById('productPhotoCount'),index=Math.max(0,thumbs.indexOf(button));
  if(counter)counter.textContent=`Photo ${index+1} sur ${thumbs.length}`;
}
function productServiceIcon(type){
  const paths={
    delivery:'<path d="M3 7h10v8H3z"></path><path d="M13 10h4l3 3v2h-7z"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle>',
    secure:'<rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    guide:'<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v16H7.5A3.5 3.5 0 0 0 4 21.5z"></path><path d="M4 5.5v16M9 7h7M9 11h7"></path>'
  };
  return `<span class="product-service-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[type]||paths.guide}</svg></span>`;
}
function renderProductPage(id){
  const kit=allKits.find(k=>String(k.id)===String(id));const c=document.getElementById('productPageContent');
  if(!kit){c.innerHTML='<div class="empty-state" style="padding:60px 0"><p>Kit non trouvé</p></div>';return}
  const cat=allCategories.find(ct=>String(ct.id)===String(kit.categoryId));
  const images=productImageList(kit),sizes=Array.isArray(kit.sizeOptions)?kit.sizeOptions:[],addOns=Array.isArray(kit.addOns)?kit.addOns:[],included=Array.isArray(kit.includes)?kit.includes:[];
  const thumbs=images.length>1?`<div class="product-thumbs" aria-label="Photos du produit">${images.map((img,index)=>`<button type="button" class="product-thumb${index===0?' active':''}" data-image="${safeAttr(img)}" data-alt="${safeAttr(kit.name)} — photo ${index+1}" onclick="switchProductImage(this)" aria-label="Afficher la photo ${index+1}" aria-pressed="${index===0?'true':'false'}"><img src="${safeAttr(img)}" alt=""></button>`).join('')}</div>`:'';
  const sizeOptions=sizes.length?`<div class="product-option-group"><div class="product-option-heading"><div><span>Choisissez votre format</span><small>Sélection obligatoire</small></div></div><div class="product-size-grid">${sizes.map((option,index)=>`<label class="product-size-option"><input type="radio" name="productSize" value="${safeAttr(option.id)}" ${index===0?'checked':''} onchange="updateProductPrice(${kit.id})"><span><strong>${safeText(option.label)}</strong><small>${productChoicePrice(option.priceDelta)}</small></span></label>`).join('')}</div></div>`:'';
  const addOnOptions=addOns.length?`<div class="product-option-group"><div class="product-option-heading"><div><span>Personnalisez votre kit</span><small>Options facultatives</small></div></div><div class="product-addon-list">${addOns.map(option=>`<label class="product-addon-option"><input class="product-addon-input" type="checkbox" value="${safeAttr(option.id)}" onchange="updateProductPrice(${kit.id})"><span class="product-addon-check" aria-hidden="true">✓</span><span class="product-addon-copy"><strong>${safeText(option.label)}</strong>${option.description?`<small>${safeText(option.description)}</small>`:''}</span><b>${productChoicePrice(option.priceDelta)}</b></label>`).join('')}</div></div>`:'';
  const regular=Number(kit.originalPrice??kit.price)||0,price=getKitDisplayPrice(kit),inStock=kit.inStock!==false;
  const includedCard=included.length?`<section class="product-detail-card product-included-card"><div class="product-detail-icon" aria-hidden="true">✓</div><div><span class="product-detail-kicker">Kit complet</span><h2>Inclus dans ce kit</h2><ul>${included.map(item=>`<li>${safeText(item)}</li>`).join('')}</ul></div></section>`:'';
  c.innerHTML=`
    <button class="product-back" onclick="navigate('#/paintings')">← Retour aux kits</button>
    <div class="product-layout product-layout-pro">
      <section class="product-gallery product-gallery-pro">
        <div class="product-main-media"><img src="${safeAttr(images[0])}" class="product-main-img" id="pMainImg" alt="${safeAttr(kit.name)} — photo 1">${images.length>1?`<span class="product-photo-count" id="productPhotoCount">Photo 1 sur ${images.length}</span>`:''}</div>
        ${thumbs}
      </section>
      <section class="product-info product-info-pro">
        <div class="product-title-row"><div><div class="product-cat">${safeText(cat?cat.name:'Kit ARTY')}</div><h1>${safeText(kit.name)}</h1></div>${kit.featured?'<span class="product-popular-mark">Populaire</span>':''}</div>
        <p class="product-desc">${safeText(kit.description||kit.shortDesc||'')}</p>
        ${!inStock?'<div class="product-tags"><span class="product-tag low-stock-tag">Épuisé</span></div>':''}
        <div class="product-purchase-card">
          <div class="product-price-line"><div><span>Votre prix</span><div class="product-configured-price"><strong id="productConfiguredPrice">$${toMoney(price)}</strong><small id="productConfiguredCompare" style="${regular>price?'':'display:none'}">$${toMoney(regular)}</small></div>${kit.discountLabel?`<em>${safeText(kit.discountLabel)}</em>`:''}</div><div class="product-selection-total"><span>Sélection</span><strong id="productSelectionSummary">${sizes[0]?safeText(sizes[0].label):'Configuration standard'}</strong></div></div>
          ${sizeOptions}${addOnOptions}
          <div class="product-buy-row"><div class="product-qty-row"><label>Quantité</label><div class="qty-ctrl"><button class="qty-btn" onclick="chgQty(-1)" aria-label="Réduire la quantité">−</button><input class="qty-val" id="pQty" value="1" readonly aria-label="Quantité"><button class="qty-btn" onclick="chgQty(1)" aria-label="Augmenter la quantité">+</button></div></div><button class="btn btn-orange product-add-button" onclick="addToCart(${kit.id})" ${!inStock?'disabled':''}>${inStock?'Ajouter au panier':'Produit épuisé'}</button></div>
          <button class="btn btn-teal product-buy-now" onclick="buyNow(${kit.id})" ${!inStock?'disabled':''}>Acheter maintenant →</button>
          <button class="btn btn-ghost product-bundle-button" onclick="startBundleWithKit(${kit.id})">Créer un forfait avec ce kit</button>
        </div>
        <div class="product-service-strip"><div>${productServiceIcon('delivery')}<strong>Livraison gratuite</strong><small>Dès 75 $</small></div><div>${productServiceIcon('secure')}<strong>Paiement protégé</strong><small>Traitement sécurisé</small></div><div>${productServiceIcon('guide')}<strong>Création guidée</strong><small>Instructions incluses</small></div></div>
      </section>
    </div>
    ${includedCard?`<div class="product-details-grid product-details-single">${includedCard}</div>`:''}`;
  updateProductPrice(kit.id);
}
function addToCart(kitId){
  const kit=allKits.find(k=>String(k.id)===String(kitId));if(!kit)return false;if(kit.inStock===false){showToast('Ce produit est épuisé','error');return false}
  const qty=parseInt(document.getElementById('pQty')?.value||1),selection=readProductSelection(kit),sizes=Array.isArray(kit.sizeOptions)?kit.sizeOptions:[];
  if(sizes.length&&!selection.size){showToast('Choisissez un format','error');return false}
  const optionIds=[selection.size?.id||'standard',...selection.addOns.map(option=>option.id)];
  const hasConfiguration=Boolean(sizes.length||(Array.isArray(kit.addOns)&&kit.addOns.length));
  const key=optionIds.join('-').replace(/[^a-z0-9_-]/gi,'-').slice(0,160);
  const id=hasConfiguration?`kit-${kit.id}-${key}`:normalizeCartId(kit.id);
  const ex=cart.find(item=>String(item.id)===String(id)),price=getKitDisplayPrice(kit)+selection.extraPrice,images=productImageList(kit);
  const customData=hasConfiguration?{kind:'configured-kit',kitId:kit.id,sizeId:selection.size?.id||'',sizeLabel:selection.size?.label||'',addOnIds:selection.addOns.map(option=>option.id),addOnLabels:selection.addOns.map(option=>option.label),selectionLabel:[selection.size?.label,...selection.addOns.map(option=>option.label)].filter(Boolean).join(' · ')}:null;
  if(ex)ex.qty+=qty;else cart.push({id,name:kit.name,price,image:images[0],qty,type:'kit',customData,discountLabel:kit.discountLabel||'',originalPrice:(Number(kit.originalPrice||kit.price)||0)+selection.extraPrice});
  saveCart();updateCartUI();showToast(`${kit.name} ajouté au panier!`,'success');return true;
}
function configuredKitDetailsHTML(item,className=''){
  const data=item?.customData;
  if(data?.kind==='event-ticket'){
    const date=data.eventDate?new Date(`${data.eventDate}T00:00:00`).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'}):'Date à confirmer';
    const admissions=Number(item.qty)||1;
    return `<div class="configured-kit-details event-ticket-details ${safeAttr(className)}"><span>${safeText(date)} · ${safeText(data.eventTime||'Heure à confirmer')}</span><span>Accès pour ${admissions} personne${admissions>1?'s':''}</span></div>`;
  }
  if(data?.kind!=='configured-kit')return '';
  const parts=[data.sizeLabel,...(Array.isArray(data.addOnLabels)?data.addOnLabels:[])].filter(Boolean);
  return parts.length?`<div class="configured-kit-details ${safeAttr(className)}">${parts.map(part=>`<span>${safeText(part)}</span>`).join('')}</div>`:'';
}
function renderCartItems(){
  const c=document.getElementById('cartItems'),f=document.getElementById('cartFooter');if(!c||!f)return;
  if(!cart.length){c.innerHTML='<div class="cart-empty"><div class="cart-empty-icon">Panier</div><p>Panier vide</p></div>';f.style.display='none';return}
  f.style.display='block';
  c.innerHTML=cart.map(i=>`<div class="cart-item ${i.type==='event-ticket'?'cart-event-ticket':''}"><img src="${safeAttr(i.image)}" class="cart-item-img" alt="${safeAttr(i.name)}"><div class="cart-item-info"><div class="cart-item-name">${safeText(i.name)}</div>${configuredKitDetailsHTML(i,'cart-config-details')}<div class="cart-item-price">$${toMoney(i.price)}${i.discountLabel?` <small>${safeText(i.discountLabel)}</small>`:''}</div>${i.type==='event-ticket'?`<div class="cart-ticket-quantity">Accès pour ${i.qty} personne${i.qty>1?'s':''}</div>`:`<div class="cart-qty-control"><button onclick="changeCartQty('${safeAttr(i.id)}',-1)">−</button><span>${i.qty}</span><button onclick="changeCartQty('${safeAttr(i.id)}',1)">+</button></div>`}</div><button class="cart-item-remove" onclick="removeFromCart('${safeAttr(i.id)}')" aria-label="Retirer">×</button></div>`).join('');
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

let adminProductChoiceCounter=0;
function newAdminProductChoiceId(prefix){adminProductChoiceCounter+=1;return `${prefix}-${Date.now()}-${adminProductChoiceCounter}`}
function adminProductRowHTML(kind,item={}){
  if(kind==='images'){const url=item.url||item.value||'';return `<div class="admin-repeat-row admin-image-row" data-kind="images"><div class="admin-image-row-preview">${url?`<img src="${safeAttr(url)}" alt="Aperçu">`:'<span>Photo</span>'}</div><input class="aKitImageUrl" type="text" value="${safeAttr(url)}" placeholder="Adresse de l’image" oninput="refreshAdminImagePreview(this)"><button type="button" onclick="removeAdminProductRow(this)">Retirer</button></div>`}
  if(kind==='includes')return `<div class="admin-repeat-row admin-repeat-simple" data-kind="includes"><input class="aKitIncludeItem" type="text" value="${safeAttr(item.label||item.value||'')}" placeholder="Ex: Toile pré-tracée 11 × 14"><button type="button" onclick="removeAdminProductRow(this)">Retirer</button></div>`;
  const id=item.id||newAdminProductChoiceId(kind==='sizes'?'size':'addon');
  if(kind==='sizes')return `<div class="admin-repeat-row admin-repeat-choice" data-kind="sizes" data-choice-id="${safeAttr(id)}"><input class="aKitSizeLabel" type="text" value="${safeAttr(item.label||'')}" placeholder="Format, ex: 11 × 14"><div class="admin-price-input"><span>+$</span><input class="aKitSizePrice" type="number" min="0" step="0.01" value="${Number(item.priceDelta)||0}" aria-label="Supplément du format"></div><button type="button" onclick="removeAdminProductRow(this)">Retirer</button></div>`;
  return `<div class="admin-repeat-row admin-repeat-addon" data-kind="addons" data-choice-id="${safeAttr(id)}"><input class="aKitAddonLabel" type="text" value="${safeAttr(item.label||'')}" placeholder="Option, ex: Ajouter un chevalet"><input class="aKitAddonDesc" type="text" value="${safeAttr(item.description||'')}" placeholder="Courte explication optionnelle"><div class="admin-price-input"><span>+$</span><input class="aKitAddonPrice" type="number" min="0" step="0.01" value="${Number(item.priceDelta)||0}" aria-label="Prix de l'option"></div><button type="button" onclick="removeAdminProductRow(this)">Retirer</button></div>`;
}
function adminProductListId(kind){return {images:'aKitImagesList',includes:'aKitIncludesList',sizes:'aKitSizesList',addons:'aKitAddonsList'}[kind]}
function addAdminProductRow(kind,item={}){const list=document.getElementById(adminProductListId(kind));if(list)list.insertAdjacentHTML('beforeend',adminProductRowHTML(kind,item))}
function setAdminProductRows(kind,items=[]){const list=document.getElementById(adminProductListId(kind));if(!list)return;const values=items.length?items:[{}];list.innerHTML=values.map(item=>adminProductRowHTML(kind,kind==='images'?{url:item}:kind==='includes'?{label:item}:item)).join('')}
function removeAdminProductRow(button){const row=button.closest('.admin-repeat-row'),list=row?.parentElement,kind=row?.dataset.kind;if(!row||!list)return;row.remove();if(!list.children.length)addAdminProductRow(kind)}
function collectAdminProductRows(){
  const images=Array.from(document.querySelectorAll('.aKitImageUrl')).map(input=>input.value.trim()).filter(Boolean);
  const includes=Array.from(document.querySelectorAll('.aKitIncludeItem')).map(input=>input.value.trim()).filter(Boolean);
  const sizeOptions=Array.from(document.querySelectorAll('#aKitSizesList .admin-repeat-choice')).map(row=>({id:row.dataset.choiceId,label:row.querySelector('.aKitSizeLabel')?.value.trim()||'',priceDelta:Number(row.querySelector('.aKitSizePrice')?.value)||0})).filter(option=>option.label);
  const addOns=Array.from(document.querySelectorAll('#aKitAddonsList .admin-repeat-addon')).map(row=>({id:row.dataset.choiceId,label:row.querySelector('.aKitAddonLabel')?.value.trim()||'',description:row.querySelector('.aKitAddonDesc')?.value.trim()||'',priceDelta:Number(row.querySelector('.aKitAddonPrice')?.value)||0})).filter(option=>option.label);
  return {images,includes,sizeOptions,addOns};
}
function refreshAdminImagePreview(input){
  const preview=input.closest('.admin-image-row')?.querySelector('.admin-image-row-preview');if(!preview)return;
  const url=input.value.trim();preview.innerHTML=url?`<img src="${safeAttr(url)}" alt="Aperçu">`:'<span>Photo</span>';
}
function readAdminImageFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Lecture impossible'));reader.readAsDataURL(file)})}
async function uploadAdminProductImages(input){
  const files=Array.from(input.files||[]),status=document.getElementById('aKitUploadStatus');if(!files.length)return;
  if(files.some(file=>file.size>10*1024*1024)){showToast('Chaque image doit faire moins de 10 Mo','error');input.value='';return}
  input.disabled=true;if(status)status.textContent=`Téléversement de ${files.length} image${files.length>1?'s':''}...`;
  try{
    for(const file of files){
      const dataUrl=await readAdminImageFile(file);
      const r=await fetch('/api/admin/product-images',{method:'POST',headers:authH(),body:JSON.stringify({fileName:file.name,dataUrl})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Téléversement impossible');
      const empty=Array.from(document.querySelectorAll('.aKitImageUrl')).find(field=>!field.value.trim());
      if(empty){empty.value=d.url;refreshAdminImagePreview(empty)}else addAdminProductRow('images',{url:d.url});
    }
    if(status)status.textContent='Images ajoutées à la galerie.';showToast('Images téléversées','success');
  }catch(err){if(status)status.textContent='';showToast(err.message||'Erreur de téléversement','error')}
  finally{input.disabled=false;input.value=''}
}
function productTemplateOptionsHTML(selected=''){return `<option value="">Choisir un modèle</option>${adminProductTemplates.map(template=>`<option value="${safeAttr(template.id)}" ${String(template.id)===String(selected)?'selected':''}>${safeText(template.name)}</option>`).join('')}`}
function refreshProductTemplateSelect(selected=''){const select=document.getElementById('aKitTemplateSelect');if(select)select.innerHTML=productTemplateOptionsHTML(selected)}
function applyProductTemplate(){
  const id=document.getElementById('aKitTemplateSelect')?.value,template=adminProductTemplates.find(item=>String(item.id)===String(id));
  if(!template)return showToast('Choisissez un modèle','error');
  setAdminProductRows('includes',template.includes||[]);setAdminProductRows('sizes',template.sizeOptions||[]);setAdminProductRows('addons',template.addOns||[]);showToast('Modèle appliqué','success');
}
async function saveProductTemplate(){
  const name=document.getElementById('aKitTemplateName')?.value.trim()||'',details=collectAdminProductRows();
  if(!name)return showToast('Donnez un nom au modèle','error');
  if(!details.includes.length&&!details.sizeOptions.length&&!details.addOns.length)return showToast('Ajoutez du contenu avant de créer le modèle','error');
  try{const r=await fetch('/api/admin/product-templates',{method:'POST',headers:authH(),body:JSON.stringify({name,includes:details.includes,sizeOptions:details.sizeOptions,addOns:details.addOns})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');adminProductTemplates.push(d.template);adminProductTemplates.sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr'));refreshProductTemplateSelect(d.template.id);document.getElementById('aKitTemplateName').value='';showToast('Modèle créé','success')}catch{showToast('Erreur','error')}
}
async function deleteProductTemplate(){
  const id=document.getElementById('aKitTemplateSelect')?.value,template=adminProductTemplates.find(item=>String(item.id)===String(id));if(!template)return showToast('Choisissez un modèle','error');if(!confirm(`Supprimer le modèle « ${template.name} »?`))return;
  try{const r=await fetch(`/api/admin/product-templates/${encodeURIComponent(id)}`,{method:'DELETE',headers:authH()});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');adminProductTemplates=adminProductTemplates.filter(item=>String(item.id)!==String(id));refreshProductTemplateSelect();showToast('Modèle supprimé','success')}catch{showToast('Erreur','error')}
}
function renderAdminKits(){
  const panel=document.getElementById('adminKitsPanel');if(!panel)return;
  const rows=allKits.map(k=>{const cat=allCategories.find(c=>String(c.id)===String(k.categoryId)),images=productImageList(k),formatCount=(k.sizeOptions||[]).length,optionCount=(k.addOns||[]).length;return `<tr><td><div class="admin-product-cell"><img src="${safeAttr(images[0])}" alt=""><div><strong>${safeText(k.name)}</strong><br><span class="admin-muted">${images.length} photo${images.length>1?'s':''} · ${formatCount} format${formatCount!==1?'s':''} · ${optionCount} option${optionCount!==1?'s':''}</span></div></div></td><td>${cat?safeText(cat.name):'-'}</td><td><span class="admin-status ${k.inStock!==false?'ok':'out'}">${safeText(stockTagText(k))}</span></td><td>${kitPriceHTML(k)}</td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editKit(${k.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteKit(${k.id})">Supprimer</button></div></td></tr>`}).join('');
  panel.innerHTML=`
    <div class="admin-form-card admin-product-editor">
      <div class="admin-form-head"><div><h3 id="kitFormTitle">Ajouter un produit</h3><p>Créez une fiche produit complète avec galerie, contenu, formats et options payantes.</p></div><button class="btn btn-ghost btn-sm" onclick="resetKitForm()">Nouveau</button></div>
      <input type="hidden" id="editKitId">
      <section class="admin-template-panel"><div class="admin-template-copy"><strong>Modèles réutilisables</strong><span>Appliquez en un clic le contenu, les formats et les options d’un autre kit.</span></div><div class="admin-template-controls"><select id="aKitTemplateSelect">${productTemplateOptionsHTML()}</select><button type="button" class="admin-template-apply" onclick="applyProductTemplate()">Appliquer</button><button type="button" class="admin-template-delete" onclick="deleteProductTemplate()">Supprimer</button></div><div class="admin-template-save"><input type="text" id="aKitTemplateName" placeholder="Nom du nouveau modèle"><button type="button" onclick="saveProductTemplate()">Créer avec la configuration actuelle</button></div></section>
      <section class="admin-product-section"><div class="admin-product-section-title"><span>1</span><div><h4>Informations principales</h4><p>Nom, prix et présentation du produit.</p></div></div><div class="form-row"><div class="form-group"><label>Nom</label><input type="text" id="aKitName" placeholder="Nom du kit"></div><div class="form-group"><label>Prix régulier ($)</label><input type="number" id="aKitPrice" step="0.01" placeholder="29.99"></div><div class="form-group"><label>Prix barré optionnel ($)</label><input type="number" id="aKitCompare" step="0.01" placeholder="39.99"></div></div><div class="form-group"><label>Description complète</label><textarea id="aKitDesc" placeholder="Présentez l’expérience, le résultat et ce qui rend ce kit spécial"></textarea></div><div class="form-group"><label>Courte description</label><input type="text" id="aKitShortDesc" placeholder="Petit résumé pour les cartes produit"></div><div class="form-group"><label>Catégorie</label><select id="aKitCat">${allCategories.map(c=>`<option value="${c.id}">${safeText(c.name)}</option>`).join('')}</select></div></section>
      <section class="admin-product-section"><div class="admin-product-section-title"><span>2</span><div><h4>Galerie de photos</h4><p>Téléversez directement vos images. La première devient l’image principale.</p></div></div><label class="admin-image-upload"><input type="file" id="aKitImageUpload" accept="image/jpeg,image/png,image/webp,image/avif" multiple onchange="uploadAdminProductImages(this)"><span>Téléverser des images depuis l’ordinateur</span><small>JPG, PNG, WEBP ou AVIF · maximum 10 Mo par image</small></label><div class="admin-upload-status" id="aKitUploadStatus" aria-live="polite"></div><div class="admin-repeat-list admin-image-list" id="aKitImagesList"></div><button type="button" class="admin-add-row" onclick="addAdminProductRow('images')">Ajouter une image par lien</button></section>
      <section class="admin-product-section"><div class="admin-product-section-title"><span>3</span><div><h4>Inclus dans ce kit</h4><p>Ajoutez chaque élément que le client recevra.</p></div></div><div class="admin-repeat-list" id="aKitIncludesList"></div><button type="button" class="admin-add-row" onclick="addAdminProductRow('includes')">+ Ajouter un élément</button></section>
      <section class="admin-product-section"><div class="admin-product-section-title"><span>4</span><div><h4>Formats disponibles</h4><p>Le premier format sera sélectionné automatiquement. Laissez vide si le produit n’a qu’un format.</p></div></div><div class="admin-repeat-head admin-repeat-head-size"><span>Nom du format</span><span>Supplément</span><span></span></div><div class="admin-repeat-list" id="aKitSizesList"></div><button type="button" class="admin-add-row" onclick="addAdminProductRow('sizes')">+ Ajouter un format</button></section>
      <section class="admin-product-section"><div class="admin-product-section-title"><span>5</span><div><h4>Options facultatives</h4><p>Exemple : ajouter un chevalet pour 5 $.</p></div></div><div class="admin-repeat-head admin-repeat-head-addon"><span>Nom</span><span>Description</span><span>Prix</span><span></span></div><div class="admin-repeat-list" id="aKitAddonsList"></div><button type="button" class="admin-add-row" onclick="addAdminProductRow('addons')">+ Ajouter une option</button></section>
      <section class="admin-product-section"><div class="admin-product-section-title"><span>6</span><div><h4>Inventaire et visibilité</h4><p>Contrôlez la disponibilité dans la boutique.</p></div></div><div class="form-row"><div class="form-group"><label>Inventaire actuel</label><input type="number" id="aKitStockQty" min="0" placeholder="ex: 12"></div><div class="form-group"><label>Seuil stock bas</label><input type="number" id="aKitLowStock" min="0" value="3"></div></div><div class="admin-check-row"><label><input type="checkbox" id="aKitStock" checked> Visible / vendable</label><label><input type="checkbox" id="aKitFeatured"> Produit populaire</label></div></section>
      <div class="admin-product-savebar"><div><strong>Fiche produit</strong><span>Vérifiez les photos, formats et prix avant de sauvegarder.</span></div><div><button class="btn btn-ghost" onclick="resetKitForm()" style="display:none" id="cancelKit">Annuler</button><button class="btn btn-orange" onclick="saveKit()">Sauvegarder le produit</button></div></div>
    </div>
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produit</th><th>Catégorie</th><th>Stock</th><th>Prix</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Aucun produit.</td></tr>'}</tbody></table></div>`;
  setAdminProductRows('images');setAdminProductRows('includes');setAdminProductRows('sizes');setAdminProductRows('addons');
}
async function saveKit(){
  const eid=document.getElementById('editKitId').value,details=collectAdminProductRows();
  const p={name:document.getElementById('aKitName').value.trim(),price:document.getElementById('aKitPrice').value,compareAtPrice:document.getElementById('aKitCompare').value,description:document.getElementById('aKitDesc').value,shortDesc:document.getElementById('aKitShortDesc').value,categoryId:parseInt(document.getElementById('aKitCat').value),images:details.images,includes:details.includes,sizeOptions:details.sizeOptions,addOns:details.addOns,stockQty:document.getElementById('aKitStockQty').value,lowStockThreshold:document.getElementById('aKitLowStock').value,inStock:document.getElementById('aKitStock').checked,featured:document.getElementById('aKitFeatured').checked};
  if(!p.name||!p.price)return showToast('Nom et prix requis','error');
  try{const r=await fetch(eid?`/api/admin/kits/${eid}`:'/api/admin/kits',{method:eid?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast(eid?'Produit modifié!':'Produit ajouté!','success');await loadAdminData()}catch{showToast('Erreur','error')}
}
function editKit(id){
  const k=allKits.find(x=>String(x.id)===String(id));if(!k)return;
  document.getElementById('editKitId').value=k.id;document.getElementById('aKitName').value=k.name||'';document.getElementById('aKitPrice').value=k.originalPrice||k.price||'';document.getElementById('aKitCompare').value=k.compareAtPrice||'';document.getElementById('aKitDesc').value=k.description||'';document.getElementById('aKitShortDesc').value=k.shortDesc||'';document.getElementById('aKitCat').value=k.categoryId||'';document.getElementById('aKitStockQty').value=k.stockQty??'';document.getElementById('aKitLowStock').value=k.lowStockThreshold??3;document.getElementById('aKitStock').checked=k.inStock!==false;document.getElementById('aKitFeatured').checked=!!k.featured;
  setAdminProductRows('images',productImageList(k));setAdminProductRows('includes',Array.isArray(k.includes)?k.includes:[]);setAdminProductRows('sizes',Array.isArray(k.sizeOptions)?k.sizeOptions:[]);setAdminProductRows('addons',Array.isArray(k.addOns)?k.addOns:[]);
  document.getElementById('kitFormTitle').textContent='Modifier le produit';document.getElementById('cancelKit').style.display='inline-flex';document.querySelector('#adminKitsPanel .admin-form-card')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function resetKitForm(){
  ['editKitId','aKitName','aKitPrice','aKitCompare','aKitDesc','aKitShortDesc','aKitStockQty','aKitTemplateName'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});const low=document.getElementById('aKitLowStock');if(low)low.value=3;const st=document.getElementById('aKitStock');if(st)st.checked=true;const feat=document.getElementById('aKitFeatured');if(feat)feat.checked=false;setAdminProductRows('images');setAdminProductRows('includes');setAdminProductRows('sizes');setAdminProductRows('addons');refreshProductTemplateSelect();const uploadStatus=document.getElementById('aKitUploadStatus');if(uploadStatus)uploadStatus.textContent='';const title=document.getElementById('kitFormTitle');if(title)title.textContent='Ajouter un produit';const cancel=document.getElementById('cancelKit');if(cancel)cancel.style.display='none';
}

function renderAdminInventory(){
  const panel=document.getElementById('adminInventoryPanel');if(!panel)return;
  const rows=allKits.map(k=>`<tr><td><strong>${safeText(k.name)}</strong><br><span class="admin-muted">${safeText(k.stockLabel||'')}</span></td><td><span class="inventory-num ${k.inStock===false?'out':k.isLowStock?'low':''}">${k.stockQty??'—'}</span></td><td>${k.lowStockThreshold??3}</td><td><span class="admin-status ${k.inStock!==false?'ok':'out'}">${safeText(stockTagText(k))}</span></td><td><div class="inventory-adjust"><input type="number" id="invQty${k.id}" value="1"><button onclick="adjustInventory(${k.id},'adjust',-1)">−</button><button onclick="adjustInventory(${k.id},'adjust',1)">+</button><button onclick="adjustInventory(${k.id},'set')">Fixer</button></div></td></tr>`).join('');
  panel.innerHTML=`<div class="admin-form-card"><h3>Inventaire</h3><p class="admin-help">Les quantités exactes restent privées dans l’administration. Le public voit seulement lorsqu’un produit est épuisé.</p></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produit</th><th>Stock</th><th>Seuil bas</th><th>Statut client</th><th>Ajustement rapide</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Aucun produit.</td></tr>'}</tbody></table></div>`;
}
async function adjustInventory(id,mode,sign=1){const input=document.getElementById(`invQty${id}`);const raw=parseInt(input?.value||0);if(!Number.isFinite(raw))return showToast('Quantité invalide','error');const quantity=mode==='set'?raw:raw*sign;try{const r=await fetch(`/api/admin/kits/${id}/inventory`,{method:'POST',headers:authH(),body:JSON.stringify({mode,quantity,reason:'Ajustement admin'})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Inventaire mis à jour','success');await loadAdminData()}catch{showToast('Erreur','error')}}

function renderAdminDiscounts(){
  const panel=document.getElementById('adminDiscountsPanel');if(!panel)return;
  const kitOptions=allKits.map(k=>`<option value="${k.id}">${safeText(k.name)}</option>`).join('');const catOptions=allCategories.map(c=>`<option value="${c.id}">${safeText(c.name)}</option>`).join('');
  const rows=adminDiscounts.map(d=>`<tr><td><strong>${safeText(d.title)}</strong><br><span class="admin-muted">${d.code?`Code: ${safeText(d.code)}`:'Automatique'}</span></td><td>${safeText(d.type)}</td><td>${d.type==='percent'?`${toMoney(d.value)}%`:d.type==='fixed'?`$${toMoney(d.value)}`:`Achetez ${d.buyQty||1}, obtenez ${d.freeQty||1}`}</td><td>${safeText(d.scope||'all')}</td><td><span class="admin-status ${d.active!==false?'ok':'out'}">${d.active!==false?'Actif':'Inactif'}</span></td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editDiscount(${d.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteDiscount(${d.id})">Supprimer</button></div></td></tr>`).join('');
  panel.innerHTML=`<div class="admin-form-card"><div class="admin-form-head"><div><h3 id="discountFormTitle">Créer un rabais</h3><p>Rabais automatique, code promo, pourcentage, montant fixe ou buy one get one free.</p></div><button class="btn btn-ghost btn-sm" onclick="resetDiscountForm()">Nouveau</button></div><input type="hidden" id="editDiscountId"><div class="form-row"><div class="form-group"><label>Nom du rabais</label><input id="aDisTitle" placeholder="Ex: Promo printemps 15%"></div><div class="form-group"><label>Code promo optionnel</label><input id="aDisCode" placeholder="PRINTEMPS15"></div></div><div class="form-row"><div class="form-group"><label>Type</label><select id="aDisType" onchange="toggleDiscountTypeFields()"><option value="percent">Pourcentage</option><option value="fixed">Montant fixe</option><option value="bogo">Buy one get one free</option></select></div><div class="form-group discount-value-field"><label>Valeur</label><input type="number" id="aDisValue" step="0.01" placeholder="15"></div><div class="form-group bogo-field" style="display:none"><label>Achetez</label><input type="number" id="aDisBuy" value="1" min="1"></div><div class="form-group bogo-field" style="display:none"><label>Obtenez gratuit</label><input type="number" id="aDisFree" value="1" min="1"></div></div><div class="form-row"><div class="form-group"><label>Appliquer à</label><select id="aDisScope"><option value="all">Tout le catalogue</option><option value="kits">Produits sélectionnés</option><option value="categories">Catégories</option></select></div><div class="form-group"><label>Étiquette client</label><input id="aDisLabel" placeholder="Ex: 15% de rabais"></div></div><div class="form-row"><div class="form-group"><label>Produits</label><select id="aDisKits" multiple>${kitOptions}</select></div><div class="form-group"><label>Catégories</label><select id="aDisCats" multiple>${catOptions}</select></div></div><div class="form-row"><div class="form-group"><label>Début</label><input type="date" id="aDisStart"></div><div class="form-group"><label>Fin</label><input type="date" id="aDisEnd"></div><div class="form-group"><label>Quantité minimum</label><input type="number" id="aDisMinQty" value="1" min="1"></div></div><label class="catalog-check" style="margin-bottom:16px"><input type="checkbox" id="aDisActive" checked> Rabais actif</label><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-orange" onclick="saveDiscount()">Sauvegarder le rabais</button><button class="btn btn-ghost" onclick="resetDiscountForm()" style="display:none" id="cancelDiscount">Annuler</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Rabais</th><th>Type</th><th>Valeur</th><th>Portée</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Aucun rabais.</td></tr>'}</tbody></table></div>`;
}
function toggleDiscountTypeFields(){const type=document.getElementById('aDisType')?.value;document.querySelectorAll('.bogo-field').forEach(el=>el.style.display=type==='bogo'?'block':'none');document.querySelectorAll('.discount-value-field').forEach(el=>el.style.display=type==='bogo'?'none':'block')}
async function saveDiscount(){const id=document.getElementById('editDiscountId').value;const kits=Array.from(document.getElementById('aDisKits').selectedOptions).map(o=>parseInt(o.value));const cats=Array.from(document.getElementById('aDisCats').selectedOptions).map(o=>parseInt(o.value));const p={title:document.getElementById('aDisTitle').value,code:document.getElementById('aDisCode').value,type:document.getElementById('aDisType').value,value:document.getElementById('aDisValue').value,buyQty:document.getElementById('aDisBuy').value,freeQty:document.getElementById('aDisFree').value,scope:document.getElementById('aDisScope').value,kitIds:kits,categoryIds:cats,customerLabel:document.getElementById('aDisLabel').value,startsAt:document.getElementById('aDisStart').value,endsAt:document.getElementById('aDisEnd').value,minQty:document.getElementById('aDisMinQty').value,active:document.getElementById('aDisActive').checked};if(!p.title)return showToast('Nom du rabais requis','error');try{const r=await fetch(id?`/api/admin/discounts/${id}`:'/api/admin/discounts',{method:id?'PUT':'POST',headers:authH(),body:JSON.stringify(p)});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Rabais sauvegardé','success');await loadAdminData()}catch{showToast('Erreur','error')}}
function editDiscount(id){const d=adminDiscounts.find(x=>String(x.id)===String(id));if(!d)return;document.getElementById('editDiscountId').value=d.id;document.getElementById('aDisTitle').value=d.title||'';document.getElementById('aDisCode').value=d.code||'';document.getElementById('aDisType').value=d.type||'percent';document.getElementById('aDisValue').value=d.value||'';document.getElementById('aDisBuy').value=d.buyQty||1;document.getElementById('aDisFree').value=d.freeQty||1;document.getElementById('aDisScope').value=['all','kits','categories'].includes(d.scope)?d.scope:'all';document.getElementById('aDisLabel').value=d.customerLabel||'';document.getElementById('aDisStart').value=d.startsAt||'';document.getElementById('aDisEnd').value=d.endsAt||'';document.getElementById('aDisMinQty').value=d.minQty||1;document.getElementById('aDisActive').checked=d.active!==false;Array.from(document.getElementById('aDisKits').options).forEach(o=>o.selected=(d.kitIds||[]).map(String).includes(String(o.value)));Array.from(document.getElementById('aDisCats').options).forEach(o=>o.selected=(d.categoryIds||[]).map(String).includes(String(o.value)));document.getElementById('discountFormTitle').textContent='Modifier le rabais';document.getElementById('cancelDiscount').style.display='inline-flex';toggleDiscountTypeFields();document.querySelector('#adminDiscountsPanel .admin-form-card')?.scrollIntoView({behavior:'smooth',block:'start'})}
function resetDiscountForm(){['editDiscountId','aDisTitle','aDisCode','aDisValue','aDisLabel','aDisStart','aDisEnd'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});const type=document.getElementById('aDisType');if(type)type.value='percent';const scope=document.getElementById('aDisScope');if(scope)scope.value='all';const buy=document.getElementById('aDisBuy');if(buy)buy.value=1;const free=document.getElementById('aDisFree');if(free)free.value=1;const min=document.getElementById('aDisMinQty');if(min)min.value=1;const act=document.getElementById('aDisActive');if(act)act.checked=true;['aDisKits','aDisCats'].forEach(id=>{const el=document.getElementById(id);if(el)Array.from(el.options).forEach(o=>o.selected=false)});const title=document.getElementById('discountFormTitle');if(title)title.textContent='Créer un rabais';const cancel=document.getElementById('cancelDiscount');if(cancel)cancel.style.display='none';toggleDiscountTypeFields()}
async function deleteDiscount(id){if(!confirm('Supprimer ce rabais?'))return;await fetch(`/api/admin/discounts/${id}`,{method:'DELETE',headers:authH()});showToast('Rabais supprimé','success');await loadAdminData()}

function renderAdminAnnouncement(){
  const panel=document.getElementById('adminAnnouncementPanel');if(!panel)return;
  panel.innerHTML=`<div class="admin-form-card announcement-admin-card"><div class="admin-form-head"><div><h3>Annonce du site</h3><p>Affichez un court message promotionnel en haut du site, ou désactivez-le quand vous n’en avez pas besoin.</p></div></div><div class="form-group"><label>Message</label><input type="text" id="aAnnouncementMessage" maxlength="180" value="${safeAttr(siteAnnouncement?.message||'')}" placeholder="Ex: Livraison gratuite pour toute commande de 75 $ et plus"></div><label class="catalog-check announcement-toggle"><input type="checkbox" id="aAnnouncementEnabled" ${siteAnnouncement?.enabled===true?'checked':''}> Afficher cette annonce sur le site</label><div class="announcement-admin-preview">${productServiceIcon('delivery')}<span id="announcementPreviewText">${safeText(siteAnnouncement?.message||'Votre annonce apparaîtra ici')}</span></div><button class="btn btn-orange" onclick="saveAnnouncement()">Sauvegarder l’annonce</button></div>`;
  const input=document.getElementById('aAnnouncementMessage');
  if(input)input.addEventListener('input',()=>{const preview=document.getElementById('announcementPreviewText');if(preview)preview.textContent=input.value.trim()||'Votre annonce apparaîtra ici'});
}
async function saveAnnouncement(){
  const message=document.getElementById('aAnnouncementMessage')?.value.trim()||'';
  const enabled=document.getElementById('aAnnouncementEnabled')?.checked===true;
  if(enabled&&!message)return showToast('Écrivez un message avant de l’afficher','error');
  try{
    const r=await fetch('/api/admin/announcement',{method:'PUT',headers:authH(),body:JSON.stringify({message,enabled})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return showToast(d.error||'Erreur','error');
    siteAnnouncement=d.announcement||{message,enabled};
    renderSiteAnnouncement();renderAdminAnnouncement();showToast('Annonce mise à jour','success');
  }catch{showToast('Erreur','error')}
}

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
  c.innerHTML=`<div class="builder-hero"><div><div class="section-tag">Forfait sur mesure</div><h2 class="section-heading">Créez votre <span class="accent">forfait Arty</span></h2></div><button class="btn btn-ghost" onclick="navigate('#/paintings')">Voir tous les produits</button></div><div class="client-builder-layout"><section class="builder-main-card"><div class="builder-purpose-row"><button class="builder-purpose ${bundleBuilderState.purpose==='group'?'active':''}" onclick="setBundlePurpose('group')">Groupe / amis</button><button class="builder-purpose ${bundleBuilderState.purpose==='event'?'active':''}" onclick="setBundlePurpose('event')">Événement</button><button class="builder-purpose ${bundleBuilderState.purpose==='wedding'?'active':''}" onclick="setBundlePurpose('wedding')">Mariage</button></div><div class="builder-form-row"><label>Nombre de personnes prévu</label><input type="number" min="1" value="${bundleBuilderState.people}" oninput="bundleBuilderState.people=Math.max(1,parseInt(this.value)||1)"></div><div class="builder-section-title"><h3>Choisir les produits</h3><span>${t.qty} kit${t.qty>1?'s':''} sélectionné${t.qty>1?'s':''}</span></div>${kitPickerHTML(bundleBuilderState,'bundle')}<div class="builder-form-row"><label>Texte personnalisé</label><input type="text" maxlength="90" value="${safeAttr(bundleBuilderState.customText||'')}" placeholder="Ex: Mariage Anna & David · 12 juillet 2026" oninput="bundleBuilderState.customText=this.value;renderBundleBuilderPage()"><small>Optionnel. Parfait pour mariages, anniversaires et événements corporatifs.</small></div></section><aside class="builder-summary-card"><div class="summary-art-badge">Arty</div><h3>Résumé du forfait</h3>${selected}<hr><div class="builder-summary-line"><span>Sous-total</span><strong>$${toMoney(t.subtotal)}</strong></div><div class="builder-summary-line discount"><span>${t.rule?safeText(t.rule.label||('Rabais '+t.percent+'%')):'Rabais quantité'}</span><strong>${t.rule?'- $'+toMoney(t.discount):'Aucun'}</strong></div>${t.customTextFee?`<div class="builder-summary-line"><span>Inscription personnalisée</span><strong>$${toMoney(t.customTextFee)}</strong></div>`:''}<div class="builder-total"><span>Total estimé</span><strong>$${toMoney(t.total)}</strong></div><button class="btn btn-orange" onclick="addClientBundleToCart()" ${!t.qty?'disabled style="opacity:.5"':''}>Ajouter au panier →</button><p class="builder-footnote">Le stock et le paiement sont vérifiés au checkout Stripe.</p></aside></div>`;initScrollEffects();
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
 const step3=`<div class="event-builder-step"><h3>Choisir les produits à peindre</h3><p class="builder-muted">Sélectionnez les kits que vous voulez recevoir pour l’événement. Vous pouvez mélanger plusieurs modèles.</p>${kitPickerHTML(eventBuilderState,'event')}<div class="builder-form-row"><label>Texte personnalisé</label><input type="text" maxlength="90" value="${safeAttr(eventBuilderState.customText||'')}" placeholder="Ex: Mariage Anna & David · 12 juillet 2026" oninput="eventBuilderState.customText=this.value;renderEventBuilderPage()"><small>On garde le texte dans la commande pour préparer le travail personnalisé.</small></div><div class="form-group"><label>Notes spéciales</label><textarea oninput="eventBuilderState.notes=this.value" placeholder="Ex: couleurs du mariage, livraison avant une date précise...">${safeText(eventBuilderState.notes||'')}</textarea></div></div>`;
 const stepHTML=eventBuilderState.step===1?step1:eventBuilderState.step===2?step2:step3;const selected=t.items.map(i=>`<div class="builder-summary-line"><span>${safeText(i.kit.name)} ×${i.qty}</span><strong>$${toMoney((getKitDisplayPrice?getKitDisplayPrice(i.kit):i.kit.price)*i.qty)}</strong></div>`).join('')||'<p class="builder-muted">Aucun produit choisi.</p>';
 c.innerHTML=`<div class="event-builder-hero"><div class="event-sparkle">✦</div><div><div class="section-tag">Expérience Arty</div><h2 class="section-heading">Créez votre <span class="accent">événement</span> en quelques clics</h2><p>Un parcours animé pour construire un mariage, anniversaire ou événement d’équipe avec prix instantané.</p></div></div><div class="event-builder-progress"><button class="${eventBuilderState.step===1?'active':''}" onclick="setEventStep(1)">1. Style</button><button class="${eventBuilderState.step===2?'active':''}" onclick="setEventStep(2)">2. Détails</button><button class="${eventBuilderState.step===3?'active':''}" onclick="setEventStep(3)">3. Produits</button></div><div class="client-builder-layout"><section class="builder-main-card animated-builder">${stepHTML}<div class="builder-nav-actions"><button class="btn btn-ghost" onclick="setEventStep(Math.max(1,eventBuilderState.step-1))">← Retour</button><button class="btn btn-teal" onclick="setEventStep(Math.min(3,eventBuilderState.step+1))">Continuer →</button></div></section><aside class="builder-summary-card event-summary-card"><div class="summary-art-badge">${eventBuilderState.eventType==='wedding'?'💍':'🎨'}</div><h3>${safeText(eventTypeLabel(eventBuilderState.eventType))}</h3><div class="builder-summary-line"><span>Invités</span><strong>${eventBuilderState.guests}</strong></div><div class="builder-summary-line"><span>Date</span><strong>${eventBuilderState.date?safeText(eventBuilderState.date):'Flexible'}</strong></div>${selected}<hr><div class="builder-summary-line"><span>Sous-total</span><strong>$${toMoney(t.subtotal)}</strong></div><div class="builder-summary-line discount"><span>${t.rule?safeText(t.rule.label||('Rabais événement '+t.percent+'%')):'Rabais événement'}</span><strong>${t.rule?'- $'+toMoney(t.discount):'Aucun'}</strong></div>${t.customTextFee?`<div class="builder-summary-line"><span>Texte souvenir</span><strong>$${toMoney(t.customTextFee)}</strong></div>`:''}<div class="builder-total"><span>Total instantané</span><strong>$${toMoney(t.total)}</strong></div><button class="btn btn-orange" onclick="addEventPackageToCart()" ${!t.qty?'disabled style="opacity:.5"':''}>Ajouter l’événement au panier →</button><button class="btn btn-ghost" onclick="submitBuiltEventRequest()">Envoyer une demande</button></aside></div>`;initScrollEffects();
}
function addEventPackageToCart(){const t=builderTotals(eventBuilderState,eventBuilderState.eventType==='wedding'?'wedding':'event');if(!t.qty)return showToast('Choisissez au moins un produit pour l’événement','error');cart.push({id:`event-package-${Date.now()}`,name:`Événement ${eventTypeLabel(eventBuilderState.eventType)} (${t.qty} kits)`,price:t.total,image:t.items[0]?.kit?.image||'photoacceuil.jpg',qty:1,type:'custom-event-package',customData:{kind:'event-package',eventType:eventBuilderState.eventType,eventLabel:eventTypeLabel(eventBuilderState.eventType),guests:eventBuilderState.guests,date:eventBuilderState.date,location:eventBuilderState.location,hostName:eventBuilderState.hostName||currentUser?.name||'',customText:eventBuilderState.customText||'',notes:eventBuilderState.notes||'',subtotal:t.subtotal,discount:t.discount,discountRule:t.rule||null,items:t.items.map(i=>({kitId:i.kit.id,name:i.kit.name,qty:i.qty,unitPrice:getKitDisplayPrice?getKitDisplayPrice(i.kit):Number(i.kit.price||0)}))}});saveCart();updateCartUI();showToast('Événement ajouté au panier','success');setTimeout(()=>goToCheckout(),250)}
async function submitBuiltEventRequest(){const t=builderTotals(eventBuilderState,eventBuilderState.eventType==='wedding'?'wedding':'event');const payload={name:eventBuilderState.hostName||currentUser?.name||'Client',email:currentUser?.email||'',phone:'',eventType:eventTypeLabel(eventBuilderState.eventType),preferredDate:eventBuilderState.date,guests:eventBuilderState.guests,location:eventBuilderState.location,message:`Événement créé par le builder. Produits: ${t.items.map(i=>i.kit.name+' x'+i.qty).join(', ')}. Texte souvenir: ${eventBuilderState.customText||'aucun'}. Prix estimé: $${toMoney(t.total)}. Notes: ${eventBuilderState.notes||''}`};if(!payload.email)return showToast('Connectez-vous ou ajoutez votre courriel au checkout pour envoyer la demande','error');try{const r=await fetch('/api/event-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Demande envoyée à Arty','success')}catch{showToast('Erreur','error')}}

// Override admin tab system to include client bundle rules
const _oldSwitchAdminTab = typeof switchAdminTab==='function'?switchAdminTab:null;
function switchAdminTab(t,btn){
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');
  ['adminDashboardPanel','adminKitsPanel','adminInventoryPanel','adminDiscountsPanel','adminOrdersPanel','adminEventsPanel','adminCategoriesPanel','adminAnnouncementPanel','adminBundleDealsPanel'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none'});
  const map={dashboard:'adminDashboardPanel',kits:'adminKitsPanel',inventory:'adminInventoryPanel',discounts:'adminDiscountsPanel',orders:'adminOrdersPanel',events:'adminEventsPanel',categories:'adminCategoriesPanel',announcement:'adminAnnouncementPanel',bundleDeals:'adminBundleDealsPanel'};
  const el=document.getElementById(map[t]);if(el)el.style.display='block';
  if(t==='bundleDeals')renderAdminBundleDeals();
  if(t==='announcement')renderAdminAnnouncement();
}
function renderAdminBundleDeals(){const panel=document.getElementById('adminBundleDealsPanel');if(!panel)return;const rows=(adminBundleDealRules||[]).map(r=>`<tr><td><strong>${safeText(r.label||'Rabais forfait')}</strong><br><span class="admin-muted">${safeText(r.appliesTo||'all')}</span></td><td>${r.minQty||1}+ kits</td><td>${toMoney(r.percent||0)}%</td><td>$${toMoney(r.customTextFee??12)}</td><td><span class="admin-status ${r.active!==false?'ok':'out'}">${r.active!==false?'Actif':'Inactif'}</span></td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editBundleDeal(${r.id})">Modifier</button><button class="admin-btn admin-btn-delete" onclick="deleteBundleDeal(${r.id})">Supprimer</button></div></td></tr>`).join('');panel.innerHTML=`<div class="admin-form-card"><h3 id="bundleDealFormTitle">Règles de forfait client</h3><p class="admin-help">Ces règles s’appliquent automatiquement quand un client crée un forfait ou un événement. Exemple: 10+ kits = 10%, 20+ kits mariage = 15%.</p><input type="hidden" id="editBundleDealId"><div class="form-row"><div class="form-group"><label>Nom visible</label><input id="bdLabel" placeholder="Ex: Rabais événement 10+"></div><div class="form-group"><label>S’applique à</label><select id="bdApplies"><option value="all">Tous</option><option value="group">Forfaits groupes</option><option value="event">Événements</option><option value="wedding">Mariages</option></select></div></div><div class="form-row"><div class="form-group"><label>Quantité minimum</label><input type="number" id="bdMinQty" min="1" value="10"></div><div class="form-group"><label>Rabais (%)</label><input type="number" id="bdPercent" step="0.1" value="10"></div></div><div class="form-row"><div class="form-group"><label>Frais texte personnalisé ($)</label><input type="number" id="bdTextFee" step="0.01" value="12"></div><div class="form-group"><label>Actif</label><select id="bdActive"><option value="true">Actif</option><option value="false">Inactif</option></select></div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-orange" onclick="saveBundleDeal()">Sauvegarder</button><button class="btn btn-ghost" onclick="resetBundleDealForm()">Réinitialiser</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Règle</th><th>Minimum</th><th>Rabais</th><th>Texte</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="admin-muted">Aucune règle. Les forfaits fonctionneront sans rabais.</td></tr>'}</tbody></table></div>`}
function editBundleDeal(id){const r=(adminBundleDealRules||[]).find(x=>String(x.id)===String(id));if(!r)return;document.getElementById('editBundleDealId').value=r.id;document.getElementById('bdLabel').value=r.label||'';document.getElementById('bdApplies').value=r.appliesTo||'all';document.getElementById('bdMinQty').value=r.minQty||1;document.getElementById('bdPercent').value=r.percent||0;document.getElementById('bdTextFee').value=r.customTextFee??12;document.getElementById('bdActive').value=String(r.active!==false)}
function resetBundleDealForm(){['editBundleDealId','bdLabel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});if(document.getElementById('bdApplies'))document.getElementById('bdApplies').value='all';if(document.getElementById('bdMinQty'))document.getElementById('bdMinQty').value=10;if(document.getElementById('bdPercent'))document.getElementById('bdPercent').value=10;if(document.getElementById('bdTextFee'))document.getElementById('bdTextFee').value=12;if(document.getElementById('bdActive'))document.getElementById('bdActive').value='true'}
async function saveBundleDeal(){const id=document.getElementById('editBundleDealId')?.value;const payload={label:document.getElementById('bdLabel')?.value,appliesTo:document.getElementById('bdApplies')?.value,minQty:document.getElementById('bdMinQty')?.value,percent:document.getElementById('bdPercent')?.value,customTextFee:document.getElementById('bdTextFee')?.value,active:document.getElementById('bdActive')?.value==='true'};if(!payload.label)return showToast('Nom de règle requis','error');try{const r=await fetch(id?`/api/admin/bundle-deals/${id}`:'/api/admin/bundle-deals',{method:id?'PUT':'POST',headers:authH(),body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Règle sauvegardée','success');await loadAdminBundleDeals();renderAdminBundleDeals()}catch{showToast('Erreur','error')}}
async function deleteBundleDeal(id){if(!confirm('Supprimer cette règle?'))return;await fetch(`/api/admin/bundle-deals/${id}`,{method:'DELETE',headers:authH()});await loadAdminBundleDeals();renderAdminBundleDeals();showToast('Règle supprimée','success')}

// Improve admin order item display for client-created bundles/events
function renderAdminOrders(){
  const panel=document.getElementById('adminOrdersPanel');if(!panel)return;const refundRows=(adminRefunds||[]).map(r=>`<tr><td>${safeText(r.id)}</td><td>${safeText(r.orderId)}</td><td>$${toMoney(r.amount)}</td><td>${safeText(r.reason||'')}</td><td>${safeText(r.status||'noté')}</td></tr>`).join('');
  const rows=(adminOrders||[]).map(o=>{const cust=o.customer||{};const itemText=(o.items||[]).map(i=>{let details='';if(i.customData?.kind==='configured-kit')details=`<div class="admin-muted">${[i.customData.sizeLabel,...(i.customData.addOnLabels||[])].filter(Boolean).map(safeText).join(' · ')}</div>`;if(i.customData?.kind==='client-bundle')details=`<div class="admin-muted">Forfait client · ${(i.customData.items||[]).map(x=>safeText(x.name)+' x'+x.qty).join(', ')}${i.customData.customText?'<br>Texte: '+safeText(i.customData.customText):''}</div>`;if(i.customData?.kind==='event-package')details=`<div class="admin-muted">${safeText(i.customData.eventLabel||'Événement')} · ${safeText(i.customData.guests||'')} invités · ${safeText(i.customData.date||'date flexible')}<br>${(i.customData.items||[]).map(x=>safeText(x.name)+' x'+x.qty).join(', ')}${i.customData.customText?'<br>Texte souvenir: '+safeText(i.customData.customText):''}</div>`;if(i.customData?.kind==='photo-canvas-trace')details=`<div class="admin-muted">Format: ${safeText(i.customData.sizeLabel||'')}</div>`;if(i.customData?.kind==='bag-trace-design')details=`<div class="admin-muted">Images: ${safeText(i.customData.imageCount||0)}</div>`;return `${safeText(i.name)} ×${i.qty}${details}${i.discountAmount?` <span class="admin-muted">(-$${toMoney(i.discountAmount)})</span>`:''}`}).join('<br>');return `<tr><td><strong>${safeText(o.id)}</strong><br><span class="admin-muted">${new Date(o.createdAt).toLocaleDateString('fr-CA')}</span></td><td>${safeText(cust.name||'')}<br><span class="admin-muted">${safeText(cust.email||o.guestEmail||'')}</span></td><td>${itemText}</td><td><strong>$${toMoney(o.total)}</strong><br>${o.discountTotal?`<span class="admin-muted">Rabais: $${toMoney(o.discountTotal)}</span>`:''}${o.refundedTotal?`<span class="admin-muted">Remb.: $${toMoney(o.refundedTotal)}</span>`:''}</td><td><span class="admin-status ${o.paymentStatus==='paid'?'ok':o.paymentStatus==='cancelled'?'out':'pending'}">${safeText(o.paymentStatus||'pending')}</span></td><td><select class="admin-status-select" onchange="updateOrderStatus('${safeAttr(o.id)}',this.value)"><option value="en attente de paiement" ${o.status==='en attente de paiement'?'selected':''}>En attente paiement</option><option value="payée" ${o.status==='payée'?'selected':''}>Payée</option><option value="préparation" ${o.status==='préparation'?'selected':''}>Préparation</option><option value="expédiée" ${o.status==='expédiée'?'selected':''}>Expédiée</option><option value="annulée" ${o.status==='annulée'?'selected':''}>Annulée</option><option value="remboursée" ${o.status==='remboursée'?'selected':''}>Remboursée</option></select><div class="admin-actions" style="margin-top:8px"><button class="admin-btn admin-btn-edit" onclick="createRefund('${safeAttr(o.id)}')">Rembourser</button></div></td></tr>`}).join('');panel.innerHTML=`<div class="admin-form-card"><h3>Commandes & remboursements</h3><p class="admin-help">Les forfaits et événements personnalisés apparaissent ici avec les quantités, textes et détails.</p></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Articles</th><th>Total</th><th>Paiement</th><th>Statut / action</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="admin-muted">Aucune commande pour le moment.</td></tr>'}</tbody></table></div><div class="admin-section-title"><h3>Historique des remboursements</h3></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Remboursement</th><th>Commande</th><th>Montant</th><th>Raison</th><th>Statut</th></tr></thead><tbody>${refundRows||'<tr><td colspan="5" class="admin-muted">Aucun remboursement.</td></tr>'}</tbody></table></div>`;
}


/* ===== BUILDER UX POLISH OVERRIDES ===== */
function startBundleWithKit(kitId){
  const key=String(kitId);
  bundleBuilderState.selected[key]=(Number(bundleBuilderState.selected[key])||0)+1;
  navigate('#/bundle-builder');
}
function setBundlePurpose(v){
  bundleBuilderState.purpose=v;
  document.querySelectorAll('[data-bundle-purpose]').forEach(b=>b.classList.toggle('active',b.dataset.bundlePurpose===v));
  updateBuilderLive('bundle');
}
function setBundlePeople(v){
  bundleBuilderState.people=Math.max(1,parseInt(v)||1);
  const el=document.getElementById('bundlePeopleValue');if(el)el.value=bundleBuilderState.people;
  updateBuilderLive('bundle');
}
function adjustBundlePeople(delta){setBundlePeople((Number(bundleBuilderState.people)||1)+delta)}
function setBundleCustomText(v){
  bundleBuilderState.customText=String(v||'').slice(0,90);
  const p=document.getElementById('bundleCustomTextPreview');
  if(p)p.textContent=bundleBuilderState.customText||'Votre texte apparaîtra ici';
  updateBuilderLive('bundle');
}
function setEventGuests(v){
  eventBuilderState.guests=Math.max(1,parseInt(v)||1);
  const el=document.getElementById('eventGuestsValue');if(el)el.value=eventBuilderState.guests;
  updateBuilderLive('event');
}
function adjustEventGuests(delta){setEventGuests((Number(eventBuilderState.guests)||1)+delta)}
function setEventCustomText(v){
  eventBuilderState.customText=String(v||'').slice(0,90);
  const p=document.getElementById('eventCustomTextPreview');
  if(p)p.textContent=eventBuilderState.customText||'Ex: Mariage Anna & David · 12 juillet 2026';
  updateBuilderLive('event');
}
function setEventHostName(v){eventBuilderState.hostName=String(v||'')}
function setEventLocation(v){eventBuilderState.location=String(v||'');updateBuilderLive('event')}
function setEventDate(v){eventBuilderState.date=String(v||'');updateBuilderLive('event')}
function setEventNotes(v){eventBuilderState.notes=String(v||'')}
function kitPickerHTMLPro(state,context){
  const kits=allKits.filter(k=>k.inStock!==false);
  if(!kits.length)return '<div class="builder-empty-modern">Aucun kit disponible pour le moment.</div>';
  return `<div class="builder-kit-grid builder-kit-grid-pro">${kits.map(k=>{
    const qty=Number(state.selected[String(k.id)]||0);
    return `<article class="builder-kit-card builder-kit-card-pro ${qty?'selected':''}" data-builder-card="${context}-${k.id}">
      <button type="button" class="builder-kit-click" onclick="changeBuilderQty('${context}',${k.id},1)" aria-label="Ajouter ${safeAttr(k.name)}"></button>
      <img src="${safeAttr(k.image||'logoarty.png')}" alt="${safeAttr(k.name)}">
      <div class="builder-kit-info"><strong>${safeText(k.name)}</strong><span>${kitPriceHTML ? kitPriceHTML(k) : ('$'+toMoney(k.price))}</span></div>
      <div class="builder-qty builder-qty-modern">
        <button type="button" onclick="event.stopPropagation();changeBuilderQty('${context}',${k.id},-1)">−</button>
        <b data-builder-qty="${context}-${k.id}">${qty}</b>
        <button type="button" onclick="event.stopPropagation();changeBuilderQty('${context}',${k.id},1)">+</button>
      </div>
    </article>`}).join('')}</div>`;
}
function changeBuilderQty(context,kitId,delta){
  const s=context==='event'?eventBuilderState:bundleBuilderState;
  const key=String(kitId);
  s.selected[key]=Math.max(0,(Number(s.selected[key])||0)+delta);
  if(!s.selected[key])delete s.selected[key];
  const qty=s.selected[key]||0;
  const qtyEl=document.querySelector(`[data-builder-qty="${context}-${kitId}"]`);
  if(qtyEl)qtyEl.textContent=qty;
  const card=document.querySelector(`[data-builder-card="${context}-${kitId}"]`);
  if(card)card.classList.toggle('selected',qty>0);
  updateBuilderLive(context);
}
function builderSummaryHTML(t,context){
  const selected=t.items.map(i=>`<div class="builder-summary-line"><span>${safeText(i.kit.name)} ×${i.qty}</span><strong>$${toMoney((getKitDisplayPrice?getKitDisplayPrice(i.kit):i.kit.price)*i.qty)}</strong></div>`).join('')||'<p class="builder-muted">Aucun produit sélectionné.</p>';
  const label=context==='event'?'Rabais événement':'Rabais quantité';
  return `${selected}<hr><div class="builder-summary-line"><span>Sous-total</span><strong>$${toMoney(t.subtotal)}</strong></div><div class="builder-summary-line discount"><span>${t.rule?safeText(t.rule.label||label):label}</span><strong>${t.rule?'- $'+toMoney(t.discount):'Aucun'}</strong></div>${t.customTextFee?`<div class="builder-summary-line"><span>Texte personnalisé</span><strong>$${toMoney(t.customTextFee)}</strong></div>`:''}<div class="builder-total"><span>Total instantané</span><strong>$${toMoney(t.total)}</strong></div>`;
}
function updateBuilderLive(context){
  const state=context==='event'?eventBuilderState:bundleBuilderState;
  const purpose=context==='event'?(eventBuilderState.eventType==='wedding'?'wedding':'event'):(bundleBuilderState.purpose||'group');
  const t=builderTotals(state,purpose);
  const summary=document.getElementById(context==='event'?'eventBuilderSummaryLines':'bundleBuilderSummaryLines');
  if(summary)summary.innerHTML=builderSummaryHTML(t,context);
  const count=document.getElementById(context==='event'?'eventSelectedCount':'bundleSelectedCount');
  if(count)count.textContent=`${t.qty} kit${t.qty>1?'s':''}`;
  const action=document.getElementById(context==='event'?'eventFinalActionBtn':'bundleAddBtn');
  if(action){action.disabled=!t.qty;action.style.opacity=t.qty?'1':'.55'}
}
function renderBundleBuilderPage(){
  const c=document.getElementById('bundleBuilderPageContent');if(!c)return;
  const t=builderTotals(bundleBuilderState,bundleBuilderState.purpose);
  c.innerHTML=`<div class="builder-hero builder-hero-polished"><div><div class="section-tag">Forfait sur mesure</div><h2 class="section-heading">Créez votre <span class="accent">forfait Arty</span></h2></div><button type="button" class="btn btn-ghost" onclick="navigate('#/paintings')">Voir les produits</button></div>
  <div class="client-builder-layout"><section class="builder-main-card builder-main-modern">
    <div class="builder-purpose-row builder-purpose-row-modern"><button type="button" data-bundle-purpose="group" class="builder-purpose ${bundleBuilderState.purpose==='group'?'active':''}" onclick="setBundlePurpose('group')">Groupe / amis</button><button type="button" data-bundle-purpose="event" class="builder-purpose ${bundleBuilderState.purpose==='event'?'active':''}" onclick="setBundlePurpose('event')">Événement</button><button type="button" data-bundle-purpose="wedding" class="builder-purpose ${bundleBuilderState.purpose==='wedding'?'active':''}" onclick="setBundlePurpose('wedding')">Mariage</button></div>
    <div class="modern-field-grid"><div class="modern-field-card"><label>Nombre de personnes</label><div class="modern-number-stepper"><button type="button" onclick="adjustBundlePeople(-1)">−</button><input id="bundlePeopleValue" type="number" min="1" value="${bundleBuilderState.people}" oninput="setBundlePeople(this.value)"><button type="button" onclick="adjustBundlePeople(1)">+</button></div><small>Utilisé pour suggérer la bonne quantité.</small></div><div class="modern-field-card modern-text-card"><label>Texte personnalisé</label><input type="text" maxlength="90" value="${safeAttr(bundleBuilderState.customText||'')}" placeholder="Ex: Soirée peinture famille · 2026" oninput="setBundleCustomText(this.value)"><div class="souvenir-preview"><span>Aperçu</span><strong id="bundleCustomTextPreview">${safeText(bundleBuilderState.customText||'Votre texte apparaîtra ici')}</strong></div></div></div>
    <div class="builder-section-title"><h3>Choisir les produits</h3><span id="bundleSelectedCount">${t.qty} kit${t.qty>1?'s':''}</span></div>${kitPickerHTMLPro(bundleBuilderState,'bundle')}
  </section><aside class="builder-summary-card builder-summary-modern"><div class="summary-art-badge">Arty</div><h3>Résumé du forfait</h3><div id="bundleBuilderSummaryLines">${builderSummaryHTML(t,'bundle')}</div><button type="button" id="bundleAddBtn" class="btn btn-orange" onclick="addClientBundleToCart()" ${!t.qty?'disabled style="opacity:.55"':''}>Ajouter au panier →</button><button type="button" class="btn btn-ghost" onclick="addClientBundleToCart(true)" ${!t.qty?'disabled style="opacity:.55"':''}>Acheter maintenant</button><p class="builder-footnote">Le stock et le paiement sont vérifiés au checkout Stripe.</p></aside></div>`;
  initScrollEffects();
}
function setEventType(v){eventBuilderState.eventType=v;eventBuilderState.step=2;renderEventBuilderPage()}
function setEventStep(n){eventBuilderState.step=Math.max(1,Math.min(3,Number(n)||1));renderEventBuilderPage()}
function autoFillEventQty(){
  const target=Math.max(1,Number(eventBuilderState.guests)||1);
  const ids=Object.keys(eventBuilderState.selected);
  if(!ids.length&&allKits[0])eventBuilderState.selected[String(allKits[0].id)]=target;
  else ids.forEach(id=>eventBuilderState.selected[id]=target);
  eventBuilderState.step=3;
  renderEventBuilderPage();
}
function eventNextAction(){
  if(eventBuilderState.step<3)return setEventStep(eventBuilderState.step+1);
  return addEventPackageToCart();
}
function renderEventBuilderPage(){
  const c=document.getElementById('eventBuilderPageContent');if(!c)return;
  const t=builderTotals(eventBuilderState,eventBuilderState.eventType==='wedding'?'wedding':'event');
  const types=[['wedding','Mariage','Une activité souvenir pour les invités'],['birthday','Anniversaire','Une fête créative simple à organiser'],['corporate','Entreprise / équipe','Team building moderne'],['family','Famille','Moment chaleureux à la maison'],['friends','Entre amis','Soirée peinture relax'],['kids','Enfants','Activité facile et encadrée']];
  const step1=`<div class="event-builder-step"><h3>Choisissez le style d’événement</h3><div class="event-type-grid">${types.map(([id,title,sub])=>`<button type="button" class="event-type-card ${eventBuilderState.eventType===id?'active':''}" onclick="setEventType('${id}')"><span>${id==='wedding'?'💍':id==='birthday'?'🎂':id==='corporate'?'🏢':id==='family'?'🏡':id==='friends'?'🥂':'🎈'}</span><strong>${title}</strong><small>${sub}</small></button>`).join('')}</div></div>`;
  const step2=`<div class="event-builder-step"><h3>Détails de l’événement</h3><div class="modern-field-grid"><div class="modern-field-card"><label>Nom du contact</label><input value="${safeAttr(eventBuilderState.hostName||currentUser?.name||'')}" oninput="setEventHostName(this.value)" placeholder="Votre nom"></div><div class="modern-field-card"><label>Nombre d’invités</label><div class="modern-number-stepper"><button type="button" onclick="adjustEventGuests(-1)">−</button><input id="eventGuestsValue" type="number" min="1" value="${eventBuilderState.guests}" oninput="setEventGuests(this.value)"><button type="button" onclick="adjustEventGuests(1)">+</button></div></div><div class="modern-field-card"><label>Date souhaitée</label><input type="date" value="${safeAttr(eventBuilderState.date||'')}" onchange="setEventDate(this.value)"></div><div class="modern-field-card"><label>Lieu</label><input value="${safeAttr(eventBuilderState.location||'')}" oninput="setEventLocation(this.value)" placeholder="Adresse, ville ou à confirmer"></div></div><button type="button" class="btn btn-teal" onclick="autoFillEventQty()">Préparer ${eventBuilderState.guests} kits automatiquement</button></div>`;
  const step3=`<div class="event-builder-step"><h3>Produits et personnalisation</h3><p class="builder-muted">Sélectionnez les produits souhaités pour votre activité.</p>${kitPickerHTMLPro(eventBuilderState,'event')}<div class="modern-field-grid"><div class="modern-field-card modern-text-card"><label>Texte personnalisé</label><input type="text" maxlength="90" value="${safeAttr(eventBuilderState.customText||'')}" placeholder="Ex: Mariage Anna & David · 12 juillet 2026" oninput="setEventCustomText(this.value)"><div class="souvenir-preview"><span>Aperçu</span><strong id="eventCustomTextPreview">${safeText(eventBuilderState.customText||'Ex: Mariage Anna & David · 12 juillet 2026')}</strong></div></div><div class="modern-field-card"><label>Notes spéciales</label><textarea oninput="setEventNotes(this.value)" placeholder="Ex: couleurs du mariage, livraison avant une date précise...">${safeText(eventBuilderState.notes||'')}</textarea></div></div></div>`;
  const stepHTML=eventBuilderState.step===1?step1:eventBuilderState.step===2?step2:step3;
  const actionText=eventBuilderState.step<3?'Continuer →':'Ajouter au panier →';
  c.innerHTML=`<div class="event-builder-hero event-builder-hero-polished"><div class="event-sparkle">✦</div><div><div class="section-tag">Expérience Arty</div><h2 class="section-heading">Créez votre <span class="accent">événement</span> en quelques clics</h2></div></div><div class="event-builder-progress"><button type="button" class="${eventBuilderState.step===1?'active':''}" onclick="setEventStep(1)">1. Style</button><button type="button" class="${eventBuilderState.step===2?'active':''}" onclick="setEventStep(2)">2. Détails</button><button type="button" class="${eventBuilderState.step===3?'active':''}" onclick="setEventStep(3)">3. Produits</button></div><div class="client-builder-layout"><section class="builder-main-card animated-builder builder-main-modern">${stepHTML}<div class="builder-nav-actions"><button type="button" class="btn btn-ghost" onclick="setEventStep(eventBuilderState.step-1)" ${eventBuilderState.step===1?'disabled style="opacity:.45"':''}>← Retour</button><button type="button" id="eventFinalActionBtn" class="btn ${eventBuilderState.step<3?'btn-teal':'btn-orange'}" onclick="eventNextAction()" ${eventBuilderState.step===3&&!t.qty?'disabled style="opacity:.55"':''}>${actionText}</button></div></section><aside class="builder-summary-card event-summary-card builder-summary-modern"><div class="summary-art-badge">${eventBuilderState.eventType==='wedding'?'💍':'🎨'}</div><h3>${safeText(eventTypeLabel(eventBuilderState.eventType))}</h3><div class="builder-summary-line"><span>Invités</span><strong>${eventBuilderState.guests}</strong></div><div class="builder-summary-line"><span>Date</span><strong>${eventBuilderState.date?safeText(eventBuilderState.date):'Flexible'}</strong></div><div id="eventBuilderSummaryLines">${builderSummaryHTML(t,'event')}</div><button type="button" class="btn btn-ghost" onclick="submitBuiltEventRequest()">Envoyer une demande</button></aside></div>`;
  initScrollEffects();
}


// ===== EVENT BUILDER CALCULATION + UX FIX =====
// Final override: remove automatic-kit preparation and keep event calculations explicit.
function roundMoneyArty(v){return Math.round((Number(v)||0)*100)/100}
function getBuilderUnitPrice(kit){
  if(!kit)return 0;
  if(typeof getKitDisplayPrice==='function')return roundMoneyArty(getKitDisplayPrice(kit));
  return roundMoneyArty(kit.effectivePrice ?? kit.salePrice ?? kit.price ?? 0);
}
function selectedBuilderItems(state){
  return Object.entries(state.selected||{}).map(([id,qty])=>{
    const k=allKits.find(x=>String(x.id)===String(id));
    const q=Math.max(0,parseInt(qty)||0);
    return k&&q>0?{kit:k,qty:q,unitPrice:getBuilderUnitPrice(k),lineTotal:roundMoneyArty(getBuilderUnitPrice(k)*q)}:null;
  }).filter(Boolean);
}
function builderTotals(state,purpose){
  const items=selectedBuilderItems(state);
  const qty=items.reduce((s,i)=>s+i.qty,0);
  const subtotal=roundMoneyArty(items.reduce((s,i)=>s+i.lineTotal,0));
  const rule=bestBundleRule(qty,purpose||state.purpose||'group');
  const percent=rule?Math.max(0,Math.min(90,Number(rule.percent)||0)):0;
  const discount=roundMoneyArty(subtotal*percent/100);
  const hasText=!!String(state.customText||'').trim();
  const customTextFee=hasText?roundMoneyArty(Number(rule?.customTextFee ?? 12)||0):0;
  const total=roundMoneyArty(Math.max(0,subtotal-discount+customTextFee));
  return{items,qty,subtotal,rule,percent,customTextFee,discount,total};
}
function builderSummaryHTML(t,context){
  const selected=t.items.map(i=>`<div class="builder-summary-line"><span>${safeText(i.kit.name)} ×${i.qty}</span><strong>$${toMoney(i.lineTotal)}</strong></div>`).join('')||'<p class="builder-muted">Aucun produit sélectionné.</p>';
  const label=context==='event'?'Rabais événement':'Rabais quantité';
  return `${selected}<hr><div class="builder-summary-line"><span>Sous-total</span><strong>$${toMoney(t.subtotal)}</strong></div><div class="builder-summary-line discount"><span>${t.rule?safeText(t.rule.label||label):label}</span><strong>${t.rule?'- $'+toMoney(t.discount):'Aucun'}</strong></div>${t.customTextFee?`<div class="builder-summary-line"><span>Texte personnalisé</span><strong>$${toMoney(t.customTextFee)}</strong></div>`:''}<div class="builder-total"><span>Total instantané</span><strong>$${toMoney(t.total)}</strong></div>`;
}
function eventNextAction(){
  if(eventBuilderState.step<3)return setEventStep(eventBuilderState.step+1);
  return addEventPackageToCart();
}
function renderEventBuilderPage(){
  const c=document.getElementById('eventBuilderPageContent');if(!c)return;
  const purpose=eventBuilderState.eventType==='wedding'?'wedding':'event';
  const t=builderTotals(eventBuilderState,purpose);
  const types=[['wedding','Mariage','Une activité souvenir pour les invités'],['birthday','Anniversaire','Une fête créative simple à organiser'],['corporate','Entreprise / équipe','Team building moderne'],['family','Famille','Moment chaleureux à la maison'],['friends','Entre amis','Soirée peinture relax'],['kids','Enfants','Activité facile et encadrée']];
  const step1=`<div class="event-builder-step"><h3>Choisissez le style d’événement</h3><div class="event-type-grid">${types.map(([id,title,sub])=>`<button type="button" class="event-type-card ${eventBuilderState.eventType===id?'active':''}" onclick="setEventType('${id}')"><span>${id==='wedding'?'💍':id==='birthday'?'🎂':id==='corporate'?'🏢':id==='family'?'🏡':id==='friends'?'🥂':'🎈'}</span><strong>${title}</strong><small>${sub}</small></button>`).join('')}</div></div>`;
  const step2=`<div class="event-builder-step"><h3>Détails de l’événement</h3><p class="builder-muted">Entrez les informations de base. Le choix des kits se fait à l’étape suivante.</p><div class="modern-field-grid"><div class="modern-field-card"><label>Nom du contact</label><input value="${safeAttr(eventBuilderState.hostName||currentUser?.name||'')}" oninput="setEventHostName(this.value)" placeholder="Votre nom"></div><div class="modern-field-card"><label>Nombre d’invités</label><div class="modern-number-stepper"><button type="button" onclick="adjustEventGuests(-1)">−</button><input id="eventGuestsValue" type="number" min="1" value="${eventBuilderState.guests}" oninput="setEventGuests(this.value)"><button type="button" onclick="adjustEventGuests(1)">+</button></div></div><div class="modern-field-card"><label>Date souhaitée</label><input type="date" value="${safeAttr(eventBuilderState.date||'')}" onchange="setEventDate(this.value)"></div><div class="modern-field-card"><label>Lieu</label><input value="${safeAttr(eventBuilderState.location||'')}" oninput="setEventLocation(this.value)" placeholder="Adresse, ville ou à confirmer"></div></div></div>`;
  const step3=`<div class="event-builder-step"><h3>Produits et personnalisation</h3><p class="builder-muted">Sélectionnez les produits et les quantités souhaités pour votre activité.</p><div class="builder-section-title"><h3>Choisir les produits</h3><span id="eventSelectedCount">${t.qty} kit${t.qty>1?'s':''}</span></div>${kitPickerHTMLPro(eventBuilderState,'event')}<div class="modern-field-grid"><div class="modern-field-card modern-text-card"><label>Texte personnalisé</label><input type="text" maxlength="90" value="${safeAttr(eventBuilderState.customText||'')}" placeholder="Ex: Mariage Anna & David · 12 juillet 2026" oninput="setEventCustomText(this.value)"><div class="souvenir-preview"><span>Aperçu</span><strong id="eventCustomTextPreview">${safeText(eventBuilderState.customText||'Ex: Mariage Anna & David · 12 juillet 2026')}</strong></div></div><div class="modern-field-card"><label>Notes spéciales</label><textarea oninput="setEventNotes(this.value)" placeholder="Ex: couleurs du mariage, livraison avant une date précise...">${safeText(eventBuilderState.notes||'')}</textarea></div></div></div>`;
  const stepHTML=eventBuilderState.step===1?step1:eventBuilderState.step===2?step2:step3;
  const actionText=eventBuilderState.step<3?'Continuer →':'Ajouter au panier →';
  c.innerHTML=`<div class="event-builder-hero event-builder-hero-polished"><div class="event-sparkle">✦</div><div><div class="section-tag">Expérience Arty</div><h2 class="section-heading">Créez votre <span class="accent">événement</span> en quelques clics</h2></div></div><div class="event-builder-progress"><button type="button" class="${eventBuilderState.step===1?'active':''}" onclick="setEventStep(1)">1. Style</button><button type="button" class="${eventBuilderState.step===2?'active':''}" onclick="setEventStep(2)">2. Détails</button><button type="button" class="${eventBuilderState.step===3?'active':''}" onclick="setEventStep(3)">3. Produits</button></div><div class="client-builder-layout"><section class="builder-main-card animated-builder builder-main-modern">${stepHTML}<div class="builder-nav-actions"><button type="button" class="btn btn-ghost" onclick="setEventStep(eventBuilderState.step-1)" ${eventBuilderState.step===1?'disabled style="opacity:.45"':''}>← Retour</button><button type="button" id="eventFinalActionBtn" class="btn ${eventBuilderState.step<3?'btn-teal':'btn-orange'}" onclick="eventNextAction()" ${eventBuilderState.step===3&&!t.qty?'disabled style="opacity:.55"':''}>${actionText}</button></div></section><aside class="builder-summary-card event-summary-card builder-summary-modern"><div class="summary-art-badge">${eventBuilderState.eventType==='wedding'?'💍':'🎨'}</div><h3>${safeText(eventTypeLabel(eventBuilderState.eventType))}</h3><div class="builder-summary-line"><span>Invités</span><strong>${eventBuilderState.guests}</strong></div><div class="builder-summary-line"><span>Date</span><strong>${eventBuilderState.date?safeText(eventBuilderState.date):'Flexible'}</strong></div><div id="eventBuilderSummaryLines">${builderSummaryHTML(t,'event')}</div><button type="button" class="btn btn-ghost" onclick="submitBuiltEventRequest()">Envoyer une demande</button></aside></div>`;
  initScrollEffects();
}
function addEventPackageToCart(){
  const purpose=eventBuilderState.eventType==='wedding'?'wedding':'event';
  const t=builderTotals(eventBuilderState,purpose);
  if(!t.qty)return showToast('Choisissez au moins un produit pour l’événement','error');
  cart.push({id:`event-package-${Date.now()}`,name:`Événement ${eventTypeLabel(eventBuilderState.eventType)} (${t.qty} kits)`,price:t.total,image:t.items[0]?.kit?.image||'photoacceuil.jpg',qty:1,type:'custom-event-package',customData:{kind:'event-package',eventType:eventBuilderState.eventType,eventLabel:eventTypeLabel(eventBuilderState.eventType),guests:eventBuilderState.guests,date:eventBuilderState.date,location:eventBuilderState.location,hostName:eventBuilderState.hostName||currentUser?.name||'',customText:eventBuilderState.customText||'',notes:eventBuilderState.notes||'',subtotal:t.subtotal,discount:t.discount,customTextFee:t.customTextFee,discountRule:t.rule||null,items:t.items.map(i=>({kitId:i.kit.id,name:i.kit.name,qty:i.qty,unitPrice:i.unitPrice,lineTotal:i.lineTotal}))}});
  saveCart();updateCartUI();showToast('Événement ajouté au panier','success');setTimeout(()=>goToCheckout(),250);
}


// ===== COMPLETE CUSTOMER ACCOUNT EXPERIENCE =====
let profileOrders=[],profileBookings=[],profileSupportRequests=[],profileActiveTab='orders',adminSupportRequests=[];

function profileIcon(type){
  const paths={
    orders:'<path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5z"></path><path d="m5 7.5 7 3.5 7-3.5M12 11v9"></path>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M8 3v4M16 3v4M3 10h18"></path>',
    support:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"></path><path d="M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2ZM20 14h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2ZM17 20c-1 1-2.5 1.5-5 1.5"></path>',
    settings:'<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path>',
    truck:'<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"></path><circle cx="7" cy="18" r="2"></circle><circle cx="18" cy="18" r="2"></circle>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="3"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    user:'<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
    location:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
    receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"></path><path d="M9 8h6M9 12h6"></path>',
    logout:'<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M18 12H8"></path>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type]||paths.user}</svg>`;
}
function profileDate(value,withTime=false){
  if(!value)return '—';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return safeText(value);
  return date.toLocaleDateString('fr-CA',withTime?{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}:{day:'numeric',month:'long',year:'numeric'});
}
function profileStatusMeta(status){
  const key=String(status||'').toLowerCase();
  const map={
    'en attente de paiement':{label:'En attente de paiement',className:'pending',step:0},
    'payée':{label:'Paiement confirmé',className:'paid',step:1},
    'préparation':{label:'En préparation',className:'preparing',step:2},
    'expédiée':{label:'Expédiée',className:'shipped',step:3},
    'livrée':{label:'Livrée',className:'delivered',step:4},
    'annulée':{label:'Annulée',className:'cancelled',step:0},
    'remboursée':{label:'Remboursée',className:'refunded',step:0}
  };
  return map[key]||{label:status||'Commande reçue',className:'pending',step:0};
}
function profileOrderProgress(order,compact=false){
  const meta=profileStatusMeta(order.status);
  if(['cancelled','refunded'].includes(meta.className))return `<div class="account-order-alert ${meta.className}">${meta.label}</div>`;
  const steps=['Commande reçue','Paiement','Préparation','Expédition','Livraison'];
  return `<div class="account-order-progress ${compact?'compact':''}">${steps.map((label,index)=>`<div class="account-progress-step ${index<meta.step?'complete':index===meta.step?'current':''}"><span></span>${compact?'':`<small>${label}</small>`}</div>`).join('')}</div>`;
}
async function loadProfileAccount(){
  const r=await fetch('/api/users/me',{headers:authH()});if(!r.ok)throw new Error('Compte indisponible');
  currentUser=await r.json();localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();
}
async function loadProfileOrders(){try{const r=await fetch('/api/orders/mine',{headers:authH()});if(!r.ok)throw new Error();profileOrders=await r.json()}catch{profileOrders=[]}}
async function loadProfileBookings(){try{const r=await fetch('/api/bookings/mine',{headers:authH()});if(!r.ok)throw new Error();profileBookings=await r.json()}catch{profileBookings=[]}}
async function loadProfileSupport(){try{const r=await fetch('/api/support-requests/mine',{headers:authH()});if(!r.ok)throw new Error();profileSupportRequests=await r.json()}catch{profileSupportRequests=[]}}

async function renderProfilePage(){
  const c=document.getElementById('profilePageContent');if(!c||!currentUser)return;
  try{await loadProfileAccount()}catch{}
  const av=currentUser.picture?`<img src="${safeAttr(currentUser.picture)}" alt="">`:safeText(String(currentUser.name||'A').charAt(0).toUpperCase());
  const provider=currentUser.provider==='google'?'Google':'Courriel et mot de passe';
  const memberSince=currentUser.createdAt?profileDate(currentUser.createdAt):'';
  const address=currentUser.defaultAddress||{};
  c.innerHTML=`
    <div class="account-heading"><div><span class="account-kicker">Mon compte ARTY</span><h1>Bonjour, ${safeText(String(currentUser.name||'').split(' ')[0])}</h1><p>Gérez vos commandes, vos réservations et vos informations personnelles.</p></div><button type="button" class="account-logout" onclick="logout()">${profileIcon('logout')}<span>Déconnexion</span></button></div>
    <div class="account-layout">
      <aside class="account-sidebar">
        <div class="account-identity"><div class="account-avatar">${av}</div><strong>${safeText(currentUser.name)}</strong><span>${safeText(currentUser.email)}</span>${memberSince?`<small>Membre depuis ${memberSince}</small>`:''}</div>
        <nav class="account-nav" aria-label="Navigation du compte">
          <button type="button" class="account-nav-button" data-profile-tab="orders" onclick="switchProfileTab('orders')">${profileIcon('orders')}<span>Mes commandes</span><b id="profileOrderCount">0</b></button>
          <button type="button" class="account-nav-button" data-profile-tab="bookings" onclick="switchProfileTab('bookings')">${profileIcon('calendar')}<span>Mes réservations</span></button>
          <button type="button" class="account-nav-button" data-profile-tab="support" onclick="switchProfileTab('support')">${profileIcon('support')}<span>Service à la clientèle</span><b id="profileSupportCount">0</b></button>
          <button type="button" class="account-nav-button" data-profile-tab="settings" onclick="switchProfileTab('settings')">${profileIcon('settings')}<span>Paramètres</span></button>
        </nav>
        <div class="account-connection">${profileIcon('lock')}<div><small>Connexion</small><strong>${safeText(provider)}</strong></div></div>
      </aside>
      <main class="account-main">
        <section class="account-panel" id="panel-orders" data-account-panel="orders"><div class="account-panel-head"><div><span>Commandes</span><h2>Suivi de vos achats</h2><p>Consultez les articles, la livraison et chaque étape de traitement.</p></div><button type="button" class="btn btn-orange btn-sm" onclick="navigate('#/paintings')">Magasiner</button></div><div class="account-summary-grid" id="profileOrderSummary"></div><div id="ordersWrap" class="account-order-list"><div class="account-loading"></div><div class="account-loading"></div></div></section>
        <section class="account-panel" id="panel-bookings" data-account-panel="bookings"><div class="account-panel-head"><div><span>Réservations</span><h2>Vos activités ARTY</h2><p>Retrouvez les événements et le nombre de places réservées.</p></div><button type="button" class="btn btn-orange btn-sm" onclick="navigate('#/party')">Voir les événements</button></div><div id="bookingsWrap" class="account-booking-list"><div class="account-loading"></div></div></section>
        <section class="account-panel" id="panel-support" data-account-panel="support"><div class="account-panel-head"><div><span>Service à la clientèle</span><h2>Comment pouvons-nous vous aider?</h2><p>Envoyez une demande et suivez la réponse directement dans votre compte.</p></div></div><div class="account-support-layout"><form class="account-form-card" onsubmit="submitProfileSupport(event)"><div class="account-card-title">${profileIcon('support')}<div><h3>Nouvelle demande</h3><p>Donnez-nous les informations nécessaires pour vous aider.</p></div></div><div class="account-form-grid"><div class="form-group"><label>Sujet</label><select id="supportTopic"><option value="commande">Commande</option><option value="livraison">Livraison</option><option value="produit">Produit</option><option value="paiement">Paiement</option><option value="événement">Événement</option><option value="autre">Autre</option></select></div><div class="form-group"><label>Commande concernée</label><select id="supportOrderId"><option value="">Aucune commande</option></select></div></div><div class="form-group"><label>Objet de la demande</label><input id="supportSubject" maxlength="120" placeholder="Ex: Question concernant la livraison"></div><div class="form-group"><label>Message</label><textarea id="supportMessage" maxlength="2400" placeholder="Expliquez-nous votre demande"></textarea></div><button class="btn btn-orange" id="supportSubmitButton" type="submit">Envoyer la demande</button></form><div class="account-support-history"><div class="account-card-title">${profileIcon('receipt')}<div><h3>Vos demandes</h3><p>Consultez leur statut et les réponses reçues.</p></div></div><div id="supportRequestsWrap"><div class="account-loading"></div></div></div></div></section>
        <section class="account-panel" id="panel-settings" data-account-panel="settings"><div class="account-panel-head"><div><span>Paramètres</span><h2>Informations du compte</h2><p>Gardez vos coordonnées et votre adresse de livraison à jour.</p></div></div><div class="account-settings-grid"><form class="account-form-card account-settings-primary" onsubmit="updateProfile(event)"><div class="account-card-title">${profileIcon('user')}<div><h3>Profil et livraison</h3><p>Ces renseignements simplifient vos prochaines commandes.</p></div></div><div class="account-form-grid"><div class="form-group"><label>Nom complet</label><input id="profileName" value="${safeAttr(currentUser.name||'')}" autocomplete="name"></div><div class="form-group"><label>Téléphone</label><input id="profilePhone" value="${safeAttr(currentUser.phone||'')}" autocomplete="tel" placeholder="Numéro de téléphone"></div></div><div class="form-group"><label>Courriel</label><input value="${safeAttr(currentUser.email||'')}" disabled></div><div class="form-group"><label>Adresse</label><input id="profileAddress" value="${safeAttr(address.line1||'')}" autocomplete="street-address" placeholder="Numéro, rue, appartement"></div><div class="account-form-grid"><div class="form-group"><label>Ville</label><input id="profileCity" value="${safeAttr(address.city||'')}" autocomplete="address-level2"></div><div class="form-group"><label>Province</label><input id="profileProvince" value="${safeAttr(address.province||'QC')}" autocomplete="address-level1"></div><div class="form-group"><label>Code postal</label><input id="profilePostal" value="${safeAttr(address.postal||'')}" autocomplete="postal-code"></div><div class="form-group"><label>Pays</label><input id="profileCountry" value="${safeAttr(address.country||'Canada')}" autocomplete="country-name"></div></div><button class="btn btn-orange" id="profileSaveButton" type="submit">Enregistrer les modifications</button></form><div class="account-settings-stack"><section class="account-form-card"><div class="account-card-title">${profileIcon('lock')}<div><h3>Sécurité et connexion</h3><p>Votre compte est connecté avec ${safeText(provider)}.</p></div></div>${currentUser.provider==='local'?`<div class="form-group"><label>Mot de passe actuel</label><div class="account-password-field"><input type="password" id="pCurPw" autocomplete="current-password"><button type="button" onclick="togglePasswordField('pCurPw',this)">Voir</button></div></div><div class="form-group"><label>Nouveau mot de passe</label><div class="account-password-field"><input type="password" id="pNewPw" autocomplete="new-password"><button type="button" onclick="togglePasswordField('pNewPw',this)">Voir</button></div></div><div class="form-group"><label>Confirmer le nouveau mot de passe</label><input type="password" id="pNewPwConfirm" autocomplete="new-password"></div><p class="account-security-note">Laissez les champs vides pour conserver votre mot de passe actuel.</p>`:`<div class="account-provider-card"><div class="account-provider-mark">G</div><div><strong>Compte Google connecté</strong><span>La sécurité du mot de passe est gérée par Google.</span></div></div>`}</section><section class="account-form-card account-session-card"><div class="account-card-title">${profileIcon('logout')}<div><h3>Session active</h3><p>Vous êtes actuellement connecté sur cet appareil.</p></div></div><button type="button" class="btn btn-ghost" onclick="logout()">Se déconnecter</button></section></div></div></section>
      </main>
    </div>
    <div class="account-order-modal" id="profileOrderModal" hidden><button type="button" class="account-modal-backdrop" onclick="closeProfileOrder()" aria-label="Fermer"></button><section class="account-order-sheet" role="dialog" aria-modal="true" aria-labelledby="profileOrderTitle"><button type="button" class="account-sheet-close" onclick="closeProfileOrder()" aria-label="Fermer">×</button><div id="profileOrderDetail"></div></section></div>`;
  await Promise.all([loadProfileOrders(),loadProfileBookings(),loadProfileSupport()]);
  renderProfileOrders();renderProfileBookings();renderProfileSupport();switchProfileTab(profileActiveTab);
}
function switchProfileTab(tab){
  profileActiveTab=['orders','bookings','support','settings'].includes(tab)?tab:'orders';
  document.querySelectorAll('[data-profile-tab]').forEach(button=>button.classList.toggle('active',button.dataset.profileTab===profileActiveTab));
  document.querySelectorAll('[data-account-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.accountPanel===profileActiveTab));
}
function switchPTab(tab){switchProfileTab(tab)}
function renderProfileOrders(){
  const wrap=document.getElementById('ordersWrap'),summary=document.getElementById('profileOrderSummary');if(!wrap||!summary)return;
  const active=profileOrders.filter(order=>!['livrée','annulée','remboursée'].includes(String(order.status||'').toLowerCase())).length;
  const total=profileOrders.reduce((sum,order)=>sum+Number(order.total||0),0);
  summary.innerHTML=`<div class="account-summary-card">${profileIcon('orders')}<div><span>Commandes</span><strong>${profileOrders.length}</strong></div></div><div class="account-summary-card">${profileIcon('truck')}<div><span>En cours</span><strong>${active}</strong></div></div><div class="account-summary-card">${profileIcon('receipt')}<div><span>Total des achats</span><strong>$${toMoney(total)}</strong></div></div>`;
  const count=document.getElementById('profileOrderCount');if(count)count.textContent=profileOrders.length;
  if(!profileOrders.length){wrap.innerHTML=`<div class="account-empty">${profileIcon('orders')}<h3>Aucune commande pour le moment</h3><p>Vos prochaines commandes apparaîtront ici avec leur suivi.</p><button class="btn btn-orange" onclick="navigate('#/paintings')">Découvrir les kits</button></div>`;return}
  wrap.innerHTML=profileOrders.map(order=>{const meta=profileStatusMeta(order.status),items=Array.isArray(order.items)?order.items:[],first=items[0]||{},more=Math.max(0,items.length-1);return `<article class="account-order-card"><div class="account-order-card-main"><img src="${safeAttr(first.image||'logoarty.png')}" alt=""><div class="account-order-copy"><div class="account-order-topline"><span>Commande ${safeText(order.id)}</span><span class="account-status ${meta.className}">${safeText(meta.label)}</span></div><h3>${safeText(first.name||'Commande ARTY')}${more?` <small>+ ${more} autre${more>1?'s':''}</small>`:''}</h3><p>${profileDate(order.createdAt)} · ${items.reduce((sum,item)=>sum+(Number(item.qty)||1),0)} article${items.length>1?'s':''}</p>${profileOrderProgress(order,true)}</div><div class="account-order-actions"><strong>$${toMoney(order.total)}</strong><button type="button" onclick="viewProfileOrder('${safeAttr(order.id)}')">Voir la commande</button></div></div></article>`}).join('');
}
function renderProfileBookings(){
  const wrap=document.getElementById('bookingsWrap');if(!wrap)return;
  if(!profileBookings.length){wrap.innerHTML=`<div class="account-empty">${profileIcon('calendar')}<h3>Aucune réservation</h3><p>Réservez une activité ARTY et retrouvez-la ensuite dans votre compte.</p><button class="btn btn-orange" onclick="navigate('#/party')">Voir les événements</button></div>`;return}
  wrap.innerHTML=profileBookings.map(booking=>{const event=booking.event||{};return `<article class="account-booking-card"><div class="account-booking-date"><strong>${event.date?new Date(event.date+'T00:00:00').toLocaleDateString('fr-CA',{day:'2-digit'}):'—'}</strong><span>${event.date?new Date(event.date+'T00:00:00').toLocaleDateString('fr-CA',{month:'short'}):''}</span></div><div><span class="account-booking-label">Réservation ${safeText(booking.status||'confirmée')}</span><h3>${safeText(event.title||'Événement ARTY')}</h3><p>${safeText(event.time||'Heure à confirmer')} · ${Number(booking.guests)||1} personne${Number(booking.guests)>1?'s':''}</p></div><button type="button" onclick="navigate('#/party')">Voir les événements</button></article>`}).join('');
}
function supportStatusMeta(status){const map={nouvelle:['Nouvelle','new'],'en cours':['En cours','progress'],'répondue':['Répondue','answered'],'fermée':['Fermée','closed']};const value=map[String(status||'').toLowerCase()]||[status||'Nouvelle','new'];return{label:value[0],className:value[1]}}
function renderProfileSupport(){
  const orderSelect=document.getElementById('supportOrderId'),wrap=document.getElementById('supportRequestsWrap');if(!orderSelect||!wrap)return;
  orderSelect.innerHTML=`<option value="">Aucune commande</option>${profileOrders.map(order=>`<option value="${safeAttr(order.id)}">${safeText(order.id)} · ${profileDate(order.createdAt)}</option>`).join('')}`;
  const openCount=profileSupportRequests.filter(request=>request.status!=='fermée').length,count=document.getElementById('profileSupportCount');if(count)count.textContent=openCount;
  if(!profileSupportRequests.length){wrap.innerHTML='<div class="account-support-empty"><p>Aucune demande envoyée.</p></div>';return}
  wrap.innerHTML=profileSupportRequests.map(request=>{const meta=supportStatusMeta(request.status);return `<article class="account-ticket"><div class="account-ticket-head"><div><span>${safeText(request.id)}</span><small>${profileDate(request.createdAt)}</small></div><b class="account-ticket-status ${meta.className}">${safeText(meta.label)}</b></div><h4>${safeText(request.subject)}</h4><p>${safeText(request.message)}</p>${request.orderId?`<span class="account-ticket-order">Commande ${safeText(request.orderId)}</span>`:''}${request.adminReply?`<div class="account-support-reply"><strong>Réponse de l’équipe ARTY</strong><p>${safeText(request.adminReply)}</p><small>${profileDate(request.repliedAt||request.updatedAt,true)}</small></div>`:''}</article>`}).join('');
}
async function submitProfileSupport(event){
  event?.preventDefault();const topic=document.getElementById('supportTopic')?.value,orderId=document.getElementById('supportOrderId')?.value,subject=document.getElementById('supportSubject')?.value.trim(),message=document.getElementById('supportMessage')?.value.trim(),button=document.getElementById('supportSubmitButton');
  if(!subject||subject.length<4)return showToast('Ajoutez un objet clair','error');if(!message||message.length<10)return showToast('Ajoutez quelques détails','error');
  if(button){button.disabled=true;button.textContent='Envoi en cours...'}
  try{const r=await fetch('/api/support-requests',{method:'POST',headers:authH(),body:JSON.stringify({topic,orderId,subject,message})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Demande impossible','error');document.getElementById('supportSubject').value='';document.getElementById('supportMessage').value='';await loadProfileSupport();renderProfileSupport();showToast('Votre demande a été envoyée','success')}catch{showToast('Erreur de connexion','error')}finally{if(button){button.disabled=false;button.textContent='Envoyer la demande'}}
}
function openSupportForOrder(orderId){closeProfileOrder();switchProfileTab('support');const select=document.getElementById('supportOrderId');if(select)select.value=orderId;const topic=document.getElementById('supportTopic');if(topic)topic.value='commande';const subject=document.getElementById('supportSubject');if(subject&&!subject.value)subject.value=`Question concernant la commande ${orderId}`;document.getElementById('panel-support')?.scrollIntoView({behavior:'smooth',block:'start'})}
function profileSafeTrackingUrl(url){const value=String(url||'').trim();return /^https?:\/\//i.test(value)?value:''}
function viewProfileOrder(orderId){
  const order=profileOrders.find(item=>String(item.id)===String(orderId)),modal=document.getElementById('profileOrderModal'),detail=document.getElementById('profileOrderDetail');if(!order||!modal||!detail)return;
  const meta=profileStatusMeta(order.status),items=Array.isArray(order.items)?order.items:[],tracking=order.tracking||{},trackingUrl=profileSafeTrackingUrl(tracking.url),address=order.address||{};
  const itemRows=items.map(item=>`<div class="account-detail-item"><img src="${safeAttr(item.image||'logoarty.png')}" alt=""><div><strong>${safeText(item.name)}</strong>${item.customData?.selectionLabel?`<small>${safeText(item.customData.selectionLabel)}</small>`:''}<span>Quantité : ${Number(item.qty)||1}</span></div><b>$${toMoney(item.lineTotal??((Number(item.price)||0)*(Number(item.qty)||1)))}</b></div>`).join('');
  detail.innerHTML=`<div class="account-detail-head"><span>Commande ${safeText(order.id)}</span><h2 id="profileOrderTitle">Détails et suivi</h2><div><small>Passée le ${profileDate(order.createdAt)}</small><b class="account-status ${meta.className}">${safeText(meta.label)}</b></div></div><div class="account-detail-progress">${profileOrderProgress(order)}</div>${tracking.number||tracking.carrier||tracking.estimatedDelivery?`<section class="account-tracking-card">${profileIcon('truck')}<div><span>Informations de livraison</span><h3>${safeText(tracking.carrier||'Transporteur à confirmer')}</h3>${tracking.number?`<p>Numéro de suivi : <strong>${safeText(tracking.number)}</strong></p>`:''}${tracking.estimatedDelivery?`<p>Livraison estimée : <strong>${profileDate(tracking.estimatedDelivery)}</strong></p>`:''}</div>${trackingUrl?`<a href="${safeAttr(trackingUrl)}" target="_blank" rel="noopener">Suivre le colis</a>`:''}</section>`:''}<div class="account-detail-grid"><section><h3>Articles</h3><div class="account-detail-items">${itemRows}</div><div class="account-detail-totals"><div><span>Sous-total</span><strong>$${toMoney(order.subtotal??order.total)}</strong></div>${Number(order.discountTotal)>0?`<div class="discount"><span>Rabais</span><strong>− $${toMoney(order.discountTotal)}</strong></div>`:''}<div class="total"><span>Total</span><strong>$${toMoney(order.total)}</strong></div></div></section><aside><div class="account-detail-address">${profileIcon('location')}<div><span>Adresse de livraison</span><strong>${safeText(address.line1||'Adresse non disponible')}</strong><p>${safeText([address.city,address.province,address.postal].filter(Boolean).join(', '))}<br>${safeText(address.country||'')}</p></div></div><div class="account-detail-help"><h3>Besoin d’aide?</h3><p>Communiquez avec notre équipe en indiquant cette commande.</p><button type="button" class="btn btn-ghost" onclick="openSupportForOrder('${safeAttr(order.id)}')">Contacter le service à la clientèle</button></div></aside></div>`;
  modal.hidden=false;document.body.style.overflow='hidden';
}
function closeProfileOrder(){const modal=document.getElementById('profileOrderModal');if(modal)modal.hidden=true;document.body.style.overflow=''}
async function updateProfile(event){
  event?.preventDefault();const name=document.getElementById('profileName')?.value.trim(),phone=document.getElementById('profilePhone')?.value.trim(),currentPassword=document.getElementById('pCurPw')?.value||'',newPassword=document.getElementById('pNewPw')?.value||'',confirmPassword=document.getElementById('pNewPwConfirm')?.value||'',button=document.getElementById('profileSaveButton');
  if(!name||name.length<2)return showToast('Entrez votre nom','error');if(newPassword&&newPassword!==confirmPassword)return showToast('Les nouveaux mots de passe ne correspondent pas','error');if(newPassword&&newPassword.length<6)return showToast('Le mot de passe doit contenir au moins 6 caractères','error');
  const body={name,phone,defaultAddress:{line1:document.getElementById('profileAddress')?.value.trim()||'',city:document.getElementById('profileCity')?.value.trim()||'',province:document.getElementById('profileProvince')?.value.trim()||'',postal:document.getElementById('profilePostal')?.value.trim()||'',country:document.getElementById('profileCountry')?.value.trim()||'Canada'}};if(newPassword){body.currentPassword=currentPassword;body.newPassword=newPassword}
  if(button){button.disabled=true;button.textContent='Enregistrement...'}
  try{const r=await fetch('/api/users/me',{method:'PUT',headers:authH(),body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Modification impossible','error');currentUser=d.user;localStorage.setItem('arty_user',JSON.stringify(currentUser));updateAuthUI();profileActiveTab='settings';await renderProfilePage();showToast('Vos informations ont été enregistrées','success')}catch{showToast('Erreur de connexion','error')}finally{if(button){button.disabled=false;button.textContent='Enregistrer les modifications'}}
}

// Customer support and shipment tools in the administration area.
async function loadAdminSupportRequests(){try{const r=await fetch('/api/admin/support-requests',{headers:authH()});if(!r.ok)throw new Error();adminSupportRequests=await r.json()}catch{adminSupportRequests=[]}}
async function loadAdminData(){
  try{await Promise.all([loadAdminEvents(),loadAdminBookings(),loadEventRequests(),loadAdminOrders(),loadAdminAnalytics(),loadAdminDiscounts(),loadAdminRefunds(),loadAdminAnnouncement(),loadAdminKits(),loadAdminProductTemplates(),loadAdminSupportRequests(),loadCategories()]);document.getElementById('statRevenue').textContent=`$${toMoney(adminAnalyticsPro?.revenue||0)}`;document.getElementById('statOrders').textContent=adminAnalyticsPro?.ordersCount??(adminOrders||[]).length;document.getElementById('statKits').textContent=allKits.length;document.getElementById('statLowInventory').textContent=adminAnalyticsPro?.lowInventoryCount??0}catch(e){console.warn(e)}
  renderAdminDashboard();renderAdminKits();renderAdminInventory();renderAdminDiscounts();renderAdminOrders();renderAdminCategories();renderAdminEvents();renderAdminAnnouncement();renderAdminSupportRequests();
}
function switchAdminTab(tab,button){
  closeAdminOrderDetail();
  document.querySelectorAll('.admin-tab').forEach(item=>item.classList.remove('active'));if(button)button.classList.add('active');
  ['adminDashboardPanel','adminKitsPanel','adminInventoryPanel','adminDiscountsPanel','adminOrdersPanel','adminEventsPanel','adminCategoriesPanel','adminAnnouncementPanel','adminBundleDealsPanel','adminSupportPanel'].forEach(id=>{const panel=document.getElementById(id);if(panel)panel.style.display='none'});
  const map={dashboard:'adminDashboardPanel',kits:'adminKitsPanel',inventory:'adminInventoryPanel',discounts:'adminDiscountsPanel',orders:'adminOrdersPanel',events:'adminEventsPanel',categories:'adminCategoriesPanel',announcement:'adminAnnouncementPanel',bundleDeals:'adminBundleDealsPanel',support:'adminSupportPanel'};const panel=document.getElementById(map[tab]||map.dashboard);if(panel)panel.style.display='block';if(tab==='support')renderAdminSupportRequests();if(tab==='announcement')renderAdminAnnouncement();if(tab==='bundleDeals')renderAdminBundleDeals();
}
function renderAdminSupportRequests(){
  const panel=document.getElementById('adminSupportPanel');if(!panel)return;
  const cards=(adminSupportRequests||[]).map(request=>{const meta=supportStatusMeta(request.status);return `<article class="admin-support-card"><div class="admin-support-head"><div><span>${safeText(request.id)}</span><h3>${safeText(request.subject)}</h3><p>${safeText(request.customer?.name||'')} · ${safeText(request.customer?.email||'')}${request.orderId?` · Commande ${safeText(request.orderId)}`:''}</p></div><b class="account-ticket-status ${meta.className}">${safeText(meta.label)}</b></div><div class="admin-support-message"><span>${safeText(request.topic||'autre')}</span><p>${safeText(request.message)}</p></div><div class="admin-support-response"><div class="form-group"><label>Statut</label><select id="supportStatus-${safeAttr(request.id)}"><option value="nouvelle" ${request.status==='nouvelle'?'selected':''}>Nouvelle</option><option value="en cours" ${request.status==='en cours'?'selected':''}>En cours</option><option value="répondue" ${request.status==='répondue'?'selected':''}>Répondue</option><option value="fermée" ${request.status==='fermée'?'selected':''}>Fermée</option></select></div><div class="form-group"><label>Réponse au client</label><textarea id="supportReply-${safeAttr(request.id)}" placeholder="Écrivez la réponse visible dans le compte client">${safeText(request.adminReply||'')}</textarea></div><button class="btn btn-teal btn-sm" onclick="saveAdminSupportRequest('${safeAttr(request.id)}')">Enregistrer la réponse</button></div></article>`}).join('');
  panel.innerHTML=`<div class="admin-form-card"><h3>Service à la clientèle</h3><p class="admin-help">Gérez les demandes envoyées depuis les comptes clients et publiez vos réponses.</p></div><div class="admin-support-list">${cards||'<div class="admin-form-card"><p class="admin-muted">Aucune demande pour le moment.</p></div>'}</div>`;
}
async function saveAdminSupportRequest(id){const status=document.getElementById(`supportStatus-${id}`)?.value,adminReply=document.getElementById(`supportReply-${id}`)?.value.trim()||'';try{const r=await fetch(`/api/admin/support-requests/${encodeURIComponent(id)}`,{method:'PATCH',headers:authH(),body:JSON.stringify({status,adminReply})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');await loadAdminSupportRequests();renderAdminSupportRequests();showToast('Demande mise à jour','success')}catch{showToast('Erreur','error')}}
function adminOrderDomId(id){return String(id||'').replace(/[^a-z0-9_-]/gi,'-')}
function adminOrderStatusOptions(current){return [['en attente de paiement','En attente de paiement'],['payée','Payée'],['préparation','En préparation'],['expédiée','Expédiée'],['livrée','Livrée'],['annulée','Annulée'],['remboursée','Remboursée']].map(([value,label])=>`<option value="${value}" ${current===value?'selected':''}>${label}</option>`).join('')}
function adminPaymentMeta(status){const key=String(status||'pending').toLowerCase(),map={paid:['Paiement confirmé','ok'],pending:['En attente','pending'],cancelled:['Annulé','out'],refund_needed:['Remboursement requis','pending'],refunded:['Remboursé','out'],provider_not_connected:['Paiement à confirmer','pending']};const value=map[key]||[status||'À confirmer','pending'];return{label:value[0],className:value[1]}}
function adminOrderItemDetails(item){
  const custom=item.customData||{},details=[];
  if(custom.kind==='event-ticket'){
    if(custom.eventDate)details.push(`Date : ${custom.eventDate}${custom.eventTime?` à ${custom.eventTime}`:''}`);
    if(custom.eventLocation)details.push(`Lieu : ${custom.eventLocation}`);
    (custom.guestNames||[]).forEach((name,index)=>details.push(`Participant ${index+1} : ${name}`));
  }
  if(custom.selectionLabel)details.push(custom.selectionLabel);
  if(custom.sizeLabel&&!details.includes(custom.sizeLabel))details.push(`Format : ${custom.sizeLabel}`);
  (custom.addOnLabels||[]).forEach(label=>details.push(`Option : ${label}`));
  if(custom.kind==='client-bundle'){
    (custom.items||[]).forEach(product=>details.push(`${product.name||'Produit'} × ${Number(product.qty)||1}`));
    if(custom.customText)details.push(`Texte personnalisé : ${custom.customText}`);
  }
  if(custom.kind==='event-package'){
    if(custom.eventLabel)details.push(custom.eventLabel);
    if(custom.guests)details.push(`${custom.guests} invités`);
    if(custom.date)details.push(`Date : ${custom.date}`);
    if(custom.location)details.push(`Lieu : ${custom.location}`);
    (custom.items||[]).forEach(product=>details.push(`${product.name||'Produit'} × ${Number(product.qty)||1}`));
    if(custom.customText)details.push(`Texte personnalisé : ${custom.customText}`);
  }
  if(custom.kind==='bag-trace-design'&&custom.imageCount)details.push(`${custom.imageCount} image${Number(custom.imageCount)>1?'s':''} personnalisée${Number(custom.imageCount)>1?'s':''}`);
  if(custom.notes)details.push(`Note : ${custom.notes}`);
  if(item.discountLabel)details.push(`Rabais : ${item.discountLabel}`);
  return details;
}
function renderAdminOrders(){
  const panel=document.getElementById('adminOrdersPanel');if(!panel)return;
  const previousModal=document.getElementById('adminOrderDetailModal');if(previousModal&&!previousModal.hidden)document.body.style.overflow='';
  const refundRows=(adminRefunds||[]).map(refund=>`<tr><td>${safeText(refund.id)}</td><td>${safeText(refund.orderId)}</td><td>$${toMoney(refund.amount)}</td><td>${safeText(refund.reason||'')}</td><td>${safeText(refund.status||'noté')}</td></tr>`).join('');
  const awaiting=(adminOrders||[]).filter(order=>['payée','préparation'].includes(order.status)).length,shipping=(adminOrders||[]).filter(order=>order.status==='expédiée').length;
  const rows=(adminOrders||[]).map(order=>{
    const customer=order.customer||{},address=order.address||{},items=Array.isArray(order.items)?order.items:[],ticketOnly=items.length>0&&items.every(item=>item.type==='event-ticket'),meta=profileStatusMeta(order.status),payment=adminPaymentMeta(order.paymentStatus),quantity=items.reduce((total,item)=>total+(Number(item.qty)||1),0);
    return `<tr class="admin-order-row"><td><button type="button" class="admin-order-number" onclick="openAdminOrderDetail('${safeAttr(order.id)}')"><strong>${safeText(order.id)}</strong><span>${profileDate(order.createdAt)}</span></button></td><td><strong>${safeText(customer.name||'Client non indiqué')}</strong><span class="admin-order-cell-note">${safeText(customer.email||order.guestEmail||'Courriel non indiqué')}</span></td><td><strong>${safeText(ticketOnly?'Billet électronique':address.city||'Adresse à consulter')}</strong><span class="admin-order-cell-note">${safeText(ticketOnly?'Envoi après paiement':[address.province,address.postal].filter(Boolean).join(' · '))}</span></td><td><strong>${quantity} ${ticketOnly?`personne${quantity>1?'s':''}`:`article${quantity>1?'s':''}`}</strong><span class="admin-order-cell-note">${safeText(items[0]?.name||'Aucun article')}${items.length>1?` + ${items.length-1}`:''}</span></td><td><strong>$${toMoney(order.total)}</strong><span class="admin-status ${payment.className}">${safeText(payment.label)}</span></td><td><span class="account-status ${meta.className}">${safeText(meta.label)}</span></td><td><button type="button" class="admin-order-view" onclick="openAdminOrderDetail('${safeAttr(order.id)}')">Voir les détails</button></td></tr>`;
  }).join('');
  panel.innerHTML=`<div class="admin-orders-heading"><div><span>Gestion des commandes</span><h3>Commandes et livraisons</h3><p>Ouvrez une commande pour consulter les coordonnées du client, l’adresse de livraison, les produits et le suivi.</p></div><div class="admin-orders-overview"><div><strong>${(adminOrders||[]).length}</strong><span>Commandes</span></div><div><strong>${awaiting}</strong><span>À préparer</span></div><div><strong>${shipping}</strong><span>En livraison</span></div></div></div><div class="admin-table-wrap admin-orders-table"><table class="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Destination</th><th>Produits</th><th>Total</th><th>Statut</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="admin-muted">Aucune commande pour le moment.</td></tr>'}</tbody></table></div><div class="admin-section-title"><h3>Historique des remboursements</h3></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Remboursement</th><th>Commande</th><th>Montant</th><th>Raison</th><th>Statut</th></tr></thead><tbody>${refundRows||'<tr><td colspan="5" class="admin-muted">Aucun remboursement.</td></tr>'}</tbody></table></div><div class="admin-order-detail-modal" id="adminOrderDetailModal" hidden><button class="admin-order-detail-backdrop" type="button" onclick="closeAdminOrderDetail()" aria-label="Fermer les détails"></button><section class="admin-order-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="adminOrderDetailTitle"><button class="admin-order-detail-close" type="button" onclick="closeAdminOrderDetail()" aria-label="Fermer">×</button><div id="adminOrderDetailContent"></div></section></div>`;
}
function openAdminOrderDetail(orderId){
  const order=(adminOrders||[]).find(item=>String(item.id)===String(orderId)),modal=document.getElementById('adminOrderDetailModal'),content=document.getElementById('adminOrderDetailContent');if(!order||!modal||!content)return;
  const customer=order.customer||{},address=order.address||{},items=Array.isArray(order.items)?order.items:[],ticketOnly=items.length>0&&items.every(item=>item.type==='event-ticket'),tracking=order.tracking||{},statusMeta=profileStatusMeta(order.status),payment=adminPaymentMeta(order.paymentStatus),domId=adminOrderDomId(order.id),email=customer.email||order.guestEmail||'',phone=customer.phone||'',phoneHref=String(phone).replace(/[^\d+]/g,''),remaining=Math.max(0,Number(order.total||0)-Number(order.refundedTotal||0));
  const itemRows=items.map(item=>{const qty=Number(item.qty)||1,details=adminOrderItemDetails(item),unit=Number(item.originalUnitPrice??item.price??0),line=Number(item.lineTotal??(unit*qty)),eventTicket=item.type==='event-ticket',typeLabel=eventTicket?'Billet':item.type==='bundle'?'Forfait':'Produit';return `<article class="admin-order-detail-item"><img src="${safeAttr(item.image||'logoarty.png')}" alt=""><div><span>${safeText(typeLabel)}</span><h4>${safeText(item.name||'Produit ARTY')}</h4><p>${eventTicket?`Accès pour ${qty} personne${qty>1?'s':''} · Prix par personne : $${toMoney(unit)}`:`Quantité : ${qty} · Prix unitaire : $${toMoney(unit)}`}</p>${details.length?`<ul>${details.map(detail=>`<li>${safeText(detail)}</li>`).join('')}</ul>`:''}</div><strong>$${toMoney(line)}</strong></article>`}).join('');
  const quantityLabel=ticketOnly?'Personnes admises':'Nombre d’articles';
  const history=(order.statusHistory||[]).slice().reverse().map(entry=>`<div class="admin-order-history-entry"><span></span><div><strong>${safeText(profileStatusMeta(entry.to).label)}</strong><small>${profileDate(entry.at,true)}</small></div></div>`).join('');
  const paymentProviderLabel=order.paymentProvider==='stripe'?'Stripe':order.paymentProvider&&order.paymentProvider!=='not_connected'?order.paymentProvider:'À confirmer';
  content.innerHTML=`<header class="admin-order-detail-head"><div><span>Commande ${safeText(order.id)}</span><h2 id="adminOrderDetailTitle">Détails de la commande</h2><p>Reçue le ${profileDate(order.createdAt,true)}</p></div><div><b class="account-status ${statusMeta.className}">${safeText(statusMeta.label)}</b><b class="admin-status ${payment.className}">${safeText(payment.label)}</b></div></header><div class="admin-order-detail-summary"><div>${profileIcon('receipt')}<span>Total de la commande<strong>$${toMoney(order.total)}</strong></span></div><div>${profileIcon('orders')}<span>${quantityLabel}<strong>${items.reduce((total,item)=>total+(Number(item.qty)||1),0)}</strong></span></div><div>${profileIcon('user')}<span>Type de commande<strong>${order.checkoutMode==='account'?'Compte client':'Commande invité'}</strong></span></div></div><div class="admin-order-detail-columns"><main><section class="admin-order-detail-card"><div class="admin-order-detail-title"><div>${profileIcon('user')}<h3>Informations du client</h3></div><span>Pour communiquer au besoin</span></div><div class="admin-customer-info"><div><span>Nom complet</span><strong>${safeText(customer.name||'Non indiqué')}</strong></div><div><span>Courriel</span><strong>${safeText(email||'Non indiqué')}</strong></div><div><span>Téléphone</span><strong>${safeText(phone||'Non indiqué')}</strong></div></div><div class="admin-contact-actions">${email?`<a href="mailto:${safeAttr(email)}">Envoyer un courriel</a>`:''}${phoneHref?`<a href="tel:${safeAttr(phoneHref)}">Appeler le client</a>`:''}</div></section><section class="admin-order-detail-card"><div class="admin-order-detail-title"><div>${profileIcon('location')}<h3>Adresse de livraison</h3></div><button type="button" onclick="copyAdminShippingAddress('${safeAttr(order.id)}')">Copier l’adresse</button></div><address><strong>${safeText(customer.name||'')}</strong><span>${safeText(address.line1||'Adresse non indiquée')}</span><span>${safeText([address.city,address.province,address.postal].filter(Boolean).join(', '))}</span><span>${safeText(address.country||'')}</span></address>${address.notes?`<div class="admin-shipping-note"><strong>Instructions de livraison</strong><p>${safeText(address.notes)}</p></div>`:''}</section><section class="admin-order-detail-card"><div class="admin-order-detail-title"><div>${profileIcon('orders')}<h3>Produits commandés</h3></div><span>${items.length} produit${items.length>1?'s':''}</span></div><div class="admin-order-detail-items">${itemRows||'<p class="admin-muted">Aucun produit enregistré.</p>'}</div><div class="admin-order-detail-totals"><div><span>Sous-total</span><strong>$${toMoney(order.subtotal??order.total)}</strong></div>${Number(order.discountTotal)>0?`<div class="discount"><span>Rabais</span><strong>− $${toMoney(order.discountTotal)}</strong></div>`:''}${Number(order.refundedTotal)>0?`<div><span>Montant remboursé</span><strong>− $${toMoney(order.refundedTotal)}</strong></div>`:''}<div class="total"><span>Total</span><strong>$${toMoney(order.total)}</strong></div></div></section></main><aside><section class="admin-order-detail-card admin-order-management"><div class="admin-order-detail-title"><div>${profileIcon('truck')}<h3>Statut et suivi</h3></div></div><div class="form-group"><label>Statut de la commande</label><select id="detailStatus-${domId}">${adminOrderStatusOptions(order.status)}</select></div><div class="form-group"><label>Transporteur</label><input id="detailCarrier-${domId}" value="${safeAttr(tracking.carrier||'')}" placeholder="Ex: Postes Canada"></div><div class="form-group"><label>Numéro de suivi</label><input id="detailNumber-${domId}" value="${safeAttr(tracking.number||'')}" placeholder="Numéro de suivi"></div><div class="form-group"><label>Livraison estimée</label><input id="detailDate-${domId}" type="date" value="${safeAttr(tracking.estimatedDelivery||'')}"></div><div class="form-group"><label>Lien de suivi</label><input id="detailUrl-${domId}" value="${safeAttr(tracking.url||'')}" placeholder="https://..."></div><button class="btn btn-teal" type="button" id="detailSave-${domId}" onclick="saveAdminOrderDetail('${safeAttr(order.id)}','${safeAttr(domId)}')">Enregistrer les changements</button></section><section class="admin-order-detail-card"><div class="admin-order-detail-title"><div>${profileIcon('receipt')}<h3>Paiement</h3></div></div><div class="admin-payment-details"><div><span>Statut</span><strong>${safeText(payment.label)}</strong></div><div><span>Mode</span><strong>${safeText(paymentProviderLabel)}</strong></div>${order.paymentReference?`<div><span>Référence</span><strong>${safeText(order.paymentReference)}</strong></div>`:''}</div>${remaining>0?`<button class="admin-refund-button" type="button" onclick="closeAdminOrderDetail();createRefund('${safeAttr(order.id)}')">Effectuer un remboursement</button>`:''}</section>${history?`<section class="admin-order-detail-card"><div class="admin-order-detail-title"><div>${profileIcon('receipt')}<h3>Historique</h3></div></div><div class="admin-order-history">${history}</div></section>`:''}</aside></div>`;
  modal.hidden=false;document.body.style.overflow='hidden';setTimeout(()=>modal.querySelector('.admin-order-detail-close')?.focus(),40);
}
function closeAdminOrderDetail(){const modal=document.getElementById('adminOrderDetailModal');if(modal)modal.hidden=true;document.body.style.overflow=''}
async function copyAdminShippingAddress(orderId){const order=(adminOrders||[]).find(item=>String(item.id)===String(orderId));if(!order)return;const customer=order.customer||{},address=order.address||{},value=[customer.name,address.line1,[address.city,address.province,address.postal].filter(Boolean).join(', '),address.country].filter(Boolean).join('\n');try{await navigator.clipboard.writeText(value);showToast('Adresse copiée','success')}catch{showToast('Impossible de copier l’adresse','error')}}
async function saveAdminOrderDetail(id,domId){const button=document.getElementById(`detailSave-${domId}`),status=document.getElementById(`detailStatus-${domId}`)?.value,tracking={carrier:document.getElementById(`detailCarrier-${domId}`)?.value.trim()||'',number:document.getElementById(`detailNumber-${domId}`)?.value.trim()||'',estimatedDelivery:document.getElementById(`detailDate-${domId}`)?.value||'',url:document.getElementById(`detailUrl-${domId}`)?.value.trim()||''};if(button){button.disabled=true;button.textContent='Enregistrement...'}try{const response=await fetch(`/api/admin/orders/${encodeURIComponent(id)}/status`,{method:'PUT',headers:authH(),body:JSON.stringify({status,tracking})});const data=await response.json().catch(()=>({}));if(!response.ok)return showToast(data.error||'Modification impossible','error');await loadAdminOrders();renderAdminOrders();openAdminOrderDetail(id);showToast('Commande mise à jour','success')}catch{showToast('Erreur de connexion','error')}finally{if(button){button.disabled=false;button.textContent='Enregistrer les changements'}}}
async function updateOrderStatus(id,status){try{const r=await fetch(`/api/admin/orders/${encodeURIComponent(id)}/status`,{method:'PUT',headers:authH(),body:JSON.stringify({status})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Statut mis à jour','success');await loadAdminOrders();renderAdminOrders()}catch{showToast('Erreur','error')}}
async function saveOrderTracking(id,domId){const order=adminOrders.find(item=>String(item.id)===String(id));if(!order)return;const tracking={carrier:document.getElementById(`trackCarrier-${domId}`)?.value.trim()||'',number:document.getElementById(`trackNumber-${domId}`)?.value.trim()||'',estimatedDelivery:document.getElementById(`trackDate-${domId}`)?.value||'',url:document.getElementById(`trackUrl-${domId}`)?.value.trim()||''};try{const r=await fetch(`/api/admin/orders/${encodeURIComponent(id)}/status`,{method:'PUT',headers:authH(),body:JSON.stringify({status:order.status,tracking})});const d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||'Erreur','error');showToast('Suivi enregistré','success');await loadAdminOrders();renderAdminOrders()}catch{showToast('Erreur','error')}}
document.addEventListener('keydown',event=>{const modal=document.getElementById('adminOrderDetailModal');if(event.key==='Escape'&&modal&&!modal.hidden)closeAdminOrderDetail()});

/* =========================================================
   EVENT TICKETS — customer tickets, guest list and check-in
   ========================================================= */
function ticketStatusMeta(status){
  const value=String(status||'valid');
  if(value==='cancelled')return {label:'Billet annulé',className:'cancelled'};
  return value==='checked_in'?{label:'Entrée confirmée',className:'checked'}:{label:'Billet valide',className:'valid'};
}

async function renderPublicTicket(code){
  const container=document.getElementById('ticketPageContent');if(!container)return;
  container.innerHTML='<div class="ticket-loading"><span></span><p>Chargement du billet...</p></div>';
  try{
    const response=await fetch(`/api/tickets/${encodeURIComponent(code)}`),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Billet non trouvé');
    const ticket=data.ticket||{},event=data.event||{},booking=data.booking||{},admissions=Math.max(1,Number(ticket.admissions)||1),eventCancelled=event.status==='cancelled',ticketCancelled=ticket.status==='cancelled',meta=eventCancelled?{label:'Événement annulé',className:'cancelled'}:ticketStatusMeta(ticket.status);
    const eventDate=event.date?new Date(`${event.date}T00:00:00`).toLocaleDateString('fr-CA',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'Date à confirmer';
    const emailNotice=lastTicketEmailStatus==='sent'
      ? '<div class="ticket-delivery-note success"><strong>Billets envoyés par courriel</strong><span>Une copie a été envoyée à l’adresse utilisée pour la réservation.</span></div>'
      : lastTicketEmailStatus
        ? '<div class="ticket-delivery-note warning"><strong>Votre billet est prêt</strong><span>Gardez cette page accessible. L’envoi par courriel n’a pas pu être complété.</span></div>'
        : '';
    container.innerHTML=`<button type="button" class="product-back ticket-back" onclick="navigate('#/party')">← Retour aux événements</button>
      ${eventCancelled?'<div class="ticket-delivery-note cancelled"><strong>Événement annulé</strong><span>Communiquez avec l’équipe ARTY pour les prochaines étapes.</span></div>':ticketCancelled?'<div class="ticket-delivery-note cancelled"><strong>Billet annulé</strong><span>Ce billet ne peut plus être utilisé à l’entrée.</span></div>':emailNotice}
      <div class="public-ticket-layout">
        <section class="public-ticket-card ${meta.className}">
          <header class="public-ticket-brand"><div><span>ARTY</span><small>Billet d’entrée</small></div><b class="ticket-status ${meta.className}">${safeText(meta.label)}</b></header>
          <div class="public-ticket-event"><span>${safeText(eventDate)} · ${safeText(event.time||'Heure à confirmer')}</span><h1>${safeText(event.title||'Événement ARTY')}</h1><p>${safeText(event.location||'Lieu à confirmer')}</p></div>
          <div class="public-ticket-holder"><span>Acheteur</span><strong>${safeText(ticket.holderName||booking.name||'Client ARTY')}</strong><small>Accès pour ${admissions} personne${admissions>1?'s':''}</small></div>
          <div class="public-ticket-tear" aria-hidden="true"><span></span></div>
          <div class="public-ticket-code"><img src="/api/tickets/${encodeURIComponent(ticket.code)}/barcode.svg" alt="Code-barres du billet"><strong>${safeText(ticket.code)}</strong><span>Présentez ce code une fois à l’entrée pour votre groupe de ${admissions} personne${admissions>1?'s':''}.</span></div>
          ${ticket.checkedInAt?`<footer class="public-ticket-checkin">Entrée confirmée le ${profileDate(ticket.checkedInAt,true)}</footer>`:''}
        </section>
        <aside class="public-ticket-info"><span>Votre arrivée</span><h2>Tout est prêt pour l’événement</h2><div><strong>Date et heure</strong><p>${safeText(eventDate)}<br>${safeText(event.time||'Heure à confirmer')}</p></div><div><strong>Lieu</strong><p>${safeText(event.location||'Lieu à confirmer')}</p></div>${event.hostNote?`<div><strong>Information importante</strong><p>${safeText(event.hostNote)}</p></div>`:''}<p class="public-ticket-help">Vous pouvez aussi retrouver tous vos billets dans votre profil si vous avez réservé en étant connecté.</p><button class="btn btn-ghost" type="button" onclick="window.print()">Imprimer le billet</button></aside>
      </div>`;
    lastTicketEmailStatus='';
  }catch(error){
    container.innerHTML=`<div class="ticket-not-found"><span>Billet</span><h1>Ce billet est introuvable</h1><p>${safeText(error.message||'Vérifiez le lien reçu par courriel.')}</p><button class="btn btn-orange" onclick="navigate('#/party')">Voir les événements</button></div>`;
  }
}

function renderProfileBookings(){
  const wrap=document.getElementById('bookingsWrap');if(!wrap)return;
  if(!profileBookings.length){wrap.innerHTML=`<div class="account-empty">${profileIcon('calendar')}<h3>Aucune réservation</h3><p>Réservez une activité ARTY et retrouvez vos billets ici.</p><button class="btn btn-orange" onclick="navigate('#/party')">Voir les événements</button></div>`;return}
  wrap.innerHTML=profileBookings.map(booking=>{
    const event=booking.event||{},tickets=Array.isArray(booking.tickets)?booking.tickets:[],admissions=tickets.reduce((sum,ticket)=>sum+Math.max(1,Number(ticket.admissions)||1),0),checked=tickets.filter(ticket=>ticket.status==='checked_in').reduce((sum,ticket)=>sum+Math.max(1,Number(ticket.admissions)||1),0),emailSent=booking.emailDelivery?.status==='sent';
    const day=event.date?new Date(`${event.date}T00:00:00`).toLocaleDateString('fr-CA',{day:'2-digit'}):'—',month=event.date?new Date(`${event.date}T00:00:00`).toLocaleDateString('fr-CA',{month:'short'}):'';
    return `<article class="account-booking-card account-ticket-booking"><div class="account-booking-date"><strong>${safeText(day)}</strong><span>${safeText(month)}</span></div><div class="account-booking-copy"><span class="account-booking-label">Accès pour ${admissions||Number(booking.guests)||1} personne${(admissions||Number(booking.guests)||1)>1?'s':''} · ${emailSent?'Courriel envoyé':'Disponible dans votre compte'}</span><h3>${safeText(event.title||'Événement ARTY')}</h3><p>${safeText(event.time||'Heure à confirmer')} · ${safeText(event.location||'Lieu à confirmer')}</p><div class="account-ticket-progress"><span style="width:${admissions?Math.round((checked/admissions)*100):0}%"></span></div><small>${checked?`Entrée confirmée pour ${checked} personne${checked>1?'s':''}`:'Billet prêt à être présenté'}</small></div><button type="button" onclick="openProfileTickets('${safeAttr(booking.id)}')">Voir le billet</button></article>`;
  }).join('');
}

function openProfileTickets(bookingId){
  const booking=profileBookings.find(item=>String(item.id)===String(bookingId));if(!booking)return;
  closeProfileTickets();
  const event=booking.event||{},modal=document.createElement('div');modal.id='profileTicketModal';modal.className='profile-ticket-modal';
  const tickets=(booking.tickets||[]).map((ticket,index)=>{const meta=ticketStatusMeta(ticket.status),admissions=Math.max(1,Number(ticket.admissions)||1),label=admissions>1?`Accès pour ${admissions} personnes`:`Billet ${index+1} sur ${booking.tickets.length}`;return `<article class="profile-ticket-mini"><div><span>${safeText(label)}</span><b class="ticket-status ${meta.className}">${safeText(meta.label)}</b></div><h3>${safeText(ticket.holderName)}</h3><img src="/api/tickets/${encodeURIComponent(ticket.code)}/barcode.svg" alt="Code-barres du billet"><code>${safeText(ticket.code)}</code><button type="button" onclick="closeProfileTickets();navigate('#/ticket/${encodeURIComponent(ticket.code)}')">Ouvrir ce billet</button></article>`}).join('');
  modal.innerHTML=`<button class="account-modal-backdrop" type="button" onclick="closeProfileTickets()" aria-label="Fermer"></button><section class="profile-ticket-sheet" role="dialog" aria-modal="true" aria-labelledby="profileTicketTitle"><button class="account-sheet-close" type="button" onclick="closeProfileTickets()" aria-label="Fermer">×</button><header><span>Réservation ${safeText(booking.id)}</span><h2 id="profileTicketTitle">${safeText(event.title||'Vos billets ARTY')}</h2><p>${event.date?safeText(formatEventDate(event,true)):'Date à confirmer'} · ${safeText(event.time||'Heure à confirmer')} · ${safeText(event.location||'Lieu à confirmer')}</p></header><div class="profile-ticket-grid">${tickets}</div></section>`;
  document.body.appendChild(modal);document.body.style.overflow='hidden';setTimeout(()=>modal.classList.add('active'),20);
}
function closeProfileTickets(){const modal=document.getElementById('profileTicketModal');if(!modal)return;modal.remove();document.body.style.overflow=''}

function adminEventBookings(eventId){return (adminBookings||[]).filter(booking=>String(booking.eventId)===String(eventId))}
function adminEventTicketCounts(eventId){const tickets=adminEventBookings(eventId).flatMap(booking=>booking.tickets||[]);return{total:tickets.reduce((sum,ticket)=>sum+Math.max(1,Number(ticket.admissions)||1),0),checked:tickets.filter(ticket=>ticket.status==='checked_in').reduce((sum,ticket)=>sum+Math.max(1,Number(ticket.admissions)||1),0)}}
function openAdminEventEditor(id){const editor=document.getElementById('adminEventEditor');if(editor)editor.open=true;setTimeout(()=>editEv(id),20)}
function selectAdminGuestEvent(id){adminGuestEventId=String(id||'');renderAdminEvents();setTimeout(()=>document.getElementById('adminGuestManager')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}
function filterAdminGuestList(value){const needle=String(value||'').trim().toLowerCase();document.querySelectorAll('[data-guest-search]').forEach(row=>{row.hidden=needle&&!row.dataset.guestSearch.includes(needle)})}

async function checkInAdminTicket(ticketId,checkedIn){
  try{const response=await fetch(`/api/admin/tickets/${encodeURIComponent(ticketId)}`,{method:'PATCH',headers:authH(),body:JSON.stringify({checkedIn})}),data=await response.json().catch(()=>({}));if(!response.ok)return showToast(data.error||'Validation impossible','error');await loadAdminBookings();renderAdminEvents();showToast(checkedIn?'Entrée confirmée':'Validation annulée','success')}catch{showToast('Erreur de connexion','error')}
}
async function submitTicketScan(event){
  event?.preventDefault();const input=document.getElementById('adminTicketScan'),code=input?.value.trim();if(!code)return showToast('Scannez ou entrez un code de billet','error');
  try{const response=await fetch('/api/admin/tickets/check-in',{method:'POST',headers:authH(),body:JSON.stringify({code})}),data=await response.json().catch(()=>({}));if(!response.ok)return showToast(data.error||'Billet invalide','error');adminGuestEventId=String(data.record?.event?.id||adminGuestEventId);await loadAdminBookings();renderAdminEvents();showToast(`${data.record?.ticket?.holderName||'Billet'} : entrée confirmée`,'success');setTimeout(()=>document.getElementById('adminTicketScan')?.focus(),30)}catch{showToast('Erreur de connexion','error')}
}
async function resendAdminTickets(bookingId){
  const button=Array.from(document.querySelectorAll('[data-resend-booking]')).find(element=>element.dataset.resendBooking===String(bookingId));if(button){button.disabled=true;button.textContent='Envoi...'}
  try{const response=await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/resend-ticket`,{method:'POST',headers:authH()}),data=await response.json().catch(()=>({}));if(!response.ok)return showToast(data.error||'Courriel non envoyé','error');await loadAdminBookings();renderAdminEvents();showToast('Billets renvoyés par courriel','success')}catch{showToast('Erreur de connexion','error')}finally{if(button){button.disabled=false;button.textContent='Renvoyer le courriel'}}
}

function renderAdminEvents(){
  const panel=document.getElementById('adminEventsPanel');if(!panel)return;
  if(!adminGuestEventId||!adminEvents.some(event=>String(event.id)===String(adminGuestEventId)))adminGuestEventId=adminEvents.length?String(adminEvents[0].id):'';
  const selectedEvent=adminEvents.find(event=>String(event.id)===String(adminGuestEventId)),selectedBookings=selectedEvent?adminEventBookings(selectedEvent.id):[];
  const totalTickets=(adminBookings||[]).flatMap(booking=>booking.tickets||[]),soldAdmissions=totalTickets.reduce((sum,ticket)=>sum+Math.max(1,Number(ticket.admissions)||1),0),checkedAdmissions=totalTickets.filter(ticket=>ticket.status==='checked_in').reduce((sum,ticket)=>sum+Math.max(1,Number(ticket.admissions)||1),0);
  const eventCards=(adminEvents||[]).map(event=>{const counts=adminEventTicketCounts(event.id),capacity=Number(event.maxSpots)||0,pct=capacity?Math.min(100,Math.round((counts.total/capacity)*100)):0;return `<article class="admin-managed-event ${String(event.id)===String(adminGuestEventId)?'selected':''}"><img src="${safeAttr(event.image||'photoacceuil.jpg')}" alt=""><div><span>${safeText(event.date?formatEventDate(event,true):'Date à confirmer')} · ${safeText(event.time||'')}</span><h4>${safeText(event.title)}</h4><p>${safeText(event.location||'Lieu à confirmer')}</p><div class="admin-event-capacity"><span style="width:${pct}%"></span></div><small>${counts.total} personne${counts.total>1?'s':''} · ${counts.checked} présence${counts.checked>1?'s':''} · ${safeText(event.status||'published')}</small></div><div class="admin-managed-actions"><button type="button" onclick="selectAdminGuestEvent('${safeAttr(event.id)}')">Liste d’invités</button><button type="button" onclick="openAdminEventEditor(${Number(event.id)})">Modifier</button><button type="button" class="danger" onclick="deleteEv(${Number(event.id)})">Supprimer</button></div></article>`}).join('');
  const guestRows=selectedBookings.flatMap(booking=>(booking.tickets||[]).map(ticket=>{const checked=ticket.status==='checked_in',cancelled=ticket.status==='cancelled',admissions=Math.max(1,Number(ticket.admissions)||1),search=[ticket.holderName,booking.name,booking.email,booking.phone,ticket.code].join(' ').toLowerCase();return `<tr data-guest-search="${safeAttr(search)}"><td><strong>${safeText(ticket.holderName)}</strong><span>${safeText(ticket.code)}</span><small>Accès pour ${admissions} personne${admissions>1?'s':''}</small></td><td><strong>${safeText(booking.name)}</strong><span>${safeText(booking.email)}${booking.phone?` · ${safeText(booking.phone)}`:''}</span></td><td><span class="admin-ticket-state ${cancelled?'cancelled':checked?'checked':'valid'}">${cancelled?'Annulé':checked?'Présent':'À venir'}</span>${checked&&ticket.checkedInAt?`<small>${profileDate(ticket.checkedInAt,true)}</small>`:''}</td><td>${cancelled?'<span class="admin-ticket-unavailable">Aucune entrée</span>':`<button class="admin-checkin-button ${checked?'undo':''}" type="button" onclick="checkInAdminTicket('${safeAttr(ticket.id)}',${checked?'false':'true'})">${checked?`Annuler (${admissions})`:`Confirmer ${admissions} entrée${admissions>1?'s':''}`}</button>`}</td></tr>`})).join('');
  const selectedCounts=selectedEvent?adminEventTicketCounts(selectedEvent.id):{total:0,checked:0};
  const bookingContacts=selectedBookings.map(booking=>`<article class="admin-booking-contact"><div><strong>${safeText(booking.name)}</strong><span>${safeText(booking.email)}${booking.phone?` · ${safeText(booking.phone)}`:''}</span><small>Accès pour ${booking.guests} personne${booking.guests>1?'s':''} · Total $${toMoney(booking.total)}</small></div><div><span class="admin-email-state ${booking.emailDelivery?.status==='sent'?'sent':'attention'}">${booking.emailDelivery?.status==='sent'?'Courriel envoyé':'Courriel à vérifier'}</span><button type="button" data-resend-booking="${safeAttr(booking.id)}" onclick="resendAdminTickets('${safeAttr(booking.id)}')">Renvoyer le courriel</button></div></article>`).join('');
  const requestRows=(eventRequests||[]).map(request=>`<tr><td><strong>${safeText(request.name)}</strong><br><small>${safeText(request.email)}${request.phone?` · ${safeText(request.phone)}`:''}</small></td><td>${safeText(request.eventType)}<br><small>${request.preferredDate?safeText(request.preferredDate):'Date flexible'} · ${Number(request.guests)||'?'} pers.</small></td><td>${safeText(request.location||'À confirmer')}</td><td><span class="admin-status-badge">${safeText(request.status||'nouvelle')}</span></td><td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="updateEventRequestStatus(${Number(request.id)},'contactée')">Contactée</button><button class="admin-btn admin-btn-delete" onclick="deleteEventRequest(${Number(request.id)})">Supprimer</button></div></td></tr>`).join('');
  panel.innerHTML=`<div class="admin-events-heading"><div><span>Billetterie et événements</span><h3>Gestion des invités</h3><p>Gérez les événements, retrouvez chaque participant et confirmez les entrées à partir de la même section.</p></div><button class="btn btn-orange" type="button" onclick="document.getElementById('adminEventEditor').open=true;document.getElementById('adminEventEditor').scrollIntoView({behavior:'smooth'})">Créer un événement</button></div>
    ${!ticketEmailConfigured?'<div class="admin-ticket-config"><strong>Envoi automatique des billets à configurer</strong><p>Ajoutez RESEND_API_KEY, TICKET_EMAIL_FROM et ARTY_PUBLIC_URL dans Render pour activer les courriels.</p></div>':''}
    <div class="admin-event-dashboard admin-ticket-dashboard"><div class="admin-event-card"><span>${adminEvents.filter(event=>(event.status||'published')==='published').length}</span><p>Événements publiés</p></div><div class="admin-event-card"><span>${soldAdmissions}</span><p>Places vendues</p></div><div class="admin-event-card"><span>${checkedAdmissions}</span><p>Entrées confirmées</p></div><div class="admin-event-card"><span>${eventRequests.filter(request=>(request.status||'nouvelle')==='nouvelle').length}</span><p>Demandes privées</p></div></div>
    <section class="admin-event-list"><div class="admin-section-title"><h3>Événements</h3><p>Sélectionnez un événement pour ouvrir sa liste d’invités.</p></div><div class="admin-managed-events">${eventCards||'<div class="admin-empty-panel">Aucun événement créé.</div>'}</div></section>
    <section class="admin-guest-manager" id="adminGuestManager"><div class="admin-guest-head"><div><span>Contrôle des entrées</span><h3>${safeText(selectedEvent?.title||'Liste d’invités')}</h3><p>${selectedEvent?`${safeText(formatEventDate(selectedEvent,true))} · ${safeText(selectedEvent.time||'')} · ${safeText(selectedEvent.location||'Lieu à confirmer')}`:'Créez un événement pour commencer.'}</p></div><div class="admin-guest-totals"><strong>${selectedCounts.checked}<small>/ ${selectedCounts.total}</small></strong><span>présences</span></div></div>
      <div class="admin-guest-tools"><select aria-label="Événement" onchange="selectAdminGuestEvent(this.value)">${adminEvents.map(event=>`<option value="${safeAttr(event.id)}" ${String(event.id)===String(adminGuestEventId)?'selected':''}>${safeText(event.title)} · ${safeText(event.date||'')}</option>`).join('')}</select><input type="search" placeholder="Rechercher un nom, courriel ou billet" oninput="filterAdminGuestList(this.value)"><form onsubmit="submitTicketScan(event)"><input id="adminTicketScan" autocomplete="off" placeholder="Scanner ou entrer le code"><button type="submit">Valider</button></form></div>
      <div class="admin-table-wrap admin-guest-table"><table class="admin-table"><thead><tr><th>Participant et billet</th><th>Acheteur</th><th>Présence</th><th>Action</th></tr></thead><tbody>${guestRows||'<tr><td colspan="4" class="admin-muted">Aucun billet pour cet événement.</td></tr>'}</tbody></table></div>
      ${selectedBookings.length?`<details class="admin-booking-contacts"><summary>Coordonnées et envoi des billets (${selectedBookings.length})</summary><div>${bookingContacts}</div></details>`:''}
    </section>
    <details class="admin-event-editor admin-event-builder" id="adminEventEditor"><summary><span><strong>Créer ou modifier un événement</strong><small>Date, capacité, prix et informations publiques</small></span></summary><div class="admin-event-editor-body"><div class="admin-form-head"><div><h3 id="evFormTitle">Publier un événement</h3><p>Renseignez toutes les informations affichées au client.</p></div><button class="btn btn-ghost btn-sm" type="button" onclick="resetEvForm()">Nouveau</button></div><input type="hidden" id="editEvId"><div class="form-row"><div class="form-group"><label>Titre</label><input type="text" id="aEvTitle"></div><div class="form-group"><label>Type</label><select id="aEvType"><option>Atelier public</option><option>Famille</option><option>Couple</option><option>Enfants</option><option>Privé</option></select></div></div><div class="form-group"><label>Description</label><textarea id="aEvDesc"></textarea></div><div class="form-row"><div class="form-group"><label>Date</label><input type="date" id="aEvDate"></div><div class="form-group"><label>Heure</label><input type="time" id="aEvTime" value="18:00"></div><div class="form-group"><label>Durée</label><input type="text" id="aEvDur" placeholder="2 heures"></div></div><div class="form-row"><div class="form-group"><label>Prix par personne ($)</label><input type="number" id="aEvPrice" min="0" step="0.01"></div><div class="form-group"><label>Capacité</label><input type="number" id="aEvSpots" min="1"></div><div class="form-group"><label>Statut</label><select id="aEvStatus"><option value="published">Publié</option><option value="draft">Brouillon</option><option value="cancelled">Annulé</option></select></div></div><div class="form-row"><div class="form-group"><label>Lieu</label><input type="text" id="aEvLoc"></div><div class="form-group"><label>Image</label><input type="text" id="aEvImg" placeholder="URL de l’image"></div></div><div class="form-group"><label>Ce qui est inclus</label><input type="text" id="aEvIncludes" placeholder="Toile, peinture, pinceaux"></div><div class="form-group"><label>Information importante</label><input type="text" id="aEvHostNote"></div><label class="catalog-check"><input type="checkbox" id="aEvFeatured"> Mettre en avant</label><div class="admin-editor-actions"><button class="btn btn-orange" type="button" onclick="saveEv()">Enregistrer l’événement</button><button class="btn btn-ghost" type="button" onclick="resetEvForm()" style="display:none" id="cancelEv">Annuler</button></div></div></details>
    <div class="admin-section-title"><h3>Demandes d’événements privés</h3><p>Demandes sur mesure à traiter par votre équipe.</p></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Client</th><th>Projet</th><th>Lieu</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${requestRows||'<tr><td colspan="5" class="admin-muted">Aucune demande privée.</td></tr>'}</tbody></table></div>`;
}

document.addEventListener('keydown',event=>{if(event.key==='Escape')closeProfileTickets()});
