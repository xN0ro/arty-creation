/* ARTY Studio administration + event image uploader
 * Persistent Studio products come from /api/studio-config.
 * The admin can manage prices, sizes, options and future product mockups.
 */
(() => {
  const FALLBACK_CONFIG = {
    version: 1,
    products: [
      {id:'canvas',type:'canvas',active:true,nameFr:'Toile rectangulaire',nameEn:'Rectangular canvas',descriptionFr:'Un canevas personnalisé à tracer et à peindre.',descriptionEn:'A custom canvas to trace and paint.',templateImage:'',basePrice:69.99,extraImagePrice:0,sizes:[{id:'petit',labelFr:'11 x 14',labelEn:'11 x 14',price:49.99},{id:'moyen',labelFr:'16 x 20',labelEn:'16 x 20',price:69.99},{id:'grand',labelFr:'18 x 24',labelEn:'18 x 24',price:89.99}],options:[],printArea:{x:3,y:3,w:94,h:94}},
      {id:'bag',type:'bag',active:true,nameFr:'Sac en toile',nameEn:'Canvas tote bag',descriptionFr:'Un sac réutilisable avec votre création à peindre.',descriptionEn:'A reusable tote bag with your custom design to paint.',templateImage:'',basePrice:34.99,extraImagePrice:6,sizes:[{id:'standard',labelFr:'Format standard',labelEn:'Standard size',price:34.99}],options:[],printArea:{x:10,y:13,w:80,h:81}}
    ]
  };

  let artyStudioConfig = JSON.parse(JSON.stringify(FALLBACK_CONFIG));
  let studioAdminEditingId = 'canvas';
  let studioConfigLoaded = false;
  const studioTemplateImages = new Map();

  const moneyNumber = value => Math.max(0, Number(value) || 0);
  const slug = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
  const clone = value => JSON.parse(JSON.stringify(value));
  function studioLocaleText(record, field) {
    const english = I18n.language() === 'en';
    return String(record?.[english ? `${field}En` : `${field}Fr`] || record?.[`${field}Fr`] || record?.[`${field}En`] || '');
  }
  function activeStudioProducts() { return (artyStudioConfig.products || []).filter(product => product.active !== false); }
  function studioProduct(id = designStudioState?.product) { return (artyStudioConfig.products || []).find(product => String(product.id) === String(id)) || activeStudioProducts()[0] || artyStudioConfig.products?.[0] || null; }
  function studioSize(product = studioProduct(), sizeId = designStudioState?.size) {
    const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
    return sizes.find(size => String(size.id) === String(sizeId)) || sizes[0] || null;
  }
  function studioSelectedOptions(product = studioProduct()) {
    const selected = Array.isArray(designStudioState?.studioOptions) ? designStudioState.studioOptions.map(String) : [];
    return (product?.options || []).filter(option => option.active !== false && selected.includes(String(option.id)));
  }
  function normalizeClientConfig(config) {
    if (!config || !Array.isArray(config.products) || !config.products.length) return clone(FALLBACK_CONFIG);
    return config;
  }
  function syncLegacyStudioValues() {
    const canvas = (artyStudioConfig.products || []).find(product => product.id === 'canvas');
    if (canvas && typeof designStudioSizes !== 'undefined') {
      Object.keys(designStudioSizes).forEach(key => delete designStudioSizes[key]);
      (canvas.sizes || []).forEach(size => { designStudioSizes[size.id] = {label:studioLocaleText(size,'label') || size.labelFr || size.labelEn || size.id, price:moneyNumber(size.price)}; });
    }
    const bag = (artyStudioConfig.products || []).find(product => product.id === 'bag');
    if (bag && typeof customBagState !== 'undefined') {
      customBagState.basePrice = moneyNumber(bag.basePrice);
      customBagState.extraImagePrice = moneyNumber(bag.extraImagePrice);
    }
    if (typeof designStudioState !== 'undefined') {
      const current = studioProduct(designStudioState.product);
      if (!current || current.active === false) designStudioState.product = activeStudioProducts()[0]?.id || 'canvas';
      const product = studioProduct(designStudioState.product);
      if (product && !(product.sizes || []).some(size => String(size.id) === String(designStudioState.size))) designStudioState.size = product.sizes?.[0]?.id || 'standard';
      if (!Array.isArray(designStudioState.studioOptions)) designStudioState.studioOptions = [];
    }
  }
  async function loadStudioConfig(admin = false) {
    try {
      const response = await artyFetch(admin ? '/api/admin/studio-config' : '/api/studio-config', {headers: admin ? authH() : undefined});
      if (!response.ok) throw new Error('Studio configuration unavailable');
      artyStudioConfig = normalizeClientConfig(await response.json());
      studioConfigLoaded = true;
      syncLegacyStudioValues();
      if ((location.hash || '').startsWith('#/studio') && typeof renderDesignStudioPage === 'function') renderDesignStudioPage();
      return artyStudioConfig;
    } catch (error) {
      console.warn('ARTY Studio configuration:', error.message || error);
      artyStudioConfig = normalizeClientConfig(artyStudioConfig);
      syncLegacyStudioValues();
      return artyStudioConfig;
    }
  }

  // ---------- Event poster upload ----------
  function eventImagePreview() {
    const url = document.getElementById('aEvImg')?.value?.trim() || '';
    const preview = document.getElementById('aEvImagePreview');
    const remove = document.getElementById('aEvRemoveImage');
    if (preview) {
      preview.hidden = !url;
      preview.innerHTML = url ? `<img src="${safeAttr(url)}" alt="${safeAttr(I18n.t('Aperçu de l’événement'))}">` : '';
    }
    if (remove) remove.hidden = !url;
  }
  function enhanceEventImageUploader() {
    const input = document.getElementById('aEvImg');
    if (!input) return;
    const group = input.closest('.form-group');
    if (!group || group.querySelector('#aEvImageUpload')) { eventImagePreview(); return; }
    input.type = 'hidden';
    const label = group.querySelector('label');
    if (label) label.textContent = I18n.t('Image de l’événement');
    group.insertAdjacentHTML('beforeend', I18n.html`
      <label class="admin-image-upload admin-event-image-upload">
        <input type="file" id="aEvImageUpload" accept="image/jpeg,image/png,image/webp,image/avif" onchange="uploadAdminEventImage(this)">
        <span>Téléverser l’image de l’événement</span>
        <small>JPG, PNG, WEBP ou AVIF · maximum 10 Mo</small>
      </label>
      <div class="admin-upload-status" id="aEvUploadStatus" aria-live="polite"></div>
      <div class="admin-event-image-preview" id="aEvImagePreview" hidden></div>
      <button type="button" class="btn btn-ghost btn-sm" id="aEvRemoveImage" onclick="removeAdminEventImage()" hidden>Retirer l’image</button>`);
    eventImagePreview();
  }
  window.uploadAdminEventImage = async function(input) {
    const file = input.files?.[0], status = document.getElementById('aEvUploadStatus');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast(I18n.t('L’image doit faire moins de 10 Mo'),'error'); input.value=''; return; }
    input.disabled = true; if (status) status.textContent = I18n.t('Téléversement en cours...');
    try {
      const dataUrl = await readAdminImageFile(file);
      const response = await artyFetch('/api/admin/product-images',{method:'POST',headers:authH(),body:JSON.stringify({fileName:file.name,dataUrl})});
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || I18n.t('Téléversement impossible'));
      const hidden = document.getElementById('aEvImg'); if (hidden) hidden.value = data.url || '';
      if (status) status.textContent = I18n.t('Image prête.');
      eventImagePreview(); showToast(I18n.t('Image de l’événement téléversée'),'success');
    } catch (error) { if(status)status.textContent=''; showToast(error.message || I18n.t('Erreur de téléversement'),'error'); }
    finally { input.disabled=false; input.value=''; }
  };
  window.removeAdminEventImage = function() { const input=document.getElementById('aEvImg');if(input)input.value='';const status=document.getElementById('aEvUploadStatus');if(status)status.textContent='';eventImagePreview(); };

  // ---------- Studio admin ----------
  function canManageStudioAdmin(){
    return currentUser?.role==='admin'||(currentUser?.role==='staff'&&Array.isArray(currentUser?.permissions)&&currentUser.permissions.includes('products'));
  }
  function ensureStudioAdminScaffold() {
    if(!canManageStudioAdmin()){
      document.querySelector('[data-admin-studio-tab]')?.remove();
      const existing=document.getElementById('adminStudioPanel');if(existing)existing.style.display='none';
      return;
    }
    const tabs = document.querySelector('.admin-tabs');
    if (tabs && !tabs.querySelector('[data-admin-studio-tab]')) {
      const button = document.createElement('button');
      button.className = 'admin-tab'; button.type = 'button'; button.dataset.adminStudioTab = 'true'; button.dataset.adminTabKey='studio';
      button.textContent = I18n.t('Studio');
      button.onclick = () => switchAdminTab('studio', button);
      const eventButton = Array.from(tabs.querySelectorAll('.admin-tab')).find(item => item.textContent.includes(I18n.t('Options d’événements')));
      eventButton?.insertAdjacentElement('afterend', button) || tabs.append(button);
    }
    if (!document.getElementById('adminStudioPanel')) {
      const panel = document.createElement('div'); panel.id='adminStudioPanel'; panel.style.display='none';
      const anchor = document.getElementById('adminAnnouncementPanel');
      anchor?.insertAdjacentElement('afterend', panel);
    }
  }
  function studioAdminProductOptions(selected='') {
    return (artyStudioConfig.products || []).map(product => `<option value="${safeAttr(product.id)}" ${String(product.id)===String(selected)?'selected':''}>${safeText(product.nameFr || product.id)}${product.active===false?' — '+safeText(I18n.t('Inactif')):''}</option>`).join('');
  }
  function studioAdminSizeRow(size={}) {
    return `<div class="studio-admin-repeat-row" data-studio-size>
      <input data-size-fr placeholder="Format FR, ex: 12 oz" value="${safeAttr(size.labelFr||'')}">
      <input data-size-en placeholder="Size EN, e.g. 12 oz" value="${safeAttr(size.labelEn||'')}">
      <div class="admin-price-input"><span>$</span><input data-size-price type="number" min="0" step="0.01" value="${safeAttr(size.price??'')}"></div>
      <button type="button" onclick="this.closest('[data-studio-size]').remove()">×</button>
    </div>`;
  }
  function studioAdminOptionRow(option={}) {
    return `<div class="studio-admin-repeat-row" data-studio-option>
      <input data-option-fr placeholder="Option FR" value="${safeAttr(option.labelFr||'')}">
      <input data-option-en placeholder="Option EN" value="${safeAttr(option.labelEn||'')}">
      <div class="admin-price-input"><span>+$</span><input data-option-price type="number" min="0" step="0.01" value="${safeAttr(option.priceDelta??0)}"></div>
      <button type="button" onclick="this.closest('[data-studio-option]').remove()">×</button>
    </div>`;
  }
  function studioAdminPreview(product) {
    if (!product?.templateImage) return `<div class="studio-admin-template-placeholder">${designStudioIcon(product?.id==='bag'?'bag':product?.id==='canvas'?'canvas':'template')}</div>`;
    return `<img src="${safeAttr(product.templateImage)}" alt="${safeAttr(product.nameFr||'Template')}">`;
  }
  window.renderAdminStudio = function() {
    if(!canManageStudioAdmin())return;
    ensureStudioAdminScaffold();
    const panel = document.getElementById('adminStudioPanel'); if(!panel)return;
    let product = (artyStudioConfig.products || []).find(item=>String(item.id)===String(studioAdminEditingId)) || artyStudioConfig.products?.[0];
    if (!product) { artyStudioConfig = clone(FALLBACK_CONFIG); product=artyStudioConfig.products[0]; }
    studioAdminEditingId = product.id;
    const productCards = (artyStudioConfig.products || []).map(item => `<button type="button" class="studio-admin-product-card ${String(item.id)===String(product.id)?'active':''}" onclick="editAdminStudioProduct('${safeAttr(item.id)}')"><span>${studioAdminPreview(item)}</span><div><strong>${safeText(item.nameFr||item.id)}</strong><small>${safeText(item.nameEn||'')} · ${item.active===false?I18n.t('Inactif'):I18n.t('Actif')}</small></div></button>`).join('');
    panel.innerHTML=I18n.html`<div class="studio-admin-heading"><div><span>Studio ARTY</span><h3>Produits et modèles personnalisables</h3><p>Gérez les prix, formats, options et gabarits proposés aux clients dans le Studio.</p></div><button class="btn btn-orange" type="button" onclick="newAdminStudioProduct()">+ Nouveau modèle</button></div>
      <div class="studio-admin-layout"><aside class="studio-admin-product-list">${productCards}</aside><section class="admin-form-card studio-admin-editor">
        <div class="admin-form-head"><div><h3>${safeText(product.nameFr||I18n.t('Nouveau modèle'))}</h3><p>${product.id==='canvas'||product.id==='bag'?I18n.t('Modèle principal du Studio'):I18n.t('Modèle personnalisable')}</p></div><label class="catalog-check"><input type="checkbox" id="studioProductActive" ${product.active!==false?'checked':''}> Actif</label></div>
        <input type="hidden" id="studioProductId" value="${safeAttr(product.id||'')}">
        <div class="form-row"><div class="form-group"><label>Nom français</label><input id="studioProductNameFr" value="${safeAttr(product.nameFr||'')}"></div><div class="form-group"><label>Name (English)</label><input id="studioProductNameEn" lang="en" value="${safeAttr(product.nameEn||'')}"></div></div>
        <div class="form-row"><div class="form-group"><label>Description française</label><textarea id="studioProductDescFr">${safeText(product.descriptionFr||'')}</textarea></div><div class="form-group"><label>Description (English)</label><textarea id="studioProductDescEn" lang="en">${safeText(product.descriptionEn||'')}</textarea></div></div>
        <div class="form-row"><div class="form-group"><label>Type de rendu</label><select id="studioProductType" ${product.id==='canvas'||product.id==='bag'?'disabled':''}><option value="template" ${product.type==='template'?'selected':''}>Gabarit image personnalisé</option><option value="canvas" ${product.type==='canvas'?'selected':''}>Toile ARTY</option><option value="bag" ${product.type==='bag'?'selected':''}>Sac ARTY</option></select></div><div class="form-group"><label>Prix de base / secours ($)</label><input id="studioProductBasePrice" type="number" min="0" step="0.01" value="${safeAttr(product.basePrice??0)}"></div><div class="form-group"><label>Image additionnelle (+$)</label><input id="studioProductExtraImage" type="number" min="0" step="0.01" value="${safeAttr(product.extraImagePrice??0)}"></div></div>
        <section class="studio-admin-section"><div><h4>Gabarit visuel</h4><p>Pour un nouveau produit comme une tasse, téléversez une image ou un mockup propre du produit.</p></div><div class="studio-admin-template-upload"><div id="studioTemplatePreview">${studioAdminPreview(product)}</div><input type="hidden" id="studioTemplateImage" value="${safeAttr(product.templateImage||'')}"><label class="admin-image-upload"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onchange="uploadStudioTemplateImage(this)"><span>Téléverser le gabarit</span><small>PNG avec fond transparent recommandé</small></label><button class="btn btn-ghost btn-sm" type="button" onclick="removeStudioTemplateImage()">Retirer</button><div id="studioTemplateUploadStatus" class="admin-upload-status"></div></div></section>
        <section class="studio-admin-section"><div><h4>Zone personnalisable</h4><p>Position de la zone où le client place son design, en pourcentage du gabarit.</p></div><div class="studio-print-area-grid"><label>X %<input id="studioPrintX" type="number" min="0" max="95" value="${safeAttr(product.printArea?.x??20)}"></label><label>Y %<input id="studioPrintY" type="number" min="0" max="95" value="${safeAttr(product.printArea?.y??20)}"></label><label>Largeur %<input id="studioPrintW" type="number" min="5" max="100" value="${safeAttr(product.printArea?.w??60)}"></label><label>Hauteur %<input id="studioPrintH" type="number" min="5" max="100" value="${safeAttr(product.printArea?.h??60)}"></label></div></section>
        <section class="studio-admin-section"><div class="admin-section-title"><div><h4>Formats et prix</h4><p>Chaque format est un choix visible par le client et peut avoir son propre prix.</p></div><button type="button" class="btn btn-ghost btn-sm" onclick="addAdminStudioSize()">+ Ajouter un format</button></div><div class="studio-admin-repeat-list" id="studioSizesList">${(product.sizes||[]).map(studioAdminSizeRow).join('')}</div></section>
        <section class="studio-admin-section"><div class="admin-section-title"><div><h4>Options supplémentaires</h4><p>Exemples : emballage cadeau, poignée colorée, finition spéciale.</p></div><button type="button" class="btn btn-ghost btn-sm" onclick="addAdminStudioOption()">+ Ajouter une option</button></div><div class="studio-admin-repeat-list" id="studioOptionsList">${(product.options||[]).map(studioAdminOptionRow).join('')}</div></section>
        <div class="admin-product-savebar"><div><strong>Configuration Studio</strong><span>Les changements seront utilisés par le Studio client dès l’enregistrement.</span></div><div>${product.id!=='canvas'&&product.id!=='bag'?`<button class="btn btn-ghost" type="button" onclick="deleteAdminStudioProduct()">Supprimer</button>`:''}<button class="btn btn-orange" type="button" onclick="saveAdminStudioProduct()">Enregistrer</button></div></div>
      </section></div>`;
  };
  window.editAdminStudioProduct = function(id){studioAdminEditingId=id;renderAdminStudio();};
  window.newAdminStudioProduct = function(){
    const id=`template-${Date.now()}`;
    artyStudioConfig.products.push({id,type:'template',active:true,nameFr:'Nouveau produit',nameEn:'New product',descriptionFr:'',descriptionEn:'',templateImage:'',basePrice:29.99,extraImagePrice:0,sizes:[{id:'standard',labelFr:'Standard',labelEn:'Standard',price:29.99}],options:[],printArea:{x:25,y:25,w:50,h:50}});
    studioAdminEditingId=id;renderAdminStudio();
  };
  window.addAdminStudioSize = function(){document.getElementById('studioSizesList')?.insertAdjacentHTML('beforeend',studioAdminSizeRow({labelFr:'',labelEn:'',price:0}));};
  window.addAdminStudioOption = function(){document.getElementById('studioOptionsList')?.insertAdjacentHTML('beforeend',studioAdminOptionRow({labelFr:'',labelEn:'',priceDelta:0}));};
  window.uploadStudioTemplateImage = async function(input){
    const file=input.files?.[0],status=document.getElementById('studioTemplateUploadStatus');if(!file)return;
    if(file.size>10*1024*1024){showToast(I18n.t('L’image doit faire moins de 10 Mo'),'error');input.value='';return}
    input.disabled=true;if(status)status.textContent=I18n.t('Téléversement en cours...');
    try{const dataUrl=await readAdminImageFile(file);const response=await artyFetch('/api/admin/product-images',{method:'POST',headers:authH(),body:JSON.stringify({fileName:file.name,dataUrl})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||I18n.t('Téléversement impossible'));document.getElementById('studioTemplateImage').value=data.url||'';const preview=document.getElementById('studioTemplatePreview');if(preview)preview.innerHTML=`<img src="${safeAttr(data.url||'')}" alt="Template">`;if(status)status.textContent=I18n.t('Gabarit prêt.');showToast(I18n.t('Gabarit téléversé'),'success')}catch(error){showToast(error.message||I18n.t('Erreur de téléversement'),'error');if(status)status.textContent=''}finally{input.disabled=false;input.value=''}
  };
  window.removeStudioTemplateImage=function(){const field=document.getElementById('studioTemplateImage');if(field)field.value='';const preview=document.getElementById('studioTemplatePreview');if(preview)preview.innerHTML='<div class="studio-admin-template-placeholder">Template</div>';};
  function readStudioAdminRows(){
    const sizes=Array.from(document.querySelectorAll('#studioSizesList [data-studio-size]')).map((row,index)=>({id:slug(row.querySelector('[data-size-fr]')?.value||row.querySelector('[data-size-en]')?.value)||`size-${index+1}`,labelFr:row.querySelector('[data-size-fr]')?.value.trim()||'',labelEn:row.querySelector('[data-size-en]')?.value.trim()||'',price:moneyNumber(row.querySelector('[data-size-price]')?.value)})).filter(size=>size.labelFr||size.labelEn);
    const options=Array.from(document.querySelectorAll('#studioOptionsList [data-studio-option]')).map((row,index)=>({id:slug(row.querySelector('[data-option-fr]')?.value||row.querySelector('[data-option-en]')?.value)||`option-${index+1}`,labelFr:row.querySelector('[data-option-fr]')?.value.trim()||'',labelEn:row.querySelector('[data-option-en]')?.value.trim()||'',priceDelta:moneyNumber(row.querySelector('[data-option-price]')?.value),active:true})).filter(option=>option.labelFr||option.labelEn);
    return {sizes,options};
  }
  window.saveAdminStudioProduct=async function(){
    const id=document.getElementById('studioProductId')?.value||studioAdminEditingId,product=(artyStudioConfig.products||[]).find(item=>String(item.id)===String(id));if(!product)return;
    const nameFr=document.getElementById('studioProductNameFr')?.value.trim()||'',nameEn=document.getElementById('studioProductNameEn')?.value.trim()||'';if(!nameFr||!nameEn)return showToast(I18n.t('Ajoutez le nom français et anglais'),'error');
    const rows=readStudioAdminRows();if(!rows.sizes.length)return showToast(I18n.t('Ajoutez au moins un format avec son prix'),'error');
    Object.assign(product,{active:document.getElementById('studioProductActive')?.checked!==false,nameFr,nameEn,descriptionFr:document.getElementById('studioProductDescFr')?.value.trim()||'',descriptionEn:document.getElementById('studioProductDescEn')?.value.trim()||'',type:product.id==='canvas'?'canvas':product.id==='bag'?'bag':document.getElementById('studioProductType')?.value||'template',templateImage:document.getElementById('studioTemplateImage')?.value.trim()||'',basePrice:moneyNumber(document.getElementById('studioProductBasePrice')?.value),extraImagePrice:moneyNumber(document.getElementById('studioProductExtraImage')?.value),sizes:rows.sizes,options:rows.options,printArea:{x:Number(document.getElementById('studioPrintX')?.value)||0,y:Number(document.getElementById('studioPrintY')?.value)||0,w:Number(document.getElementById('studioPrintW')?.value)||50,h:Number(document.getElementById('studioPrintH')?.value)||50}});
    try{const response=await artyFetch('/api/admin/studio-config',{method:'PUT',headers:authH(),body:JSON.stringify(artyStudioConfig)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||I18n.t('Erreur'));artyStudioConfig=normalizeClientConfig(data.config||artyStudioConfig);syncLegacyStudioValues();renderAdminStudio();showToast(I18n.t('Studio sauvegardé'),'success')}catch(error){showToast(error.message||I18n.t('Erreur'),'error')}
  };
  window.deleteAdminStudioProduct=async function(){
    const product=(artyStudioConfig.products||[]).find(item=>String(item.id)===String(studioAdminEditingId));if(!product||['canvas','bag'].includes(product.id))return;if(!confirm(I18n.msg`Supprimer le modèle « ${product.nameFr} »?`))return;
    artyStudioConfig.products=artyStudioConfig.products.filter(item=>String(item.id)!==String(product.id));studioAdminEditingId=artyStudioConfig.products[0]?.id||'canvas';
    try{const response=await artyFetch('/api/admin/studio-config',{method:'PUT',headers:authH(),body:JSON.stringify(artyStudioConfig)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||I18n.t('Erreur'));artyStudioConfig=normalizeClientConfig(data.config||artyStudioConfig);renderAdminStudio();showToast(I18n.t('Modèle supprimé'),'success')}catch(error){showToast(error.message||I18n.t('Erreur'),'error')}
  };

  // ---------- Customer Studio: make products dynamic ----------
  const originalDesignStudioInitialState = typeof designStudioInitialState === 'function' ? designStudioInitialState : null;
  if (originalDesignStudioInitialState) designStudioInitialState = function(){return {...originalDesignStudioInitialState(),studioOptions:[]}};
  if (typeof designStudioState !== 'undefined' && !Array.isArray(designStudioState.studioOptions)) designStudioState.studioOptions=[];

  const originalDesignStudioPrice = designStudioPrice;
  designStudioPrice = function(){
    const product=studioProduct();if(!product)return originalDesignStudioPrice();
    const size=studioSize(product);let price=size?moneyNumber(size.price):moneyNumber(product.basePrice);
    price += studioSelectedOptions(product).reduce((sum,option)=>sum+moneyNumber(option.priceDelta),0);
    const images=(designStudioState.elements||[]).filter(item=>item.type==='image').length;
    price += Math.max(0,images-1)*moneyNumber(product.extraImagePrice);
    return price;
  };
  designStudioProductLabel = function(){const product=studioProduct();if(!product)return I18n.t('Création personnalisée');const size=studioSize(product);const sizeLabel=size?studioLocaleText(size,'label'):'';return [studioLocaleText(product,'name'),sizeLabel].filter(Boolean).join(' · ')};
  selectDesignStudioProduct = function(productId){const product=studioProduct(productId);if(!product||product.active===false||String(designStudioState.product)===String(product.id))return;designStudioPushHistory();designStudioState.product=product.id;designStudioState.size=product.sizes?.[0]?.id||'standard';designStudioState.studioOptions=[];designStudioState.selectedId=null;refreshDesignStudioProductUI();if(isMobileDesignStudio())fitDesignStudioCanvas(true)};
  setDesignStudioSize = function(sizeId){const product=studioProduct();if(!(product?.sizes||[]).some(size=>String(size.id)===String(sizeId))||String(designStudioState.size)===String(sizeId))return;designStudioPushHistory();designStudioState.size=sizeId;refreshDesignStudioProductUI()};
  window.toggleDesignStudioOption=function(optionId){const product=studioProduct(),valid=(product?.options||[]).some(option=>String(option.id)===String(optionId)&&option.active!==false);if(!valid)return;designStudioPushHistory();const selected=new Set((designStudioState.studioOptions||[]).map(String));selected.has(String(optionId))?selected.delete(String(optionId)):selected.add(String(optionId));designStudioState.studioOptions=[...selected];refreshDesignStudioProductUI()};

  const originalStudioLibrary=renderDesignStudioLibrary;
  renderDesignStudioLibrary=function(){
    if(designStudioState.activePanel!=='templates')return originalStudioLibrary();
    const panel=document.getElementById('designStudioLibrary');if(!panel)return;
    const products=activeStudioProducts(),product=studioProduct(),size=studioSize(product),selectedOptions=new Set((designStudioState.studioOptions||[]).map(String));
    panel.innerHTML=I18n.html`<div class="studio-panel-head"><span>Produit</span><h2>Choisissez votre modèle</h2><p>Choisissez le produit, son format et les options disponibles.</p></div><div class="studio-template-list">${products.map(item=>`<button type="button" class="studio-template-card ${String(designStudioState.product)===String(item.id)?'active':''}" onclick="selectDesignStudioProduct('${safeAttr(item.id)}')"><span class="studio-dynamic-template-thumb">${item.templateImage?`<img src="${safeAttr(item.templateImage)}" alt="">`:designStudioIcon(item.id==='canvas'?'canvas':item.id==='bag'?'bag':'template')}</span><div><strong>${safeText(studioLocaleText(item,'name'))}</strong><small>${safeText(studioLocaleText(item,'description'))}</small></div>${String(designStudioState.product)===String(item.id)?designStudioIcon('check'):''}</button>`).join('')}</div>${product?`<div class="studio-panel-section"><label>${safeText(I18n.t('Format'))}</label><div class="studio-size-list">${(product.sizes||[]).map(item=>`<button type="button" class="${String(size?.id)===String(item.id)?'active':''}" onclick="setDesignStudioSize('${safeAttr(item.id)}')"><strong>${safeText(studioLocaleText(item,'label'))}</strong><span>${isEventDesignStudio()?I18n.t('Format'):I18n.currency(toMoney(item.price))}</span></button>`).join('')}</div></div>`:''}${product?.id==='canvas'?I18n.html`<div class="studio-panel-section"><label>Orientation</label><div class="studio-segmented"><button type="button" class="${designStudioState.orientation==='portrait'?'active':''}" onclick="setDesignStudioOrientation('portrait')">Verticale</button><button type="button" class="${designStudioState.orientation==='landscape'?'active':''}" onclick="setDesignStudioOrientation('landscape')">Horizontale</button></div></div>`:''}${(product?.options||[]).filter(item=>item.active!==false).length?`<div class="studio-panel-section"><label>${safeText(I18n.t('Options'))}</label><div class="studio-dynamic-options">${product.options.filter(item=>item.active!==false).map(option=>`<label class="studio-dynamic-option"><input type="checkbox" ${selectedOptions.has(String(option.id))?'checked':''} onchange="toggleDesignStudioOption('${safeAttr(option.id)}')"><span><strong>${safeText(studioLocaleText(option,'label'))}</strong><small>${moneyNumber(option.priceDelta)?`+ ${I18n.currency(toMoney(option.priceDelta))}`:I18n.t('Inclus')}</small></span></label>`).join('')}</div></div>`:''}`;
    syncMobileStudioUI();
  };

  function getStudioTemplateImage(product){
    if(!product?.templateImage)return null;let image=studioTemplateImages.get(product.id);if(image?.src===product.templateImage)return image;image=new Image();image.onload=()=>{drawDesignStudio();};image.src=product.templateImage;studioTemplateImages.set(product.id,image);return image;
  }
  const originalDesignStudioGeometry=designStudioGeometry;
  designStudioGeometry=function(){
    const product=studioProduct();if(!product||['canvas','bag'].includes(product.id))return originalDesignStudioGeometry();
    const image=getStudioTemplateImage(product),ratio=image?.complete&&image.naturalWidth&&image.naturalHeight?image.naturalWidth/image.naturalHeight:1;
    const maxW=720,maxH=700;let w=maxW,h=w/Math.max(.15,ratio);if(h>maxH){h=maxH;w=h*ratio}w=Math.max(300,Math.min(maxW,w));h=Math.max(300,Math.min(maxH,h));const box={x:(1200-w)/2,y:(900-h)/2,w,h},area=product.printArea||{x:25,y:25,w:50,h:50};
    return{product:box,print:{x:box.x+box.w*(Number(area.x)||0)/100,y:box.y+box.h*(Number(area.y)||0)/100,w:box.w*Math.max(5,Number(area.w)||50)/100,h:box.h*Math.max(5,Number(area.h)||50)/100}};
  };
  const originalRenderStudioScene=renderDesignStudioScene;
  renderDesignStudioScene=function(ctx,view,showSelection=false){
    const productConfig=studioProduct();if(!productConfig||['canvas','bag'].includes(productConfig.id))return originalRenderStudioScene(ctx,view,showSelection);
    const canvas=ctx.canvas,geometry=designStudioGeometry(),product=geometry.product,print=geometry.print,image=getStudioTemplateImage(productConfig);
    ctx.save();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle=view==='edit'?'#eef0f2':'#f3f0eb';ctx.fillRect(0,0,canvas.width,canvas.height);if(view==='edit'){ctx.fillStyle='rgba(73,88,94,.12)';for(let x=24;x<canvas.width;x+=24)for(let y=24;y<canvas.height;y+=24){ctx.beginPath();ctx.arc(x,y,1.2,0,Math.PI*2);ctx.fill()}}
    ctx.shadowColor='rgba(38,34,28,.18)';ctx.shadowBlur=30;ctx.shadowOffsetY=16;if(image?.complete){ctx.drawImage(image,product.x,product.y,product.w,product.h)}else{ctx.fillStyle='#fff';drawRoundedRect(ctx,product.x,product.y,product.w,product.h,24);ctx.fill();ctx.strokeStyle='#ddd';ctx.stroke()};ctx.shadowColor='transparent';
    ctx.save();drawRoundedRect(ctx,print.x,print.y,print.w,print.h,10);ctx.clip();if(view!=='edit'){ctx.fillStyle='rgba(255,255,255,.20)';ctx.fillRect(print.x,print.y,print.w,print.h)}designStudioState.elements.forEach(item=>drawDesignStudioElement(ctx,item,print,view));if(view==='painted')drawDesignStudioPaintTexture(ctx,print);ctx.restore();ctx.strokeStyle=view==='edit'?'rgba(20,137,151,.85)':'rgba(70,70,70,.25)';ctx.lineWidth=3;ctx.setLineDash(view==='edit'?[12,8]:[]);drawRoundedRect(ctx,print.x,print.y,print.w,print.h,10);ctx.stroke();ctx.setLineDash([]);if(view==='edit'){ctx.font='700 15px Outfit, sans-serif';ctx.fillStyle='#137d8a';ctx.fillText(I18n.t('ZONE IMPRIMABLE'),print.x+4,print.y-10)}if(showSelection&&view==='edit'){const selected=designStudioSelected();if(selected)drawDesignStudioSelection(ctx,selected,print)}ctx.restore();
  };

  const originalSnapshot=designStudioSnapshot;
  designStudioSnapshot=function(){return{...originalSnapshot(),studioOptions:[...(designStudioState.studioOptions||[])]}};
  const originalRestoreSnapshot=restoreDesignStudioSnapshot;
  restoreDesignStudioSnapshot=function(snapshot){originalRestoreSnapshot(snapshot);designStudioState.studioOptions=[...(snapshot.studioOptions||[])];renderDesignStudioLibrary();refreshDesignStudioProductUI()};

  completeEventStudioDesign=async function(){
    if(designStudioRuntime.busy)return;if(!designStudioState.elements.length)return showToast(I18n.t('Ajoutez une image, un texte ou une forme à votre création'),'error');
    const button=document.getElementById('designStudioCartButton');if(button){button.disabled=true;button.querySelector('b').textContent=I18n.t('Préparation...')}setDesignStudioBusy(true,I18n.t('Préparation de la création pour votre demande...'));
    try{const [paintedPreview,tracePreview,colorArtwork]=await Promise.all([exportDesignStudioView('painted',false),exportDesignStudioView('trace',true),exportDesignStudioView('edit',true)]),product=studioProduct(),size=studioSize(product),imageCount=designStudioState.elements.filter(item=>item.type==='image').length,textCount=designStudioState.elements.filter(item=>item.type==='text').length,selectedOptions=studioSelectedOptions(product);eventCustomSourceData=colorArtwork;eventCustomTraceData=tracePreview;eventStudioDesign={studioVersion:2,productType:product?.id||designStudioState.product,productLabel:designStudioProductLabel(),size:size?.id||'standard',sizeLabel:size?studioLocaleText(size,'label'):'',orientation:product?.id==='canvas'?(designStudioState.orientation==='landscape'?'horizontale':'verticale'):'standard',options:selectedOptions.map(option=>({id:option.id,label:studioLocaleText(option,'label'),priceDelta:option.priceDelta})),imageCount,textCount,elementCount:designStudioState.elements.length,paintedPreview,tracePreview,colorArtwork,elements:designStudioProductionElements()};eventBuilderState.customKit={...(eventBuilderState.customKit||{}),size:eventStudioDesign.size,quantity:designStudioState.quantity,notes:designStudioState.notes||'',productType:eventStudioDesign.productType,productLabel:eventStudioDesign.productLabel,orientation:eventStudioDesign.orientation,options:eventStudioDesign.options};eventStudioDraftState=cloneDesignStudioState(designStudioState);eventBuilderState.step=3;navigate('#/event-builder');setTimeout(()=>showToast(I18n.t('Création jointe à votre demande'),'success'),120)}catch(error){console.error(error);showToast(I18n.t('Impossible de préparer votre création'),'error')}finally{setDesignStudioBusy(false);if(button){button.disabled=false;button.querySelector('b').textContent=I18n.t('Continuer mon événement')}}
  };
  addDesignStudioToCart=async function(goCheckout=false){
    if(isEventDesignStudio())return completeEventStudioDesign();if(designStudioRuntime.busy)return;if(!designStudioState.elements.length)return showToast(I18n.t('Ajoutez une image, un texte ou une forme à votre création'),'error');
    const button=document.getElementById('designStudioCartButton');if(button){button.disabled=true;button.querySelector('b').textContent=I18n.t('Préparation...')}setDesignStudioBusy(true,I18n.t('Création de vos fichiers de production...'));
    try{const [paintedPreview,tracePreview,colorArtwork]=await Promise.all([exportDesignStudioView('painted',false),exportDesignStudioView('trace',true),exportDesignStudioView('edit',true)]),product=studioProduct(),size=studioSize(product),selectedOptions=studioSelectedOptions(product),id=`custom-studio-${Date.now()}`,imageCount=designStudioState.elements.filter(item=>item.type==='image').length,textCount=designStudioState.elements.filter(item=>item.type==='text').length,name=designStudioProductLabel();cart.push({id,type:'custom-studio',name,price:designStudioPrice(),image:paintedPreview,qty:designStudioState.quantity,customData:{kind:'design-studio',studioVersion:2,productType:product?.id||designStudioState.product,productLabel:studioLocaleText(product,'name')||name,size:size?.id||'standard',sizeLabel:size?studioLocaleText(size,'label'):'',orientation:product?.id==='canvas'?(designStudioState.orientation==='landscape'?'horizontale':'verticale'):'standard',options:selectedOptions.map(option=>({id:option.id,label:studioLocaleText(option,'label'),priceDelta:option.priceDelta})),notes:designStudioState.notes||'',imageCount,textCount,elementCount:designStudioState.elements.length,paintedPreview,tracePreview,colorArtwork,elements:designStudioProductionElements()}});saveCart();updateCartUI();showToast(I18n.msg`${name} ajouté au panier`,'success');if(goCheckout)setTimeout(()=>goToCheckout(),250);else if(isMobileDesignStudio())openCart()}catch(error){console.error(error);showToast(I18n.t('Impossible de préparer votre création'),'error')}finally{setDesignStudioBusy(false);if(button){button.disabled=false;button.querySelector('b').textContent=I18n.t('Ajouter au panier')}}
  };

  // ---------- Hook existing admin lifecycle ----------
  const originalRenderEvents=renderAdminEvents;
  renderAdminEvents=function(...args){const result=originalRenderEvents.apply(this,args);enhanceEventImageUploader();return result};
  const originalEditEvent=typeof editEv==='function'?editEv:null;
  if(originalEditEvent)editEv=function(id,...args){const result=originalEditEvent.call(this,id,...args);enhanceEventImageUploader();eventImagePreview();return result};
  const originalResetEvent=typeof resetEvForm==='function'?resetEvForm:null;
  if(originalResetEvent)resetEvForm=function(...args){const result=originalResetEvent.apply(this,args);enhanceEventImageUploader();eventImagePreview();return result};

  const originalSwitchAdminTab=typeof switchAdminTab==='function'?switchAdminTab:null;
  if(originalSwitchAdminTab)switchAdminTab=function(tab,button){ensureStudioAdminScaffold();const studioPanel=document.getElementById('adminStudioPanel');if(tab==='studio'){if(!canManageStudioAdmin())return;closeAdminOrderDetail?.();document.querySelectorAll('.admin-tab').forEach(item=>item.classList.remove('active'));button?.classList.add('active');document.querySelectorAll('[id^="admin"][id$="Panel"]').forEach(panel=>panel.style.display='none');if(studioPanel)studioPanel.style.display='block';renderAdminStudio();return}const result=originalSwitchAdminTab.call(this,tab,button);if(studioPanel)studioPanel.style.display='none';return result};

  const originalLoadAdminData=typeof loadAdminData==='function'?loadAdminData:null;
  if(originalLoadAdminData)loadAdminData=async function(...args){const result=await originalLoadAdminData.apply(this,args);ensureStudioAdminScaffold();if(canManageStudioAdmin()){await loadStudioConfig(true);renderAdminStudio()}enhanceEventImageUploader();return result};

  function injectStudioAdminStyles(){
    if(document.getElementById('artyStudioAdminStyles'))return;const style=document.createElement('style');style.id='artyStudioAdminStyles';style.textContent=`
      .admin-event-image-preview{margin:12px 0;border:1px solid rgba(44,36,24,.12);border-radius:16px;overflow:hidden;max-width:420px;background:#f7f3ed}.admin-event-image-preview img{display:block;width:100%;max-height:240px;object-fit:cover}
      .studio-admin-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:10px 0 22px}.studio-admin-heading>div>span{font-size:.76rem;text-transform:uppercase;letter-spacing:.08em;color:var(--teal);font-weight:800}.studio-admin-heading h3{margin:3px 0}.studio-admin-heading p{margin:0;color:var(--muted)}
      .studio-admin-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:18px;align-items:start}.studio-admin-product-list{display:grid;gap:9px;position:sticky;top:108px}.studio-admin-product-card{display:grid;grid-template-columns:58px 1fr;gap:10px;align-items:center;text-align:left;border:1px solid rgba(44,36,24,.12);background:#fff;border-radius:15px;padding:9px;cursor:pointer}.studio-admin-product-card.active{border-color:var(--teal);box-shadow:0 0 0 2px rgba(27,154,170,.10)}.studio-admin-product-card>span{width:58px;height:58px;border-radius:10px;overflow:hidden;background:#f5f0e8;display:grid;place-items:center}.studio-admin-product-card img{width:100%;height:100%;object-fit:contain}.studio-admin-product-card svg{width:27px}.studio-admin-product-card div{min-width:0}.studio-admin-product-card strong,.studio-admin-product-card small{display:block}.studio-admin-product-card small{color:var(--muted);font-size:.74rem;margin-top:3px}
      .studio-admin-editor{margin:0}.studio-admin-section{border-top:1px solid rgba(44,36,24,.1);padding:22px 0}.studio-admin-section>div:first-child h4{margin:0 0 4px}.studio-admin-section>div:first-child p{margin:0 0 14px;color:var(--muted);font-size:.86rem}.studio-admin-template-upload{display:grid;grid-template-columns:150px 1fr auto;gap:12px;align-items:center}.studio-admin-template-upload #studioTemplatePreview{width:150px;height:130px;border:1px dashed rgba(44,36,24,.2);border-radius:14px;overflow:hidden;background:#f8f4ef;display:grid;place-items:center}.studio-admin-template-upload img{width:100%;height:100%;object-fit:contain}.studio-admin-template-placeholder{display:grid;place-items:center;width:100%;height:100%;color:var(--muted);font-weight:700}.studio-admin-template-placeholder svg{width:34px}.studio-print-area-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.studio-print-area-grid label{display:grid;gap:5px;font-size:.78rem;font-weight:700}.studio-print-area-grid input{width:100%}
      .studio-admin-repeat-list{display:grid;gap:8px}.studio-admin-repeat-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 130px 38px;gap:8px;align-items:center}.studio-admin-repeat-row>button{height:38px;border:0;border-radius:9px;background:#f4ece5;cursor:pointer;font-size:1.15rem}.studio-dynamic-template-thumb img{width:46px;height:46px;object-fit:contain;border-radius:8px}.studio-dynamic-options{display:grid;gap:7px}.studio-dynamic-option{display:flex;align-items:center;gap:10px;border:1px solid rgba(44,36,24,.11);border-radius:12px;padding:10px;background:#fff}.studio-dynamic-option input{width:17px;height:17px;accent-color:var(--teal)}.studio-dynamic-option span{display:flex;flex-direction:column}.studio-dynamic-option small{color:var(--muted)}
      @media(max-width:900px){.studio-admin-layout{grid-template-columns:1fr}.studio-admin-product-list{position:static;grid-template-columns:repeat(2,minmax(0,1fr))}.studio-admin-template-upload{grid-template-columns:120px 1fr}.studio-admin-template-upload>button{grid-column:2}.studio-print-area-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.studio-admin-heading{align-items:flex-start;flex-direction:column}.studio-admin-product-list{grid-template-columns:1fr}.studio-admin-repeat-row{grid-template-columns:1fr}.studio-admin-repeat-row>button{justify-self:start;width:44px}.studio-admin-template-upload{grid-template-columns:1fr}.studio-admin-template-upload>button{grid-column:auto}.studio-print-area-grid{grid-template-columns:1fr 1fr}}
    `;document.head.append(style);
  }

  injectStudioAdminStyles();
  ensureStudioAdminScaffold();
  syncLegacyStudioValues();
  const boot=()=>loadStudioConfig(canManageStudioAdmin()).then(()=>{ensureStudioAdminScaffold();if(canManageStudioAdmin())renderAdminStudio();enhanceEventImageUploader()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
