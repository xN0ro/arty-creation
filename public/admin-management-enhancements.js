(() => {
  'use strict';
  if (window.__ARTY_ADMIN_MANAGEMENT_ENHANCED__) return;
  window.__ARTY_ADMIN_MANAGEMENT_ENHANCED__ = true;

  const productState = { query:'', category:'all', availability:'all', sort:'name-asc' };
  const inventoryState = { query:'', category:'all', status:'all', sort:'name-asc' };
  const orderState = { query:'', status:'all', payment:'all', kind:'all', sort:'newest' };
  let productEditorOpen = false;

  const tr = (fr,en) => {
    try { return I18n.language?.() === 'en' ? en : fr; } catch { return fr; }
  };
  const clean = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const categoryIds = kit => {
    const ids = Array.isArray(kit?.categoryIds) ? [...kit.categoryIds] : [];
    if (kit?.categoryId !== undefined && kit?.categoryId !== null && !ids.map(String).includes(String(kit.categoryId))) ids.unshift(kit.categoryId);
    return ids.filter(value => value !== undefined && value !== null && value !== '').map(String);
  };
  const categoryName = id => {
    const category = (allCategories || []).find(item => String(item.id) === String(id));
    return category ? (I18n.field?.(category,'name') || category.name || '') : '';
  };
  const kitName = kit => I18n.field?.(kit,'name') || kit?.name || '';
  const rawKitSearch = kit => clean([
    kit?.id, kit?.name, kit?.translations?.en?.name, kit?.shortDesc, kit?.translations?.en?.shortDesc,
    ...categoryIds(kit).map(categoryName)
  ].join(' '));
  const kitStockStatus = kit => {
    const qty = Number(kit?.stockQty);
    if (kit?.inStock === false || (Number.isFinite(qty) && qty <= 0)) return 'out';
    if (kit?.isLowStock === true || (Number.isFinite(qty) && qty <= Number(kit?.lowStockThreshold ?? 3))) return 'low';
    return 'available';
  };

  function injectStyles(){
    if (document.getElementById('artyAdminManagementStyles')) return;
    const style = document.createElement('style');
    style.id = 'artyAdminManagementStyles';
    style.textContent = `
      .admin-management-shell{display:grid;gap:14px;margin-bottom:16px}
      .admin-management-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:20px 22px;border:1px solid rgba(44,36,24,.08);border-radius:20px;background:linear-gradient(135deg,#fff,#fbfaf7);box-shadow:0 8px 28px rgba(44,36,24,.045)}
      .admin-management-head>div:first-child{min-width:0}
      .admin-management-eyebrow{display:block;margin-bottom:4px;color:var(--teal);font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.11em}
      .admin-management-head h3{margin:0;color:var(--text);font-size:1.35rem;letter-spacing:-.3px}
      .admin-management-head p{max-width:720px;margin:5px 0 0;color:var(--text-light);font-size:.83rem;line-height:1.5}
      .admin-management-primary{display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;min-height:42px;padding:10px 15px;border-radius:13px;background:var(--orange);color:#fff;font-weight:900;box-shadow:0 8px 20px rgba(232,134,58,.18);transition:var(--tr)}
      .admin-management-primary:hover{transform:translateY(-1px);box-shadow:0 11px 25px rgba(232,134,58,.24)}
      .admin-management-primary span{font-size:1.15rem;line-height:1}
      .admin-management-toolbar{display:grid;grid-template-columns:minmax(240px,1.6fr) repeat(3,minmax(145px,.65fr));gap:10px;padding:12px;border:1px solid rgba(44,36,24,.08);border-radius:18px;background:#fff;box-shadow:0 7px 22px rgba(44,36,24,.035)}
      .admin-management-search{position:relative;display:flex;align-items:center}
      .admin-management-search svg{position:absolute;left:13px;width:17px;height:17px;fill:none;stroke:var(--teal);stroke-width:2;pointer-events:none}
      .admin-management-toolbar input,.admin-management-toolbar select{width:100%;height:44px;padding:0 12px;border:1px solid rgba(44,36,24,.12);border-radius:12px;background:#fbfaf7;color:var(--text);font:inherit;font-size:.82rem;outline:none;transition:var(--tr)}
      .admin-management-toolbar input{padding-left:40px}
      .admin-management-toolbar input:focus,.admin-management-toolbar select:focus{border-color:rgba(27,154,170,.55);box-shadow:0 0 0 3px rgba(27,154,170,.08);background:#fff}
      .admin-management-results{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 4px;color:var(--text-light);font-size:.76rem}
      .admin-management-results strong{color:var(--text);font-weight:900}
      .admin-management-empty{padding:36px 20px;text-align:center;color:var(--text-light)}
      #adminKitsPanel .admin-product-editor[hidden]{display:none!important}
      #adminKitsPanel .admin-product-editor{margin-top:18px;border:1px solid rgba(27,154,170,.16);box-shadow:0 18px 50px rgba(31,80,89,.08)}
      #adminKitsPanel .admin-table-wrap{margin-top:0}
      #adminKitsPanel .admin-product-cell img{width:54px;height:54px;object-fit:cover;border-radius:10px;background:#f6f3ed}
      .admin-management-close-editor{display:inline-flex!important}
      .admin-order-row[hidden],#adminKitsPanel tbody tr[hidden],#adminInventoryPanel tbody tr[hidden]{display:none!important}
      .admin-orders-table tbody tr,.admin-table-wrap tbody tr{transition:opacity .15s ease,background .15s ease}
      @media(max-width:1050px){.admin-management-toolbar{grid-template-columns:minmax(220px,1.4fr) repeat(2,minmax(140px,.7fr))}.admin-management-toolbar>*:last-child{grid-column:auto}}
      @media(max-width:760px){
        .admin-management-head{align-items:stretch;flex-direction:column;padding:16px}
        .admin-management-primary{justify-content:center;width:100%}
        .admin-management-toolbar{grid-template-columns:1fr}
        .admin-management-results{align-items:flex-start;flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }

  const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>';

  function categoryOptions(selected){
    return '<option value="all">'+esc(tr('Toutes les catégories','All categories'))+'</option>' +
      (allCategories || []).map(category => '<option value="'+esc(category.id)+'" '+(String(selected)===String(category.id)?'selected':'')+'>'+esc(I18n.field?.(category,'name') || category.name || '')+'</option>').join('');
  }

  function productToolbarHTML(){
    return `<div class="admin-management-shell" id="adminProductManagement">
      <div class="admin-management-head">
        <div><span class="admin-management-eyebrow">${esc(tr('Catalogue','Catalog'))}</span><h3>${esc(tr('Gérer les produits','Manage products'))}</h3><p>${esc(tr('Recherchez, filtrez et modifiez rapidement vos produits sans parcourir toute la page.','Search, filter and edit products quickly without scrolling through the entire page.'))}</p></div>
        <button type="button" class="admin-management-primary" onclick="openAdminProductCreator()"><span>＋</span>${esc(tr('Ajouter un produit','Add product'))}</button>
      </div>
      <div class="admin-management-toolbar">
        <label class="admin-management-search">${searchIcon}<input id="adminProductSearch" type="search" value="${esc(productState.query)}" placeholder="${esc(tr('Rechercher un produit, une catégorie...','Search product, category...'))}" oninput="adminManagementUpdateProducts()"></label>
        <select id="adminProductCategory" onchange="adminManagementUpdateProducts()">${categoryOptions(productState.category)}</select>
        <select id="adminProductAvailability" onchange="adminManagementUpdateProducts()">
          <option value="all" ${productState.availability==='all'?'selected':''}>${esc(tr('Tous les statuts','All statuses'))}</option>
          <option value="available" ${productState.availability==='available'?'selected':''}>${esc(tr('En stock','In stock'))}</option>
          <option value="low" ${productState.availability==='low'?'selected':''}>${esc(tr('Stock bas','Low stock'))}</option>
          <option value="out" ${productState.availability==='out'?'selected':''}>${esc(tr('Épuisé','Out of stock'))}</option>
          <option value="featured" ${productState.availability==='featured'?'selected':''}>${esc(tr('Produits populaires','Featured products'))}</option>
        </select>
        <select id="adminProductSort" onchange="adminManagementUpdateProducts()">
          <option value="name-asc" ${productState.sort==='name-asc'?'selected':''}>A → Z</option>
          <option value="name-desc" ${productState.sort==='name-desc'?'selected':''}>Z → A</option>
          <option value="price-asc" ${productState.sort==='price-asc'?'selected':''}>${esc(tr('Prix : plus bas','Price: low to high'))}</option>
          <option value="price-desc" ${productState.sort==='price-desc'?'selected':''}>${esc(tr('Prix : plus élevé','Price: high to low'))}</option>
        </select>
      </div>
      <div class="admin-management-results"><span id="adminProductResultCount"></span><span>${esc(tr((allKits||[]).length+' produits au total',(allKits||[]).length+' total products'))}</span></div>
    </div>`;
  }

  function enhanceProducts(){
    const panel=document.getElementById('adminKitsPanel'); if(!panel) return;
    panel.querySelector('#adminProductManagement')?.remove();
    const editor=panel.querySelector('.admin-product-editor');
    const table=panel.querySelector('.admin-table-wrap');
    if(!editor || !table) return;
    table.insertAdjacentHTML('beforebegin',productToolbarHTML());
    const management=panel.querySelector('#adminProductManagement');
    if(management)panel.insertBefore(management,panel.firstChild);
    if(management)management.insertAdjacentElement('afterend',editor);
    editor.insertAdjacentElement('afterend',table);
    editor.id='adminProductEditor';
    editor.hidden=!productEditorOpen;
    const cancel=document.getElementById('cancelKit');
    if(cancel){
      cancel.style.display=productEditorOpen?'inline-flex':'none';
      cancel.textContent=tr('Fermer','Close');
      cancel.classList.add('admin-management-close-editor');
      cancel.onclick=window.closeAdminProductEditor;
    }
    const rows=[...table.querySelectorAll('tbody tr')];
    rows.forEach((row,index)=>{
      const kit=(allKits||[])[index]; if(!kit)return;
      row.dataset.productId=String(kit.id);
      row.dataset.search=rawKitSearch(kit);
      row.dataset.categories=categoryIds(kit).join(',');
      row.dataset.stock=kitStockStatus(kit);
      row.dataset.featured=kit.featured?'true':'false';
    });
    window.adminManagementUpdateProducts();
  }

  function applyProductFilters(){
    const panel=document.getElementById('adminKitsPanel');if(!panel)return;
    const search=document.getElementById('adminProductSearch'),category=document.getElementById('adminProductCategory'),availability=document.getElementById('adminProductAvailability'),sort=document.getElementById('adminProductSort');
    if(search)productState.query=search.value;
    if(category)productState.category=category.value;
    if(availability)productState.availability=availability.value;
    if(sort)productState.sort=sort.value;
    const query=clean(productState.query), tbody=panel.querySelector('.admin-table-wrap tbody');
    if(!tbody)return;
    const rows=[...tbody.querySelectorAll('tr[data-product-id]')];
    const kitMap=new Map((allKits||[]).map(kit=>[String(kit.id),kit]));
    rows.forEach(row=>{
      const kit=kitMap.get(row.dataset.productId),cats=(row.dataset.categories||'').split(',').filter(Boolean);
      const matchQuery=!query || (row.dataset.search||'').includes(query);
      const matchCategory=productState.category==='all' || cats.includes(String(productState.category));
      const matchAvailability=productState.availability==='all' ||
        (productState.availability==='featured' ? row.dataset.featured==='true' : row.dataset.stock===productState.availability);
      row.hidden=!(matchQuery&&matchCategory&&matchAvailability);
      row._artyKit=kit;
    });
    const compare=(a,b)=>{
      const ka=a._artyKit||{},kb=b._artyKit||{};
      if(productState.sort==='price-asc')return Number(ka.price||0)-Number(kb.price||0);
      if(productState.sort==='price-desc')return Number(kb.price||0)-Number(ka.price||0);
      const cmp=kitName(ka).localeCompare(kitName(kb),undefined,{sensitivity:'base'});
      return productState.sort==='name-desc'?-cmp:cmp;
    };
    rows.sort(compare).forEach(row=>tbody.appendChild(row));
    const visible=rows.filter(row=>!row.hidden).length;
    const count=document.getElementById('adminProductResultCount');
    if(count)count.innerHTML='<strong>'+visible+'</strong> '+esc(tr(visible===1?'produit affiché':'produits affichés',visible===1?'product shown':'products shown'));
  }

  function inventoryToolbarHTML(){
    return `<div class="admin-management-shell" id="adminInventoryManagement">
      <div class="admin-management-head"><div><span class="admin-management-eyebrow">${esc(tr('Stock','Inventory'))}</span><h3>${esc(tr('Gestion de l’inventaire','Inventory management'))}</h3><p>${esc(tr('Trouvez rapidement un produit et concentrez-vous sur les articles à faible stock ou épuisés.','Find a product quickly and focus on low-stock or out-of-stock items.'))}</p></div></div>
      <div class="admin-management-toolbar">
        <label class="admin-management-search">${searchIcon}<input id="adminInventorySearch" type="search" value="${esc(inventoryState.query)}" placeholder="${esc(tr('Rechercher dans l’inventaire...','Search inventory...'))}" oninput="adminManagementUpdateInventory()"></label>
        <select id="adminInventoryCategory" onchange="adminManagementUpdateInventory()">${categoryOptions(inventoryState.category)}</select>
        <select id="adminInventoryStatus" onchange="adminManagementUpdateInventory()">
          <option value="all" ${inventoryState.status==='all'?'selected':''}>${esc(tr('Tout le stock','All inventory'))}</option>
          <option value="available" ${inventoryState.status==='available'?'selected':''}>${esc(tr('En stock','In stock'))}</option>
          <option value="low" ${inventoryState.status==='low'?'selected':''}>${esc(tr('Stock bas','Low stock'))}</option>
          <option value="out" ${inventoryState.status==='out'?'selected':''}>${esc(tr('Épuisé','Out of stock'))}</option>
        </select>
        <select id="adminInventorySort" onchange="adminManagementUpdateInventory()">
          <option value="name-asc" ${inventoryState.sort==='name-asc'?'selected':''}>A → Z</option>
          <option value="stock-asc" ${inventoryState.sort==='stock-asc'?'selected':''}>${esc(tr('Stock : plus bas','Stock: low to high'))}</option>
          <option value="stock-desc" ${inventoryState.sort==='stock-desc'?'selected':''}>${esc(tr('Stock : plus élevé','Stock: high to low'))}</option>
        </select>
      </div>
      <div class="admin-management-results"><span id="adminInventoryResultCount"></span><span>${esc(tr((allKits||[]).length+' produits suivis',(allKits||[]).length+' tracked products'))}</span></div>
    </div>`;
  }

  function enhanceInventory(){
    const panel=document.getElementById('adminInventoryPanel');if(!panel)return;
    panel.querySelector('#adminInventoryManagement')?.remove();
    const intro=panel.querySelector('.admin-form-card'),table=panel.querySelector('.admin-table-wrap');
    if(!table)return;
    if(intro)intro.style.display='none';
    table.insertAdjacentHTML('beforebegin',inventoryToolbarHTML());
    [...table.querySelectorAll('tbody tr')].forEach((row,index)=>{
      const kit=(allKits||[])[index];if(!kit)return;
      row.dataset.productId=String(kit.id);
      row.dataset.search=rawKitSearch(kit);
      row.dataset.categories=categoryIds(kit).join(',');
      row.dataset.stock=kitStockStatus(kit);
    });
    window.adminManagementUpdateInventory();
  }

  function applyInventoryFilters(){
    const panel=document.getElementById('adminInventoryPanel');if(!panel)return;
    const search=document.getElementById('adminInventorySearch'),category=document.getElementById('adminInventoryCategory'),status=document.getElementById('adminInventoryStatus'),sort=document.getElementById('adminInventorySort');
    if(search)inventoryState.query=search.value;if(category)inventoryState.category=category.value;if(status)inventoryState.status=status.value;if(sort)inventoryState.sort=sort.value;
    const query=clean(inventoryState.query),tbody=panel.querySelector('.admin-table-wrap tbody');if(!tbody)return;
    const rows=[...tbody.querySelectorAll('tr[data-product-id]')],kitMap=new Map((allKits||[]).map(kit=>[String(kit.id),kit]));
    rows.forEach(row=>{
      const cats=(row.dataset.categories||'').split(',').filter(Boolean);
      row.hidden=!((!query||(row.dataset.search||'').includes(query))&&(inventoryState.category==='all'||cats.includes(String(inventoryState.category)))&&(inventoryState.status==='all'||row.dataset.stock===inventoryState.status));
      row._artyKit=kitMap.get(row.dataset.productId);
    });
    rows.sort((a,b)=>{
      const ka=a._artyKit||{},kb=b._artyKit||{};
      if(inventoryState.sort.startsWith('stock-')){
        const qa=Number.isFinite(Number(ka.stockQty))?Number(ka.stockQty):999999,qb=Number.isFinite(Number(kb.stockQty))?Number(kb.stockQty):999999;
        return inventoryState.sort==='stock-desc'?qb-qa:qa-qb;
      }
      return kitName(ka).localeCompare(kitName(kb),undefined,{sensitivity:'base'});
    }).forEach(row=>tbody.appendChild(row));
    const visible=rows.filter(row=>!row.hidden).length,count=document.getElementById('adminInventoryResultCount');
    if(count)count.innerHTML='<strong>'+visible+'</strong> '+esc(tr(visible===1?'produit affiché':'produits affichés',visible===1?'product shown':'products shown'));
  }

  const orderStatusOptions = selected => [
    ['all',tr('Tous les statuts','All statuses')],
    ['en attente de paiement',tr('En attente de paiement','Awaiting payment')],
    ['payée',tr('Payée','Paid')],
    ['préparation',tr('Préparation','Preparing')],
    ['expédiée',tr('Expédiée','Shipped')],
    ['livrée',tr('Livrée','Delivered')],
    ['annulée',tr('Annulée','Cancelled')],
    ['remboursée',tr('Remboursée','Refunded')]
  ].map(([value,label])=>'<option value="'+esc(value)+'" '+(selected===value?'selected':'')+'>'+esc(label)+'</option>').join('');
  const paymentOptions = selected => [
    ['all',tr('Tous les paiements','All payments')],['paid',tr('Paiement confirmé','Paid')],['pending',tr('En attente','Pending')],
    ['processing',tr('En traitement','Processing')],['cancelled',tr('Annulé','Cancelled')],['refunded',tr('Remboursé','Refunded')]
  ].map(([value,label])=>'<option value="'+esc(value)+'" '+(selected===value?'selected':'')+'>'+esc(label)+'</option>').join('');

  function orderToolbarHTML(){
    return `<div class="admin-management-shell" id="adminOrderManagement">
      <div class="admin-management-toolbar">
        <label class="admin-management-search">${searchIcon}<input id="adminOrderSearch" type="search" value="${esc(orderState.query)}" placeholder="${esc(tr('Commande, client, courriel, produit ou événement...','Order, customer, email, product or event...'))}" oninput="adminManagementUpdateOrders()"></label>
        <select id="adminOrderStatusFilter" onchange="adminManagementUpdateOrders()">${orderStatusOptions(orderState.status)}</select>
        <select id="adminOrderPaymentFilter" onchange="adminManagementUpdateOrders()">${paymentOptions(orderState.payment)}</select>
        <select id="adminOrderKindFilter" onchange="adminManagementUpdateOrders()">
          <option value="all" ${orderState.kind==='all'?'selected':''}>${esc(tr('Réelles + tests','Real + test'))}</option>
          <option value="real" ${orderState.kind==='real'?'selected':''}>${esc(tr('Ventes réelles','Real sales'))}</option>
          <option value="test" ${orderState.kind==='test'?'selected':''}>${esc(tr('Commandes TEST','TEST orders'))}</option>
        </select>
      </div>
      <div class="admin-management-results"><span id="adminOrderResultCount"></span><label>${esc(tr('Trier :','Sort:'))} <select id="adminOrderSort" onchange="adminManagementUpdateOrders()" style="margin-left:6px;border:0;background:transparent;font-weight:800;color:var(--teal)">
        <option value="newest" ${orderState.sort==='newest'?'selected':''}>${esc(tr('plus récentes','newest'))}</option>
        <option value="oldest" ${orderState.sort==='oldest'?'selected':''}>${esc(tr('plus anciennes','oldest'))}</option>
        <option value="total-desc" ${orderState.sort==='total-desc'?'selected':''}>${esc(tr('montant élevé','highest total'))}</option>
      </select></label></div>
    </div>`;
  }

  function orderSearchText(order){
    const customer=order?.customer||{},address=order?.address||{};
    const items=(order?.items||[]).flatMap(item=>[
      item?.name,item?.customData?.eventLabel,item?.customData?.eventLocation,item?.customData?.selectionLabel,
      ...(item?.customData?.guestNames||[])
    ]);
    return clean([order?.id,customer.name,customer.email,order?.guestEmail,customer.phone,address.city,address.province,...items].join(' '));
  }

  function enhanceOrders(){
    const panel=document.getElementById('adminOrdersPanel');if(!panel)return;
    panel.querySelector('#adminOrderManagement')?.remove();
    const table=panel.querySelector('.admin-orders-table');if(!table)return;
    table.insertAdjacentHTML('beforebegin',orderToolbarHTML());
    [...table.querySelectorAll('tbody .admin-order-row')].forEach((row,index)=>{
      const order=(adminOrders||[])[index];if(!order)return;
      row.dataset.orderId=String(order.id);
      row.dataset.search=orderSearchText(order);
      row.dataset.status=String(order.status||'');
      row.dataset.payment=String(order.paymentStatus||'pending');
      row.dataset.kind=order.isTest?'test':'real';
    });
    window.adminManagementUpdateOrders();
  }

  function applyOrderFilters(){
    const panel=document.getElementById('adminOrdersPanel');if(!panel)return;
    const search=document.getElementById('adminOrderSearch'),status=document.getElementById('adminOrderStatusFilter'),payment=document.getElementById('adminOrderPaymentFilter'),kind=document.getElementById('adminOrderKindFilter'),sort=document.getElementById('adminOrderSort');
    if(search)orderState.query=search.value;if(status)orderState.status=status.value;if(payment)orderState.payment=payment.value;if(kind)orderState.kind=kind.value;if(sort)orderState.sort=sort.value;
    const query=clean(orderState.query),tbody=panel.querySelector('.admin-orders-table tbody');if(!tbody)return;
    const rows=[...tbody.querySelectorAll('.admin-order-row[data-order-id]')],orderMap=new Map((adminOrders||[]).map(order=>[String(order.id),order]));
    rows.forEach(row=>{
      const match=(!query||(row.dataset.search||'').includes(query))&&(orderState.status==='all'||row.dataset.status===orderState.status)&&(orderState.payment==='all'||row.dataset.payment===orderState.payment)&&(orderState.kind==='all'||row.dataset.kind===orderState.kind);
      row.hidden=!match;row._artyOrder=orderMap.get(row.dataset.orderId);
    });
    rows.sort((a,b)=>{
      const oa=a._artyOrder||{},ob=b._artyOrder||{};
      if(orderState.sort==='total-desc')return Number(ob.total||0)-Number(oa.total||0);
      const delta=new Date(ob.createdAt||0)-new Date(oa.createdAt||0);
      return orderState.sort==='oldest'?-delta:delta;
    }).forEach(row=>tbody.appendChild(row));
    const visible=rows.filter(row=>!row.hidden).length,count=document.getElementById('adminOrderResultCount');
    if(count)count.innerHTML='<strong>'+visible+'</strong> '+esc(tr(visible===1?'commande affichée':'commandes affichées',visible===1?'order shown':'orders shown'));
  }

  window.adminManagementUpdateProducts = applyProductFilters;
  window.adminManagementUpdateInventory = applyInventoryFilters;
  window.adminManagementUpdateOrders = applyOrderFilters;
  window.openAdminProductCreator = function(){
    productEditorOpen=true;
    try { window.resetKitForm?.(); } catch {}
    const editor=document.getElementById('adminProductEditor');if(editor)editor.hidden=false;
    const cancel=document.getElementById('cancelKit');if(cancel){cancel.style.display='inline-flex';cancel.textContent=tr('Fermer','Close');cancel.onclick=window.closeAdminProductEditor}
    requestAnimationFrame(()=>editor?.scrollIntoView({behavior:'smooth',block:'start'}));
  };
  window.closeAdminProductEditor = function(){
    productEditorOpen=false;
    try { window.resetKitForm?.(); } catch {}
    const editor=document.getElementById('adminProductEditor');if(editor)editor.hidden=true;
    document.getElementById('adminProductManagement')?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  function wrap(name,after){
    const original=window[name];if(typeof original!=='function')return;
    window[name]=function(...args){const result=original.apply(this,args);after(...args);return result};
  }

  const originalRenderKits=window.renderAdminKits;
  if(typeof originalRenderKits==='function')window.renderAdminKits=function(...args){const result=originalRenderKits.apply(this,args);enhanceProducts();return result};
  const originalInventory=window.renderAdminInventory;
  if(typeof originalInventory==='function')window.renderAdminInventory=function(...args){const result=originalInventory.apply(this,args);enhanceInventory();return result};
  const originalOrders=window.renderAdminOrders;
  if(typeof originalOrders==='function')window.renderAdminOrders=function(...args){const result=originalOrders.apply(this,args);enhanceOrders();return result};
  const originalEditKit=window.editKit;
  if(typeof originalEditKit==='function')window.editKit=function(id,...args){
    productEditorOpen=true;
    const result=originalEditKit.call(this,id,...args);
    const editor=document.getElementById('adminProductEditor')||document.querySelector('#adminKitsPanel .admin-product-editor');
    if(editor){editor.hidden=false;setTimeout(()=>editor.scrollIntoView({behavior:'smooth',block:'start'}),20)}
    const cancel=document.getElementById('cancelKit');if(cancel){cancel.style.display='inline-flex';cancel.textContent=tr('Fermer','Close');cancel.onclick=window.closeAdminProductEditor}
    return result;
  };

  injectStyles();
  if(document.getElementById('adminKitsPanel')) enhanceProducts();
  if(document.getElementById('adminInventoryPanel')) enhanceInventory();
  if(document.getElementById('adminOrdersPanel')) enhanceOrders();
})();