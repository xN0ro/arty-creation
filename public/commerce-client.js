/* ARTY shipping, taxes and checkout totals */
(() => {
  const PROVINCES=[
    ['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],['NL','Newfoundland and Labrador'],['NS','Nova Scotia'],['NT','Northwest Territories'],['NU','Nunavut'],['ON','Ontario'],['PE','Prince Edward Island'],['QC','Québec'],['SK','Saskatchewan'],['YT','Yukon']
  ];
  const FALLBACK={version:1,shipping:{enabled:true,defaultPrice:9.99,freeShippingEnabled:true,freeShippingThreshold:75,canadaOnly:true,productOverrides:[]},taxes:{enabled:true,defaultProvince:'QC',collectGSTHST:true,collectQST:true,collectBCPST:false,collectMBRST:false,collectSKPST:false}};
  let commerceConfig=JSON.parse(JSON.stringify(FALLBACK));
  let checkoutQuote=null,quoteTimer=null,quoteSequence=0;

  const clone=value=>JSON.parse(JSON.stringify(value));
  const currency=value=>I18n.currency(toMoney(Number(value)||0));
  const provinceOptions=selected=>PROVINCES.map(([code,name])=>`<option value="${code}" ${String(selected||'').toUpperCase()===code?'selected':''}>${safeText(name)}</option>`).join('');
  function normalizeConfig(value){
    if(!value||typeof value!=='object')return clone(FALLBACK);
    return {
      version:1,
      shipping:{...FALLBACK.shipping,...(value.shipping||{}),productOverrides:Array.isArray(value.shipping?.productOverrides)?value.shipping.productOverrides:[]},
      taxes:{...FALLBACK.taxes,...(value.taxes||{})}
    };
  }
  async function loadCommerceConfig(admin=false){
    try{
      const response=await artyFetch(admin?'/api/admin/commerce-config':'/api/commerce-config',{headers:admin?authH():undefined});
      if(!response.ok)throw new Error('Commerce configuration unavailable');
      commerceConfig=normalizeConfig(await response.json());
    }catch(error){console.warn('ARTY commerce configuration:',error.message||error);commerceConfig=normalizeConfig(commerceConfig)}
    return commerceConfig;
  }

  function ensureCommerceAdminScaffold(){
    const tabs=document.querySelector('.admin-tabs');
    if(tabs&&!tabs.querySelector('[data-admin-commerce-tab]')){
      const button=document.createElement('button');button.type='button';button.className='admin-tab';button.dataset.adminCommerceTab='true';button.textContent=I18n.t('Livraison & taxes');button.onclick=()=>switchAdminTab('commerce',button);
      const studio=tabs.querySelector('[data-admin-studio-tab]');studio?.insertAdjacentElement('afterend',button)||tabs.append(button);
    }
    if(!document.getElementById('adminCommercePanel')){
      const panel=document.createElement('div');panel.id='adminCommercePanel';panel.style.display='none';
      const studioPanel=document.getElementById('adminStudioPanel'),anchor=studioPanel||document.getElementById('adminAnnouncementPanel');anchor?.insertAdjacentElement('afterend',panel);
    }
  }
  function overrideMap(){return new Map((commerceConfig.shipping.productOverrides||[]).map(item=>[String(item.kitId),Number(item.price)]))}
  window.renderAdminCommerce=function(){
    ensureCommerceAdminScaffold();const panel=document.getElementById('adminCommercePanel');if(!panel)return;
    const shipping=commerceConfig.shipping,taxes=commerceConfig.taxes,overrides=overrideMap();
    const overrideRows=(allKits||[]).map(kit=>`<div class="commerce-override-row"><span><strong>${safeText(I18n.field(kit,'name'))}</strong><small>${safeText(I18n.t('Laisser vide pour utiliser le tarif standard'))}</small></span><div class="admin-price-input"><span>$</span><input type="number" min="0" step="0.01" data-commerce-kit="${safeAttr(kit.id)}" value="${overrides.has(String(kit.id))?safeAttr(overrides.get(String(kit.id))):''}" placeholder="${safeAttr(shipping.defaultPrice)}"></div></div>`).join('')||I18n.html('<p class="admin-muted">Aucun produit.</p>');
    panel.innerHTML=I18n.html`<div class="commerce-admin-head"><div><span>Commerce</span><h3>Livraison et taxes</h3><p>Les montants sont recalculés sur le serveur avant la création du paiement Stripe.</p></div></div>
      <div class="commerce-admin-grid">
        <section class="admin-form-card"><div class="admin-form-head"><div><h3>Livraison</h3><p>Configurez le tarif standard, la livraison gratuite et les exceptions par produit.</p></div><label class="catalog-check"><input type="checkbox" id="commerceShippingEnabled" ${shipping.enabled?'checked':''}> Livraison active</label></div>
          <div class="form-row"><div class="form-group"><label>Tarif standard ($)</label><input id="commerceShippingPrice" type="number" min="0" step="0.01" value="${safeAttr(shipping.defaultPrice)}"></div><div class="form-group"><label>Seuil livraison gratuite ($)</label><input id="commerceFreeThreshold" type="number" min="0" step="0.01" value="${safeAttr(shipping.freeShippingThreshold)}"></div></div>
          <div class="commerce-toggle-stack"><label class="catalog-check"><input type="checkbox" id="commerceFreeEnabled" ${shipping.freeShippingEnabled?'checked':''}> Activer la livraison gratuite à partir du seuil</label><label class="catalog-check"><input type="checkbox" id="commerceCanadaOnly" ${shipping.canadaOnly?'checked':''}> Livrer au Canada seulement</label></div>
          <div class="commerce-admin-note">Le seuil est calculé sur les produits physiques après rabais. Si plusieurs produits ont des tarifs spéciaux, le tarif le plus élevé de la commande est utilisé.</div>
          <div class="commerce-overrides"><h4>Tarifs spéciaux par produit</h4><p>Utilisez ceci pour un produit plus grand ou plus coûteux à expédier. Entrez 0 $ pour rendre ce produit gratuit à expédier lorsqu’il est seul dans la commande.</p>${overrideRows}</div>
        </section>
        <section class="admin-form-card"><div class="admin-form-head"><div><h3>Taxes canadiennes</h3><p>Calcul selon la province de destination des produits.</p></div><label class="catalog-check"><input type="checkbox" id="commerceTaxesEnabled" ${taxes.enabled?'checked':''}> Taxes actives</label></div>
          <div class="form-group"><label>Province par défaut pour les commandes sans adresse de livraison</label><select id="commerceDefaultProvince">${provinceOptions(taxes.defaultProvince)}</select></div>
          <div class="commerce-tax-toggles"><label class="catalog-check"><input type="checkbox" id="commerceGST" ${taxes.collectGSTHST?'checked':''}> Percevoir TPS / TVH</label><label class="catalog-check"><input type="checkbox" id="commerceQST" ${taxes.collectQST?'checked':''}> Percevoir TVQ au Québec</label><label class="catalog-check"><input type="checkbox" id="commerceBCPST" ${taxes.collectBCPST?'checked':''}> Percevoir PST en Colombie-Britannique</label><label class="catalog-check"><input type="checkbox" id="commerceMBRST" ${taxes.collectMBRST?'checked':''}> Percevoir RST au Manitoba</label><label class="catalog-check"><input type="checkbox" id="commerceSKPST" ${taxes.collectSKPST?'checked':''}> Percevoir PST en Saskatchewan</label></div>
          <div class="commerce-admin-note warning"><strong>Important :</strong> activez les taxes provinciales séparées seulement si ARTY est inscrit pour les percevoir. Les taux TPS/TVH intégrés suivent les taux canadiens actuels, incluant la Nouvelle-Écosse à 14 %.</div>
        </section>
      </div><div class="commerce-admin-save"><button type="button" class="btn btn-orange" onclick="saveAdminCommerce()">Sauvegarder livraison et taxes</button></div>`;
    injectCommerceStyles();
  };
  window.saveAdminCommerce=async function(){
    const overrides=Array.from(document.querySelectorAll('[data-commerce-kit]')).map(input=>({kitId:Number(input.dataset.commerceKit),raw:input.value.trim()})).filter(item=>item.raw!=='').map(item=>({kitId:item.kitId,price:Math.max(0,Number(item.raw)||0)}));
    const payload={version:1,shipping:{enabled:!!document.getElementById('commerceShippingEnabled')?.checked,defaultPrice:Math.max(0,Number(document.getElementById('commerceShippingPrice')?.value)||0),freeShippingEnabled:!!document.getElementById('commerceFreeEnabled')?.checked,freeShippingThreshold:Math.max(0,Number(document.getElementById('commerceFreeThreshold')?.value)||0),canadaOnly:!!document.getElementById('commerceCanadaOnly')?.checked,productOverrides:overrides},taxes:{enabled:!!document.getElementById('commerceTaxesEnabled')?.checked,defaultProvince:document.getElementById('commerceDefaultProvince')?.value||'QC',collectGSTHST:!!document.getElementById('commerceGST')?.checked,collectQST:!!document.getElementById('commerceQST')?.checked,collectBCPST:!!document.getElementById('commerceBCPST')?.checked,collectMBRST:!!document.getElementById('commerceMBRST')?.checked,collectSKPST:!!document.getElementById('commerceSKPST')?.checked}};
    try{const response=await artyFetch('/api/admin/commerce-config',{method:'PUT',headers:authH(),body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||I18n.t('Erreur'));commerceConfig=normalizeConfig(data.config||payload);renderAdminCommerce();showToast(I18n.t('Livraison et taxes sauvegardées'),'success')}catch(error){showToast(error.message||I18n.t('Erreur'),'error')}
  };

  function checkoutAddress(){return{line1:document.getElementById('coAddress')?.value.trim()||'',city:document.getElementById('coCity')?.value.trim()||'',province:document.getElementById('coProvince')?.value.trim()||commerceConfig.taxes.defaultProvince||'QC',postal:document.getElementById('coPostal')?.value.trim()||'',country:document.getElementById('coCountry')?.value.trim()||'Canada'}}
  function enhanceProvinceCountryFields(){
    const province=document.getElementById('coProvince');
    if(province&&province.tagName!=='SELECT'){
      const select=document.createElement('select');select.id='coProvince';select.innerHTML=provinceOptions(province.value||commerceConfig.taxes.defaultProvince||'QC');province.replaceWith(select);
    }
    const country=document.getElementById('coCountry');
    if(country&&commerceConfig.shipping.canadaOnly){country.value='Canada';country.readOnly=true;country.setAttribute('aria-readonly','true')}
  }
  function commerceRowsHTML(quote){
    if(!quote)return `<div class="checkout-commerce-loading">${safeText(I18n.t('Calcul des taxes et de la livraison...'))}</div>`;
    const discount=Number(quote.discountTotal)||0,shipping=Number(quote.shippingTotal)||0,taxLines=Array.isArray(quote.taxLines)?quote.taxLines:[];
    return `${discount>0?`<div class="checkout-commerce-row discount"><span>${safeText(I18n.t('Rabais'))}</span><strong>− ${currency(discount)}</strong></div>`:''}<div class="checkout-commerce-row"><span>${safeText(I18n.t('Livraison'))}</span><strong>${quote.needsShipping?(quote.freeShippingApplied?I18n.t('Gratuite'):currency(shipping)):I18n.t('Aucune')}</strong></div>${taxLines.map(line=>`<div class="checkout-commerce-row"><span>${safeText(line.label)} (${Number(line.rate)||0}%)</span><strong>${currency(line.amount)}</strong></div>`).join('')}${!taxLines.length?`<div class="checkout-commerce-row"><span>${safeText(I18n.t('Taxes'))}</span><strong>${currency(quote.taxTotal||0)}</strong></div>`:''}<div class="checkout-commerce-row checkout-commerce-total"><span>${safeText(I18n.t('Total'))}</span><strong>${currency(quote.total)}</strong></div>`;
  }
  function freeShippingMessage(quote){
    if(!quote?.needsShipping||!commerceConfig.shipping.freeShippingEnabled||!commerceConfig.shipping.freeShippingThreshold)return'';
    if(quote.freeShippingApplied)return `<div class="checkout-free-shipping achieved">${safeText(I18n.t('Livraison gratuite appliquée'))}</div>`;
    const remaining=Math.max(0,Number(commerceConfig.shipping.freeShippingThreshold)-Number(quote.shippingQualifyingSubtotal||0));
    return remaining>0?`<div class="checkout-free-shipping">${safeText(I18n.t('Ajoutez'))} <strong>${currency(remaining)}</strong> ${safeText(I18n.t('de produits physiques pour obtenir la livraison gratuite.'))}</div>`:'';
  }
  function renderCheckoutCommerce(){const host=document.getElementById('checkoutCommerceTotals');if(!host)return;host.innerHTML=commerceRowsHTML(checkoutQuote)+freeShippingMessage(checkoutQuote)}
  async function requestCheckoutQuote(){
    if((location.hash||'')!=='#/checkout'||!Array.isArray(cart)||!cart.length)return;
    const seq=++quoteSequence;const host=document.getElementById('checkoutCommerceTotals');if(host&&!checkoutQuote)renderCheckoutCommerce();
    try{const response=await artyFetch('/api/checkout-quote',{method:'POST',headers:authH(),body:JSON.stringify({items:cart,address:checkoutAddress()})}),data=await response.json().catch(()=>({}));if(seq!==quoteSequence)return;if(!response.ok)throw new Error(data.error||I18n.t('Impossible de calculer le total'));checkoutQuote=data;renderCheckoutCommerce()}catch(error){if(seq!==quoteSequence)return;checkoutQuote=null;if(host)host.innerHTML=`<div class="checkout-commerce-error">${safeText(error.message||I18n.t('Impossible de calculer le total'))}</div>`}
  }
  function scheduleCheckoutQuote(){clearTimeout(quoteTimer);quoteTimer=setTimeout(requestCheckoutQuote,180)}
  function mountCheckoutCommerce(){
    const summary=document.querySelector('.checkout-summary-card');if(!summary||!cart?.length)return;
    enhanceProvinceCountryFields();
    let host=document.getElementById('checkoutCommerceTotals');
    if(!host){host=document.createElement('div');host.id='checkoutCommerceTotals';host.className='checkout-commerce-totals';const subtotal=summary.querySelector('.checkout-total-row');subtotal?.insertAdjacentElement('afterend',host)||summary.append(host)}
    checkoutQuote=null;renderCheckoutCommerce();
    ['coAddress','coCity','coProvince','coPostal','coCountry'].forEach(id=>{const field=document.getElementById(id);if(!field||field.dataset.commerceBound)return;field.dataset.commerceBound='1';field.addEventListener('input',scheduleCheckoutQuote);field.addEventListener('change',scheduleCheckoutQuote)});
    scheduleCheckoutQuote();
  }

  function addOrderCommerceRows(order,selector){
    const totals=document.querySelector(selector);if(!totals||totals.dataset.commerceEnhanced)return;totals.dataset.commerceEnhanced='1';const total=totals.querySelector('.total')||totals.lastElementChild;if(!total)return;
    const rows=[];
    if(Number(order.shippingTotal)>0||order.freeShippingApplied)rows.push(`<div><span>${safeText(I18n.t('Livraison'))}</span><strong>${order.freeShippingApplied?I18n.t('Gratuite'):currency(order.shippingTotal)}</strong></div>`);
    (order.taxLines||[]).forEach(line=>rows.push(`<div><span>${safeText(line.label)} (${Number(line.rate)||0}%)</span><strong>${currency(line.amount)}</strong></div>`));
    if(!rows.length&&Number(order.taxTotal)>0)rows.push(`<div><span>${safeText(I18n.t('Taxes'))}</span><strong>${currency(order.taxTotal)}</strong></div>`);
    total.insertAdjacentHTML('beforebegin',rows.join(''));
  }

  function injectCommerceStyles(){
    if(document.getElementById('artyCommerceStyles'))return;const style=document.createElement('style');style.id='artyCommerceStyles';style.textContent=`
      .commerce-admin-head{display:flex;justify-content:space-between;align-items:end;margin:8px 0 18px}.commerce-admin-head>div>span{font-size:.76rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--teal)}.commerce-admin-head h3{font-size:1.55rem;margin:3px 0}.commerce-admin-head p{color:var(--muted);margin:0}.commerce-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.commerce-toggle-stack,.commerce-tax-toggles{display:grid;gap:10px;margin:12px 0}.commerce-admin-note{padding:12px 14px;border-radius:12px;background:rgba(27,154,170,.07);font-size:.84rem;color:var(--muted);margin:14px 0}.commerce-admin-note.warning{background:rgba(232,134,58,.08)}.commerce-overrides{margin-top:20px}.commerce-overrides h4{margin-bottom:3px}.commerce-overrides>p{color:var(--muted);font-size:.84rem}.commerce-override-row{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(50,45,38,.08)}.commerce-override-row span{display:grid}.commerce-override-row small{color:var(--muted);font-size:.75rem}.commerce-admin-save{display:flex;justify-content:flex-end;margin-top:18px}.checkout-commerce-totals{border-top:1px solid rgba(50,45,38,.1);margin-top:8px;padding-top:6px}.checkout-commerce-row{display:flex;justify-content:space-between;gap:16px;padding:7px 0;font-size:.92rem}.checkout-commerce-row.discount strong{color:var(--teal)}.checkout-commerce-total{border-top:1px solid rgba(50,45,38,.12);margin-top:5px;padding-top:12px;font-size:1.06rem}.checkout-commerce-total strong{font-size:1.2rem}.checkout-commerce-loading,.checkout-commerce-error{padding:10px 0;color:var(--muted);font-size:.84rem}.checkout-commerce-error{color:#a44335}.checkout-free-shipping{margin-top:9px;padding:9px 11px;border-radius:10px;background:rgba(232,134,58,.08);font-size:.8rem}.checkout-free-shipping.achieved{background:rgba(27,154,170,.09);color:var(--teal);font-weight:700}@media(max-width:900px){.commerce-admin-grid{grid-template-columns:1fr}}@media(max-width:640px){.commerce-override-row{grid-template-columns:1fr}.commerce-override-row .admin-price-input{max-width:180px}}`;
    document.head.append(style);
  }

  const originalSwitch=window.switchAdminTab;
  if(typeof originalSwitch==='function')window.switchAdminTab=function(tab,button){
    ensureCommerceAdminScaffold();
    if(tab==='commerce'){
      try{window.closeAdminOrderDetail?.()}catch{}
      document.querySelectorAll('.admin-tab').forEach(item=>item.classList.remove('active'));if(button)button.classList.add('active');
      document.querySelectorAll('#page-admin [id^="admin"][id$="Panel"]').forEach(panel=>panel.style.display='none');
      const panel=document.getElementById('adminCommercePanel');if(panel)panel.style.display='block';renderAdminCommerce();return;
    }
    const result=originalSwitch.call(this,tab,button);const panel=document.getElementById('adminCommercePanel');if(panel)panel.style.display='none';return result;
  };
  const originalLoadAdminData=window.loadAdminData;
  if(typeof originalLoadAdminData==='function')window.loadAdminData=async function(...args){const result=await originalLoadAdminData.apply(this,args);ensureCommerceAdminScaffold();await loadCommerceConfig(true);return result};
  const originalRenderCheckout=window.renderCheckoutPage;
  if(typeof originalRenderCheckout==='function')window.renderCheckoutPage=function(...args){const result=originalRenderCheckout.apply(this,args);setTimeout(mountCheckoutCommerce,0);return result};
  const originalProfileOrder=window.viewProfileOrder;
  if(typeof originalProfileOrder==='function')window.viewProfileOrder=function(orderId,...args){const result=originalProfileOrder.call(this,orderId,...args),order=(window.profileOrders||[]).find(item=>String(item.id)===String(orderId));if(order)setTimeout(()=>addOrderCommerceRows(order,'.account-detail-totals'),0);return result};
  const originalAdminOrder=window.openAdminOrderDetail;
  if(typeof originalAdminOrder==='function')window.openAdminOrderDetail=function(orderId,...args){const result=originalAdminOrder.call(this,orderId,...args),order=(adminOrders||[]).find(item=>String(item.id)===String(orderId));if(order)setTimeout(()=>addOrderCommerceRows(order,'.admin-order-detail-totals'),0);return result};

  injectCommerceStyles();ensureCommerceAdminScaffold();loadCommerceConfig(false).then(()=>{if((location.hash||'')==='#/checkout')mountCheckoutCommerce()});
})();
