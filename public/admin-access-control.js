(() => {
'use strict';
if(window.__ARTY_STAFF_ACCESS_CONTROL__)return;window.__ARTY_STAFF_ACCESS_CONTROL__=true;
const PERMISSIONS=[
 ['dashboard','Tableau de bord & statistiques','Dashboard & analytics','Voir les indicateurs généraux et les statistiques de vente.','View overall performance and sales analytics.'],
 ['crm_dashboard','Aperçu CRM','CRM overview','Voir le centre d’action, les suivis et les rapports CRM.','View the CRM action centre, follow-ups and reports.'],
 ['customers','Clients','Customers','Consulter et gérer les profils clients, notes et comptes.','View and manage customer profiles, notes and accounts.'],
 ['leads','Prospects & ventes','Leads & sales','Créer, attribuer et gérer les prospects et le pipeline de vente.','Create, assign and manage leads and the sales pipeline.'],
 ['crm_manager','Gestionnaire des ventes','Sales manager','Voir et gérer tous les prospects et clients de l’équipe CRM.','View and manage all CRM leads and customers across the sales team.'],
 ['account_management','Sécurité des comptes','Account security','Désactiver des comptes et envoyer des actions de sécurité.','Disable accounts and send security actions.'],
 ['products','Produits','Products','Créer, modifier et gérer les produits et le Studio.','Create, edit and manage products and Studio settings.'],
 ['inventory','Inventaire','Inventory','Consulter et ajuster les quantités en stock.','View and adjust inventory quantities.'],
 ['promotions','Promotions & rabais','Promotions & discounts','Créer des rabais automatiques et codes promo.','Create automatic discounts and promo codes.'],
 ['orders','Commandes & remboursements','Orders & refunds','Voir les commandes, changer leur statut et effectuer des remboursements.','View orders, update status and issue refunds.'],
 ['support','Service à la clientèle','Customer support','Lire et répondre aux demandes des clients.','Read and respond to customer requests.'],
 ['events','Événements & billets','Events & tickets','Créer des événements, voir les invités et gérer les billets.','Create events, view guests and manage tickets.'],
 ['categories','Catégories','Categories','Créer et modifier les catégories de produits.','Create and edit product categories.'],
 ['marketing','Marketing','Marketing','Gérer GA4, Meta Pixel, liens de campagne et paramètres marketing.','Manage GA4, Meta Pixel, campaign links and marketing settings.'],
 ['settings','Paramètres du site','Site settings','Gérer la livraison, les taxes, les annonces et autres paramètres globaux.','Manage shipping, taxes, announcements and other site-wide settings.']
];
let grants=[],editingId='';
const en=()=>{try{return I18n.language?.()==='en'}catch{return false}},t=(fr,enText)=>en()?enText:fr;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function has(permission){return currentUser?.role==='admin'||(Array.isArray(currentUser?.permissions)&&currentUser.permissions.includes(permission))}
window.artyHasAdminPermission=has;
const TAB_RULES={
 dashboard:'dashboard',
 crm:['crm_dashboard','customers','leads'],
 crmOverview:'crm_dashboard',crmCustomers:'customers',crmLeads:'leads',
 kits:'products',studio:'products',inventory:'inventory',
 discounts:'promotions',bundleDeals:'promotions',
 orders:'orders',support:'support',
 events:'events',eventOptions:'events',
 categories:'categories',
 announcement:'settings',commerce:'settings',
 marketing:'marketing',
 access:'__owner'
};
const PANEL_RULES={
 adminDashboardPanel:'dashboard',adminKitsPanel:'kits',adminStudioPanel:'studio',adminInventoryPanel:'inventory',
 adminDiscountsPanel:'discounts',adminBundleDealsPanel:'bundleDeals',adminOrdersPanel:'orders',adminSupportPanel:'support',
 adminEventsPanel:'events',adminEventOptionsPanel:'eventOptions',adminCategoriesPanel:'categories',
 adminAnnouncementPanel:'announcement',adminCommercePanel:'commerce',adminMarketingPanel:'marketing',
 adminCrmOverviewPanel:'crmOverview',adminCrmCustomersPanel:'crmCustomers',adminCrmLeadsPanel:'crmLeads',
 adminAccessPanel:'access'
};
function tabRule(tab){return TAB_RULES[tab]??null}
function canOpenTab(tab){
 if(currentUser?.role==='admin')return true;
 if(currentUser?.role!=='staff')return false;
 const rule=tabRule(tab);
 if(!rule||rule==='__owner')return false;
 if(Array.isArray(rule))return rule.some(has);
 return has(rule);
}
window.artyCanOpenAdminTab=canOpenTab;
function buttonTabKey(button){
 if(!button)return'';
 if(button.dataset.adminTabKey)return button.dataset.adminTabKey;
 if(button.dataset.adminStudioTab)return'studio';
 if(button.dataset.adminCommerceTab)return'commerce';
 if(button.dataset.adminMarketingTab)return'marketing';
 if(button.dataset.crmMain)return'crm';
 if(button.id==='adminAccessTab')return'access';
 const match=String(button.getAttribute('onclick')||'').match(/switchAdminTab\(['"]([^'"]+)/);
 return match?.[1]||'';
}
function applyPermissions(){
 if(!currentUser)return;
 const staff=currentUser.role==='staff';
 document.querySelectorAll('.admin-tab').forEach(button=>{
   const tab=buttonTabKey(button);
   const allowed=tab?canOpenTab(tab):!staff;
   button.hidden=!allowed;
   button.style.display=allowed?'':'none';
   button.setAttribute('aria-hidden',allowed?'false':'true');
 });
 for(const [panelId,tab] of Object.entries(PANEL_RULES)){
   const panel=document.getElementById(panelId);
   if(panel&&!canOpenTab(tab))panel.style.display='none';
 }
 const stats=document.querySelector('.admin-pro-stats');if(stats)stats.style.display=has('dashboard')?'':'none';
 if(staff){
   const active=document.querySelector('.admin-tab.active');
   if(!active||active.hidden||active.style.display==='none'){
     const first=[...document.querySelectorAll('.admin-tab')].find(button=>!button.hidden&&button.style.display!=='none');
     if(first)setTimeout(()=>first.click(),0);
   }
 }
}
function style(){
 if(document.getElementById('artyStaffAccessStyles'))return;const s=document.createElement('style');s.id='artyStaffAccessStyles';s.textContent=`
 .staff-access-shell{display:grid;gap:16px}.staff-access-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:21px 23px;border:1px solid rgba(44,36,24,.08);border-radius:20px;background:linear-gradient(135deg,#fff,#f4fbfb);box-shadow:0 8px 28px rgba(44,36,24,.045)}
 .staff-access-head h3{margin:0 0 5px;font-size:1.4rem}.staff-access-head p{max-width:760px;margin:0;color:var(--text-light);font-size:.82rem;line-height:1.5}.staff-access-new{padding:10px 15px;border-radius:13px;background:var(--teal);color:#fff;font-weight:900}
 .staff-access-editor{display:grid;gap:16px;padding:20px;border:1px solid rgba(27,154,170,.15);border-radius:20px;background:#fff}.staff-access-editor[hidden]{display:none!important}.staff-access-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 .staff-permission{position:relative;display:grid;gap:3px;padding:13px 14px 13px 43px;border:1px solid var(--border-light);border-radius:13px;background:#fff;cursor:pointer}.staff-permission:has(input:checked){border-color:rgba(27,154,170,.5);background:var(--teal-pale)}.staff-permission input{position:absolute;left:14px;top:16px;width:17px;height:17px;accent-color:var(--teal)}.staff-permission strong{font-size:.8rem}.staff-permission small{color:var(--text-light);font-size:.68rem;line-height:1.4}
 .staff-access-fields{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}.staff-access-fields label{display:grid;gap:6px;font-size:.72rem;font-weight:800}.staff-access-fields input{height:43px;padding:0 11px;border:1px solid var(--border);border-radius:11px}
 .staff-presets{display:flex;gap:7px;flex-wrap:wrap}.staff-presets button{padding:7px 10px;border:1px solid var(--border);border-radius:999px;background:var(--bg2);font-size:.7rem;font-weight:800;color:var(--text-md)}
 .staff-access-actions{display:flex;justify-content:flex-end;gap:8px}.staff-access-list{display:grid;gap:10px}.staff-access-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:16px 18px;border:1px solid var(--border-light);border-radius:16px;background:#fff}.staff-access-card h4{margin:0 0 3px}.staff-access-card p{margin:0;color:var(--text-light);font-size:.73rem}.staff-access-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.staff-access-tags span{padding:4px 7px;border-radius:999px;background:var(--teal-pale);color:var(--teal);font-size:.62rem;font-weight:800}.staff-access-status{display:inline-flex;margin-top:7px;padding:4px 7px;border-radius:999px;font-size:.62rem;font-weight:900}.staff-access-status.active{background:#edf8f2;color:#247a4d}.staff-access-status.pending{background:#fff4e8;color:#b76320}.staff-access-card-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
 @media(max-width:720px){.staff-access-head{align-items:stretch;flex-direction:column}.staff-access-new{width:100%}.staff-access-grid,.staff-access-fields{grid-template-columns:1fr}.staff-access-card{grid-template-columns:1fr}.staff-access-card-actions{justify-content:flex-start}}
 `;document.head.appendChild(s)}
function ensurePanel(){
 if(currentUser?.role!=='admin')return;const tabs=document.querySelector('.admin-tabs'),container=document.querySelector('.admin-pro-container');if(!tabs||!container)return;
 if(!document.getElementById('adminAccessTab')){const b=document.createElement('button');b.id='adminAccessTab';b.className='admin-tab';b.textContent=t('Accès équipe','Staff access');b.setAttribute('onclick',"switchAdminTab('access',this)");tabs.appendChild(b)}
 if(!document.getElementById('adminAccessPanel')){const p=document.createElement('div');p.id='adminAccessPanel';p.style.display='none';container.appendChild(p)}
}
async function load(){if(currentUser?.role!=='admin')return;try{const r=await artyFetch('/api/admin/access-grants',{headers:authH()});if(r.ok)grants=await r.json()}catch{}}
function permissionName(key){const p=PERMISSIONS.find(row=>row[0]===key);return p?t(p[1],p[2]):key}
function render(){
 const panel=document.getElementById('adminAccessPanel');if(!panel||currentUser?.role!=='admin')return;
 const edit=editingId?grants.find(g=>String(g.id)===String(editingId)):null;
 panel.innerHTML=`<div class="staff-access-shell"><div class="staff-access-head"><div><h3>${esc(t('Accès équipe','Staff access'))}</h3><p>${esc(t('Ajoutez un collaborateur par courriel et choisissez exactement les sections qu’il peut utiliser. Les propriétaires gardent toujours le contrôle total.','Add a collaborator by email and choose exactly which sections they can use. Owners always keep full control.'))}</p></div><button class="staff-access-new" onclick="openStaffAccessEditor()">＋ ${esc(t('Ajouter un collaborateur','Add collaborator'))}</button></div>
 <div class="staff-access-editor" id="staffAccessEditor" ${editingId||window.__artyNewStaff?'':'hidden'}><div class="staff-access-fields"><label>${esc(t('Nom','Name'))}<input id="staffAccessName" value="${esc(edit?.name||'')}" placeholder="Yuriy"></label><label>${esc(t('Courriel','Email'))}<input id="staffAccessEmail" type="email" value="${esc(edit?.email||'')}" ${edit?'disabled':''} placeholder="name@example.com"></label></div>
 <div><strong style="font-size:.8rem">${esc(t('Permissions','Permissions'))}</strong><div class="staff-presets" style="margin-top:8px"><button onclick="staffPreset('sales')">${esc(t('Préréglage Ventes','Sales preset'))}</button><button onclick="staffPreset('sales_manager')">${esc(t('Gestionnaire ventes','Sales manager'))}</button><button onclick="staffPreset('marketing')">${esc(t('Préréglage Marketing','Marketing preset'))}</button><button onclick="staffPreset('events')">${esc(t('Préréglage Événements','Events preset'))}</button><button onclick="staffPreset('support')">${esc(t('Préréglage Support','Support preset'))}</button><button onclick="staffPreset('clear')">${esc(t('Effacer','Clear'))}</button></div></div>
 <div class="staff-access-grid">${PERMISSIONS.map(row=>`<label class="staff-permission"><input type="checkbox" data-staff-permission="${row[0]}" ${edit?.permissions?.includes(row[0])?'checked':''}><strong>${esc(t(row[1],row[2]))}</strong><small>${esc(t(row[3],row[4]))}</small></label>`).join('')}</div>
 <div style="padding:11px 13px;border-radius:11px;background:#fff8ed;color:var(--text-light);font-size:.73rem;line-height:1.5">${esc(t('ARTY enverra une invitation à cette adresse pour rejoindre l’équipe.','ARTY will send an invitation to this address to join the team.'))}</div>
 <div class="staff-access-actions"><button class="btn btn-ghost" onclick="closeStaffAccessEditor()">${esc(t('Annuler','Cancel'))}</button><button class="btn btn-orange" onclick="saveStaffAccess()">${esc(t('Enregistrer l’accès','Save access'))}</button></div></div>
 <div class="staff-access-list">${grants.length?grants.map(g=>`<article class="staff-access-card"><div><h4>${esc(g.name||g.email)}</h4><p>${esc(g.email)}</p><span class="staff-access-status ${g.emailVerifiedAt?'active':'pending'}">${esc(g.emailVerifiedAt?t('Accès activé','Access active'):t('Invitation en attente','Invitation pending'))}</span><div class="staff-access-tags">${(g.permissions||[]).map(p=>`<span>${esc(permissionName(p))}</span>`).join('')}</div></div><div class="staff-access-card-actions"><button class="admin-btn admin-btn-edit" onclick="editStaffAccess('${esc(g.id)}')">${esc(t('Modifier','Edit'))}</button>${!g.emailVerifiedAt?`<button class="admin-btn" onclick="resendStaffAccess('${esc(g.id)}')">${esc(t('Renvoyer','Resend'))}</button>`:''}<button class="admin-btn admin-btn-delete" onclick="deleteStaffAccess('${esc(g.id)}')">${esc(t('Retirer','Remove'))}</button></div></article>`).join(''):`<div class="admin-form-card"><p class="admin-muted">${esc(t('Aucun collaborateur pour le moment.','No collaborators yet.'))}</p></div>`}</div></div>`}
window.openStaffAccessEditor=()=>{editingId='';window.__artyNewStaff=true;render();document.getElementById('staffAccessEditor')?.scrollIntoView({behavior:'smooth',block:'start'})};
window.closeStaffAccessEditor=()=>{editingId='';window.__artyNewStaff=false;render()};
window.editStaffAccess=id=>{editingId=id;window.__artyNewStaff=false;render();document.getElementById('staffAccessEditor')?.scrollIntoView({behavior:'smooth',block:'start'})};
window.staffPreset=preset=>{const sets={sales:['crm_dashboard','customers','leads'],sales_manager:['crm_dashboard','customers','leads','crm_manager'],marketing:['marketing','events','promotions'],events:['events'],support:['support'],clear:[]},wanted=new Set(sets[preset]||[]);document.querySelectorAll('[data-staff-permission]').forEach(input=>input.checked=wanted.has(input.dataset.staffPermission))};
window.saveStaffAccess=async()=>{const permissions=[...document.querySelectorAll('[data-staff-permission]:checked')].map(input=>input.dataset.staffPermission),name=document.getElementById('staffAccessName')?.value.trim()||'',email=document.getElementById('staffAccessEmail')?.value.trim().toLowerCase()||'';if(!permissions.length)return showToast(t('Choisissez au moins une permission','Choose at least one permission'),'error');if(!editingId&&!email)return showToast(t('Ajoutez le courriel','Enter an email'),'error');try{const r=await artyFetch(editingId?`/api/admin/access-grants/${encodeURIComponent(editingId)}`:'/api/admin/access-grants',{method:editingId?'PUT':'POST',headers:authH(),body:JSON.stringify({name,email,permissions,active:true})}),d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||t('Impossible de sauvegarder','Could not save'),'error');editingId='';window.__artyNewStaff=false;await load();render();showToast(t('Accès enregistré','Access saved'),'success')}catch{showToast(t('Erreur de connexion','Connection error'),'error')}};
window.resendStaffAccess=async id=>{try{const r=await artyFetch(`/api/admin/access-grants/${encodeURIComponent(id)}/resend`,{method:'POST',headers:authH(),body:'{}'}),d=await r.json().catch(()=>({}));if(!r.ok)return showToast(d.error||t('Impossible de renvoyer','Could not resend'),'error');await load();render();showToast(t('Invitation renvoyée','Invitation resent'),'success')}catch{showToast(t('Erreur de connexion','Connection error'),'error')}};
window.deleteStaffAccess=async id=>{if(!confirm(t('Retirer cet accès?','Remove this access?')))return;try{const r=await artyFetch(`/api/admin/access-grants/${encodeURIComponent(id)}`,{method:'DELETE',headers:authH()});if(!r.ok){const d=await r.json().catch(()=>({}));return showToast(d.error||t('Impossible de retirer','Could not remove'),'error')}await load();render();showToast(t('Accès retiré','Access removed'),'success')}catch{showToast(t('Erreur de connexion','Connection error'),'error')}};
const oldSwitch=window.switchAdminTab;if(typeof oldSwitch==='function')window.switchAdminTab=function(tab,button){
 if(!canOpenTab(tab)){applyPermissions();return}
 const accessPanel=document.getElementById('adminAccessPanel');
 if(tab!=='access'&&accessPanel)accessPanel.style.display='none';
 if(tab==='access'){document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));button?.classList.add('active');document.querySelectorAll('#page-admin [id^="admin"][id$="Panel"]').forEach(panel=>panel.style.display='none');const p=document.getElementById('adminAccessPanel');if(p)p.style.display='block';load().then(render);return}
 const result=oldSwitch.apply(this,arguments);if(accessPanel)accessPanel.style.display='none';setTimeout(applyPermissions,0);return result
};
const oldLoad=window.loadAdminData;if(typeof oldLoad==='function')window.loadAdminData=async function(){const result=await oldLoad.apply(this,arguments);ensurePanel();await load();render();applyPermissions();return result};
let permissionObserver=null;
function watchAdminTabs(){
 const tabs=document.querySelector('.admin-tabs');if(!tabs||permissionObserver)return;
 permissionObserver=new MutationObserver(()=>applyPermissions());
 permissionObserver.observe(tabs,{childList:true,subtree:true});
}
style();ensurePanel();watchAdminTabs();applyPermissions();
})();