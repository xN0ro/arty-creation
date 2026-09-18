/* ARTY CRM V2 — sales action centre, customer 360 and lead pipeline */
(()=>{
'use strict';

const state={
  summary:null,actions:null,reporting:null,googleCalendar:null,customers:[],leads:[],team:[],customer:null,
  customerQuery:'',customerFilter:'all',leadQuery:'',leadOwner:'all',leadStatus:'all',
  dragLead:null,editingLead:null,activeSection:'overview'
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
function addCrmTab(){
  const tabs=document.querySelector('.admin-tabs');if(!tabs||tabs.querySelector('[data-crm-main]'))return;
  const b=document.createElement('button');b.type='button';b.className='admin-tab';b.dataset.crmMain='1';b.textContent='CRM';b.setAttribute('onclick',"switchAdminTab('crm',this)");
  const after=tabs.querySelector('.admin-tab[onclick*="dashboard"]');if(after)after.insertAdjacentElement('afterend',b);else tabs.prepend(b);
}
function ensurePanels(){
  const container=document.querySelector('.admin-pro-container')||document.querySelector('#page-admin .container');if(!container)return;
  for(const [id,after] of [['adminCrmOverviewPanel','adminDashboardPanel'],['adminCrmCustomersPanel','adminCrmOverviewPanel'],['adminCrmLeadsPanel','adminCrmCustomersPanel']]){
    if(document.getElementById(id))continue;
    const p=document.createElement('div');p.id=id;p.style.display='none';
    const anchor=document.getElementById(after);anchor?.insertAdjacentElement('afterend',p)||container.appendChild(p);
  }
}
function defaultSection(){
  if(has('crm_dashboard'))return'overview';
  if(has('leads'))return'leads';
  if(has('customers'))return'customers';
  return'overview';
}
function crmNav(active){
  const items=[];
  if(has('crm_dashboard'))items.push(['overview',T('Aperçu','Overview'),T('Actions, suivis et statistiques','Actions, follow-ups & stats')]);
  if(has('leads'))items.push(['leads',T('Prospects','Leads'),T('Pipeline et ventes','Pipeline & sales')]);
  if(has('customers'))items.push(['customers',T('Clients','Customers'),T('Profils et historique','Profiles & history')]);
  return `<div class="crm-workspace-head"><div><span>ARTY CRM</span><strong>${T('Espace ventes','Sales workspace')}</strong></div><nav class="crm-subnav" aria-label="${T('Navigation CRM','CRM navigation')}">${items.map(([key,label,sub])=>`<button type="button" class="${active===key?'active':''}" onclick="ARTYCRM.section('${key}')"><span>${esc(label)}</span><small>${esc(sub)}</small></button>`).join('')}</nav></div>`;
}
function ensure(){
  if(!currentUser||!['admin','staff'].includes(currentUser.role))return;
  document.querySelectorAll('[data-crm-tab]').forEach(el=>el.remove());
  if(has('crm_dashboard')||has('customers')||has('leads'))addCrmTab();
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
    const jobs=[api('/api/admin/crm/summary'),api('/api/admin/crm/action-center'),api('/api/admin/crm/reporting')];
    if(currentUser?.role==='admin')jobs.push(api('/api/admin/crm/google-calendar/status').catch(()=>null));
    const [summary,actions,reporting,googleCalendarStatus]=await Promise.all(jobs);
    state.summary=summary;state.actions=actions;state.reporting=reporting;if(currentUser?.role==='admin')state.googleCalendar=googleCalendarStatus;
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
function googleCalendarCard(){
  const g=state.googleCalendar||{},connected=g.connected===true;
  if(!g.oauthConfigured&&!connected)return `<section class="crm-calendar-card warning"><div><span>GOOGLE CALENDAR</span><strong>${T('Configuration requise','Setup required')}</strong><small>${T('Ajoutez le Client ID et le Client Secret Google Calendar dans Render, puis revenez ici.','Add the Google Calendar Client ID and Client Secret in Render, then come back here.')}</small></div></section>`;
  return `<section class="crm-calendar-card ${connected?'connected':''}"><div><span>GOOGLE CALENDAR</span><strong>${connected?T('Connecté','Connected'):T('Prêt à connecter','Ready to connect')}</strong><small>${connected?(g.connectedEmail?esc(g.connectedEmail)+' · ':'')+T('Les suivis CRM se synchronisent automatiquement.','CRM follow-ups sync automatically.'):T('Connectez le compte Google Workspace du gestionnaire une seule fois.','Connect the manager Google Workspace account once.')}</small></div><div class="crm-calendar-actions">${connected?`<button class="btn btn-ghost btn-sm" onclick="ARTYCRM.connectGoogleCalendar()">${T('Reconnecter','Reconnect')}</button><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.disconnectGoogleCalendar()">${T('Déconnecter','Disconnect')}</button>`:`<button class="btn btn-orange btn-sm" onclick="ARTYCRM.connectGoogleCalendar()">${T('Connecter Google Calendar','Connect Google Calendar')}</button>`}</div></section>`;
}
async function connectGoogleCalendar(){
  try{
    const result=await api('/api/admin/crm/google-calendar/connect',{method:'POST',body:'{}'});
    if(!result.url)throw new Error(T('Lien Google manquant','Google authorization link missing'));
    const popup=window.open(result.url,'artyGoogleCalendar','width=560,height=720,resizable=yes,scrollbars=yes');
    if(!popup)window.location.href=result.url;
  }catch(e){showToast(e.message,'error')}
}
async function disconnectGoogleCalendar(){
  if(!confirm(T('Déconnecter Google Calendar du CRM?','Disconnect Google Calendar from CRM?')))return;
  try{await api('/api/admin/crm/google-calendar/disconnect',{method:'POST',body:'{}'});state.googleCalendar=null;await loadOverview();renderOverview();showToast(T('Google Calendar déconnecté','Google Calendar disconnected'),'success')}catch(e){showToast(e.message,'error')}
}
function renderOverview(){
  const p=document.getElementById('adminCrmOverviewPanel');if(!p||!has('crm_dashboard'))return;
  const s=state.summary||{},a=state.actions||{},r=state.reporting||{rates:{},totals:{},sources:[],eventTypes:[]};
  p.innerHTML=`${crmNav('overview')}
    <div class="crm-head"><div><span>CRM</span><h2>${T('Centre d’action ventes','Sales action centre')}</h2><p>${T('Ce qui demande votre attention aujourd’hui, puis les indicateurs qui expliquent ce qui transforme les prospects en ventes.','What needs attention today, followed by the metrics that explain what turns leads into sales.')}</p></div><div class="crm-head-actions">${currentUser?.role==='admin'?`<button class="btn btn-ghost btn-sm" onclick="ARTYCRM.download('backup')">${T('Sauvegarde CRM','CRM backup')}</button>`:''}</div></div>
    ${currentUser?.role==='admin'?googleCalendarCard():''}
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
  if(state.customerFilter==='mine'&&!(c.owners||[]).includes(String(currentUser?.email||'').toLowerCase()))return false;
  if(state.customerFilter==='accounts'&&!c.hasAccount)return false;
  if(state.customerFilter==='leads'&&c.leadCount<1)return false;
  if(state.customerFilter==='repeat'&&c.paidOrderCount<2)return false;
  if(state.customerFilter==='disabled'&&!c.disabled)return false;
  return true;
}
function renderCustomers(){
  const p=document.getElementById('adminCrmCustomersPanel');if(!p||!has('customers'))return;
  const rows=state.customers.filter(customerVisible);
  p.innerHTML=`${crmNav('customers')}
    <div class="crm-head"><div><span>CRM</span><h2>${T('Clients','Customers')}</h2><p>${T('Historique complet, comptes, commandes, événements, préférences et notes internes.','Complete history, accounts, orders, events, preferences and internal notes.')}</p></div><div class="crm-head-actions"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.download('customers')">${T('Exporter CSV','Export CSV')}</button></div></div>
    <div class="crm-toolbar"><input type="search" value="${attr(state.customerQuery)}" placeholder="${T('Rechercher nom, courriel, téléphone ou étiquette…','Search name, email, phone or tag…')}" oninput="ARTYCRM.searchCustomers(this.value)"><select onchange="ARTYCRM.filterCustomers(this.value)"><option value="all">${T('Tous les contacts','All contacts')}</option>${currentUser?.role==='staff'?`<option value="mine" ${state.customerFilter==='mine'?'selected':''}>${T('Mes clients','My clients')}</option>`:''}<option value="accounts" ${state.customerFilter==='accounts'?'selected':''}>${T('Comptes ARTY','ARTY accounts')}</option><option value="leads" ${state.customerFilter==='leads'?'selected':''}>${T('Avec prospect','With leads')}</option><option value="repeat" ${state.customerFilter==='repeat'?'selected':''}>${T('Clients récurrents','Repeat customers')}</option><option value="disabled" ${state.customerFilter==='disabled'?'selected':''}>${T('Comptes désactivés','Disabled accounts')}</option></select></div>
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
    <div class="crm-detail-head"><div><span>${a?T('Client avec compte','Account customer'):T('Contact / prospect','Contact / lead')}</span><h3>${esc(c.name)}</h3><p>${esc(c.email)}${c.phone?' · '+esc(c.phone):''}</p><div class="crm-contact-actions"><a class="btn btn-ghost btn-sm" href="mailto:${attr(c.email)}">${T('Courriel','Email')}</a>${c.phone?`<a class="btn btn-ghost btn-sm" href="tel:${attr(c.phone)}">${T('Appeler','Call')}</a>`:''}</div></div><strong>${money(c.lifetimeSpend)}</strong></div>
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
  return `<article class="crm-kanban-card ${overdue?'overdue':''}" draggable="true" ondragstart="ARTYCRM.dragStart(event,'${attr(l.kind)}','${attr(encodeURIComponent(l.id))}')" onclick="ARTYCRM.openLeadActions('${attr(l.kind)}','${attr(encodeURIComponent(l.id))}')"><div class="crm-card-top"><span>${esc(l.reference||l.key)}</span><b>${money(l.finalValue||l.value||l.expectedValue)}</b></div><h4>${esc(l.name||l.email)}</h4><p>${esc(l.title||'')}</p><div class="crm-card-tags">${l.owner?`<span>${esc(state.team.find(t=>t.email===l.owner)?.name||l.owner)}</span>`:''}${l.source?`<span>${esc(l.source)}</span>`:''}${(l.tags||[]).slice(0,2).map(x=>`<span>${esc(x)}</span>`).join('')}</div>${l.nextFollowUp?`<small class="crm-follow ${overdue?'late':''}">${overdue?T('En retard','Overdue'):T('Suivi','Follow-up')}: ${dateTime(l.nextFollowUp)}</small>`:''}${l.status==='lost'&&l.lostReason?`<small class="crm-lost-reason">${esc(lostLabel(l.lostReason))}</small>`:''}</article>`;
}
function renderLeads(){
  const p=document.getElementById('adminCrmLeadsPanel');if(!p||!has('leads'))return;
  const leads=filteredLeads(),s=state.summary||{};
  p.innerHTML=`${crmNav('leads')}
    <div class="crm-head"><div><span>CRM</span><h2>${T('Pipeline de ventes','Sales pipeline')}</h2><p>${T('Glissez les cartes entre les étapes, assignez un responsable et gardez chaque suivi visible.','Drag cards between stages, assign an owner and keep every follow-up visible.')}</p></div><div class="crm-head-actions"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.download('leads')">${T('Exporter CSV','Export CSV')}</button><button class="btn btn-orange btn-sm" onclick="ARTYCRM.newLead()">＋ ${T('Ajouter un prospect','Add lead')}</button></div></div>
    <div class="crm-stats">${stat(T('Nouveaux','New'),s.newLeads||state.leads.filter(l=>l.status==='new').length)}${stat(T('Suivis en retard','Overdue'),s.followUpsDue||0)}${stat(T('Pipeline','Pipeline'),money(s.openPipelineValue||0))}${stat(T('Gagné','Won'),money(s.wonValue||0))}</div>
    <div class="crm-toolbar"><input type="search" value="${attr(state.leadQuery)}" placeholder="${T('Rechercher un prospect…','Search leads…')}" oninput="ARTYCRM.searchLeads(this.value)"><select onchange="ARTYCRM.filterOwner(this.value)"><option value="all">${T('Toute l’équipe','All team')}</option>${state.team.map(t=>`<option value="${attr(t.email)}" ${state.leadOwner===t.email?'selected':''}>${esc(t.name)}</option>`).join('')}</select><select onchange="ARTYCRM.filterStatus(this.value)"><option value="all">${T('Toutes les étapes','All stages')}</option>${statusOrder.map(s=>`<option value="${s}" ${state.leadStatus===s?'selected':''}>${esc(statusLabel(s))}</option>`).join('')}</select></div>
    <div class="crm-kanban">${statusOrder.map(s=>`<section class="crm-kanban-col" data-stage="${s}" ondragover="event.preventDefault()" ondrop="ARTYCRM.dropStage(event,'${s}')"><header><span class="crm-stage-dot ${s}"></span><strong>${esc(statusLabel(s))}</strong><b>${leads.filter(l=>l.status===s).length}</b></header><div class="crm-kanban-list">${leads.filter(l=>l.status===s).map(leadCard).join('')||`<div class="crm-drop-empty">${T('Déposez ici','Drop here')}</div>`}</div></section>`).join('')}</div>`;
}
function ownerOptions(selected=''){return `<option value="">${T('Non assigné','Unassigned')}</option>${state.team.map(t=>`<option value="${attr(t.email)}" ${selected===t.email?'selected':''}>${esc(t.name)}${t.role==='admin'?' · '+T('Admin','Admin'):''}</option>`).join('')}`}
function modalLead(kind,idEncoded){
  const id=decodeURIComponent(idEncoded);
  return state.leads.find(l=>l.kind===kind&&String(l.id)===String(id))||null;
}
function showLeadModal(){
  const m=document.getElementById('crmLeadModal');if(m)m.hidden=false;document.body.classList.add('crm-modal-open');
}
function openLeadActions(kind,idEncoded){
  const lead=modalLead(kind,idEncoded);if(!lead)return;
  state.editingLead={...lead};renderLeadActions();showLeadModal();
}
function leadPrimaryValue(l){return money(l.finalValue||l.expectedValue||l.value||0)}
function renderLeadActions(){
  const host=document.getElementById('crmLeadEditorBody'),l=state.editingLead;if(!host||!l)return;
  const terminal=['won','lost'].includes(l.status);
  host.innerHTML=`<div class="crm-action-profile">
    <div class="crm-editor-head"><span>${esc(statusLabel(l.status))}</span><h2>${esc(l.name||l.email)}</h2><p>${esc(l.title||'')} ${l.reference?'· '+esc(l.reference):''}</p></div>
    <div class="crm-action-summary">
      <div><small>${T('Valeur','Value')}</small><strong>${leadPrimaryValue(l)}</strong></div>
      <div><small>${T('Responsable','Owner')}</small><strong>${esc(state.team.find(t=>t.email===l.owner)?.name||l.owner||T('Non assigné','Unassigned'))}</strong></div>
      <div><small>${T('Prochain suivi','Next follow-up')}</small><strong>${l.nextFollowUp?esc(dateTime(l.nextFollowUp)):T('Aucun','None')}</strong></div>
      <div><small>${T('Paiement','Payment')}</small><strong>${esc(l.quotePaymentStatus||'—')}</strong></div>
    </div>
    <div class="crm-quick-actions">
      ${!terminal?`<button class="crm-action-tile primary" onclick="ARTYCRM.renderFollowUpAction()"><span>↗</span><strong>${T('Planifier un suivi','Schedule follow-up')}</strong><small>${T('Date, heure et rappel Google Calendar','Date, time and Google Calendar reminder')}</small></button>`:''}
      ${l.status!=='won'?`<button class="crm-action-tile quote" onclick="ARTYCRM.renderQuoteAction()"><span>$</span><strong>${T('Envoyer un devis','Send quote')}</strong><small>${T('Courriel avec paiement Stripe sécurisé','Email with secure Stripe payment')}</small></button>`:''}
      <button class="crm-action-tile" onclick="ARTYCRM.emailLead()"><span>@</span><strong>${T('Envoyer un courriel','Email client')}</strong><small>${esc(l.email||'')}</small></button>
      ${l.phone?`<button class="crm-action-tile" onclick="ARTYCRM.callLead()"><span>☎</span><strong>${T('Appeler','Call')}</strong><small>${esc(l.phone)}</small></button>`:''}
      <button class="crm-action-tile" onclick="ARTYCRM.openLeadCalendar()"><span>▣</span><strong>${T('Google Calendar','Google Calendar')}</strong><small>${l.nextFollowUp?T('Ouvrir ce suivi','Open this follow-up'):T('Ouvrir le calendrier','Open calendar')}</small></button>
      ${l.status==='new'?`<button class="crm-action-tile" onclick="ARTYCRM.quickLeadStatus('contacted')"><span>✓</span><strong>${T('Marquer contacté','Mark contacted')}</strong><small>${T('Met à jour le pipeline','Updates the pipeline')}</small></button>`:''}
      ${!terminal?`<button class="crm-action-tile danger" onclick="ARTYCRM.renderLostAction()"><span>×</span><strong>${T('Marquer perdu','Mark lost')}</strong><small>${T('Enregistrer la raison','Record the reason')}</small></button>`:''}
      <button class="crm-action-tile secondary" onclick="ARTYCRM.renderLeadEditor()"><span>⋯</span><strong>${T('Modifier les détails','Edit details')}</strong><small>${T('Champs avancés du prospect','Advanced lead fields')}</small></button>
    </div>
    ${l.kind==='event'&&l.paymentLinkUrl?`<div class="crm-secure-link"><div><strong>${T('Lien de devis sécurisé','Secure quote link')}</strong><small>${T('Le client a reçu ce lien par courriel.','The customer received this link by email.')}</small></div><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.openSecureQuote()">${T('Ouvrir','Open')}</button></div>`:''}
    <div class="crm-action-footer"><button class="btn btn-ghost" onclick="ARTYCRM.closeLeadEditor()">${T('Fermer','Close')}</button></div>
  </div>`;
}
function renderFollowUpAction(){
  const host=document.getElementById('crmLeadEditorBody'),l=state.editingLead;if(!host||!l)return;
  host.innerHTML=`<div class="crm-editor-head"><span>${T('Action','Action')}</span><h2>${T('Planifier un suivi','Schedule follow-up')}</h2><p>${esc(l.name||l.email)}</p></div>
    <div class="crm-action-form">
      <label>${T('Date et heure','Date & time')}<input id="quickFollowDate" type="datetime-local" value="${attr((l.nextFollowUp||'').slice(0,16))}"></label>
      <label>${T('Type','Type')}<select id="quickFollowType"><option value="call" ${(l.followUpType||'call')==='call'?'selected':''}>${T('Appel','Call')}</option><option value="email" ${l.followUpType==='email'?'selected':''}>${T('Courriel','Email')}</option><option value="meeting" ${l.followUpType==='meeting'?'selected':''}>${T('Réunion','Meeting')}</option><option value="quote" ${l.followUpType==='quote'?'selected':''}>${T('Suivi devis','Quote follow-up')}</option><option value="other" ${l.followUpType==='other'?'selected':''}>${T('Autre','Other')}</option></select></label>
      <label>${T('Durée','Duration')}<select id="quickFollowDuration">${[15,30,45,60,90,120].map(m=>`<option value="${m}" ${Number(l.followUpDuration||30)===m?'selected':''}>${m} min</option>`).join('')}</select></label>
      <label>${T('Responsable','Owner')}<select id="quickFollowOwner">${ownerOptions(l.owner||currentUser?.email||'')}</select></label>
      <label class="wide">${T('Note interne','Internal note')}<textarea id="quickFollowNote" rows="3">${esc(l.adminNote||'')}</textarea></label>
    </div>
    <div class="crm-form-note">${T('En enregistrant, ARTY crée ou met à jour automatiquement le rendez-vous dans Google Calendar.','Saving automatically creates or updates the appointment in Google Calendar.')}</div>
    <div class="crm-editor-footer"><button class="btn btn-ghost" onclick="ARTYCRM.renderLeadActions()">${T('Retour','Back')}</button>${l.nextFollowUp?`<button class="btn btn-ghost" onclick="ARTYCRM.clearFollowUp()">${T('Supprimer le suivi','Remove follow-up')}</button>`:''}<button class="btn btn-orange" onclick="ARTYCRM.saveFollowUpAction()">${T('Planifier','Schedule')}</button></div>`;
}
async function saveFollowUpAction(){
  const l=state.editingLead,dateValue=document.getElementById('quickFollowDate')?.value||'';
  if(!l||!dateValue)return showToast(T('Choisissez une date et une heure','Choose a date and time'),'error');
  const body={nextFollowUp:dateValue,followUpType:document.getElementById('quickFollowType')?.value||'call',followUpDuration:Number(document.getElementById('quickFollowDuration')?.value)||30,owner:document.getElementById('quickFollowOwner')?.value||currentUser?.email||'',adminNote:document.getElementById('quickFollowNote')?.value||''};
  try{
    const result=await api('/api/admin/crm/leads/'+encodeURIComponent(l.kind)+'/'+encodeURIComponent(l.id),{method:'PATCH',body:JSON.stringify(body)});
    await refreshLeadAfterAction(l.kind,l.id);
    showToast(result?.calendarSync?.action==='error'?T('Suivi enregistré; vérifiez Google Calendar','Follow-up saved; check Google Calendar'):T('Suivi ajouté à Google Calendar','Follow-up added to Google Calendar'),result?.calendarSync?.action==='error'?'warning':'success');
    renderLeadActions();
  }catch(e){showToast(e.message,'error')}
}
async function clearFollowUp(){
  const l=state.editingLead;if(!l)return;
  try{await api('/api/admin/crm/leads/'+encodeURIComponent(l.kind)+'/'+encodeURIComponent(l.id),{method:'PATCH',body:JSON.stringify({nextFollowUp:''})});await refreshLeadAfterAction(l.kind,l.id);showToast(T('Suivi supprimé','Follow-up removed'),'success');renderLeadActions()}catch(e){showToast(e.message,'error')}
}
function renderQuoteAction(){
  const host=document.getElementById('crmLeadEditorBody'),l=state.editingLead;if(!host||!l)return;
  const needsConversion=l.kind!=='event';
  host.innerHTML=`<div class="crm-editor-head"><span>${T('Devis sécurisé','Secure quote')}</span><h2>${T('Envoyer le devis au client','Send quote to client')}</h2><p>${esc(l.name||l.email)} · ${esc(l.email||'')}</p></div>
    <div class="crm-quote-banner"><div><strong>${T('Paiement Stripe sécurisé','Secure Stripe payment')}</strong><small>${T('ARTY génère un lien personnel valable 30 jours et l’envoie par courriel. Après paiement, le prospect passe automatiquement à Gagné.','ARTY generates a personal 30-day link and emails it. After payment, the lead automatically becomes Won.')}</small></div></div>
    <div class="crm-action-form">
      ${needsConversion?`<label>${T('Type d’événement / projet','Event / project type')}<input id="quickQuoteEventType" value="${attr(l.eventType||l.title||'')}" placeholder="${T('Événement privé, corporatif…','Private event, corporate…')}"></label>
      <label>${T('Nombre de personnes','Guests')}<input id="quickQuoteGuests" type="number" min="1" max="1000" value="1"></label>
      <label>${T('Date souhaitée','Preferred date')}<input id="quickQuotePreferredDate" type="date" value="${attr((l.preferredDate||'').slice(0,10))}"></label>
      <label>${T('Lieu (optionnel)','Location (optional)')}<input id="quickQuoteLocation" value="" placeholder="${T('À confirmer','To be confirmed')}"></label>`:''}
      <label>${T('Montant du devis (CAD)','Quote amount (CAD)')}<input id="quickQuoteAmount" type="number" min=".50" step=".01" value="${Number(l.expectedValue||l.value||0)||''}" placeholder="500.00"></label>
      <label class="wide">${T('Description visible au client','Description shown to client')}<textarea id="quickQuoteDescription" rows="6" placeholder="${T('Ex.: Expérience artistique privée pour 20 personnes, matériel inclus…','E.g. Private art experience for 20 guests, materials included…')}">${esc(l.quoteDescription||'')}</textarea></label>
    </div>
    ${needsConversion?`<div class="crm-form-note">${T('Ce prospect sera transformé en opportunité événement afin d’utiliser le paiement sécurisé, sans créer de doublon dans le pipeline.','This lead will be converted into an event opportunity for secure payment without creating a duplicate in the pipeline.')}</div>`:''}
    <div class="crm-editor-footer"><button class="btn btn-ghost" onclick="ARTYCRM.renderLeadActions()">${T('Retour','Back')}</button><button class="btn btn-orange" onclick="ARTYCRM.sendQuoteAction()">${T('Envoyer le devis sécurisé','Send secure quote')}</button></div>`;
}
async function sendQuoteAction(){
  let l=state.editingLead;
  const amount=Number(document.getElementById('quickQuoteAmount')?.value)||0,quoteDescription=document.getElementById('quickQuoteDescription')?.value.trim()||'';
  if(!l)return;if(amount<.5)return showToast(T('Entrez un montant valide','Enter a valid amount'),'error');
  if(!confirm(T('Envoyer ce devis au client par courriel maintenant?','Send this quote to the customer by email now?')))return;
  try{
    if(l.kind!=='event'){
      const converted=await api('/api/admin/crm/leads/'+encodeURIComponent(l.kind)+'/'+encodeURIComponent(l.id)+'/convert-event',{method:'POST',body:JSON.stringify({
        eventType:document.getElementById('quickQuoteEventType')?.value||l.title||'ARTY event',
        guests:Number(document.getElementById('quickQuoteGuests')?.value)||1,
        preferredDate:document.getElementById('quickQuotePreferredDate')?.value||'',
        location:document.getElementById('quickQuoteLocation')?.value||''
      })});
      if(!converted.lead)throw new Error(T('Conversion du prospect impossible','Could not convert lead'));
      l=converted.lead;state.editingLead={...l};
    }
    const result=await api('/api/admin/event-requests/'+encodeURIComponent(l.id)+'/payment-link',{method:'POST',body:JSON.stringify({quoteAmount:amount,quoteDescription})});
    await refreshLeadAfterAction('event',l.id);
    showToast(result.emailStatus==='sent'?T('Devis envoyé. Le client peut maintenant payer en ligne.','Quote sent. The customer can now pay online.'):T('Lien créé, mais vérifiez la livraison du courriel.','Link created, but check email delivery.'),result.emailStatus==='sent'?'success':'warning');
    renderLeadActions();
  }catch(e){showToast(e.message,'error')}
}
function renderLostAction(){
  const host=document.getElementById('crmLeadEditorBody'),l=state.editingLead;if(!host||!l)return;
  host.innerHTML=`<div class="crm-editor-head"><span>${T('Pipeline','Pipeline')}</span><h2>${T('Marquer ce prospect perdu','Mark this lead lost')}</h2><p>${esc(l.name||l.email)}</p></div>
    <div class="crm-action-form"><label class="wide">${T('Raison','Reason')}<select id="quickLostReason"><option value="">—</option>${['price','no_response','date_unavailable','cancelled','not_fit','competitor','other'].map(x=>`<option value="${x}">${esc(lostLabel(x))}</option>`).join('')}</select></label></div>
    <div class="crm-editor-footer"><button class="btn btn-ghost" onclick="ARTYCRM.renderLeadActions()">${T('Retour','Back')}</button><button class="btn btn-orange" onclick="ARTYCRM.saveLostAction()">${T('Marquer perdu','Mark lost')}</button></div>`;
}
async function saveLostAction(){
  const reason=document.getElementById('quickLostReason')?.value||'';if(!reason)return showToast(T('Choisissez une raison','Choose a reason'),'error');
  await quickLeadStatus('lost',{lostReason:reason});
}
async function quickLeadStatus(status,extra={}){
  const l=state.editingLead;if(!l)return;
  try{await api('/api/admin/crm/leads/'+encodeURIComponent(l.kind)+'/'+encodeURIComponent(l.id),{method:'PATCH',body:JSON.stringify({status,...extra})});await refreshLeadAfterAction(l.kind,l.id);showToast(T('Pipeline mis à jour','Pipeline updated'),'success');renderLeadActions()}catch(e){showToast(e.message,'error')}
}
async function refreshLeadAfterAction(kind,id){
  await Promise.all([loadLeads(),loadOverview(),loadCustomers()]);
  const refreshed=state.leads.find(x=>x.kind===kind&&String(x.id)===String(id));if(refreshed)state.editingLead={...refreshed};
  renderLeads();
}
function emailLead(){const l=state.editingLead;if(!l?.email)return;const subject='ARTY — '+(l.reference||l.title||T('Suivi','Follow-up'));window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(l.email)+'&su='+encodeURIComponent(subject),'_blank','noopener')}
function callLead(){const l=state.editingLead;if(l?.phone)window.location.href='tel:'+String(l.phone).replace(/[^+0-9]/g,'')}
function openLeadCalendar(){const l=state.editingLead,url=l?.calendar?.htmlLink||'https://calendar.google.com/calendar/u/0/r';window.open(url,'_blank','noopener')}
function openSecureQuote(){const url=state.editingLead?.paymentLinkUrl;if(url)window.open(url,'_blank','noopener')}

function openLeadEditor(kind,idEncoded,forcedStatus=''){
  const id=decodeURIComponent(idEncoded),lead=kind?state.leads.find(l=>l.kind===kind&&String(l.id)===String(id)):null;
  state.editingLead=lead?{...lead}:{kind:'manual',id:'',status:'new',name:'',email:'',phone:'',title:'',eventType:'',preferredDate:'',expectedValue:0,value:0,finalValue:0,source:'manual',campaign:'',owner:currentUser?.email||'',nextFollowUp:'',followUpType:'call',followUpDuration:30,tags:[],adminNote:'',lostReason:'',message:''};
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
      <label>${T('Prochain suivi','Next follow-up')}<input id="leadFollow" type="datetime-local" value="${attr((l.nextFollowUp||'').slice(0,16))}"></label>
      <label>${T('Type de suivi','Follow-up type')}<select id="leadFollowType"><option value="call" ${(l.followUpType||'call')==='call'?'selected':''}>${T('Appel','Call')}</option><option value="email" ${l.followUpType==='email'?'selected':''}>${T('Courriel','Email')}</option><option value="meeting" ${l.followUpType==='meeting'?'selected':''}>${T('Réunion','Meeting')}</option><option value="quote" ${l.followUpType==='quote'?'selected':''}>${T('Suivi devis','Quote follow-up')}</option><option value="other" ${l.followUpType==='other'?'selected':''}>${T('Autre','Other')}</option></select></label>
      <label>${T('Durée','Duration')}<select id="leadFollowDuration">${[15,30,45,60,90,120].map(m=>`<option value="${m}" ${Number(l.followUpDuration||30)===m?'selected':''}>${m} min</option>`).join('')}</select></label>
      <label>${T('Date souhaitée','Preferred date')}<input id="leadPreferredDate" type="date" value="${attr((l.preferredDate||'').slice(0,10))}" ${manual?'':'disabled'}></label>
      <label>${T('Source','Source')}<input id="leadSource" value="${attr(l.source||'')}" ${manual?'':'disabled'} placeholder="Instagram, phone, referral"></label>
      <label>${T('Campagne','Campaign')}<input id="leadCampaign" value="${attr(l.campaign||'')}" ${manual?'':'disabled'}></label>
      <label class="wide">${T('Étiquettes','Tags')}<input id="leadTags" value="${attr((l.tags||[]).join(', '))}" placeholder="Corporate, VIP, Birthday"></label>
      <label class="wide crm-lost-field" style="${l.status==='lost'?'':'display:none'}">${T('Raison perdue','Lost reason')}<select id="leadLostReason"><option value="">—</option>${['price','no_response','date_unavailable','cancelled','not_fit','competitor','other'].map(x=>`<option value="${x}" ${l.lostReason===x?'selected':''}>${esc(lostLabel(x))}</option>`).join('')}</select></label>
      <label class="wide">${T('Note interne','Internal note')}<textarea id="leadAdminNote" rows="4">${esc(l.adminNote||'')}</textarea></label>
      ${manual?`<label class="wide">${T('Détails','Details')}<textarea id="leadMessage" rows="3">${esc(l.message||'')}</textarea></label>`:''}
    </div>
    <div class="crm-editor-footer"><button class="btn btn-ghost" onclick="${isNew?'ARTYCRM.closeLeadEditor()':'ARTYCRM.renderLeadActions()'}">${isNew?T('Annuler','Cancel'):T('Retour','Back')}</button><button class="btn btn-orange" onclick="ARTYCRM.saveLeadEditor()">${isNew?T('Créer le prospect','Create lead'):T('Enregistrer','Save')}</button></div>`;
  document.getElementById('leadStatus')?.addEventListener('change',e=>{const row=host.querySelector('.crm-lost-field');if(row)row.style.display=e.target.value==='lost'?'':'none'});
}
async function saveLeadEditor(){
  const l=state.editingLead;if(!l)return;const isNew=!l.id,manual=isNew||l.kind==='manual';
  const body={
    status:document.getElementById('leadStatus')?.value||'new',
    owner:document.getElementById('leadOwner')?.value||'',
    nextFollowUp:document.getElementById('leadFollow')?.value||'',
    followUpType:document.getElementById('leadFollowType')?.value||'call',
    followUpDuration:Number(document.getElementById('leadFollowDuration')?.value)||30,
    finalValue:Number(document.getElementById('leadFinalValue')?.value)||0,
    lostReason:document.getElementById('leadLostReason')?.value||'',
    tags:(document.getElementById('leadTags')?.value||'').split(',').map(x=>x.trim()).filter(Boolean),
    adminNote:document.getElementById('leadAdminNote')?.value||''
  };
  if(manual)Object.assign(body,{name:document.getElementById('leadName')?.value||'',email:document.getElementById('leadEmail')?.value||'',phone:document.getElementById('leadPhone')?.value||'',title:document.getElementById('leadTitle')?.value||'',preferredDate:document.getElementById('leadPreferredDate')?.value||'',value:Number(document.getElementById('leadValue')?.value)||0,source:document.getElementById('leadSource')?.value||'',campaign:document.getElementById('leadCampaign')?.value||'',message:document.getElementById('leadMessage')?.value||''});
  if(body.status==='lost'&&!body.lostReason)return showToast(T('Choisissez une raison pour le prospect perdu','Choose a lost reason'),'error');
  try{
    const result=isNew?await api('/api/admin/crm/leads',{method:'POST',body:JSON.stringify(body)}):await api('/api/admin/crm/leads/'+encodeURIComponent(l.kind)+'/'+encodeURIComponent(l.id),{method:'PATCH',body:JSON.stringify(body)});
    const calendarState=result?.calendarSync?.action;
    const message=calendarState==='error'?T('Prospect enregistré; synchronisation Google Calendar à vérifier','Lead saved; Google Calendar sync needs attention'):isNew?T('Prospect créé','Lead created'):T('Prospect mis à jour','Lead updated');
    showToast(message,calendarState==='error'?'warning':'success');
    if(isNew){closeLeadEditor();await Promise.all([loadLeads(),loadOverview(),loadCustomers()]);renderLeads()}
    else{await refreshLeadAfterAction(l.kind,l.id);renderLeadActions()}
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
  section('leads').then(()=>openLeadActions(kind,idEncoded));
}

async function download(type){
  const map={customers:'/api/admin/crm/export/customers.csv',leads:'/api/admin/crm/export/leads.csv',backup:'/api/admin/crm/export/backup.json'},path=map[type];if(!path)return;
  try{
    const r=await artyFetch(path,{headers:authH()});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||T('Export impossible','Export failed'))}
    const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=type==='customers'?'arty-customers.csv':type==='leads'?'arty-leads.csv':'arty-crm-backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){showToast(e.message,'error')}
}
async function section(next){
  if(next==='overview'&&!has('crm_dashboard'))next=defaultSection();
  if(next==='leads'&&!has('leads'))next=defaultSection();
  if(next==='customers'&&!has('customers'))next=defaultSection();
  state.activeSection=next;
  document.querySelectorAll('#page-admin [id^="adminCrm"][id$="Panel"]').forEach(x=>x.style.display='none');
  if(next==='overview'){
    const panel=document.getElementById('adminCrmOverviewPanel');if(panel)panel.style.display='block';
    await loadOverview();renderOverview();
  }else if(next==='leads'){
    const panel=document.getElementById('adminCrmLeadsPanel');if(panel)panel.style.display='block';
    await Promise.all([loadLeads(),loadOverview()]);renderLeads();
  }else{
    const panel=document.getElementById('adminCrmCustomersPanel');if(panel)panel.style.display='block';
    await loadCustomers();renderCustomers();
  }
}
async function showCrm(button){
  ensure();document.querySelectorAll('.admin-tab').forEach(x=>x.classList.remove('active'));(button||document.querySelector('[data-crm-main]'))?.classList.add('active');
  document.querySelectorAll('#page-admin [id^="admin"][id$="Panel"]').forEach(x=>x.style.display='none');
  await section(state.activeSection&&((state.activeSection==='overview'&&has('crm_dashboard'))||(state.activeSection==='leads'&&has('leads'))||(state.activeSection==='customers'&&has('customers')))?state.activeSection:defaultSection());
}

function install(){
  ensure();
  if(!window.__ARTY_GOOGLE_CALENDAR_LISTENER__){
    window.__ARTY_GOOGLE_CALENDAR_LISTENER__=true;
    window.addEventListener('message',async event=>{
      if(event.origin!==location.origin||event.data?.type!=='ARTY_GOOGLE_CALENDAR_CONNECTED')return;
      await loadOverview();if(state.activeSection==='overview')renderOverview();showToast(T('Google Calendar connecté','Google Calendar connected'),'success');
    });
  }
  const base=window.switchAdminTab;
  if(typeof base==='function'&&!base.__crmV2Wrapped){
    const wrapped=function(tab,button,...rest){
      if(tab==='crm')return showCrm(button);
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
  .crm-calendar-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;margin:0 0 16px;border:1px solid var(--border-light);border-radius:16px;background:#fff}.crm-calendar-card>div:first-child{display:grid;gap:2px}.crm-calendar-card span{font-size:.61rem;font-weight:900;letter-spacing:.11em;color:var(--teal)}.crm-calendar-card strong{font-size:.86rem}.crm-calendar-card small{font-size:.68rem;color:var(--text-light)}.crm-calendar-card.connected{background:var(--teal-pale);border-color:rgba(27,154,170,.28)}.crm-calendar-card.warning{background:#fff8ed}.crm-calendar-actions{display:flex;gap:7px;flex-wrap:wrap}
  .crm-workspace-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 16px;margin:0 0 18px;border:1px solid var(--border-light);border-radius:18px;background:linear-gradient(135deg,#fff,#f6fbfb)}.crm-workspace-head>div{display:grid;gap:2px;min-width:max-content}.crm-workspace-head>div span{font-size:.64rem;letter-spacing:.12em;font-weight:900;color:var(--teal)}.crm-workspace-head>div strong{font-size:.98rem}.crm-subnav{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.crm-subnav button{display:grid;gap:1px;min-width:130px;padding:9px 12px;border:1px solid var(--border-light);border-radius:12px;background:#fff;text-align:left;color:inherit;cursor:pointer}.crm-subnav button:hover{border-color:rgba(27,154,170,.35)}.crm-subnav button.active{border-color:var(--teal);background:var(--teal-pale)}.crm-subnav span{font-size:.75rem;font-weight:900}.crm-subnav small{font-size:.59rem;color:var(--text-light)}
  .crm-head{display:flex;justify-content:space-between;align-items:end;gap:18px;margin:8px 0 18px}.crm-head>div:first-child>span{font-size:.73rem;font-weight:900;letter-spacing:.1em;color:var(--teal)}.crm-head h2{margin:2px 0;font-size:1.7rem}.crm-head p{margin:0;color:var(--text-light);max-width:760px}.crm-head-actions{display:flex;gap:8px;flex-wrap:wrap}
  .crm-stats,.crm-report-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.crm-report-stats{grid-template-columns:repeat(5,minmax(0,1fr))}.crm-stat{padding:15px 16px;border:1px solid var(--border-light);border-radius:16px;background:#fff;box-shadow:0 5px 18px rgba(44,36,24,.025)}.crm-stat span,.crm-stat small{display:block;color:var(--text-light);font-size:.72rem}.crm-stat strong{display:block;font-size:1.35rem;margin:3px 0}
  .crm-section{padding:18px;border:1px solid var(--border-light);border-radius:18px;background:#fff}.crm-section-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:14px}.crm-section-head h3,.crm-section h4{margin:0}.crm-section-head p{margin:3px 0 0;color:var(--text-light);font-size:.78rem}.crm-action-grid,.crm-report-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.crm-action-block{padding:11px 0;border-top:1px solid var(--border-light)}.crm-action-block:first-of-type{border-top:0}.crm-action-block>h4{font-size:.78rem;margin-bottom:7px}.crm-action-row{display:flex;justify-content:space-between;gap:12px;width:100%;padding:10px;border:0;border-radius:11px;background:transparent;text-align:left;color:inherit;cursor:pointer}.crm-action-row:hover{background:var(--bg2)}.crm-action-row span{display:grid}.crm-action-row small{color:var(--text-light);font-size:.69rem}.crm-action-row b{text-align:right}.crm-mini-alert{display:flex;align-items:center;gap:10px;padding:14px;border-radius:12px;background:var(--orange-pale,#fff5ea)}.crm-mini-alert strong{font-size:1.6rem}.crm-mini-alert span{font-size:.8rem}.crm-operation-row{display:flex;justify-content:space-between;gap:12px;padding:9px 5px;border-bottom:1px solid var(--border-light)}.crm-operation-row:last-child{border-bottom:0}.crm-operation-row span{display:grid}.crm-operation-row small{font-size:.68rem;color:var(--text-light)}.crm-operation-row b{font-size:.78rem;text-align:right}
  .crm-reporting{margin-top:14px}.crm-report-table{display:grid}.crm-report-table>div{display:grid;grid-template-columns:1.4fr .55fr .7fr .8fr;gap:8px;padding:8px 5px;border-bottom:1px solid var(--border-light);font-size:.74rem}.crm-report-table .head{font-size:.65rem;font-weight:900;text-transform:uppercase;color:var(--text-light);background:var(--bg2);border-radius:9px}.crm-report-table>div span:last-child{text-align:right;font-weight:800}
  .crm-toolbar{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}.crm-toolbar input,.crm-toolbar select,.crm-form-block input,.crm-form-block textarea,.crm-account-form input,.crm-editor-grid input,.crm-editor-grid select,.crm-editor-grid textarea{border:1px solid var(--border);border-radius:11px;padding:10px 11px;background:#fff;color:inherit}.crm-toolbar input{min-width:260px;flex:1}.crm-toolbar select{min-width:150px}
  .crm-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(360px,.75fr);gap:15px}.crm-list,.crm-detail{background:#fff;border:1px solid var(--border-light);border-radius:18px;overflow:hidden}.crm-table-head,.crm-customer-row{display:grid;grid-template-columns:1.4fr .85fr .55fr;gap:14px;align-items:center;padding:12px 15px}.crm-table-head{font-size:.67rem;font-weight:900;text-transform:uppercase;color:var(--text-light);background:var(--bg2)}.crm-customer-row{border:0;border-top:1px solid var(--border-light);width:100%;text-align:left;background:#fff;cursor:pointer;color:inherit}.crm-customer-row:hover{background:#fffaf4}.crm-customer-row.disabled{opacity:.7}.crm-customer-row span{display:grid;gap:2px}.crm-customer-row small{color:var(--text-light);font-size:.7rem}.crm-customer-row i{font-style:normal;font-size:.66rem;color:var(--teal)}
  .crm-detail{padding:18px;min-height:420px;max-height:calc(100vh - 190px);overflow:auto}.crm-detail-head{display:flex;justify-content:space-between;gap:12px}.crm-detail-head span{font-size:.67rem;font-weight:900;color:var(--teal);text-transform:uppercase}.crm-detail-head h3{margin:3px 0}.crm-detail-head p{margin:0;color:var(--text-light);font-size:.8rem}.crm-detail-head>strong{font-size:1.25rem}.crm-contact-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.crm-contact-actions a{text-decoration:none}.crm-mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.crm-mini-grid div,.crm-preference-grid div{padding:10px;background:var(--bg2);border-radius:10px}.crm-mini-grid span,.crm-preference-grid span{display:block;font-size:.65rem;color:var(--text-light)}.crm-detail-section{padding:13px 0;border-top:1px solid var(--border-light)}.crm-subhead{display:flex;justify-content:space-between;gap:9px;align-items:center;margin-bottom:9px}.crm-subhead h4{margin:0}.crm-subhead small{color:var(--text-light)}.crm-account-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}.crm-account-form label,.crm-editor-grid label{display:grid;gap:5px;font-size:.7rem;font-weight:800}.crm-inline-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.crm-account-warning{margin:10px 0;padding:10px;border-radius:10px;background:#fff0ec;color:#934331;font-size:.75rem}.crm-preference-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.crm-preference-grid strong,.crm-preference-grid small{display:block}.crm-legal-note{font-size:.68rem;color:var(--text-light);margin:8px 0 0}
  .crm-form-block{display:grid;grid-template-columns:1fr auto;gap:7px;margin:9px 0}.crm-form-block label{grid-column:1/-1;font-size:.7rem;font-weight:800}.crm-timeline>div{display:grid;grid-template-columns:12px 1fr;gap:8px;padding:8px 0}.crm-timeline i{width:8px;height:8px;border-radius:50%;background:var(--teal);margin-top:5px}.crm-timeline small{display:block;color:var(--text-light);font-size:.68rem}.crm-timeline p{margin:2px 0 0;font-size:.77rem}
  .crm-kanban{display:grid;grid-template-columns:repeat(7,minmax(230px,1fr));gap:10px;overflow-x:auto;padding:2px 2px 12px}.crm-kanban-col{min-height:390px;padding:10px;border:1px solid var(--border-light);border-radius:15px;background:var(--bg2)}.crm-kanban-col>header{display:flex;align-items:center;gap:7px;padding:3px 2px 10px}.crm-kanban-col>header strong{font-size:.76rem;flex:1}.crm-kanban-col>header b{font-size:.68rem;padding:3px 6px;border-radius:999px;background:#fff}.crm-stage-dot{width:8px;height:8px;border-radius:50%;background:#aaa}.crm-stage-dot.new{background:#2d9fac}.crm-stage-dot.contacted{background:#609bc0}.crm-stage-dot.qualified{background:#8d79b8}.crm-stage-dot.quote_sent{background:#e29342}.crm-stage-dot.follow_up{background:#d16f45}.crm-stage-dot.won{background:#3e9a68}.crm-stage-dot.lost{background:#a26961}.crm-kanban-list{display:grid;gap:8px}.crm-kanban-card{padding:11px;border:1px solid rgba(44,36,24,.08);border-radius:12px;background:#fff;box-shadow:0 5px 15px rgba(44,36,24,.04);cursor:pointer}.crm-kanban-card.overdue{border-color:rgba(197,78,51,.35)}.crm-card-top{display:flex;justify-content:space-between;gap:8px;color:var(--text-light);font-size:.64rem}.crm-card-top b{color:var(--text);font-size:.73rem}.crm-kanban-card h4{margin:7px 0 2px}.crm-kanban-card p{margin:0;color:var(--text-light);font-size:.7rem}.crm-card-tags{display:flex;gap:4px;flex-wrap:wrap;margin:8px 0}.crm-card-tags span{padding:3px 6px;border-radius:999px;background:var(--teal-pale);color:var(--teal);font-size:.58rem;font-weight:800}.crm-follow,.crm-lost-reason{display:block;font-size:.63rem;color:var(--text-light)}.crm-follow.late{color:#ad4d37;font-weight:900}.crm-drop-empty{padding:22px 8px;text-align:center;color:var(--text-light);font-size:.66rem;border:1px dashed var(--border);border-radius:10px}
  .crm-modal[hidden]{display:none}.crm-modal{position:fixed;inset:0;z-index:10030;display:grid;place-items:center;padding:20px}.crm-modal-backdrop{position:absolute;inset:0;border:0;background:rgba(25,22,18,.55)}.crm-modal-sheet{position:relative;width:min(760px,100%);max-height:92vh;overflow:auto;padding:22px;border-radius:20px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.2)}.crm-modal-close{position:absolute;right:12px;top:10px;border:0;background:transparent;font-size:1.8rem;cursor:pointer}.crm-editor-head>span{font-size:.68rem;font-weight:900;color:var(--teal)}.crm-editor-head h2{margin:3px 0}.crm-editor-head p{margin:0 0 15px;color:var(--text-light)}.crm-action-profile{display:grid;gap:16px}.crm-action-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.crm-action-summary>div{display:grid;gap:4px;padding:11px 12px;border:1px solid var(--border-light);border-radius:12px;background:var(--bg2)}.crm-action-summary small{font-size:.61rem;color:var(--text-light);font-weight:800}.crm-action-summary strong{font-size:.76rem;overflow-wrap:anywhere}.crm-quick-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.crm-action-tile{display:grid;grid-template-columns:34px 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;padding:13px;border:1px solid var(--border-light);border-radius:14px;background:#fff;text-align:left;cursor:pointer;color:inherit}.crm-action-tile>span{grid-row:1/3;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--bg2);font-weight:900}.crm-action-tile strong{font-size:.78rem}.crm-action-tile small{font-size:.62rem;color:var(--text-light);line-height:1.35}.crm-action-tile:hover{border-color:rgba(27,154,170,.4);box-shadow:0 5px 18px rgba(0,0,0,.04)}.crm-action-tile.primary{background:var(--teal-pale);border-color:rgba(27,154,170,.28)}.crm-action-tile.quote{background:#fff8ed;border-color:rgba(220,142,53,.25)}.crm-action-tile.danger{background:#fff7f5}.crm-action-tile.secondary{background:#fafafa}.crm-action-footer{display:flex;justify-content:flex-end}.crm-action-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.crm-action-form label{display:grid;gap:6px;font-size:.7rem;font-weight:800}.crm-action-form label.wide{grid-column:1/-1}.crm-action-form input,.crm-action-form select,.crm-action-form textarea{width:100%;padding:10px 11px;border:1px solid var(--border);border-radius:10px;background:#fff;font:inherit}.crm-form-note,.crm-quote-banner,.crm-secure-link{padding:12px 13px;border-radius:12px;background:var(--teal-pale);font-size:.69rem;line-height:1.45}.crm-quote-banner,.crm-secure-link{display:flex;align-items:center;justify-content:space-between;gap:12px}.crm-quote-banner>div,.crm-secure-link>div{display:grid;gap:3px}.crm-quote-banner small,.crm-secure-link small{color:var(--text-light)}.crm-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.crm-editor-grid label.wide{grid-column:1/-1}.crm-editor-grid input:disabled{background:#f5f4f0;color:#777}.crm-editor-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.crm-modal-open{overflow:hidden}
  .crm-empty{padding:24px;text-align:center;color:var(--text-light)}.crm-empty.compact{padding:12px;font-size:.74rem}
  @media(max-width:1100px){.crm-stats,.crm-report-stats{grid-template-columns:repeat(2,1fr)}.crm-action-grid,.crm-report-grid,.crm-layout{grid-template-columns:1fr}.crm-detail{max-height:none}}
  @media(max-width:680px){.crm-action-summary{grid-template-columns:1fr 1fr}.crm-quick-actions,.crm-action-form{grid-template-columns:1fr}.crm-action-form label.wide{grid-column:auto}.crm-quote-banner,.crm-secure-link{align-items:stretch;flex-direction:column}.crm-workspace-head{align-items:stretch;flex-direction:column}.crm-subnav{display:grid;grid-template-columns:1fr}.crm-subnav button{width:100%}.crm-head{align-items:stretch;flex-direction:column}.crm-head-actions>*{flex:1}.crm-stats,.crm-report-stats{grid-template-columns:1fr 1fr}.crm-table-head{display:none}.crm-customer-row{grid-template-columns:1fr}.crm-account-form,.crm-preference-grid,.crm-editor-grid{grid-template-columns:1fr}.crm-editor-grid label.wide{grid-column:auto}.crm-detail{padding:14px}.crm-modal{padding:8px}.crm-modal-sheet{padding:18px 14px}.crm-report-table>div{grid-template-columns:1.2fr .5fr .65fr .75fr;font-size:.66rem}}
  `;document.head.appendChild(s);
}

window.ARTYCRM={
  install,loadAll,renderOverview,renderCustomers,renderLeads,openCustomer,section,connectGoogleCalendar,disconnectGoogleCalendar,
  searchCustomers:q=>{state.customerQuery=q;renderCustomers()},filterCustomers:v=>{state.customerFilter=v;renderCustomers()},
  searchLeads:q=>{state.leadQuery=q;renderLeads()},filterOwner:v=>{state.leadOwner=v;renderLeads()},filterStatus:v=>{state.leadStatus=v;renderLeads()},
  saveCustomerTags,addCustomerNote,saveAccount,toggleAccount,sendPasswordReset,resendWelcome,
  newLead,openLeadActions,openLeadEditor,renderLeadEditor,renderLeadActions,renderFollowUpAction,saveFollowUpAction,clearFollowUp,renderQuoteAction,sendQuoteAction,renderLostAction,saveLostAction,quickLeadStatus,emailLead,callLead,openLeadCalendar,openSecureQuote,closeLeadEditor,saveLeadEditor,dragStart,dropStage,openLeadByKey,download
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();