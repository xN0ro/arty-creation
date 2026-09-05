/* English content is edited alongside the original French content. */
const englishContentForms = {
  kits:{anchor:'aKitName',fields:{name:['Nom','aKitName'],description:['Description complète','aKitDesc'],shortDesc:['Courte description','aKitShortDesc'],includes:['Inclus dans ce kit',null]}},
  events:{anchor:'aEvTitle',fields:{title:['Titre','aEvTitle'],description:['Description','aEvDesc'],duration:['Durée','aEvDur'],includes:['Ce qui est inclus','aEvIncludes'],hostNote:['Information importante','aEvHostNote']}},
  categories:{anchor:'aCatName',fields:{name:['Nom','aCatName']}},
  announcement:{anchor:'aAnnouncementMessage',fields:{message:['Message','aAnnouncementMessage']}},
  discounts:{anchor:'aDisTitle',fields:{title:['Nom du rabais','aDisTitle'],customerLabel:['Étiquette client','aDisLabel']}},
  'bundle-deals':{anchor:'bdLabel',fields:{label:['Nom visible','bdLabel']}}
};
function renderEnglishContent(collection, record = {}) {
  const config=englishContentForms[collection],anchor=document.getElementById(config?.anchor);
  if(!anchor)return;
  document.getElementById(`english-${collection}`)?.remove();
  const block=document.createElement('section');block.id=`english-${collection}`;block.className='admin-english-content';
  block.innerHTML=`<h4>${safeText(I18n.t('Contenu anglais'))} <span lang="en">English</span></h4><p>${safeText(I18n.t('Les champs principaux conservent le français. Ajoutez ici la version anglaise destinée aux clients.'))}</p>`;
  for(const [field,[label,sourceId]] of Object.entries(config.fields)){
    const source=record[field]??(sourceId?document.getElementById(sourceId)?.value:'')??'';
    const explicit=record.translations?.en?.[field];
    const fallback=Array.isArray(source)?source.map(text=>I18n.t(text,[],'en')):I18n.t(source,[],'en');
    const value=explicit??fallback;
    const id=`english-${collection}-${field}`,multiline=['description','includes'].includes(field);
    const group=document.createElement('div');group.className='form-group';
    const labelElement=document.createElement('label');labelElement.htmlFor=id;labelElement.textContent=I18n.t(label)+' (English)';
    const input=document.createElement(multiline?'textarea':'input');input.id=id;input.lang='en';input.dataset.englishField=field;
    if(!multiline)input.type='text';
    input.value=Array.isArray(value)?value.join('\n'):value||'';
    if(collection==='announcement'){input.maxLength=180;input.addEventListener('input',()=>{const preview=document.getElementById('announcementPreviewText');if(preview&&I18n.language()==='en')preview.textContent=input.value||I18n.t('Votre annonce apparaîtra ici');});}
    group.append(labelElement,input);
    if(field==='includes'){const help=document.createElement('small');help.textContent=I18n.t('Un élément par ligne, dans le même ordre que le français.');group.append(help);}
    block.append(group);
    if(sourceId){const sourceInput=document.getElementById(sourceId);sourceInput?.setAttribute('lang','fr');const sourceLabel=sourceInput?.closest('.form-group')?.querySelector('label');if(sourceLabel&&!sourceLabel.querySelector('.content-language-label')){const badge=document.createElement('small');badge.className='content-language-label';badge.lang='fr';badge.textContent=' Français';sourceLabel.append(badge);}}
  }
  const container=anchor.closest('.admin-event-editor-body,.admin-form-card');
  const savebar=container?.querySelector('.admin-product-savebar,.admin-editor-actions');
  if(savebar)savebar.before(block);else container?.append(block);
}
function collectEnglishTranslation(path) {
  const match=/^\/api\/admin\/(kits|events|categories|announcement|discounts|bundle-deals|product-templates)(?:\/[^/]+)?$/.exec(path);
  if(!match)return null;
  const collection=match[1]==='product-templates'?'kits':match[1];
  const section=document.getElementById(`english-${collection}`);if(!section)return null;
  const en={};
  section.querySelectorAll('[data-english-field]').forEach(input=>{const field=input.dataset.englishField;en[field]=field==='includes'?input.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean):input.value.trim();});
  if(match[1]==='product-templates')return {translations:{en:{includes:en.includes||[]}}};
  return {translations:{en}};
}
function addEnglishChoiceFields(row, choice={}) {
  if(!row||row.querySelector('.english-choice-fields'))return;
  const block=document.createElement('div');block.className='english-choice-fields';
  for(const field of ['label',...(row.dataset.kind==='addons'?['description']:[])]){
    const label=document.createElement('label');label.textContent=I18n.t(field==='label'?'Nom':'Description')+' (English)';
    const input=document.createElement('input');input.type='text';input.lang='en';input.dataset.choiceEnglish=field;
    input.value=choice.translations?.en?.[field]??I18n.t(choice[field]||'',[],'en');label.append(input);block.append(label);
  }
  row.append(block);
}
function englishAdminHook(name, after) {
  const original=window[name];if(typeof original!=='function')return;
  window[name]=function(...args){const result=original.apply(this,args);after(...args);return result;};
}
englishAdminHook('renderAdminKits',()=>renderEnglishContent('kits'));
englishAdminHook('editKit',id=>renderEnglishContent('kits',allKits.find(item=>String(item.id)===String(id))));
englishAdminHook('resetKitForm',()=>renderEnglishContent('kits'));
englishAdminHook('renderAdminEvents',()=>renderEnglishContent('events'));
englishAdminHook('editEv',id=>renderEnglishContent('events',adminEvents.find(item=>String(item.id)===String(id))));
englishAdminHook('resetEvForm',()=>renderEnglishContent('events'));
englishAdminHook('renderAdminCategories',()=>renderEnglishContent('categories'));
englishAdminHook('editCat',id=>renderEnglishContent('categories',allCategories.find(item=>String(item.id)===String(id))));
englishAdminHook('resetCatForm',()=>renderEnglishContent('categories'));
englishAdminHook('renderAdminAnnouncement',()=>renderEnglishContent('announcement',siteAnnouncement));
englishAdminHook('renderAdminDiscounts',()=>renderEnglishContent('discounts'));
englishAdminHook('editDiscount',id=>renderEnglishContent('discounts',adminDiscounts.find(item=>String(item.id)===String(id))));
englishAdminHook('resetDiscountForm',()=>renderEnglishContent('discounts'));
englishAdminHook('renderAdminBundleDeals',()=>renderEnglishContent('bundle-deals'));
englishAdminHook('editBundleDeal',id=>renderEnglishContent('bundle-deals',adminBundleDealRules.find(item=>String(item.id)===String(id))));
englishAdminHook('resetBundleDealForm',()=>renderEnglishContent('bundle-deals'));
englishAdminHook('setAdminProductRows',(kind,items=[])=>{
  if(!['sizes','addons'].includes(kind))return;
  document.getElementById(adminProductListId(kind))?.querySelectorAll('.admin-repeat-row').forEach((row,index)=>addEnglishChoiceFields(row,items[index]||{}));
});
englishAdminHook('addAdminProductRow',(kind,item={})=>{
  if(['sizes','addons'].includes(kind))addEnglishChoiceFields(document.getElementById(adminProductListId(kind))?.lastElementChild,item);
});
const collectFrenchProductRows=collectAdminProductRows;
collectAdminProductRows=function(){
  const result=collectFrenchProductRows();
  for(const [field,id] of [['sizeOptions','aKitSizesList'],['addOns','aKitAddonsList']]){
    const rows=Array.from(document.getElementById(id)?.children||[]);
    result[field].forEach(choice=>{const row=rows.find(row=>row.dataset.choiceId===choice.id);if(row){const en={};row.querySelectorAll('[data-choice-english]').forEach(input=>en[input.dataset.choiceEnglish]=input.value.trim());choice.translations={en};}});
  }
  return result;
};
englishAdminHook('applyProductTemplate',()=>{
  const template=adminProductTemplates.find(item=>String(item.id)===String(document.getElementById('aKitTemplateSelect')?.value));
  const input=document.getElementById('english-kits-includes');if(template&&input)input.value=(template.translations?.en?.includes||template.includes?.map(item=>I18n.t(item,[],'en'))||[]).join('\n');
});
