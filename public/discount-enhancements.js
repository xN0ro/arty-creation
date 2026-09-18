(() => {
  'use strict';
  if (window.__ARTY_DISCOUNT_EXPERIENCE__) return;
  window.__ARTY_DISCOUNT_EXPERIENCE__ = true;

  let editorOpen=false;
  let checkoutPromoCode=String(sessionStorage.getItem('arty_promo_code')||'').trim().toUpperCase();
  let lastPromoQuote=null;
  const listState={query:'',mode:'all',status:'all'};

  const isEn=()=>{try{return I18n.language?.()==='en'}catch{return false}};
  const tr=(fr,en)=>isEn()?en:fr;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>I18n.currency(toMoney(Number(value)||0));
  const modeOf=d=>String(d?.mode||'').toLowerCase()==='code'||(!d?.mode&&d?.code)?'code':'automatic';
  const titleOf=d=>I18n.field?.(d,'title')||d?.title||'';
  const labelOf=d=>I18n.field?.(d,'customerLabel')||d?.customerLabel||'';
  const activeNow=d=>{
    if(d?.active===false)return false;
    const now=new Date();
    if(d?.startsAt&&new Date(d.startsAt+'T00:00:00')>now)return false;
    if(d?.endsAt&&new Date(d.endsAt+'T23:59:59')<now)return false;
    return true;
  };
  const selectedValues=id=>Array.from(document.querySelectorAll(`#${id} input[type="checkbox"]:checked`)).map(input=>Number(input.value)).filter(Number.isFinite);

  function injectStyles(){
    if(document.getElementById('artyDiscountExperienceStyles'))return;
    const style=document.createElement('style');style.id='artyDiscountExperienceStyles';style.textContent=`
      .discount-admin-shell{display:grid;gap:16px}
      .discount-admin-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:21px 23px;border:1px solid rgba(44,36,24,.08);border-radius:20px;background:linear-gradient(135deg,#fff,#fbf8f2);box-shadow:0 8px 28px rgba(44,36,24,.045)}
      .discount-admin-head>div>span{color:var(--teal);font-size:.68rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      .discount-admin-head h3{margin:3px 0 4px;font-size:1.45rem;letter-spacing:-.4px}.discount-admin-head p{margin:0;max-width:720px;color:var(--text-light);font-size:.84rem;line-height:1.5}
      .discount-new-btn{display:inline-flex;align-items:center;gap:7px;min-height:43px;padding:10px 15px;border-radius:13px;background:var(--orange);color:#fff;font-weight:900;box-shadow:0 8px 22px rgba(232,134,58,.19)}
      .discount-list-tools{display:grid;grid-template-columns:minmax(240px,1.5fr) minmax(160px,.55fr) minmax(160px,.55fr);gap:10px;padding:12px;border:1px solid rgba(44,36,24,.08);border-radius:17px;background:#fff}
      .discount-list-tools input,.discount-list-tools select{width:100%;height:43px;padding:0 12px;border:1px solid rgba(44,36,24,.12);border-radius:11px;background:#fbfaf7;color:var(--text);font:inherit;font-size:.82rem;outline:none}
      .discount-list-tools input:focus,.discount-list-tools select:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(27,154,170,.08)}
      .discount-table-card{overflow:hidden;border:1px solid rgba(44,36,24,.08);border-radius:18px;background:#fff;box-shadow:0 8px 25px rgba(44,36,24,.04)}
      .discount-table-card .admin-table-wrap{margin:0;border:0;box-shadow:none}
      .discount-trigger-badge,.discount-rule-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:.66rem;font-weight:900}
      .discount-trigger-badge.code{background:#fff1e5;color:#b76320}.discount-trigger-badge.auto{background:var(--teal-pale);color:var(--teal)}
      .discount-rule-badge{background:var(--bg2);color:var(--text-md)}
      .discount-editor{display:grid;gap:18px;padding:22px;border:1px solid rgba(27,154,170,.16);border-radius:22px;background:#fff;box-shadow:0 18px 50px rgba(31,80,89,.08)}
      .discount-editor[hidden]{display:none!important}
      .discount-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:16px;border-bottom:1px solid var(--border-light)}
      .discount-editor-head h3{margin:0 0 4px;font-size:1.35rem}.discount-editor-head p{margin:0;color:var(--text-light);font-size:.82rem}
      .discount-section{display:grid;gap:13px;padding:18px;border:1px solid var(--border-light);border-radius:17px;background:#fffdfb}
      .discount-section-title{display:flex;align-items:flex-start;gap:11px}.discount-section-title>b{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:10px;background:var(--teal-pale);color:var(--teal);font-size:.72rem}.discount-section-title h4{margin:0 0 2px;font-size:.96rem}.discount-section-title p{margin:0;color:var(--text-light);font-size:.75rem;line-height:1.45}
      .discount-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .discount-choice{position:relative;display:grid;gap:3px;padding:13px 14px;border:1.5px solid var(--border);border-radius:14px;background:#fff;cursor:pointer;transition:var(--tr)}.discount-choice input{position:absolute;opacity:0;pointer-events:none}.discount-choice:has(input:checked){border-color:var(--teal);background:var(--teal-pale);box-shadow:0 0 0 3px rgba(27,154,170,.07)}.discount-choice strong{font-size:.84rem;color:var(--text)}.discount-choice small{font-size:.7rem;line-height:1.4;color:var(--text-light)}
      .discount-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.discount-form-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .discount-field{display:grid;gap:6px}.discount-field>label{font-size:.72rem;font-weight:800;color:var(--text-md)}.discount-field input,.discount-field select{width:100%;min-height:43px;padding:10px 11px;border:1px solid var(--border);border-radius:11px;background:#fff;color:var(--text);font:inherit;outline:none}.discount-field input:focus,.discount-field select:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(27,154,170,.08)}
      .discount-help{padding:11px 13px;border-radius:11px;background:rgba(27,154,170,.065);color:var(--text-light);font-size:.75rem;line-height:1.5}.discount-help strong{color:var(--teal)}
      .discount-picker{display:grid;gap:9px}.discount-picker-search{width:100%;height:41px;padding:0 11px;border:1px solid var(--border);border-radius:11px;background:#fff}.discount-picker-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:270px;padding:3px;overflow:auto}
      .discount-pick{display:grid;grid-template-columns:18px 42px minmax(0,1fr);gap:9px;align-items:center;padding:8px 9px;border:1px solid var(--border-light);border-radius:11px;background:#fff;cursor:pointer}.discount-pick:has(input:checked){border-color:rgba(27,154,170,.45);background:var(--teal-pale)}.discount-pick input{width:16px;height:16px;accent-color:var(--teal)}.discount-pick img{width:42px;height:42px;border-radius:8px;object-fit:cover;background:var(--bg2)}.discount-pick span{min-width:0}.discount-pick strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.76rem}.discount-pick small{display:block;margin-top:2px;color:var(--text-light);font-size:.64rem}
      .discount-category-pick{grid-template-columns:18px minmax(0,1fr);min-height:48px}.discount-category-pick span{display:grid;gap:2px}
      .discount-preview{padding:17px;border:1px dashed rgba(232,134,58,.36);border-radius:15px;background:linear-gradient(135deg,#fff9f1,#f3fbfb)}.discount-preview>span{display:block;color:var(--orange);font-size:.65rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.discount-preview h4{margin:5px 0 5px;font-size:1rem}.discount-preview p{margin:0;color:var(--text-md);font-size:.78rem;line-height:1.5}
      .discount-editor-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;padding-top:3px}
      .checkout-promo-box{margin:12px 0 3px;padding:12px;border:1px solid rgba(44,36,24,.09);border-radius:13px;background:#fbfaf7}.checkout-promo-label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.checkout-promo-label strong{font-size:.78rem}.checkout-promo-label span{color:var(--text-light);font-size:.67rem}
      .checkout-promo-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.checkout-promo-controls input{min-width:0;height:41px;padding:0 11px;border:1px solid var(--border);border-radius:10px;background:#fff;text-transform:uppercase;font-weight:800;letter-spacing:.5px}.checkout-promo-controls button{padding:0 13px;border-radius:10px;background:var(--teal);color:#fff;font-size:.72rem;font-weight:900}
      .checkout-promo-status{margin-top:7px;font-size:.7rem;line-height:1.4}.checkout-promo-status.success{color:#24745a}.checkout-promo-status.warning{color:#a96820}.checkout-promo-status.error{color:#b34e43}.checkout-promo-remove{margin-left:6px;background:none!important;color:var(--text-light)!important;text-decoration:underline;padding:0!important}
      @media(max-width:760px){.discount-admin-head{align-items:stretch;flex-direction:column}.discount-new-btn{justify-content:center}.discount-list-tools,.discount-form-grid,.discount-form-grid.three,.discount-choice-grid,.discount-picker-list{grid-template-columns:1fr}}
    `;document.head.appendChild(style);
  }

  function scopeLabel(d){
    if(d.scope==='kits')return tr('Produits sélectionnés','Selected products');
    if(d.scope==='categories')return tr('Catégories sélectionnées','Selected categories');
    return tr('Tout le catalogue','Entire catalog');
  }
  function ruleLabel(d){
    const min=Math.max(1,Number(d.minQty)||1);
    if(d.type==='bogo')return tr(`Achetez ${d.buyQty||1}, obtenez ${d.freeQty||1} gratuit`,`Buy ${d.buyQty||1}, get ${d.freeQty||1} free`);
    if(d.type==='fixed')return min>1?tr(`${money(d.value)} de rabais chacun dès ${min} articles`,`${money(d.value)} off each when buying ${min}+`):tr(`${money(d.value)} de rabais`,`${money(d.value)} off`);
    return min>1?tr(`${Number(d.value)||0}% dès ${min} articles`,`${Number(d.value)||0}% off when buying ${min}+`):tr(`${Number(d.value)||0}% de rabais`,`${Number(d.value)||0}% off`);
  }
  function statusLabel(d){
    if(d.active===false)return tr('Inactif','Inactive');
    const now=new Date();
    if(d.startsAt&&new Date(d.startsAt+'T00:00:00')>now)return tr('Planifié','Scheduled');
    if(d.endsAt&&new Date(d.endsAt+'T23:59:59')<now)return tr('Terminé','Ended');
    return tr('Actif','Active');
  }

  function listHTML(){
    const rows=(adminDiscounts||[]).map(d=>`<tr data-discount-row="${esc(d.id)}" data-search="${esc((titleOf(d)+' '+(d.code||'')+' '+labelOf(d)).toLowerCase())}" data-mode="${modeOf(d)}" data-status="${activeNow(d)?'active':'inactive'}">
      <td><strong>${esc(titleOf(d))}</strong><br><span class="admin-muted">${esc(labelOf(d)||scopeLabel(d))}</span></td>
      <td><span class="discount-trigger-badge ${modeOf(d)==='code'?'code':'auto'}">${modeOf(d)==='code'?esc(tr('Code '+(d.code||''),'Code '+(d.code||''))):esc(tr('Automatique','Automatic'))}</span></td>
      <td><span class="discount-rule-badge">${esc(ruleLabel(d))}</span></td>
      <td>${esc(scopeLabel(d))}</td>
      <td><span class="admin-status ${activeNow(d)?'ok':'out'}">${esc(statusLabel(d))}</span></td>
      <td><div class="admin-actions"><button class="admin-btn admin-btn-edit" onclick="editDiscount(${Number(d.id)})">${esc(tr('Modifier','Edit'))}</button><button class="admin-btn admin-btn-delete" onclick="deleteDiscount(${Number(d.id)})">${esc(tr('Supprimer','Delete'))}</button></div></td>
    </tr>`).join('');
    return `<div class="discount-table-card"><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>${esc(tr('Promotion','Promotion'))}</th><th>${esc(tr('Déclenchement','Trigger'))}</th><th>${esc(tr('Avantage','Benefit'))}</th><th>${esc(tr('Produits visés','Applies to'))}</th><th>${esc(tr('Statut','Status'))}</th><th></th></tr></thead><tbody>${rows||`<tr><td colspan="6" class="admin-muted">${esc(tr('Aucune promotion.','No promotions yet.'))}</td></tr>`}</tbody></table></div></div>`;
  }

  function pickerProductsHTML(selected=[]){
    const set=new Set((selected||[]).map(String));
    return (allKits||[]).map(kit=>{
      const image=(Array.isArray(kit.images)&&kit.images[0])||kit.image||'logoarty.png';
      const cat=allCategories.find(c=>String(c.id)===String(kit.categoryId));
      return `<label class="discount-pick" data-picker-search="${esc((I18n.field(kit,'name')||kit.name||'')+' '+(cat?(I18n.field(cat,'name')||cat.name):''))}"><input type="checkbox" value="${esc(kit.id)}" ${set.has(String(kit.id))?'checked':''}><img src="${esc(image)}" alt=""><span><strong>${esc(I18n.field(kit,'name')||kit.name||'')}</strong><small>${esc(cat?(I18n.field(cat,'name')||cat.name):'')}</small></span></label>`;
    }).join('');
  }
  function pickerCategoriesHTML(selected=[]){
    const set=new Set((selected||[]).map(String));
    return (allCategories||[]).map(cat=>{
      const count=(allKits||[]).filter(kit=>String(kit.categoryId)===String(cat.id)||(Array.isArray(kit.categoryIds)&&kit.categoryIds.map(String).includes(String(cat.id)))).length;
      return `<label class="discount-pick discount-category-pick"><input type="checkbox" value="${esc(cat.id)}" ${set.has(String(cat.id))?'checked':''}><span><strong>${esc(I18n.field(cat,'name')||cat.name||'')}</strong><small>${count} ${esc(tr(count===1?'produit':'produits',count===1?'product':'products'))}</small></span></label>`;
    }).join('');
  }

  function editorHTML(d={}){
    const mode=modeOf(d),scope=['all','kits','categories'].includes(d.scope)?d.scope:'all',type=['percent','fixed','bogo'].includes(d.type)?d.type:'percent';
    return `<div class="discount-editor" id="discountEditor" ${editorOpen?'':'hidden'}>
      <div class="discount-editor-head"><div><h3 id="discountFormTitle">${esc(d.id?tr('Modifier la promotion','Edit promotion'):tr('Créer une promotion','Create promotion'))}</h3><p>${esc(tr('Définissez clairement comment elle se déclenche, ce qu’elle offre et quels produits sont admissibles.','Clearly define how it triggers, what it offers, and which products qualify.'))}</p></div><button type="button" class="btn btn-ghost btn-sm" onclick="closeDiscountEditor()">× ${esc(tr('Fermer','Close'))}</button></div>
      <input type="hidden" id="editDiscountId" value="${esc(d.id||'')}">
      <section class="discount-section"><div class="discount-section-title"><b>1</b><div><h4>${esc(tr('Nom et déclenchement','Name and trigger'))}</h4><p>${esc(tr('Une promotion automatique s’applique seule. Un code promo doit être saisi au paiement.','An automatic promotion applies by itself. A promo code must be entered at checkout.'))}</p></div></div>
        <div class="discount-form-grid"><div class="discount-field"><label>${esc(tr('Nom interne / titre','Internal name / title'))}</label><input id="aDisTitle" value="${esc(d.title||'')}" placeholder="${esc(tr('Ex: Duo créatif 15%','Example: Creative Duo 15%'))}" oninput="updateDiscountPreview()"></div><div class="discount-field"><label>${esc(tr('Étiquette visible au client','Customer-facing label'))}</label><input id="aDisLabel" value="${esc(d.customerLabel||'')}" placeholder="${esc(tr('Ex: Offre duo -15%','Example: Duo offer -15%'))}" oninput="updateDiscountPreview()"></div></div>
        <div class="discount-choice-grid"><label class="discount-choice"><input type="radio" name="aDisMode" value="automatic" ${mode!=='code'?'checked':''} onchange="toggleDiscountExperienceFields()"><strong>${esc(tr('Promotion automatique','Automatic promotion'))}</strong><small>${esc(tr('Le rabais apparaît dès que le panier respecte les conditions.','Discount appears automatically when the cart qualifies.'))}</small></label><label class="discount-choice"><input type="radio" name="aDisMode" value="code" ${mode==='code'?'checked':''} onchange="toggleDiscountExperienceFields()"><strong>${esc(tr('Code promo','Promo code'))}</strong><small>${esc(tr('Le client entre un code dans le panier / paiement.','Customer enters a code during checkout.'))}</small></label></div>
        <div class="discount-field" id="discountCodeField"><label>${esc(tr('Code à entrer','Code customers enter'))}</label><input id="aDisCode" value="${esc(d.code||'')}" maxlength="30" placeholder="ARTY15" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'');updateDiscountPreview()"></div>
      </section>
      <section class="discount-section"><div class="discount-section-title"><b>2</b><div><h4>${esc(tr('Type de promotion','Promotion type'))}</h4><p>${esc(tr('La quantité minimum compte tous les articles admissibles ensemble, même s’ils sont différents.','Minimum quantity counts all eligible items together, even when they are different products.'))}</p></div></div>
        <div class="discount-field"><label>${esc(tr('Avantage','Benefit'))}</label><select id="aDisType" onchange="toggleDiscountExperienceFields()"><option value="percent" ${type==='percent'?'selected':''}>${esc(tr('Pourcentage de rabais','Percentage off'))}</option><option value="fixed" ${type==='fixed'?'selected':''}>${esc(tr('Montant fixe par article','Fixed amount off each item'))}</option><option value="bogo" ${type==='bogo'?'selected':''}>${esc(tr('Achetez X, obtenez Y gratuit','Buy X, get Y free'))}</option></select></div>
        <div class="discount-form-grid three" id="discountValueFields"><div class="discount-field discount-value-field"><label id="discountValueLabel">${esc(type==='fixed'?tr('Rabais par article ($)','Discount per item ($)'):tr('Pourcentage (%)','Percentage (%)'))}</label><input type="number" id="aDisValue" min="0" step="0.01" value="${esc(d.value??'')}" placeholder="15" oninput="updateDiscountPreview()"></div><div class="discount-field quantity-min-field"><label>${esc(tr('Quantité minimum admissible','Minimum eligible quantity'))}</label><input type="number" id="aDisMinQty" min="1" value="${esc(d.minQty||1)}" oninput="updateDiscountPreview()"></div><div class="discount-help quantity-min-field"><strong>${esc(tr('Exemple','Example'))}</strong><br>${esc(tr('Minimum 2 + 15% = dès que le panier contient 2 articles visés, ces articles reçoivent 15% de rabais.','Minimum 2 + 15% = once the cart has 2 eligible items, those items receive 15% off.'))}</div></div>
        <div class="discount-form-grid" id="discountBogoFields"><div class="discount-field"><label>${esc(tr('Articles à acheter','Items to buy'))}</label><input type="number" id="aDisBuy" min="1" value="${esc(d.buyQty||2)}" oninput="updateDiscountPreview()"></div><div class="discount-field"><label>${esc(tr('Articles gratuits','Free items'))}</label><input type="number" id="aDisFree" min="1" value="${esc(d.freeQty||1)}" oninput="updateDiscountPreview()"></div></div>
      </section>
      <section class="discount-section"><div class="discount-section-title"><b>3</b><div><h4>${esc(tr('Produits admissibles','Eligible products'))}</h4><p>${esc(tr('Choisissez tout le catalogue, des produits précis, ou une catégorie complète.','Choose the entire catalog, specific products, or a full category.'))}</p></div></div>
        <div class="discount-field"><label>${esc(tr('Appliquer à','Apply to'))}</label><select id="aDisScope" onchange="toggleDiscountExperienceFields()"><option value="all" ${scope==='all'?'selected':''}>${esc(tr('Tout le catalogue','Entire catalog'))}</option><option value="kits" ${scope==='kits'?'selected':''}>${esc(tr('Produits sélectionnés','Selected products'))}</option><option value="categories" ${scope==='categories'?'selected':''}>${esc(tr('Catégories sélectionnées','Selected categories'))}</option></select></div>
        <div class="discount-help" id="discountScopeHelp"></div>
        <div class="discount-picker" id="discountProductPicker"><input class="discount-picker-search" type="search" placeholder="${esc(tr('Rechercher parmi les produits...','Search products...'))}" oninput="filterDiscountPicker('aDisKits',this.value)"><div class="discount-picker-list" id="aDisKits">${pickerProductsHTML(d.kitIds)}</div></div>
        <div class="discount-picker" id="discountCategoryPicker"><div class="discount-picker-list" id="aDisCats">${pickerCategoriesHTML(d.categoryIds)}</div></div>
      </section>
      <section class="discount-section"><div class="discount-section-title"><b>4</b><div><h4>${esc(tr('Période et statut','Schedule and status'))}</h4><p>${esc(tr('Laissez les dates vides pour garder la promotion active sans période fixe.','Leave dates empty to keep the promotion active without a fixed period.'))}</p></div></div>
        <div class="discount-form-grid"><div class="discount-field"><label>${esc(tr('Date de début','Start date'))}</label><input type="date" id="aDisStart" value="${esc(d.startsAt||'')}"></div><div class="discount-field"><label>${esc(tr('Date de fin','End date'))}</label><input type="date" id="aDisEnd" value="${esc(d.endsAt||'')}"></div></div>
        <label class="catalog-check"><input type="checkbox" id="aDisActive" ${d.active===false?'':'checked'}> ${esc(tr('Promotion active','Promotion active'))}</label>
      </section>
      <div class="discount-preview" id="discountPreview"></div>
      <div class="discount-editor-actions"><button type="button" class="btn btn-ghost" onclick="closeDiscountEditor()">${esc(tr('Annuler','Cancel'))}</button><button type="button" class="btn btn-orange" onclick="saveDiscount()">${esc(tr('Sauvegarder la promotion','Save promotion'))}</button></div>
    </div>`;
  }

  function renderDiscountAdmin(record=null){
    const panel=document.getElementById('adminDiscountsPanel');if(!panel)return;
    panel.innerHTML=`<div class="discount-admin-shell">
      <div class="discount-admin-head"><div><span>${esc(tr('Promotions','Promotions'))}</span><h3>${esc(tr('Rabais et codes promo','Discounts & promo codes'))}</h3><p>${esc(tr('Créez des offres automatiques, des codes promotionnels et des rabais de quantité. Les calculs finaux sont toujours vérifiés par le serveur avant le paiement.','Create automatic offers, promo codes, and quantity discounts. Final amounts are always verified by the server before payment.'))}</p></div><button type="button" class="discount-new-btn" onclick="openDiscountEditor()"><span>＋</span>${esc(tr('Nouvelle promotion','New promotion'))}</button></div>
      <div class="discount-list-tools"><input id="discountListSearch" type="search" value="${esc(listState.query)}" placeholder="${esc(tr('Rechercher une promotion ou un code...','Search promotion or code...'))}" oninput="filterDiscountList()"><select id="discountListMode" onchange="filterDiscountList()"><option value="all">${esc(tr('Tous les types','All triggers'))}</option><option value="automatic">${esc(tr('Automatiques','Automatic'))}</option><option value="code">${esc(tr('Codes promo','Promo codes'))}</option></select><select id="discountListStatus" onchange="filterDiscountList()"><option value="all">${esc(tr('Tous les statuts','All statuses'))}</option><option value="active">${esc(tr('Actives','Active'))}</option><option value="inactive">${esc(tr('Inactives / terminées','Inactive / ended'))}</option></select></div>
      ${editorHTML(record||{})}
      ${listHTML()}
    </div>`;
    const modeSelect=document.getElementById('discountListMode');if(modeSelect)modeSelect.value=listState.mode;
    const statusSelect=document.getElementById('discountListStatus');if(statusSelect)statusSelect.value=listState.status;
    if(editorOpen){
      try{if(typeof renderEnglishContent==='function')renderEnglishContent('discounts',record||{})}catch{}
      toggleDiscountExperienceFields();updateDiscountPreview();
    }
    filterDiscountList();
  }

  window.renderAdminDiscounts=function(){renderDiscountAdmin(null)};
  window.openDiscountEditor=function(){
    editorOpen=true;renderDiscountAdmin(null);
    requestAnimationFrame(()=>document.getElementById('discountEditor')?.scrollIntoView({behavior:'smooth',block:'start'}));
  };
  window.closeDiscountEditor=function(){editorOpen=false;renderDiscountAdmin(null)};
  window.editDiscount=function(id){
    const d=(adminDiscounts||[]).find(item=>String(item.id)===String(id));if(!d)return;
    editorOpen=true;renderDiscountAdmin(d);
    requestAnimationFrame(()=>document.getElementById('discountEditor')?.scrollIntoView({behavior:'smooth',block:'start'}));
  };
  window.resetDiscountForm=function(){window.openDiscountEditor()};

  window.filterDiscountList=function(){
    const search=document.getElementById('discountListSearch');if(search)listState.query=search.value.trim().toLowerCase();
    const mode=document.getElementById('discountListMode');if(mode)listState.mode=mode.value;
    const status=document.getElementById('discountListStatus');if(status)listState.status=status.value;
    document.querySelectorAll('[data-discount-row]').forEach(row=>{
      const okSearch=!listState.query||(row.dataset.search||'').includes(listState.query);
      const okMode=listState.mode==='all'||row.dataset.mode===listState.mode;
      const okStatus=listState.status==='all'||row.dataset.status===listState.status;
      row.hidden=!(okSearch&&okMode&&okStatus);
    });
  };
  window.filterDiscountPicker=function(id,value){
    const q=String(value||'').toLowerCase();document.querySelectorAll(`#${id} [data-picker-search]`).forEach(row=>row.hidden=q&&!String(row.dataset.pickerSearch||'').toLowerCase().includes(q));
  };
  window.toggleDiscountExperienceFields=function(){
    const mode=document.querySelector('input[name="aDisMode"]:checked')?.value||'automatic';
    const type=document.getElementById('aDisType')?.value||'percent';
    const scope=document.getElementById('aDisScope')?.value||'all';
    const code=document.getElementById('discountCodeField');if(code)code.style.display=mode==='code'?'grid':'none';
    document.querySelectorAll('.discount-value-field,.quantity-min-field').forEach(el=>el.style.display=type==='bogo'?'none':el.classList.contains('discount-help')?'block':'grid');
    const bogo=document.getElementById('discountBogoFields');if(bogo)bogo.style.display=type==='bogo'?'grid':'none';
    const label=document.getElementById('discountValueLabel');if(label)label.textContent=type==='fixed'?tr('Rabais par article ($)','Discount per item ($)'):tr('Pourcentage (%)','Percentage (%)');
    const product=document.getElementById('discountProductPicker');if(product)product.style.display=scope==='kits'?'grid':'none';
    const category=document.getElementById('discountCategoryPicker');if(category)category.style.display=scope==='categories'?'grid':'none';
    const help=document.getElementById('discountScopeHelp');if(help)help.innerHTML=scope==='categories'
      ? '<strong>'+esc(tr('Pourquoi une catégorie?','Why use a category?'))+'</strong> '+esc(tr('Tous les produits de cette catégorie sont admissibles, y compris ceux ajoutés plus tard.','Every product in that category qualifies, including products added later.'))
      : scope==='kits'?esc(tr('Seulement les produits cochés ci-dessous pourront recevoir cette promotion.','Only the checked products below can receive this promotion.'))
      : esc(tr('Tous les kits standards du catalogue sont admissibles.','All standard kits in the catalog are eligible.'));
    updateDiscountPreview();
  };
  window.updateDiscountPreview=function(){
    const host=document.getElementById('discountPreview');if(!host)return;
    const mode=document.querySelector('input[name="aDisMode"]:checked')?.value||'automatic',type=document.getElementById('aDisType')?.value||'percent',scope=document.getElementById('aDisScope')?.value||'all';
    const code=document.getElementById('aDisCode')?.value.trim().toUpperCase()||'',value=Number(document.getElementById('aDisValue')?.value)||0,min=Math.max(1,Number(document.getElementById('aDisMinQty')?.value)||1),buy=Math.max(1,Number(document.getElementById('aDisBuy')?.value)||1),free=Math.max(1,Number(document.getElementById('aDisFree')?.value)||1);
    let benefit=type==='bogo'?tr(`Achetez ${buy}, obtenez ${free} gratuit`,`Buy ${buy}, get ${free} free`):type==='fixed'?tr(`${money(value)} de rabais par article admissible`,`${money(value)} off each eligible item`):tr(`${value}% de rabais`,`${value}% off`);
    if(type!=='bogo'&&min>1)benefit+=' · '+tr(`minimum ${min} articles admissibles`,`minimum ${min} eligible items`);
    const target=scope==='kits'?tr(`${selectedValues('aDisKits').length} produit(s) sélectionné(s)`,`${selectedValues('aDisKits').length} selected product(s)`):scope==='categories'?tr(`${selectedValues('aDisCats').length} catégorie(s) sélectionnée(s)`,`${selectedValues('aDisCats').length} selected category/categories`):tr('tout le catalogue','entire catalog');
    host.innerHTML='<span>'+esc(tr('Aperçu client','Customer preview'))+'</span><h4>'+esc(document.getElementById('aDisLabel')?.value.trim()||document.getElementById('aDisTitle')?.value.trim()||tr('Votre promotion','Your promotion'))+'</h4><p>'+esc(benefit+' · '+target+(mode==='code'?' · '+tr('code: ','code: ')+(code||'—'):' · '+tr('appliqué automatiquement','applied automatically')))+'</p>';
  };

  window.saveDiscount=async function(){
    const id=document.getElementById('editDiscountId')?.value||'',mode=document.querySelector('input[name="aDisMode"]:checked')?.value||'automatic',scope=document.getElementById('aDisScope')?.value||'all',type=document.getElementById('aDisType')?.value||'percent';
    const payload={title:document.getElementById('aDisTitle')?.value.trim()||'',customerLabel:document.getElementById('aDisLabel')?.value.trim()||'',mode,code:mode==='code'?(document.getElementById('aDisCode')?.value.trim().toUpperCase()||''):'',type,value:Number(document.getElementById('aDisValue')?.value)||0,minQty:Math.max(1,Number(document.getElementById('aDisMinQty')?.value)||1),buyQty:Math.max(1,Number(document.getElementById('aDisBuy')?.value)||1),freeQty:Math.max(1,Number(document.getElementById('aDisFree')?.value)||1),scope,kitIds:selectedValues('aDisKits'),categoryIds:selectedValues('aDisCats'),startsAt:document.getElementById('aDisStart')?.value||'',endsAt:document.getElementById('aDisEnd')?.value||'',active:!!document.getElementById('aDisActive')?.checked};
    const enTitle=document.getElementById('english-discounts-title')?.value.trim()||'',enLabel=document.getElementById('english-discounts-customerLabel')?.value.trim()||'';payload.translations={en:{title:enTitle,customerLabel:enLabel}};
    if(!payload.title)return showToast(tr('Ajoutez un nom à la promotion','Add a promotion name'),'error');
    if(mode==='code'&&!payload.code)return showToast(tr('Ajoutez le code que les clients devront entrer','Enter the promo code customers will use'),'error');
    if(scope==='kits'&&!payload.kitIds.length)return showToast(tr('Sélectionnez au moins un produit','Select at least one product'),'error');
    if(scope==='categories'&&!payload.categoryIds.length)return showToast(tr('Sélectionnez au moins une catégorie','Select at least one category'),'error');
    if(type!=='bogo'&&payload.value<=0)return showToast(tr('Ajoutez une valeur de rabais supérieure à 0','Enter a discount value greater than 0'),'error');
    try{
      const response=await artyFetch(id?`/api/admin/discounts/${encodeURIComponent(id)}`:'/api/admin/discounts',{method:id?'PUT':'POST',headers:authH(),body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));
      if(!response.ok)return showToast(data.error||tr('Impossible de sauvegarder','Could not save promotion'),'error');
      editorOpen=false;showToast(tr('Promotion sauvegardée','Promotion saved'),'success');await loadAdminData();
    }catch{showToast(tr('Erreur de connexion','Connection error'),'error')}
  };

  function checkoutPromoHTML(){
    return `<div class="checkout-promo-box" id="checkoutPromoBox"><div class="checkout-promo-label"><strong>${esc(tr('Code promo','Promo code'))}</strong><span>${esc(tr('Vous avez un code?','Have a code?'))}</span></div><div class="checkout-promo-controls"><input id="checkoutPromoInput" value="${esc(checkoutPromoCode)}" placeholder="ARTY15" autocomplete="off"><button type="button" onclick="applyCheckoutPromo()">${esc(tr('Appliquer','Apply'))}</button></div><div class="checkout-promo-status" id="checkoutPromoStatus"></div></div>`;
  }
  function mountPromoBox(){
    const summary=document.querySelector('.checkout-summary-card');if(!summary||!cart?.length)return;
    if(!document.getElementById('checkoutPromoBox')){
      const subtotal=summary.querySelector('.checkout-total-row');if(subtotal)subtotal.insertAdjacentHTML('afterend',checkoutPromoHTML());else summary.insertAdjacentHTML('beforeend',checkoutPromoHTML());
    }
    renderPromoStatus(lastPromoQuote);
  }
  window.applyCheckoutPromo=function(){
    checkoutPromoCode=String(document.getElementById('checkoutPromoInput')?.value||'').trim().toUpperCase();
    if(checkoutPromoCode)sessionStorage.setItem('arty_promo_code',checkoutPromoCode);else sessionStorage.removeItem('arty_promo_code');
    lastPromoQuote=null;renderPromoStatus(null);window.refreshArtyCheckoutQuote?.();
  };
  window.removeCheckoutPromo=function(){
    checkoutPromoCode='';sessionStorage.removeItem('arty_promo_code');const input=document.getElementById('checkoutPromoInput');if(input)input.value='';lastPromoQuote=null;window.refreshArtyCheckoutQuote?.();
  };
  function renderPromoStatus(quote){
    const host=document.getElementById('checkoutPromoStatus');if(!host)return;
    if(!checkoutPromoCode){host.className='checkout-promo-status';host.textContent='';return}
    if(!quote){host.className='checkout-promo-status warning';host.textContent=tr('Vérification du code...','Checking code...');return}
    if(quote.promoCodeValid===false){host.className='checkout-promo-status error';host.innerHTML=esc(tr('Code invalide ou expiré.','Invalid or expired code.'))+' <button type="button" class="checkout-promo-remove" onclick="removeCheckoutPromo()">'+esc(tr('Retirer','Remove'))+'</button>';return}
    if(!quote.promoCodeApplied){host.className='checkout-promo-status warning';host.innerHTML=esc(tr('Code reconnu, mais les conditions ne sont pas encore remplies.','Code recognized, but the cart does not meet the conditions yet.'))+' <button type="button" class="checkout-promo-remove" onclick="removeCheckoutPromo()">'+esc(tr('Retirer','Remove'))+'</button>';return}
    host.className='checkout-promo-status success';host.innerHTML='✓ '+esc(tr('Code appliqué','Code applied'))+(Number(quote.promoDiscountTotal)>0?' · − '+esc(money(quote.promoDiscountTotal)):'')+' <button type="button" class="checkout-promo-remove" onclick="removeCheckoutPromo()">'+esc(tr('Retirer','Remove'))+'</button>';
  }

  window.ARTYDiscountCheckout={renderQuote(quote){lastPromoQuote=quote||null;mountPromoBox();renderPromoStatus(quote)}};
  window.ARTYCheckoutPromoCode=()=>checkoutPromoCode;

  const originalFetch=window.artyFetch;
  if(typeof originalFetch==='function')window.artyFetch=function(input,options={}){
    try{
      const url=new URL(typeof input==='string'?input:input.url,location.href),method=String(options.method||'GET').toUpperCase();
      if(['/api/checkout-quote','/api/orders'].includes(url.pathname)&&method==='POST'&&typeof options.body==='string'){
        const body=JSON.parse(options.body);body.promoCode=checkoutPromoCode;options={...options,body:JSON.stringify(body)};
      }
    }catch{}
    return originalFetch.call(this,input,options);
  };

  const originalCheckout=window.renderCheckoutPage;
  if(typeof originalCheckout==='function')window.renderCheckoutPage=function(...args){const result=originalCheckout.apply(this,args);setTimeout(mountPromoBox,0);return result};

  injectStyles();
  if(document.getElementById('adminDiscountsPanel'))renderDiscountAdmin(null);
  if((location.hash||'')==='#/checkout')setTimeout(mountPromoBox,0);
})();