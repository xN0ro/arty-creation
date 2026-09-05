/* Language preference, static page bindings, and requests to ARTY's API. */
(() => {
  let saved = '';
  try { saved = localStorage.getItem('arty_language') || ''; } catch {}
  const pageLanguage = new URLSearchParams(location.search).get('lang');
  const routeLanguage = new URLSearchParams(location.hash.split('?')[1] || '').get('lang');
  I18n.setLanguage(pageLanguage || routeLanguage || saved || 'fr');
  document.documentElement.lang = I18n.language();
})();

const artyStaticBindings = [];
let artyLanguageChanging = false;
function languageSwitchHTML() {
  return `<div class="language-switch" role="group" aria-label="Language / Langue"><button type="button" lang="fr" data-language="fr" aria-pressed="${I18n.language()==='fr'}" onclick="setArtyLanguage('fr')">FR</button><button type="button" lang="en" data-language="en" aria-pressed="${I18n.language()==='en'}" onclick="setArtyLanguage('en')">EN</button></div>`;
}
function updateLanguageControls() {
  document.querySelectorAll('[data-language]').forEach(button => {
    button.setAttribute('aria-pressed',String(button.dataset.language===I18n.language()));
    button.disabled = artyLanguageChanging;
  });
  document.documentElement.lang = I18n.language();
  document.title = I18n.t('Arty! — Kits de Peinture & Événements Créatifs');
  document.querySelector('meta[name="description"]')?.setAttribute('content',I18n.language()==='en'?'Creative painting kits, tutorials, and ARTY events. Explore our activities and create at your own pace.':'Kits de peinture créatifs, tutoriels et événements ARTY. Découvrez nos activités et créez à votre rythme.');
}
function bindStaticLanguage() {
  // Keep option values stable even when their display text is translated.
  document.querySelectorAll('option:not([value])').forEach(option => option.setAttribute('value',option.textContent));
  const walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node;
  while ((node=walker.nextNode())) {
    if (node.parentElement?.closest('script,style,textarea,[translate="no"]')) continue;
    if (I18n.has(node.nodeValue)) artyStaticBindings.push({node,source:node.nodeValue});
  }
  document.querySelectorAll('[placeholder],[title],[alt],[aria-label],[aria-description]').forEach(node => {
    for (const attribute of ['placeholder','title','alt','aria-label','aria-description']) {
      const source=node.getAttribute(attribute);
      if (source && I18n.has(source)) artyStaticBindings.push({node,attribute,source});
    }
  });
  applyStaticLanguage();
}
function applyStaticLanguage() {
  for (const {node,attribute,source} of artyStaticBindings) {
    if (!node.isConnected) continue;
    if (attribute) node.setAttribute(attribute,I18n.t(source));
    else node.nodeValue=I18n.t(source);
  }
  updateLanguageControls();
}
async function artyFetch(input, options = {}) {
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if (url.origin!==location.origin || !url.pathname.startsWith('/api/')) return fetch(input,options);
  const headers=new Headers(options.headers || (typeof input==='object'?input.headers:undefined));
  headers.set('X-Arty-Language',I18n.language());
  let body=options.body;
  if (/^(POST|PUT)$/i.test(options.method || '') && typeof body==='string' && typeof collectEnglishTranslation==='function') {
    const translation=collectEnglishTranslation(url.pathname);
    if (translation) {
      const payload=JSON.parse(body);
      payload.translations=translation.translations;
      if (translation.sizeOptions) payload.sizeOptions=translation.sizeOptions;
      if (translation.addOns) payload.addOns=translation.addOns;
      body=JSON.stringify(payload);
    }
  }
  return fetch(input,{...options,headers,body});
}
function snapshotLanguageForms() {
  const snapshots=[];
  const groups=new Map();
  document.querySelectorAll('input,textarea,select').forEach(element => {
    const scope=element.parentElement.closest('[id]')?.id || 'body';
    const index=groups.get(scope)||0;groups.set(scope,index+1);
    snapshots.push({key:element.id || `${scope}:${index}`,element,value:element.value,checked:element.checked,selectedValues:element.tagName==='SELECT'&&element.multiple?Array.from(element.selectedOptions).map(option=>option.value):null});
  });
  return snapshots;
}
function restoreLanguageForms(snapshots) {
  const groups=new Map(),saved=new Map(snapshots.map(item=>[item.key,item]));
  document.querySelectorAll('input,textarea,select').forEach(element => {
    const scope=element.parentElement.closest('[id]')?.id || 'body';
    const index=groups.get(scope)||0;groups.set(scope,index+1);
    const item=saved.get(element.id || `${scope}:${index}`);if(!item)return;
    if(element.type==='file'){if(item.element.files?.length&&element!==item.element)element.replaceWith(item.element);return;}
    if(item.selectedValues)Array.from(element.options).forEach(option=>option.selected=item.selectedValues.includes(option.value));
    else element.value=item.value;
    if ('checked' in element) element.checked=item.checked;
  });
}
// Change only text around an active Stripe widget; never remove its iframe.
function translatePaymentCopy(root, fromLanguage) {
  if(!root)return;
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pairs=Object.entries(ARTY_EN);
  const translate=value=>{
    const trimmed=I18n.key(value);
    for(const [fr,en] of pairs){
      const from=fromLanguage==='en'?en:fr,to=I18n.language()==='en'?en:fr;
      if(trimmed===from)return value.match(/^\s*/)[0]+to+value.match(/\s*$/)[0];
      if(!from.includes('{'))continue;
      const slots=[];
      const pattern=from.split(/(\{\d+\})/).map(part=>/^\{\d+\}$/.test(part)?(slots.push(Number(part.slice(1,-1))),'([\\s\\S]*?)'):escape(part)).join('');
      const match=new RegExp('^'+pattern+'$').exec(trimmed);
      if(match){const args=[];slots.forEach((slot,index)=>args[slot]=match[index+1]);return to.replace(/\{(\d+)\}/g,(_,i)=>args[i]??'');}
    }
    return value;
  };
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))if(!node.parentElement.closest('script,style,textarea,iframe,[translate="no"],.event-payment-brief,.event-payment-shell h1'))node.nodeValue=translate(node.nodeValue);
  root.querySelectorAll('[placeholder],[aria-label]').forEach(element=>['placeholder','aria-label'].forEach(attr=>{if(element.hasAttribute(attr))element.setAttribute(attr,translate(element.getAttribute(attr)));}));
}
async function setArtyLanguage(language) {
  language=I18n.normalize(language);
  if(language===I18n.language()||artyLanguageChanging)return;
  artyLanguageChanging=true;
  const previous=I18n.language(),scroll={x:window.scrollX,y:window.scrollY};
  const forms=snapshotLanguageForms(),filterState={...catalogFilters};
  const productDraft=document.getElementById('aKitName')?collectAdminProductRows():null;
  const editIds=['editKitId','editEvId','editCatId','editDiscountId','editBundleDealId'].map(id=>[id,document.getElementById(id)?.value]);
  const expanded=Array.from(document.querySelectorAll('details[open][id]')).map(el=>el.id);
  const activeModal=document.querySelector('.modal-overlay.active')?.id;
  const authTab=['login','register','forgotPassword','resetPassword'].find(name=>document.getElementById(name+'Form')?.style.display==='block')||'login';
  I18n.setLanguage(language);applyStaticLanguage();updateLanguageControls();
  try {
    try{localStorage.setItem('arty_language',language);}catch{}
    const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);
    await Promise.all([loadKits(),loadCategories(),loadEvents(),loadTeam(),loadBundles(),loadBundleDealRules(),loadLanguageAnnouncement()]);
    localizeCart();
    const hash=location.hash||'#/';
    if(hash==='#/checkout'&&stripeElements){translatePaymentCopy(document.getElementById('checkoutPageContent'),previous);stripeElements.update({locale:language});}
    else if(hash.startsWith('#/event-quote/')&&eventQuoteElements){translatePaymentCopy(document.getElementById('eventQuotePageContent'),previous);eventQuoteElements.update({locale:language});}
    else {
      await handleRoute();
      if(hash.startsWith('#/paintings')){catalogFilters=filterState;syncCatalogInputs();renderKitsGrid();}
      if(hash==='#/admin'){
        for(const [id,value] of editIds)if(value){({editKitId:editKit,editEvId:editEv,editCatId:editCat,editDiscountId:editDiscount,editBundleDealId:editBundleDeal}[id])?.(value);}
        if(productDraft){setAdminProductRows('images',productDraft.images);setAdminProductRows('includes',productDraft.includes);setAdminProductRows('sizes',productDraft.sizeOptions);setAdminProductRows('addons',productDraft.addOns);}
      }
    }
    updateAuthUI();updateCartUI();renderSiteAnnouncement();
    if(activeModal==='authModal')switchAuthTab({forgotPassword:'forgot',resetPassword:'reset'}[authTab]||authTab);
    restoreLanguageForms(forms);
    if(hash.startsWith('#/product/'))updateProductPrice(hash.split('/')[2]);
    if(activeModal&&activeModal!=='authModal')translatePaymentCopy(document.getElementById(activeModal),previous);
    expanded.forEach(id=>{const el=document.getElementById(id);if(el)el.open=true;});
    initGoogleSignIn();
    if(authToken&&currentUser){currentUser.locale=language;try{localStorage.setItem('arty_user',JSON.stringify(currentUser));}catch{}await artyFetch('/api/users/locale',{method:'PUT',headers:authH(),body:'{}'});}
  } catch(error) { console.error('Language update failed',error); }
  finally {artyLanguageChanging=false;updateLanguageControls();window.scrollTo(scroll.x,scroll.y);}
}
async function loadLanguageAnnouncement() {
  if(location.hash==='#/admin')return;
  const response=await artyFetch('/api/announcement');
  if(response.ok)siteAnnouncement=await response.json();
}
function localizeCart() {
  for(const item of cart){
    const kit=allKits.find(kit=>String(kit.id)===String(item.customData?.kitId||item.kitId||item.id));
    const event=allEvents.find(event=>String(event.id)===String(item.customData?.eventId||item.eventId));
    const bundle=allBundles.find(bundle=>`bundle-${bundle.id}`===String(item.id));
    if(kit){
      item.name=kit.name;
      if(item.customData?.kind==='configured-kit'){
        const size=kit.sizeOptions?.find(option=>String(option.id)===String(item.customData.sizeId));
        const addOns=(kit.addOns||[]).filter(option=>(item.customData.addOnIds||[]).map(String).includes(String(option.id)));
        item.customData.sizeLabel=size?.label||'';
        item.customData.addOnLabels=addOns.map(option=>option.label);
        item.customData.selectionLabel=[size?.label,...addOns.map(option=>option.label)].filter(Boolean).join(' · ');
      }
    }
    else if(event)item.name=I18n.t('Billet — {0}',[event.title]);
    else if(bundle)item.name=bundle.name;
    else if(item.customData?.kind==='design-studio'){
      const isBag=item.customData.productType==='bag';
      item.name=isBag?I18n.t('Sac personnalisé créé dans le Studio ARTY'):I18n.t('Toile personnalisée {0} créée dans le Studio ARTY',[item.customData.sizeLabel||'']);
      item.customData.productLabel=isBag?I18n.t('Sac en toile'):I18n.t('Toile rectangulaire');
    }
  }
  saveCart();
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('languageControl').innerHTML=languageSwitchHTML();
  bindStaticLanguage();
});
