/* ARTY CRM V2 — sales action centre, customer 360 and lead pipeline */
(()=>{
'use strict';

const state={
  summary:null,actions:null,reporting:null,customers:[],leads:[],team:[],customer:null,
  customerQuery:'',customerFilter:'all',leadQuery:'',leadOwner:'all',leadStatus:'all',
  dragLead:null,editingLead:null
};
const EN=()=>{try{return I18n.language?.()==='en'}catch{return false}};
const T=(fr,en)=>EN()?en:fr;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=esc;
const money=v=>new Intl.NumberFormat(EN()?'en-CA':'fr-CA',{style:'currency',currency:'CAD'}).format(Number(v)||0);
const date=v=>v?new Date(v).toLocaleDateString(EN()?'en-CA':'fr-CA'):'—';
const dateTime=v=>v?new Date(v).toLocaleString(EN()?'en-CA':'fr-CA'):'—';
const has=p=>currentUser?.role==='admin'||(Array.isArray(currentUser?.permissions)&&currentUser.permissions.includes(p));
const statusOrder=['new','contacted','qualified','quote_sent','follow_up','won','lost'];
const statusLabel=s=>({
  new:T('Nouveau','New'),
  contacted:T('Contacté','Contacted'),
  qualified:T('Qualifié','Qualified'),
  quote_sent:T('Devis envoyé','Quote sent'),
  follow_up:T('Suivi','Follow-up'),
  won:T('Gagné','Won'),
  lost:T('Perdu','Lost')
})[s]||s;
const lostLabel=s=>({
  price:T('Prix','Price'),
  no_response:T('Aucune réponse','No response'),
  date_unavailable:T('Date indisponible','Date unavailable'),
  cancelled:T('Annulé','Cancelled'),
  not_fit:T('Pas adapté','Not a fit'),
  competitor:T('Concurrent','Competitor'),
  other:T('Autre','Other')
})[s]||'';
const timelineLabel=x=>({
  account:T('Compte créé','Account created'),login:T('Dernière connexion','Last login'),order:T('Commande','Order'),
  event_request:T('Demande événement','Event request'),booking:T('Réservation','Booking'),contact:T('Message','Message'),
  lead:T('Prospect manuel','Manual lead'),manual_lead:T('Prospect manuel','Manual lead'),note:T('Note interne','Internal note')
})[x.type]||x.type;

async function api(path,opts={}){
  const headers={...(opts.headers||{}),...authH()};
  if(opts.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
  const r=await artyFetch(path,{...opts,headers}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||T('Erreur CRM','CRM error'));
  return d;
}
function addTab(key,label,afterSelector){
  const tabs=document.querySelector('.admin-tabs');if(!tabs||tabs.querySelector('[data-crm-tab="'+key+'"]'))return;
  const b=document.createElement('button');b.type='button';b.className='admin-tab';b.dataset.crmTab=key;b.textContent=label;b.setAttribute('onclick',`switchAdminTab('${key}',this)`);
  const after=tabs.querySelector(afterSelector)||tabs.querySelector('.admin-tab[onclick*="dashboard"]');if(after)after.insertAdjacentElement('afterend',b);else tabs.appendChild(b);
}
function ensurePanels(){
  const container=document.querySelector('.admin-pro-container')||document.querySelector('#page-admin .container');if(!container)return;
  for(const [id,after] of [['adminCrmOverviewPanel','adminDashboardPanel'],['adminCrmCustomersPanel','adminCrmOverviewPanel'],['adminCrmLeadsPanel','adminCrmCustomersPanel']]){
    if(document.getElementById(id))continue;
    const p=document.createElement('div');p.id=id;p.style.display='none';
    const anchor=document.getElementById(after);anchor?.insertAdjacentElement('afterend',p)||container.appendChild(p);
  }
}
function ensure(){
  if(!currentUser||!['admin','staff'].includes(currentUser.role))return;
  if(has('crm_dashboard'))addTab('crmOverview',T('CRM','CRM'),'.admin-tab[onclick*="dashboard"]');
  if(has('customers'))addTab('crmCustomers',T('Clients','Customers'),'[data-crm-tab="crmOverview"]');
  if(has('leads'))addTab('crmLeads',T('Prospects','Leads'),'[data-crm-tab="crmCustomers"]');
  ensurePanels();styles();ensureModal();
}
function ensureModal(){
  if(document.getElementById('crmLeadModal'))return;
  const modal=document.createElement('div');modal.id='crmLeadModal';modal.className='crm-modal';modal.hidden=true;
  modal.innerHTML='<button class="crm-modal-backdrop" type="button" onclick="ARTYCRM.closeLeadEditor()"></button><section class="crm-modal-sheet"><button class="crm-modal-close" type="button" onclick="ARTYCRM.closeLeadEditor()">×</button><div id="crmLeadEditorBody"></div></section>';
  document.body.appendChild(modal);
}

async function loadOverview(){
  if(!has('crm_dashboard'))return;
  try{
    const [summary,actions,reporting]=await Promise.all([api('/api/admin/crm/summary'),api('/api/admin/crm/action-center'),api('/api/admin/crm/reporting')]);
    state.summary=summary;state.actions=actions;state.reporting=reporting;
  }catch(e){console.error('CRM overview',e)}
}
async function loadCustomers(){
  if(!has('customers'))return;
  try{state.customers=await api('/api/admin/crm/customers')}catch(e){console.error('CRM customers',e);state.customers=[]}
}
async function loadLeads(){
  if(!has('leads'))return;
  try{const [leads,team]=await Promise.all([api('/api/admin/crm/leads'),api('/api/admin/crm/team')]);state.leads=leads;state.team=team}catch(e){console.error('CRM leads',e);state.leads=[];state.team=[]}
}
async function loadAll(){ensure();await Promise.all([loadOverview(),loadCustomers(),loadLeads()])}

function stat(label,value,sub=''){return `<div class="crm-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
function actionLeadCard(l,kind=''){
  return `<button class="crm-action-row" onclick="ARTYCRM.openLeadByKey('${attr(l.kind)}','${attr(encodeURIComponent(l.id))}')"><span><strong>${esc(l.name||l.email)}</strong><small>${esc(l.title||'')} · ${esc(l.email||'')}</small></span><span><b>${money(l.value||l.expectedValue)}</b><small>${l.nextFollowUp?date(l.nextFollowUp):esc(kind)}</small></span></button>`;
}
function renderOverview(){
  const p=document.getElementById('adminCrmOverviewPanel');if(!p||!has('crm_dashboard'))return;
  const s=state.summary||{},a=state.actions||{},r=state.reporting||{rates:{},totals:{},sources:[],eventTypes:[]};
  p.innerHTML=`
    <div class="crm-head"><div><span>CRM</span><h2>${T('Centre d’action ventes','Sales action centre')}</h2><p>${T('Ce qui demande votre attention aujourd’hui, puis les indicateurs qui expliquent ce qui transforme les prospects en ventes.','What needs attention today, followed by the metrics that explain what turns leads into sales.')}</p></div><div class="crm-head-actions">${currentUser?.role==='admin'?`<button class="btn btn-ghost btn-sm" onclick="ARTYCRM.download('backup')">${T('Sauvegarde CRM','CRM backup')}</button>`:''}</div></div>
    <div class="crm-stats">${stat(T('Nouveaux prospects','New leads'),s.newLeads||0)}${stat(T('Suivis en retard','Overdue follow-ups'),s.followUpsDue||0)}${stat(T('Suivis aujourd’hui','Follow-ups today'),s.followUpsToday||0)}${stat(T('Pipeline ouvert','Open pipeline'),money(s.openPipelineValue||0))}</div>
    <div class="crm-action-grid">
      <section class="crm-section"><div class="crm-section-head"><div><h3>${T('À faire maintenant','Do now')}</h3><p>${T('Suivis en retard et prospects nouveaux.','Overdue follow-ups and new leads.')}</p></div></div>
        <div class="crm-action-block"><h4>${T('En retard','Overdue')}</h4>${(a.overdue||[]).map(l=>actionLeadCard(l,T('À relancer','Follow up'))).join('')||`<div class="crm-empty compact">${T('Aucun suivi en retard.','No overdue follow-ups.')}</div>`}</div>
        <div class="crm-action-block"><h4>${T('Nouveaux prospects','New leads')}</h4>${(a.newLeads||[]).slice(0,8).map(l=>actionLeadCard(l,T('Nouveau','New'))).join('')||`<div class="crm-empty compact">${T('Aucun nouveau prospect.','No new leads.')}</div>`}</div>
      </section>
      <section class="crm-section"><div class="crm-section-head"><div><h3>${T('À surveiller','Watch list')}</h3><p>${T('Devis et paiements qui peuvent rapidement devenir du revenu.','Quotes and payments that can quickly become revenue.')}</p></div></div>
        <div class="crm-action-block"><h4>${T('Devis en attente','Quotes waiting')}</h4>${(a.quoteWaiting||[]).slice(0,10).map(l=>actionLeadCard(l,T('Devis','Quote'))).join('')||`<div class="crm-empty compact">${T('Aucun devis en attente.','No quotes waiting.')}</div>`}</div>
        <div class="crm-mini-alert"><strong>${Number(a.paymentPending)||0}</strong><span>${T('paiements en attente','payments pending')}</span></div>
      </section>
    </div>
    ${(has('orders')||has('inventory'))?`<div class="crm-action-grid crm-ops-grid">
      ${has('orders')?`<section class="crm-section"><div class="crm-section-head"><div><h3>${T('Commandes récentes','Recent orders')}</h3><p>${T('Un aperçu opérationnel sans quitter le CRM.','An operational snapshot without leaving the CRM.')}</p></div></div><div class="crm-action-block">${(a.recentOrders||[]).map(o=>`<div class="crm-operation-row"><span><strong>${esc(o.id)}</strong><small>${dateTime(o.createdAt)} · ${esc(o.status||o.paymentStatus||'')}</small></span><b>${money(o.total)}</b></div>`).join('')||`<div class="crm-empty compact">${T('Aucune commande récente.','No recent orders.')}</div>`}</div></section>`:''}
      ${has('inventory')?`<section class="crm-section"><div class="crm-section-head"><div><h3>${T('Inventaire à surveiller','Inventory watch')}</h3><p>${T('Produits épuisés ou sous le seuil de stock faible.','Out-of-stock or low-stock products.')}</p></div></div><div class="crm-action-block">${(a.lowInventory||[]).map(k=>`<div class="crm-operation-row"><span><strong>${esc(k.name||('Product '+k.id))}</strong><small>${k.inStock?T('Stock faible','Low stock'):T('Épuisé','Out of stock')}</small></span><b>${Number(k.stockQty)||0}</b></div>`).join('')||`<div class="crm-empty compact">${T('Aucune alerte d’inventaire.','No inventory alerts.')}</div>`}</div></section>`:''}
    </div>`:''}
    <section class="crm-section crm-reporting"><div class="crm-section-head"><div><h3>${T('Performance commerciale','Sales performance')}</h3><p>${T('Mesurez la conversion plutôt que seulement le trafic.','Measure conversion, not just traffic.')}</p></div></div>
      <div class="crm-report-stats">
        ${stat(T('Prospect → devis','Lead → quote'),(r.rates?.leadToQuote||0)+'%')}
        ${stat(T('Devis → vente','Quote → sale'),(r.rates?.quoteToWon||0)+'%')}
        ${stat(T('Clients récurrents','Repeat customers'),(r.rates?.repeatCustomer||0)+'%')}
        ${stat(T('Vente moyenne','Average won sale'),money(r.averageWonValue||0))}
        ${stat(T('Cycle de vente moyen','Average sales cycle'),(r.averageSalesCycleDays||0)+' '+T('jours','days'))}
      </div>
      <div class="crm-report-grid">
        <div><h4>${T('Sources','Sources')}</h4><div class="crm-report-table"><div class="head"><span>${T('Source','Source')}</span><span>${T('Prospects','Leads')}</span><span>${T('Ventes','Won')}</span><span>${T('Revenu','Revenue')}</span></div>${(r.sources||[]).slice(0,12).map(x=>`<div><span>${esc(x.source)}</span><span>${x.leads}</span><span>${x.won} · ${x.conversion}%</span><span>${money(x.value)}</span></div>`).join('')||`<p class="crm-empty compact">${T('Pas encore de données.','No data yet.')}</p>`}</div></div>
        <div><h4>${T('Types d’événements','Event types')}</h4><div class="crm-report-table"><div class="head"><span>${T('Type','Type')}</span><span>${T('Prospects','Leads')}</span><span>${T('Ventes','Won')}</span><span>${T('Revenu','Revenue')}</span></div>${(r.eventTypes||[]).slice(0,12).map(x=>`<div><span>${esc(x.eventType)}</span><span>${x.leads}</span><span>${x.won} · ${x.conversion}%</span><span>${money(x.value)}</span></div>`).join('')||`<p class="crm-empty compact">${T('Pas encore de données.','No data yet.')}</p>`}</div></div>
      </div>
    </section>`;
}

function customerVisible(c){
  const q=state.customerQuery.toLowerCase().trim();
  if(q&&![c.name,c.email,c.phone,...(c.tags||[])].join(' ').toLowerCase().includes(q))return false;
  if(state.customerFilter==='accounts'&&!c.hasAccount)return false;
  if(state.customerFilter==='leads'&&c.leadCount<1)return false;
  if(state.customerFilter==='repeat'&&c.paidOrderCount<2)return false;
  if(state.customerFilter==='disabled'&&!c.disabled)return false;
  return true;
}
function renderCustomers(){
  const p=document.getElementById('adminCrmCustomersPanel');if(!p||!has('customers'))return;
  const rows=state.customers.filter(customerVisible);
  p.innerHTML=`
    <div class="crm-head"><div><span>CRM</span><h2>${T('Clients','Customers')}</h2><p>${T('Historique complet, comptes, commandes, événements, préférences et notes internes.','Complete history, accounts, orders, events, preferences and internal notes.')}</p></div><div class="crm-head-actions"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.download('customers')">${T('Exporter CSV','Export CSV')}</button></div></div>
    <div class="crm-toolbar"><input type="search" value="${attr(state.customerQuery)}" placeholder="${T('Rechercher nom, courriel, téléphone ou étiquette…','Search name, email, phone or tag…')}" oninput="ARTYCRM.searchCustomers(this.value)"><select onchange="ARTYCRM.filterCustomers(this.value)"><option value="all">${T('Tous les contacts','All contacts')}</option><option value="accounts" ${state.customerFilter==='accounts'?'selected':''}>${T('Comptes ARTY','ARTY accounts')}</option><option value="leads" ${state.customerFilter==='leads'?'selected':''}>${T('Avec prospect','With leads')}</option><option value="repeat" ${state.customerFilter==='repeat'?'selected':''}>${T('Clients récurrents','Repeat customers')}</option><option value="disabled" ${state.customerFilter==='disabled'?'selected':''}>${T('Comptes désactivés','Disabled accounts')}</option></select></div>
    <div class="crm-layout"><div class="crm-list"><div class="crm-table-head"><span>${T('Client','Customer')}</span><span>${T('Activité','Activity')}</span><span>${T('Valeur','Value')}</span></div>
      ${rows.map(c=>`<button class="crm-customer-row ${c.disabled?'disabled':''}" onclick="ARTYCRM.openCustomer('${encodeURIComponent(c.email)}')"><span><strong>${esc(c.name)}</strong><small>${esc(c.email)}${c.phone?' · '+esc(c.phone):''}</small><i>${c.disabled?T('Compte désactivé','Account disabled'):c.hasAccount?T('Compte ARTY','ARTY account'):T('Contact seulement','Contact only')}</i></span><span><b>${c.orderCount} ${T('commande(s)','order(s)')}</b><small>${c.leadCount} ${T('prospect(s)','lead(s)')} · ${date(c.lastActivity)}</small></span><span><strong>${money(c.lifetimeSpend)}</strong><small>${(c.tags||[]).map(esc).join(' · ')||'—'}</small></span></button>`).join('')||`<div class="crm-empty">${T('Aucun client trouvé.','No customers found.')}</div>`}
    </div><div class="crm-detail" id="crmCustomerDetail">${T('Sélectionnez un client pour voir son historique.','Select a customer to view their history.')}</div></div>`;
  if(state.customer)renderCustomerDetail();
}
async function openCustomer(encoded){
  const email=decodeURIComponent(encoded);
  try{state.customer=await api('/api/admin/crm/customers/'+encodeURIComponent(email));renderCustomerDetail()}catch(e){showToast(e.message,'error')}
}
function renderCustomerDetail(){
  const host=document.getElementById('crmCustomerDetail'),d=state.customer;if(!host||!d)return;
  const c=d.summary,a=d.account,p=d.preferences||{};
  host.innerHTML=`
    <div class="crm-detail-head"><div><span>${a?T('Client avec compte','Account customer'):T('Contact / prospect','Contact / lead')}</span><h3>${esc(c.name)}</h3><p>${esc(c.email)}${c.phone?' · '+esc(c.phone):''}</p></div><strong>${money(c.lifetimeSpend)}</strong></div>
    ${a?.accountDisabledAt?`<div class="crm-account-warning">${T('Ce compte est désactivé. Les sessions actives ont été fermées.','This account is disabled. Active sessions have been revoked.')}</div>`:''}
    <div class="crm-mini-grid"><div><span>${T('Commandes payées','Paid orders')}</span><b>${c.paidOrderCount}</b></div><div><span>${T('Panier moyen','Average order')}</span><b>${money(c.averageOrder)}</b></div><div><span>${T('Prospects','Leads')}</span><b>${c.leadCount}</b></div></div>
    ${a?`<section class="crm-detail-section"><div class="crm-subhead"><h4>${T('Gestion du compte','Account management')}</h4><small>${T('Dernière connexion','Last login')}: ${dateTime(a.lastLoginAt)}</small></div><div class="crm-account-form"><label>${T('Nom','Name')}<input id="crmAccountName" value="${attr(a.name||'')}"></label><label>${T('Téléphone','Phone')}<input id="crmAccountPhone" value="${attr(a.phone||'')}"></label></div><div class="crm-inline-actions"><button class="btn btn-orange btn-sm" onclick="ARTYCRM.saveAccount()">${T('Enregistrer','Save')}</button>${has('account_management')?`<button class="btn btn-ghost btn-sm" onclick="ARTYCRM.sendPasswordReset()">${T('Envoyer réinitialisation','Send password reset')}</button><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.resendWelcome()">${T('Renvoyer bienvenue','Resend welcome')}</button><button class="btn ${a.accountDisabledAt?'btn-teal':'btn-ghost'} btn-sm" onclick="ARTYCRM.toggleAccount(${a.accountDisabledAt?'false':'true'})">${a.accountDisabledAt?T('Réactiver','Reactivate'):T('Désactiver','Disable')}</button>`:''}</div></section>`:''}
    <section class="crm-detail-section"><div class="crm-subhead"><h4>${T('Préférences','Preferences')}</h4></div><div class="crm-preference-grid"><div><span>${T('Langue préférée','Preferred language')}</span><strong>${p.preferredLanguage==='en'?'English':p.preferredLanguage==='fr'?'Français':'—'}</strong></div><div><span>${T('Marketing','Marketing')}</span><strong>${p.marketingConsent?T('Consentement actif','Consented'):T('Non inscrit','Not subscribed')}</strong><small>${p.marketingConsentAt?dateTime(p.marketingConsentAt):''}</small></div></div><p class="crm-legal-note">${T('Le consentement marketing est contrôlé par le client depuis son compte.','Marketing consent is controlled by the customer from their account.')}</p></section>
    <section class="crm-detail-section"><div class="crm-form-block"><label>${T('Étiquettes internes','Internal tags')}</label><input id="crmCustomerTags" value="${attr((c.tags||[]).join(', '))}" placeholder="VIP, Corporate, Repeat"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.saveCustomerTags()">${T('Sauvegarder','Save')}</button></div><div class="crm-form-block"><label>${T('Ajouter une note','Add note')}</label><textarea id="crmCustomerNote" rows="2" placeholder="${T('Préférences, contexte, prochain échange…','Preferences, context, next conversation…')}"></textarea><button class="btn btn-orange btn-sm" onclick="ARTYCRM.addCustomerNote()">${T('Ajouter','Add')}</button></div></section>
    <section class="crm-detail-section"><div class="crm-subhead"><h4>${T('Historique','Timeline')}</h4><small>${(d.timeline||[]).length} ${T('activité(s)','activities')}</small></div><div class="crm-timeline">${(d.timeline||[]).map(x=>`<div><i></i><span><strong>${esc(timelineLabel(x))}</strong><small>${dateTime(x.at)}${x.status?' · '+esc(statusLabel(x.status)||x.status):''}${x.amount?' · '+money(x.amount):''}</small><p>${esc(x.detail||'')}</p></span></div>`).join('')||`<p class="crm-empty compact">${T('Aucune activité.','No activity.')}</p>`}</div></section>`;
}
async function saveAccount(){
  if(!state.customer?.account)return;
  try{
    await api('/api/admin/crm/customers/'+encodeURIComponent(state.customer.summary.email)+'/account',{method:'PATCH',body:JSON.stringify({name:document.getElementById('crmAccountName')?.value||'',phone:document.getElementById('crmAccountPhone')?.value||''})});
    showToast(T('Compte mis à jour','Account updated'),'success');await refreshCustomer();
  }catch(e){showToast(e.message,'error')}
}
async function toggleAccount(disabled){
  if(!state.customer?.account)return;
  const msg=disabled?T('Désactiver ce compte? Les sessions actives seront fermées.','Disable this account? Active sessions will be revoked.'):T('Réactiver ce compte?','Reactivate this account?');
  if(!confirm(msg))return;
  try{await api('/api/admin/crm/customers/'+encodeURIComponent(state.customer.summary.email)+'/disable',{method:'POST',body:JSON.stringify({disabled})});showToast(disabled?T('Compte désactivé','Account disabled'):T('Compte réactivé','Account reactivated'),'success');await refreshCustomer()}catch(e){showToast(e.message,'error')}
}
async function sendPasswordReset(){
  if(!state.customer?.account)return;if(!confirm(T('Envoyer un lien de réinitialisation sécurisé à ce client?','Send a secure password reset link to this customer?')))return;
  try{await api('/api/admin/crm/customers/'+encodeURIComponent(state.customer.summary.email)+'/password-reset',{method:'POST',body:'{}'});showToast(T('Lien envoyé','Reset link sent'),'success')}catch(e){showToast(e.message,'error')}
}
async function resendWelcome(){
  if(!state.customer?.account)return;
  try{await api('/api/admin/crm/customers/'+encodeURIComponent(state.customer.summary.email)+'/resend-welcome',{method:'POST',body:'{}'});showToast(T('Courriel de bienvenue envoyé','Welcome email sent'),'success')}catch(e){showToast(e.message,'error')}
}
async function refreshCustomer(){const email=state.customer.summary.email;await Promise.all([loadCustomers(),openCustomer(encodeURIComponent(email))]);renderCustomers();renderCustomerDetail()}
async function saveCustomerTags(){
  if(!state.customer)return;const tags=(document.getElementById('crmCustomerTags')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
  try{await api('/api/admin/crm/customers/'+encodeURIComponent(state.customer.summary.email)+'/tags',{method:'PUT',body:JSON.stringify({tags})});showToast(T('Étiquettes sauvegardées','Tags saved'),'success');await refreshCustomer()}catch(e){showToast(e.message,'error')}
}
async function addCustomerNote(){
  if(!state.customer)return;const el=document.getElementById('crmCustomerNote'),note=el?.value.trim();if(!note)return;
  try{await api('/api/admin/crm/customers/'+encodeURIComponent(state.customer.summary.email)+'/notes',{method:'POST',body:JSON.stringify({note})});showToast(T('Note ajoutée','Note added'),'success');await refreshCustomer()}catch(e){showToast(e.message,'error')}
}

function filteredLeads(){
  const q=state.leadQuery.toLowerCase().trim();
  return state.leads.filter(l=>{
    if(q&&![l.name,l.email,l.phone,l.title,l.source,l.campaign,...(l.tags||[])].join(' ').toLowerCase().includes(q))return false;
    if(state.leadOwner!=='all'&&String(l.owner||'')!==state.leadOwner)return false;
    if(state.leadStatus!=='all'&&l.status!==state.leadStatus)return false;
    return true;
  });
}
function leadCard(l){
  const overdue=l.nextFollowUp&&l.nextFollowUp.slice(0,10)<new Date().toISOString().slice(0,10)&&!['won','lost'].includes(l.status);
  return `<article class="crm-kanban-card ${overdue?'overdue':''}" draggable="true" ondragstart="ARTYCRM.dragStart(event,'${attr(l.kind)}','${attr(encodeURIComponent(l.id))}')" onclick="ARTYCRM.openLeadEditor('${attr(l.kind)}','${attr(encodeURIComponent(l.id))}')"><div class="crm-card-top"><span>${esc(l.reference||l.key)}</span><b>${money(l.finalValue||l.value||l.expectedValue)}</b></div><h4>${esc(l.name||l.email)}</h4><p>${esc(l.title||'')}</p><div class="crm-card-tags">${l.owner?`<span>${esc(state.team.find(t=>t.email===l.owner)?.name||l.owner)}</span>`:''}${l.source?`<span>${esc(l.source)}</span>`:''}${(l.tags||[]).slice(0,2).map(x=>`<span>${esc(x)}</span>`).join('')}</div>${l.nextFollowUp?`<small class="crm-follow ${overdue?'late':''}">${overdue?T('En retard','Overdue'):T('Suivi','Follow-up')}: ${date(l.nextFollowUp)}</small>`:''}${l.status==='lost'&&l.lostReason?`<small class="crm-lost-reason">${esc(lostLabel(l.lostReason))}</small>`:''}</article>`;
}
function renderLeads(){
  const p=document.getElementById('adminCrmLeadsPanel');if(!p||!has('leads'))return;
  const leads=filteredLeads(),s=state.summary||{};
  p.innerHTML=`
    <div class="crm-head"><div><span>CRM</span><h2>${T('Pipeline de ventes','Sales pipeline')}</h2><p>${T('Glissez les cartes entre les étapes, assignez un responsable et gardez chaque suivi visible.','Drag cards between stages, assign an owner and keep every follow-up visible.')}</p></div><div class="crm-head-actions"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.download('leads')">${T('Exporter CSV','Export CSV')}</button><button class="btn btn-orange btn-sm" onclick="ARTYCRM.newLead()">＋ ${T('Ajouter un prospect','Add lead')}</button></div></div>
    <div class="crm-stats">${stat(T('Nouveaux','New'),s.newLeads||state.leads.filter(l=>l.status==='new').length)}${stat(T('Suivis en retard','Overdue'),s.followUpsDue||0)}${stat(T('Pipeline','Pipeline'),money(s.openPipelineValue||0))}${stat(T('Gagné','Won'),money(s.wonValue||0))}</div>
    <div class="crm-toolbar"><input type="search" value="${attr(state.leadQuery)}" placeholder="${T('Rechercher un prospect…','Search leads…')}" oninput="ARTYCRM.searchLeads(this.value)"><select onchange="ARTYCRM.filterOwner(this.value)"><option value="all">${T('Toute l’équipe','All team')}</option>${state.team.map(t=>`<option value="${attr(t.email)}" ${state.leadOwner===t.email?'selected':''}>${esc(t.name)}</option>`).join('')}</select><select onchange="ARTYCRM.filterStatus(this.value)"><option value="all">${T('Toutes les étapes','All stages')}</option>${statusOrder.map(s=>`<option value="${s}" ${state.leadStatus===s?'selected':''}>${esc(statusLabel(s))}</option>`).join('')}</select></div>
    <div class="crm-kanban">${statusOrder.map(s=>`<section class="crm-kanban-col" data-stage="${s}" ondragover="event.preventDefault()" ondrop="ARTYCRM.dropStage(event,'${s}')"><header><span class="crm-stage-dot ${s}"></span><strong>${esc(statusLabel(s))}</strong><b>${leads.filter(l=>l.status===s).length}</b></header><div class="crm-kanban-list">${leads.filter(l=>l.status===s).map(leadCard).join('')||`<div class="crm-drop-empty">${T('Déposez ici','Drop here')}</div>`}</div></section>`).join('')}</div>`;
}
function ownerOptions(selected=''){return `<option value="">${T('Non assigné','Unassigned')}</option>${state.team.map(t=>`<option value="${attr(t.email)}" ${selected===t.email?'selected':''}>${esc(t.name)}${t.role==='admin'?' · '+T('Admin','Admin'):''}</option>`).join('')}`}
function openLeadEditor(kind,idEncoded,forcedStatus=''){
  const id=decodeURIComponent(idEncoded),lead=kind?state.leads.find(l=>l.kind===kind&&String(l.id)===String(id)):null;
  state.editingLead=lead?{...lead}:{kind:'manual',id:'',status:'new',name:'',email:'',phone:'',title:'',eventType:'',preferredDate:'',expectedValue:0,value:0,finalValue:0,source:'manual',campaign:'',owner:currentUser?.email||'',nextFollowUp:'',tags:[],adminNote:'',lostReason:'',message:''};
  if(forcedStatus)state.editingLead.status=forcedStatus;
  renderLeadEditor();const m=document.getElementById('crmLeadModal');m.hidden=false;document.body.classList.add('crm-modal-open');
}
function newLead(){openLeadEditor('','')}
function closeLeadEditor(){const m=document.getElementById('crmLeadModal');if(m)m.hidden=true;document.body.classList.remove('crm-modal-open');state.editingLead=null}
function renderLeadEditor(){
  const host=document.getElementById('crmLeadEditorBody'),l=state.editingLead;if(!host||!l)return;const isNew=!l.id,manual=isNew||l.kind==='manual';
  host.innerHTML=`<div class="crm-editor-head"><span>CRM</span><h2>${isNew?T('Nouveau prospect','New lead'):esc(l.name||l.email)}</h2><p>${isNew?T('Ajoutez un prospect provenant d’un appel, Instagram, courriel ou autre source.','Add a lead from a call, Instagram, email or any other source.'):esc(l.reference||l.key)}</p></div>
    <div class="crm-editor-grid">
      <label>${T('Nom','Name')}<input id="leadName" value="${attr(l.name||'')}" ${manual?'':'disabled'}></label>
      <label>${T('Courriel','Email')}<input id="leadEmail" type="email" value="${attr(l.email||'')}" ${manual?'':'disabled'}></label>
      <label>${T('Téléphone','Phone')}<input id="leadPhone" value="${attr(l.phone||'')}" ${manual?'':'disabled'}></label>
      <label>${T('Sujet / occasion','Title / occasion')}<input id="leadTitle" value="${attr(l.title||'')}" ${manual?'':'disabled'}></label>
      <label>${T('Étape','Stage')}<select id="leadStatus">${statusOrder.map(s=>`<option value="${s}" ${l.status===s?'selected':''}>${esc(statusLabel(s))}</option>`).join('')}</select></label>
      <label>${T('Responsable','Owner')}<select id="leadOwner">${ownerOptions(l.owner||'')}</select></label>
      <label>${T('Valeur estimée','Expected value')}<input id="leadValue" type="number" min="0" step="0.01" value="${Number(l.expectedValue||l.value||0)}" ${manual?'':'disabled'}></label>
      <label>${T('Valeur finale','Final value')}<input id="leadFinalValue" type="number" min="0" step="0.01" value="${Number(l.finalValue||0)}"></label>
      <label>${T('Prochain suivi','Next follow-up')}<input id="leadFollow" type="date" value="${attr((l.nextFollowUp||'').slice(0,10))}"></label>
      <label>${T('Date souhaitée','Preferred date')}<input id="leadPreferredDate" type="date" value="${attr((l.preferredDate||'').slice(0,10))}" ${manual?'':'disabled'}></label>
      <label>${T('Source','Source')}<input id="leadSource" value="${attr(l.source||'')}" ${manual?'':'disabled'} placeholder="Instagram, phone, referral"></label>
      <label>${T('Campagne','Campaign')}<input id="leadCampaign" value="${attr(l.campaign||'')}" ${manual?'':'disabled'}></label>
      <label class="wide">${T('Étiquettes','Tags')}<input id="leadTags" value="${attr((l.tags||[]).join(', '))}" placeholder="Corporate, VIP, Birthday"></label>
      <label class="wide crm-lost-field" style="${l.status==='lost'?'':'display:none'}">${T('Raison perdue','Lost reason')}<select id="leadLostReason"><option value="">—</option>${['price','no_response','date_unavailable','cancelled','not_fit','competitor','other'].map(x=>`<option value="${x}" ${l.lostReason===x?'selected':''}>${esc(lostLabel(x))}</option>`).join('')}</select></label>
      <label class="wide">${T('Note interne','Internal note')}<textarea id="leadAdminNote" rows="4">${esc(l.adminNote||'')}</textarea></label>
      ${manual?`<label class="wide">${T('Détails','Details')}<textarea id="leadMessage" rows="3">${esc(l.message||'')}</textarea></label>`:''}
    </div>
    <div class="crm-editor-footer"><button class="btn btn-ghost" onclick="ARTYCRM.closeLeadEditor()">${T('Annuler','Cancel')}</button><button class="btn btn-orange" onclick="ARTYCRM.saveLeadEditor()">${isNew?T('Créer le prospect','Create lead'):T('Enregistrer','Save')}</button></div>`;
  document.getElementById('leadStatus')?.addEventListener('change',e=>{const row=host.querySelector('.crm-lost-field');if(row)row.style.display=e.target.value==='lost'?'':'none'});
}
async function saveLeadEditor(){
  const l=state.editingLead;if(!l)return;const isNew=!l.id,manual=isNew||l.kind==='manual';
  const body={
    status:document.getElementById('leadStatus')?.value||'new',
    owner:document.getElementById('leadOwner')?.value||'',
    nextFollowUp:document.getElementById('leadFollow')?.value||'',
    finalValue:Number(document.getElementById('leadFinalValue')?.value)||0,
    lostReason:document.getElementById('leadLostReason')?.value||'',
    tags:(document.getElementById('leadTags')?.value||'').split(',').map(x=>x.trim()).filter(Boolean),
    adminNote:document.getElementById('leadAdminNote')?.value||''
  };
  if(manual)Object.assign(body,{name:document.getElementById('leadName')?.value||'',email:document.getElementById('leadEmail')?.value||'',phone:document.getElementById('leadPhone')?.value||'',title:document.getElementById('leadTitle')?.value||'',preferredDate:document.getElementById('leadPreferredDate')?.value||'',value:Number(document.getElementById('leadValue')?.value)||0,source:document.getElementById('leadSource')?.value||'',campaign:document.getElementById('leadCampaign')?.value||'',message:document.getElementById('leadMessage')?.value||''});
  if(body.status==='lost'&&!body.lostReason)return showToast(T('Choisissez une raison pour le prospect perdu','Choose a lost reason'),'error');
  try{
    if(isNew)await api('/api/admin/crm/leads',{method:'POST',body:JSON.stringify(body)});
    else await api('/api/admin/crm/leads/'+encodeURIComponent(l.kind)+'/'+encodeURIComponent(l.id),{method:'PATCH',body:JSON.stringify(body)});
    showToast(isNew?T('Prospect créé','Lead created'):T('Prospect mis à jour','Lead updated'),'success');closeLeadEditor();await Promise.all([loadLeads(),loadOverview(),loadCustomers()]);renderLeads();
  }catch(e){showToast(e.message,'error')}
}
function dragStart(event,kind,idEncoded){state.dragLead={kind,id:decodeURIComponent(idEncoded)};event.dataTransfer.effectAllowed='move'}
async function dropStage(event,status){
  event.preventDefault();const ref=state.dragLead;state.dragLead=null;if(!ref)return;const lead=state.leads.find(l=>l.kind===ref.kind&&String(l.id)===String(ref.id));if(!lead||lead.status===status)return;
  if(['won','lost'].includes(status)){openLeadEditor(lead.kind,encodeURIComponent(lead.id),status);return}
  try{await api('/api/admin/crm/leads/'+encodeURIComponent(lead.kind)+'/'+encodeURIComponent(lead.id),{method:'PATCH',body:JSON.stringify({status})});await Promise.all([loadLeads(),loadOverview()]);renderLeads()}catch(e){showToast(e.message,'error')}
}
function openLeadByKey(kind,idEncoded){
  if(!has('leads'))return;
  showTab('crmLeads',document.querySelector('[data-crm-tab="crmLeads"]')).then(()=>openLeadEditor(kind,idEncoded));
}

async function download(type){
  const map={customers:'/api/admin/crm/export/customers.csv',leads:'/api/admin/crm/export/leads.csv',backup:'/api/admin/crm/export/backup.json'},path=map[type];if(!path)return;
  try{
    const r=await artyFetch(path,{headers:authH()});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||T('Export impossible','Export failed'))}
    const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=type==='customers'?'arty-customers.csv':type==='leads'?'arty-leads.csv':'arty-crm-backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){showToast(e.message,'error')}
}
async function showTab(tab,button){
  ensure();document.querySelectorAll('.admin-tab').forEach(x=>x.classList.remove('active'));button?.classList.add('active');
  document.querySelectorAll('#page-admin [id^="admin"][id$="Panel"]').forEach(x=>x.style.display='none');
  const id=tab==='crmOverview'?'adminCrmOverviewPanel':tab==='crmCustomers'?'adminCrmCustomersPanel':'adminCrmLeadsPanel',panel=document.getElementById(id);if(panel)panel.style.display='block';
  if(tab==='crmOverview'){await loadOverview();renderOverview()}
  if(tab==='crmCustomers'){await loadCustomers();renderCustomers()}
  if(tab==='crmLeads'){await Promise.all([loadLeads(),loadOverview()]);renderLeads()}
}

function install(){
  ensure();
  const base=window.switchAdminTab;
  if(typeof base==='function'&&!base.__crmV2Wrapped){
    const wrapped=function(tab,button,...rest){
      if(tab==='crmOverview'||tab==='crmCustomers'||tab==='crmLeads')return showTab(tab,button);
      return base.call(this,tab,button,...rest);
    };wrapped.__crmV2Wrapped=true;window.switchAdminTab=wrapped;
  }
  const loadBase=window.loadAdminData;
  if(typeof loadBase==='function'&&!loadBase.__crmV2Wrapped){
    const wrapped=async function(...args){const result=await loadBase.apply(this,args);ensure();await loadAll();return result};wrapped.__crmV2Wrapped=true;window.loadAdminData=wrapped;
  }
}

function styles(){
  if(document.getElementById('artyCrmStyles'))return;
  const s=document.createElement('style');s.id='artyCrmStyles';s.textContent=`
  .crm-head{display:flex;justify-content:space-between;align-items:end;gap:18px;margin:8px 0 18px}.crm-head>div:first-child>span{font-size:.73rem;font-weight:900;letter-spacing:.1em;color:var(--teal)}.crm-head h2{margin:2px 0;font-size:1.7rem}.crm-head p{margin:0;color:var(--text-light);max-width:760px}.crm-head-actions{display:flex;gap:8px;flex-wrap:wrap}
  .crm-stats,.crm-report-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.crm-report-stats{grid-template-columns:repeat(5,minmax(0,1fr))}.crm-stat{padding:15px 16px;border:1px solid var(--border-light);border-radius:16px;background:#fff;box-shadow:0 5px 18px rgba(44,36,24,.025)}.crm-stat span,.crm-stat small{display:block;color:var(--text-light);font-size:.72rem}.crm-stat strong{display:block;font-size:1.35rem;margin:3px 0}
  .crm-section{padding:18px;border:1px solid var(--border-light);border-radius:18px;background:#fff}.crm-section-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:14px}.crm-section-head h3,.crm-section h4{margin:0}.crm-section-head p{margin:3px 0 0;color:var(--text-light);font-size:.78rem}.crm-action-grid,.crm-report-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.crm-action-block{padding:11px 0;border-top:1px solid var(--border-light)}.crm-action-block:first-of-type{border-top:0}.crm-action-block>h4{font-size:.78rem;margin-bottom:7px}.crm-action-row{display:flex;justify-content:space-between;gap:12px;width:100%;padding:10px;border:0;border-radius:11px;background:transparent;text-align:left;color:inherit;cursor:pointer}.crm-action-row:hover{background:var(--bg2)}.crm-action-row span{display:grid}.crm-action-row small{color:var(--text-light);font-size:.69rem}.crm-action-row b{text-align:right}.crm-mini-alert{display:flex;align-items:center;gap:10px;padding:14px;border-radius:12px;background:var(--orange-pale,#fff5ea)}.crm-mini-alert strong{font-size:1.6rem}.crm-mini-alert span{font-size:.8rem}.crm-operation-row{display:flex;justify-content:space-between;gap:12px;padding:9px 5px;border-bottom:1px solid var(--border-light)}.crm-operation-row:last-child{border-bottom:0}.crm-operation-row span{display:grid}.crm-operation-row small{font-size:.68rem;color:var(--text-light)}.crm-operation-row b{font-size:.78rem;text-align:right}
  .crm-reporting{margin-top:14px}.crm-report-table{display:grid}.crm-report-table>div{display:grid;grid-template-columns:1.4fr .55fr .7fr .8fr;gap:8px;padding:8px 5px;border-bottom:1px solid var(--border-light);font-size:.74rem}.crm-report-table .head{font-size:.65rem;font-weight:900;text-transform:uppercase;color:var(--text-light);background:var(--bg2);border-radius:9px}.crm-report-table>div span:last-child{text-align:right;font-weight:800}
  .crm-toolbar{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}.crm-toolbar input,.crm-toolbar select,.crm-form-block input,.crm-form-block textarea,.crm-account-form input,.crm-editor-grid input,.crm-editor-grid select,.crm-editor-grid textarea{border:1px solid var(--border);border-radius:11px;padding:10px 11px;background:#fff;color:inherit}.crm-toolbar input{min-width:260px;flex:1}.crm-toolbar select{min-width:150px}
  .crm-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(360px,.75fr);gap:15px}.crm-list,.crm-detail{background:#fff;border:1px solid var(--border-light);border-radius:18px;overflow:hidden}.crm-table-head,.crm-customer-row{display:grid;grid-template-columns:1.4fr .85fr .55fr;gap:14px;align-items:center;padding:12px 15px}.crm-table-head{font-size:.67rem;font-weight:900;text-transform:uppercase;color:var(--text-light);background:var(--bg2)}.crm-customer-row{border:0;border-top:1px solid var(--border-light);width:100%;text-align:left;background:#fff;cursor:pointer;color:inherit}.crm-customer-row:hover{background:#fffaf4}.crm-customer-row.disabled{opacity:.7}.crm-customer-row span{display:grid;gap:2px}.crm-customer-row small{color:var(--text-light);font-size:.7rem}.crm-customer-row i{font-style:normal;font-size:.66rem;color:var(--teal)}
  .crm-detail{padding:18px;min-height:420px;max-height:calc(100vh - 190px);overflow:auto}.crm-detail-head{display:flex;justify-content:space-between;gap:12px}.crm-detail-head span{font-size:.67rem;font-weight:900;color:var(--teal);text-transform:uppercase}.crm-detail-head h3{margin:3px 0}.crm-detail-head p{margin:0;color:var(--text-light);font-size:.8rem}.crm-detail-head>strong{font-size:1.25rem}.crm-mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.crm-mini-grid div,.crm-preference-grid div{padding:10px;background:var(--bg2);border-radius:10px}.crm-mini-grid span,.crm-preference-grid span{display:block;font-size:.65rem;color:var(--text-light)}.crm-detail-section{padding:13px 0;border-top:1px solid var(--border-light)}.crm-subhead{display:flex;justify-content:space-between;gap:9px;align-items:center;margin-bottom:9px}.crm-subhead h4{margin:0}.crm-subhead small{color:var(--text-light)}.crm-account-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}.crm-account-form label,.crm-editor-grid label{display:grid;gap:5px;font-size:.7rem;font-weight:800}.crm-inline-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.crm-account-warning{margin:10px 0;padding:10px;border-radius:10px;background:#fff0ec;color:#934331;font-size:.75rem}.crm-preference-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.crm-preference-grid strong,.crm-preference-grid small{display:block}.crm-legal-note{font-size:.68rem;color:var(--text-light);margin:8px 0 0}
  .crm-form-block{display:grid;grid-template-columns:1fr auto;gap:7px;margin:9px 0}.crm-form-block label{grid-column:1/-1;font-size:.7rem;font-weight:800}.crm-timeline>div{display:grid;grid-template-columns:12px 1fr;gap:8px;padding:8px 0}.crm-timeline i{width:8px;height:8px;border-radius:50%;background:var(--teal);margin-top:5px}.crm-timeline small{display:block;color:var(--text-light);font-size:.68rem}.crm-timeline p{margin:2px 0 0;font-size:.77rem}
  .crm-kanban{display:grid;grid-template-columns:repeat(7,minmax(230px,1fr));gap:10px;overflow-x:auto;padding:2px 2px 12px}.crm-kanban-col{min-height:390px;padding:10px;border:1px solid var(--border-light);border-radius:15px;background:var(--bg2)}.crm-kanban-col>header{display:flex;align-items:center;gap:7px;padding:3px 2px 10px}.crm-kanban-col>header strong{font-size:.76rem;flex:1}.crm-kanban-col>header b{font-size:.68rem;padding:3px 6px;border-radius:999px;background:#fff}.crm-stage-dot{width:8px;height:8px;border-radius:50%;background:#aaa}.crm-stage-dot.new{background:#2d9fac}.crm-stage-dot.contacted{background:#609bc0}.crm-stage-dot.qualified{background:#8d79b8}.crm-stage-dot.quote_sent{background:#e29342}.crm-stage-dot.follow_up{background:#d16f45}.crm-stage-dot.won{background:#3e9a68}.crm-stage-dot.lost{background:#a26961}.crm-kanban-list{display:grid;gap:8px}.crm-kanban-card{padding:11px;border:1px solid rgba(44,36,24,.08);border-radius:12px;background:#fff;box-shadow:0 5px 15px rgba(44,36,24,.04);cursor:pointer}.crm-kanban-card.overdue{border-color:rgba(197,78,51,.35)}.crm-card-top{display:flex;justify-content:space-between;gap:8px;color:var(--text-light);font-size:.64rem}.crm-card-top b{color:var(--text);font-size:.73rem}.crm-kanban-card h4{margin:7px 0 2px}.crm-kanban-card p{margin:0;color:var(--text-light);font-size:.7rem}.crm-card-tags{display:flex;gap:4px;flex-wrap:wrap;margin:8px 0}.crm-card-tags span{padding:3px 6px;border-radius:999px;background:var(--teal-pale);color:var(--teal);font-size:.58rem;font-weight:800}.crm-follow,.crm-lost-reason{display:block;font-size:.63rem;color:var(--text-light)}.crm-follow.late{color:#ad4d37;font-weight:900}.crm-drop-empty{padding:22px 8px;text-align:center;color:var(--text-light);font-size:.66rem;border:1px dashed var(--border);border-radius:10px}
  .crm-modal[hidden]{display:none}.crm-modal{position:fixed;inset:0;z-index:10030;display:grid;place-items:center;padding:20px}.crm-modal-backdrop{position:absolute;inset:0;border:0;background:rgba(25,22,18,.55)}.crm-modal-sheet{position:relative;width:min(760px,100%);max-height:92vh;overflow:auto;padding:22px;border-radius:20px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.2)}.crm-modal-close{position:absolute;right:12px;top:10px;border:0;background:transparent;font-size:1.8rem;cursor:pointer}.crm-editor-head>span{font-size:.68rem;font-weight:900;color:var(--teal)}.crm-editor-head h2{margin:3px 0}.crm-editor-head p{margin:0 0 15px;color:var(--text-light)}.crm-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.crm-editor-grid label.wide{grid-column:1/-1}.crm-editor-grid input:disabled{background:#f5f4f0;color:#777}.crm-editor-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.crm-modal-open{overflow:hidden}
  .crm-empty{padding:24px;text-align:center;color:var(--text-light)}.crm-empty.compact{padding:12px;font-size:.74rem}
  @media(max-width:1100px){.crm-stats,.crm-report-stats{grid-template-columns:repeat(2,1fr)}.crm-action-grid,.crm-report-grid,.crm-layout{grid-template-columns:1fr}.crm-detail{max-height:none}}
  @media(max-width:680px){.crm-head{align-items:stretch;flex-direction:column}.crm-head-actions>*{flex:1}.crm-stats,.crm-report-stats{grid-template-columns:1fr 1fr}.crm-table-head{display:none}.crm-customer-row{grid-template-columns:1fr}.crm-account-form,.crm-preference-grid,.crm-editor-grid{grid-template-columns:1fr}.crm-editor-grid label.wide{grid-column:auto}.crm-detail{padding:14px}.crm-modal{padding:8px}.crm-modal-sheet{padding:18px 14px}.crm-report-table>div{grid-template-columns:1.2fr .5fr .65fr .75fr;font-size:.66rem}}
  `;document.head.appendChild(s);
}

window.ARTYCRM={
  install,loadAll,renderOverview,renderCustomers,renderLeads,openCustomer,
  searchCustomers:q=>{state.customerQuery=q;renderCustomers()},filterCustomers:v=>{state.customerFilter=v;renderCustomers()},
  searchLeads:q=>{state.leadQuery=q;renderLeads()},filterOwner:v=>{state.leadOwner=v;renderLeads()},filterStatus:v=>{state.leadStatus=v;renderLeads()},
  saveCustomerTags,addCustomerNote,saveAccount,toggleAccount,sendPasswordReset,resendWelcome,
  newLead,openLeadEditor,closeLeadEditor,saveLeadEditor,dragStart,dropStage,openLeadByKey,download
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();