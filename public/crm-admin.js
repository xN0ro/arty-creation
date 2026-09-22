/* ARTY CRM V2 — sales action centre, customer 360 and lead pipeline */
(()=>{
'use strict';

const state={
  summary:null,actions:null,reporting:null,googleCalendar:null,customers:[],leads:[],team:[],customer:null,
  customerQuery:'',customerFilter:'all',leadQuery:'',leadOwner:'all',leadStatus:'all',
  dragLead:null,editingLead:null,activeSection:'overview',dayQueue:'today',dayOwner:'mine',leadView:'list',leadPreset:'open',errors:{},saving:false,activityFilter:'all',taskMode:'',returnFocus:null
};
const EN=()=>{try{return I18n.language?.()==='en'}catch{return false}};
const T=(fr,en)=>EN()?en:fr;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=esc;
const encodeKey=v=>encodeURIComponent(v).replace(/'/g,'%27');
const money=v=>new Intl.NumberFormat(EN()?'en-CA':'fr-CA',{style:'currency',currency:'CAD'}).format(Number(v)||0);
const date=v=>v?new Date(v).toLocaleDateString(EN()?'en-CA':'fr-CA'):'—';
const dateTime=v=>v?new Date(v).toLocaleString(EN()?'en-CA':'fr-CA'):'—';
const has=p=>currentUser?.role==='admin'||(Array.isArray(currentUser?.permissions)&&currentUser.permissions.includes(p));
const statusOrder=['new','contacted','qualified','quote_sent','follow_up','won','refunded','lost'];
const statusLabel=s=>({
  new:T('Nouveau','New'),
  contacted:T('Contacté','Contacted'),
  qualified:T('Qualifié','Qualified'),
  quote_sent:T('Devis envoyé','Quote sent'),
  follow_up:T('Suivi','Follow-up'),
  won:T('Gagné','Won'),
  refunded:T('Remboursé','Refunded'),
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
  const b=document.createElement('button');b.type='button';b.className='admin-tab';b.dataset.crmMain='1';b.dataset.adminTabKey='crm';b.textContent='CRM';b.setAttribute('onclick',"switchAdminTab('crm',this)");
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
  if(has('crm_dashboard'))items.push(['overview',T('Ma journée','My day'),T('Priorités et prochains échanges','Priorities & next conversations')]);
  if(has('leads'))items.push(['leads',T('Prospects','Leads'),T('Pipeline et ventes','Pipeline & sales')]);
  if(has('customers'))items.push(['customers',T('Clients','Customers'),T('Profils et historique','Profiles & history')]);
  return `<div class="crm-workspace-head"><div><span>ARTY CRM</span><strong>${T('Relations clients','Customer relationships')}</strong></div><nav class="crm-subnav" aria-label="${T('Navigation CRM','CRM navigation')}">${items.map(([key,label,sub])=>`<button type="button" class="${active===key?'active':''}" onclick="ARTYCRM.section('${key}')"><span>${esc(label)}</span><small>${esc(sub)}</small></button>`).join('')}</nav></div>`;
}
function ensure(){
  if(!currentUser||!['admin','staff'].includes(currentUser.role))return;
  const allowed=has('crm_dashboard')||has('customers')||has('leads');
  if(!allowed){
    document.querySelector('[data-crm-main]')?.remove();
    document.querySelectorAll('#page-admin [id^="adminCrm"][id$="Panel"]').forEach(panel=>panel.style.display='none');
    return;
  }
  if(!document.querySelector('[data-crm-main]'))addCrmTab();
  ensurePanels();styles();ensureModal();
}
function ensureModal(){
  if(document.getElementById('crmLeadModal'))return;
  const modal=document.createElement('div');modal.id='crmLeadModal';modal.className='crm-modal';modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',T('Dossier client','Client workspace'));
  modal.innerHTML='<button class="crm-modal-backdrop" tabindex="-1" aria-label="Close / Fermer" type="button" onclick="ARTYCRM.closeLeadEditor()"></button><section class="crm-modal-sheet"><button class="crm-modal-close" aria-label="Close / Fermer" type="button" onclick="ARTYCRM.closeLeadEditor()">×</button><div id="crmLeadEditorBody"></div></section>';
  document.body.appendChild(modal);
}

async function loadOverview(){
  if(!has('crm_dashboard'))return;
  try{
    const jobs=[api('/api/admin/crm/summary'),api('/api/admin/crm/action-center'),api('/api/admin/crm/reporting')];
    if(currentUser?.role==='admin')jobs.push(api('/api/admin/crm/google-calendar/status').catch(()=>null));
    const [summary,actions,reporting,googleCalendarStatus]=await Promise.all(jobs);
    state.summary=summary;state.actions=actions;state.reporting=reporting;if(currentUser?.role==='admin')state.googleCalendar=googleCalendarStatus;
  state.errors.overview='';}catch(e){state.errors.overview=e.message;console.error('CRM overview',e)}
}
async function loadCustomers(){
  if(!has('customers'))return;
  try{state.customers=await api('/api/admin/crm/customers');state.errors.customers=''}catch(e){state.errors.customers=e.message}
}
async function loadLeads(){
  if(!has('leads'))return;
  try{const [leads,team]=await Promise.all([api('/api/admin/crm/leads'),api('/api/admin/crm/team')]);state.leads=leads;state.team=team;state.errors.leads=''}catch(e){state.errors.leads=e.message}
}
async function loadAll(){ensure();await Promise.all([loadOverview(),loadCustomers(),loadLeads()])}

function stat(label,value,sub=''){return `<div class="crm-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
function actionLeadCard(l,kind=''){
  return `<button class="crm-action-row" onclick="ARTYCRM.openLeadByKey('${attr(l.kind)}','${attr(encodeKey(l.id))}')"><span><strong>${esc(l.name||l.email)}</strong><small>${esc(l.title||'')} · ${esc(l.email||'')}</small></span><span><b>${money(l.value||l.expectedValue)}</b><small>${l.nextFollowUp?date(l.nextFollowUp):esc(kind)}</small></span></button>`;
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
function failure(section){return state.errors[section]?`<div class="crm-error" role="alert"><strong>${T('Chargement impossible','Could not load this view')}</strong><p>${esc(state.errors[section])}</p><button class="btn btn-ghost" onclick="ARTYCRM.section('${section}')">${T('Réessayer','Try again')}</button></div>`:''}
function taskType(type){return({call:T('Appel','Call'),email:T('Courriel','Email'),meeting:T('Rencontre','Meeting'),quote:T('Suivi de devis','Quote follow-up'),other:T('Suivi','Follow-up')})[type]||type}
function outcomeLabel(type){return({reached:T('Client rejoint','Reached client'),no_answer:T('Aucune réponse','No answer'),email_sent:T('Courriel envoyé','Email sent'),meeting_done:T('Rencontre terminée','Meeting completed'),quote_followed:T('Devis suivi','Quote followed up'),other:T('Autre résultat','Other outcome')})[type]||type||''}
function scheduleDate(value){if(!value)return '—';const d=new Date(value.slice(0,16)+(value.length===10?'T09:00:00Z':':00Z'));return Number.isNaN(d.getTime())?esc(value):new Intl.DateTimeFormat(EN()?'en-CA':'fr-CA',{timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)}
function initials(name){return String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function dayRows(){const a=state.actions||{},q=state.dayQueue,day=a.today||'';let rows;
  if(q==='unassigned')rows=(a.unassigned||[]).map(l=>({...l,leadKind:l.kind,leadId:l.id,leadKey:l.key,isLead:true}));
  else if(q==='no_next')rows=(a.noNextAction||[]).map(l=>({...l,leadKind:l.kind,leadId:l.id,leadKey:l.key,isLead:true}));
  else rows=(a.tasks||[]).filter(t=>q==='overdue'?t.dueAt.slice(0,10)<day:q==='today'?t.dueAt.slice(0,10)===day:t.dueAt.slice(0,10)>day);
  return rows.filter(t=>state.dayOwner==='team'||q==='unassigned'||t.owner===currentUser?.email);
}
function dayRow(t){return `<article class="crm-day-row"><span class="crm-avatar">${esc(initials(t.name))}</span><button class="crm-row-main" onclick="ARTYCRM.openLeadByKey('${attr(t.leadKind)}','${encodeKey(t.leadId)}')"><strong>${esc(t.name||t.email)}</strong><span>${esc(t.title||'')}</span><small>${esc(t.email||'')}</small></button><div class="crm-row-context"><span class="crm-pill ${t.priority==='high'?'urgent':''}">${t.isLead?esc(statusLabel(t.status)):esc(taskType(t.type))}</span><small>${t.dueAt?scheduleDate(t.dueAt):T('Prochaine action à définir','Choose the next action')}</small>${t.owner?`<small>${esc(state.team.find(x=>x.email===t.owner)?.name||t.owner)}</small>`:''}</div><div class="crm-row-buttons">${t.isLead?`<button class="btn btn-ghost btn-sm" onclick="ARTYCRM.openTask('${attr(t.leadKind)}','${encodeKey(t.leadId)}')">${T('Planifier','Schedule')}</button>`:`<button class="crm-complete" onclick="ARTYCRM.openTask('${attr(t.leadKind)}','${encodeKey(t.leadId)}','${encodeKey(t.id)}')">${T('Terminer','Complete')} <span aria-hidden="true">↗</span></button>`}</div></article>`}
function renderOverview(){
  const p=document.getElementById('adminCrmOverviewPanel');if(!p||!has('crm_dashboard'))return;
  if(state.errors.overview){p.innerHTML=crmNav('overview')+failure('overview');return}
  const s=state.summary||{},a=state.actions||{},r=state.reporting||{},rows=dayRows();
  const counts={};for(const key of ['today','overdue','upcoming','unassigned','no_next']){const selected=state.dayQueue;state.dayQueue=key;counts[key]=dayRows().length;state.dayQueue=selected}
  const queues=[['today',T('Aujourd’hui','Today')],['overdue',T('En retard','Overdue')],['upcoming',T('À venir','Upcoming')],['unassigned',T('Non assignés','Unassigned')],['no_next',T('Sans suivi','No next action')]];
  p.innerHTML=`${crmNav('overview')}<div class="crm-day-hero"><div><span class="crm-eyebrow">${T('UN PEU D’ATTENTION. BEAUCOUP DE LIENS.','A LITTLE ATTENTION. LASTING CONNECTIONS.')}</span><h2>${T('Chaque client compte.','Every client matters.')}</h2><p>${T('Vos priorités, vos suivis et les conversations à faire avancer.','Your priorities, follow-ups, and conversations to move forward.')}</p></div>${has('leads')?`<button class="crm-primary" onclick="ARTYCRM.newLead()">+ ${T('Nouveau prospect','New lead')}</button>`:''}</div>
    <div class="crm-day-metrics"><div><span>${T('Suivis aujourd’hui','Due today')}</span><strong>${a.queues?.today||0}</strong></div><div><span>${T('En retard','Overdue')}</span><strong class="${a.queues?.overdue?'crm-warm':''}">${a.queues?.overdue||0}</strong></div><div><span>${T('Sans prochaine action','Without a next action')}</span><strong>${a.queues?.no_next||0}</strong></div><div><span>${T('Opportunités ouvertes','Open opportunities')}</span><strong>${money(s.openPipelineValue||0)}</strong></div></div>
    <div class="crm-day-layout"><section class="crm-day-work"><div class="crm-section-head"><div><h3>${T('Votre liste d’action','Your action list')}</h3><p>${T('Horaires','Schedule time zone')}: ${esc(a.timeZone||'America/Toronto')}</p></div><select aria-label="${T('Responsable','Owner')}" onchange="ARTYCRM.dayOwner(this.value)"><option value="mine" ${state.dayOwner==='mine'?'selected':''}>${T('Mes suivis','My follow-ups')}</option><option value="team" ${state.dayOwner==='team'?'selected':''}>${T('Toute l’équipe','All team')}</option></select></div><div class="crm-queue-tabs" role="group" aria-label="${T('Listes de suivi','Follow-up lists')}">${queues.map(([id,label])=>`<button aria-pressed="${state.dayQueue===id}" class="${state.dayQueue===id?'active':''}" onclick="ARTYCRM.dayQueue('${id}')">${label}<b>${counts[id]||0}</b></button>`).join('')}</div><div class="crm-day-rows">${rows.map(dayRow).join('')||`<div class="crm-empty-state"><span aria-hidden="true">✓</span><h4>${T('Rien dans cette liste','Nothing in this list')}</h4><p>${T('Passez à une autre liste ou planifiez votre prochain échange.','Choose another list or schedule your next conversation.')}</p></div>`}</div></section>
    <aside class="crm-day-aside"><section class="crm-insight"><span class="crm-eyebrow">${T('À NE PAS OUBLIER','KEEP IN MIND')}</span><h3>${T('Une relance peut tout changer.','A follow-up can make the difference.')}</h3><p>${T('Les devis ci-dessous attendent depuis au moins 3 jours. Vérifiez la dernière conversation avant de relancer.','These quotes have been waiting for at least 3 days. Check the last conversation before following up.')}</p>${(a.staleQuotes||[]).slice(0,5).map(l=>actionLeadCard(l)).join('')||`<small>${T('Aucun devis ancien à relancer.','No aging quotes to follow up.')}</small>`}</section><section class="crm-section"><h3>${T('Nouvelles demandes','New inquiries')}</h3>${(a.newLeads||[]).slice(0,4).map(l=>actionLeadCard(l)).join('')||`<p class="crm-muted">${T('Vous êtes à jour.','You’re all caught up.')}</p>`}</section>${currentUser?.role==='admin'?googleCalendarCard():''}</aside></div>
    <details class="crm-report-details"><summary>${T('Résultats et performance commerciale','Sales results & performance')}</summary>    <section class="crm-section crm-reporting"><div class="crm-section-head"><div><h3>${T('Performance commerciale','Sales performance')}</h3><p>${T('Mesurez la conversion plutôt que seulement le trafic.','Measure conversion, not just traffic.')}</p></div></div>
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
    </section></details>`;
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
function preserveSearch(render){const el=document.activeElement,active=el?.matches('input[type=search]'),panel=el?.closest('[id]')?.id,start=el?.selectionStart,end=el?.selectionEnd;render();if(active){const replacement=document.getElementById(panel)?.querySelector('input[type=search]');replacement?.focus({preventScroll:true});replacement?.setSelectionRange(start,end)}}
function renderCustomers(){
  const p=document.getElementById('adminCrmCustomersPanel');if(!p||!has('customers'))return;
  if(state.errors.customers){p.innerHTML=crmNav('customers')+failure('customers');return}
  const rows=state.customers.filter(customerVisible);
  p.innerHTML=`${crmNav('customers')}
    <div class="crm-head"><div><span>CRM</span><h2>${T('Clients','Customers')}</h2><p>${T('Une vue claire de chaque client, de ses projets et de votre relation.','A clear view of every client, their projects, and your relationship.')}</p></div><div class="crm-head-actions"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.download('customers')">${T('Exporter CSV','Export CSV')}</button></div></div>
    <div class="crm-toolbar"><input aria-label="${T('Rechercher un client','Search customers')}" type="search" value="${attr(state.customerQuery)}" placeholder="${T('Rechercher nom, courriel, téléphone ou étiquette…','Search name, email, phone or tag…')}" oninput="ARTYCRM.searchCustomers(this.value)"><select onchange="ARTYCRM.filterCustomers(this.value)"><option value="all">${T('Tous les contacts','All contacts')}</option>${currentUser?.role==='staff'?`<option value="mine" ${state.customerFilter==='mine'?'selected':''}>${T('Mes clients','My clients')}</option>`:''}<option value="accounts" ${state.customerFilter==='accounts'?'selected':''}>${T('Comptes ARTY','ARTY accounts')}</option><option value="leads" ${state.customerFilter==='leads'?'selected':''}>${T('Avec prospect','With leads')}</option><option value="repeat" ${state.customerFilter==='repeat'?'selected':''}>${T('Clients récurrents','Repeat customers')}</option><option value="disabled" ${state.customerFilter==='disabled'?'selected':''}>${T('Comptes désactivés','Disabled accounts')}</option></select></div>
    <div class="crm-layout"><div class="crm-list"><div class="crm-table-head"><span>${T('Client','Customer')}</span><span>${T('Activité','Activity')}</span><span>${T('Valeur','Value')}</span></div>
      ${rows.map(c=>`<button class="crm-customer-row ${c.disabled?'disabled':''}" onclick="ARTYCRM.openCustomer('${encodeKey(c.email)}')"><span><strong>${esc(c.name)}</strong><small>${esc(c.email)}${c.phone?' · '+esc(c.phone):''}</small><i>${c.disabled?T('Compte désactivé','Account disabled'):c.hasAccount?T('Compte ARTY','ARTY account'):T('Contact seulement','Contact only')}</i></span><span><b>${c.orderCount} ${T('commande(s)','order(s)')}</b><small>${c.leadCount} ${T('prospect(s)','lead(s)')} · ${date(c.lastActivity)}</small></span><span><strong>${money(c.lifetimeSpend)}</strong><small>${(c.tags||[]).map(esc).join(' · ')||'—'}</small></span></button>`).join('')||`<div class="crm-empty">${T('Aucun client trouvé.','No customers found.')}</div>`}
    </div><div class="crm-detail" id="crmCustomerDetail">${T('Sélectionnez un client pour voir son historique.','Select a customer to view their history.')}</div></div>`;
  if(state.customer)renderCustomerDetail();
}
async function openCustomer(encoded){
  state.activityFilter='all';const email=decodeURIComponent(encoded);
  try{state.customer=await api('/api/admin/crm/customers/'+encodeKey(email));renderCustomerDetail()}catch(e){showToast(e.message,'error')}
}
function timelineEntry(x){
  if(x.type==='activity')return activitiesHTML([x.activity]);
  const label=x.type==='support'?T('Conversation assistance','Support conversation'):x.type==='stage'?T('Étape du projet','Project stage'):timelineLabel(x);
  return `<article class="crm-history-entry"><span class="crm-history-dot ${x.type}"></span><div><strong>${esc(label)}${x.subject?' · '+esc(x.subject):''}</strong><small>${dateTime(x.at)}${x.author?' · '+esc(x.author):''}${x.status?' · '+esc(statusLabel(x.status)):''}</small>${x.amount?`<b>${money(x.amount)}</b>`:''}${x.detail?`<p>${esc(x.detail)}</p>`:''}</div></article>`;
}
function renderCustomerDetail(){
  const host=document.getElementById('crmCustomerDetail'),d=state.customer;if(!host||!d)return;
  const c=d.summary,a=d.account,p=d.preferences||{},all=d.timeline||[],filter=state.activityFilter,entries=all.filter(x=>filter==='all'||(filter==='conversations'?['activity','support','contact','note'].includes(x.type):filter==='purchases'?['order','booking','event_request'].includes(x.type):true));
  host.innerHTML=`<div class="crm-client-cover"><span class="crm-avatar">${esc(initials(c.name))}</span><div><span class="crm-eyebrow">${T('DOSSIER CLIENT','CLIENT PROFILE')}</span><h3>${esc(c.name)}</h3><p>${esc(c.email)}</p>${c.phone?`<p>${esc(c.phone)}</p>`:''}</div></div>
  <div class="crm-mini-grid"><div><span>${T('Total net payé','Net paid')}</span><b>${money(c.lifetimeSpend)}</b></div><div><span>${T('Commandes','Orders')}</span><b>${money(c.orderSpend)}</b></div><div><span>${T('Événements privés','Private events')}</span><b>${money(c.eventSpend)}</b></div></div>
  <p class="crm-muted">${T('Remboursements déduits. Montants payés, taxes incluses.','Refunds deducted. Paid amounts include tax.')}</p>
  <div class="crm-contact-actions"><a class="btn btn-ghost btn-sm" href="mailto:${attr(c.email)}">${T('Écrire','Email')}</a>${c.phone?`<a class="btn btn-ghost btn-sm" href="tel:${attr(c.phone)}">${T('Appeler','Call')}</a>`:''}</div>
  ${has('leads')?`<section class="crm-detail-section"><h4>${T('Projets et suivis','Projects & follow-ups')}</h4>${(d.leads||[]).map(l=>`<button class="crm-linked-project" onclick="ARTYCRM.openLeadByKey('${l.kind}','${encodeKey(l.id)}')"><span><strong>${esc(l.title)}</strong><small>${statusLabel(l.status)}${l.nextFollowUp?' · '+scheduleDate(l.nextFollowUp):''}</small></span><span aria-hidden="true">↗</span></button>`).join('')||`<p class="crm-muted">${T('Aucun projet de vente lié.','No linked sales projects.')}</p>`}</section>`:''}
  ${(d.support||[]).length&&has('support')?`<section class="crm-detail-section"><h4>${T('Demandes d’assistance','Support requests')}</h4>${d.support.map(t=>`<button class="crm-linked-project" onclick="ARTYCRM.openSupport('${encodeKey(t.id)}')"><span><strong>${esc(t.subject)}</strong><small>${esc(t.id)} · ${esc(t.status)}</small></span><span aria-hidden="true">↗</span></button>`).join('')}</section>`:''}
      <section class="crm-detail-section"><div class="crm-form-block"><label>${T('Étiquettes internes','Internal tags')}</label><input id="crmCustomerTags" value="${attr((c.tags||[]).join(', '))}" placeholder="VIP, Corporate, Repeat"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.saveCustomerTags()">${T('Sauvegarder','Save')}</button></div><div class="crm-form-block"><label>${T('Ajouter une note','Add note')}</label><textarea id="crmCustomerNote" rows="2" placeholder="${T('Préférences, contexte, prochain échange…','Preferences, context, next conversation…')}"></textarea><button class="btn btn-orange btn-sm" onclick="ARTYCRM.addCustomerNote()">${T('Ajouter','Add')}</button></div></section>

  <section class="crm-detail-section"><div class="crm-subhead"><h4>${T('L’histoire de votre relation','Your relationship history')}</h4><small>${all.length}</small></div><div class="crm-preset-row">${[['all',T('Tout','All')],['conversations',T('Échanges','Conversations')],['purchases',T('Achats','Purchases')]].map(([k,v])=>`<button aria-pressed="${filter===k}" class="${filter===k?'active':''}" onclick="ARTYCRM.activityFilter('${k}')">${v}</button>`).join('')}</div><div class="crm-client-timeline">${entries.map(timelineEntry).join('')||`<p class="crm-muted">${T('Aucune activité dans cette vue.','No activity in this view.')}</p>`}</div></section>
  <details class="crm-account-details"><summary>${T('Préférences et compte','Preferences & account')}</summary>    <section class="crm-detail-section"><div class="crm-subhead"><h4>${T('Préférences','Preferences')}</h4></div><div class="crm-preference-grid"><div><span>${T('Langue préférée','Preferred language')}</span><strong>${p.preferredLanguage==='en'?'English':p.preferredLanguage==='fr'?'Français':'—'}</strong></div><div><span>${T('Marketing','Marketing')}</span><strong>${p.marketingConsent?T('Consentement actif','Consented'):T('Non inscrit','Not subscribed')}</strong><small>${p.marketingConsentAt?dateTime(p.marketingConsentAt):''}</small></div></div><p class="crm-legal-note">${T('Le consentement marketing est contrôlé par le client depuis son compte.','Marketing consent is controlled by the customer from their account.')}</p></section>
     ${a?`<section class="crm-detail-section"><div class="crm-subhead"><h4>${T('Gestion du compte','Account management')}</h4><small>${T('Dernière connexion','Last login')}: ${dateTime(a.lastLoginAt)}</small></div><div class="crm-account-form"><label>${T('Nom','Name')}<input id="crmAccountName" value="${attr(a.name||'')}"></label><label>${T('Téléphone','Phone')}<input id="crmAccountPhone" value="${attr(a.phone||'')}"></label></div><div class="crm-inline-actions"><button class="btn btn-orange btn-sm" onclick="ARTYCRM.saveAccount()">${T('Enregistrer','Save')}</button>${has('account_management')?`<button class="btn btn-ghost btn-sm" onclick="ARTYCRM.sendPasswordReset()">${T('Envoyer réinitialisation','Send password reset')}</button><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.resendWelcome()">${T('Renvoyer bienvenue','Resend welcome')}</button><button class="btn ${a.accountDisabledAt?'btn-teal':'btn-ghost'} btn-sm" onclick="ARTYCRM.toggleAccount(${a.accountDisabledAt?'false':'true'})">${a.accountDisabledAt?T('Réactiver','Reactivate'):T('Désactiver','Disable')}</button>`:''}</div></section>`:''}
</details>`;
}

async function saveAccount(){
  if(!state.customer?.account)return;
  try{
    await api('/api/admin/crm/customers/'+encodeKey(state.customer.summary.email)+'/account',{method:'PATCH',body:JSON.stringify({name:document.getElementById('crmAccountName')?.value||'',phone:document.getElementById('crmAccountPhone')?.value||''})});
    showToast(T('Compte mis à jour','Account updated'),'success');await refreshCustomer();
  }catch(e){showToast(e.message,'error')}
}
async function toggleAccount(disabled){
  if(!state.customer?.account)return;
  const msg=disabled?T('Désactiver ce compte? Les sessions actives seront fermées.','Disable this account? Active sessions will be revoked.'):T('Réactiver ce compte?','Reactivate this account?');
  if(!confirm(msg))return;
  try{await api('/api/admin/crm/customers/'+encodeKey(state.customer.summary.email)+'/disable',{method:'POST',body:JSON.stringify({disabled})});showToast(disabled?T('Compte désactivé','Account disabled'):T('Compte réactivé','Account reactivated'),'success');await refreshCustomer()}catch(e){showToast(e.message,'error')}
}
async function sendPasswordReset(){
  if(!state.customer?.account)return;if(!confirm(T('Envoyer un lien de réinitialisation sécurisé à ce client?','Send a secure password reset link to this customer?')))return;
  try{await api('/api/admin/crm/customers/'+encodeKey(state.customer.summary.email)+'/password-reset',{method:'POST',body:'{}'});showToast(T('Lien envoyé','Reset link sent'),'success')}catch(e){showToast(e.message,'error')}
}
async function resendWelcome(){
  if(!state.customer?.account)return;
  try{await api('/api/admin/crm/customers/'+encodeKey(state.customer.summary.email)+'/resend-welcome',{method:'POST',body:'{}'});showToast(T('Courriel de bienvenue envoyé','Welcome email sent'),'success')}catch(e){showToast(e.message,'error')}
}
async function refreshCustomer(){const email=state.customer.summary.email;await Promise.all([loadCustomers(),openCustomer(encodeKey(email))]);renderCustomers();renderCustomerDetail()}
async function saveCustomerTags(){
  if(!state.customer)return;const tags=(document.getElementById('crmCustomerTags')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
  try{await api('/api/admin/crm/customers/'+encodeKey(state.customer.summary.email)+'/tags',{method:'PUT',body:JSON.stringify({tags})});showToast(T('Étiquettes sauvegardées','Tags saved'),'success');await refreshCustomer()}catch(e){showToast(e.message,'error')}
}
async function addCustomerNote(){
  if(!state.customer)return;const el=document.getElementById('crmCustomerNote'),note=el?.value.trim();if(!note)return;
  try{await api('/api/admin/crm/customers/'+encodeKey(state.customer.summary.email)+'/notes',{method:'POST',body:JSON.stringify({note})});showToast(T('Note ajoutée','Note added'),'success');await refreshCustomer()}catch(e){showToast(e.message,'error')}
}

function filteredLeads(){
  const q=state.leadQuery.toLowerCase().trim();
  return state.leads.filter(l=>{
    if(q&&![l.name,l.email,l.phone,l.title,l.source,l.campaign,...(l.tags||[])].join(' ').toLowerCase().includes(q))return false;
    if(state.leadPreset==='open'&&['won','refunded','lost'].includes(l.status))return false;
    if(state.leadPreset==='mine'&&l.owner!==currentUser?.email)return false;
    if(state.leadPreset==='no_next'&&(['won','refunded','lost'].includes(l.status)||l.tasks?.some(t=>t.status==='open')))return false;
    if(state.leadPreset==='closed'&&!['won','refunded','lost'].includes(l.status))return false;
    if(state.leadOwner!=='all'&&String(l.owner||'')!==state.leadOwner)return false;
    if(state.leadStatus!=='all'&&l.status!==state.leadStatus)return false;
    return true;
  });
}
function leadCard(l){
  const overdue=l.nextFollowUp&&l.nextFollowUp.slice(0,10)<new Date().toISOString().slice(0,10)&&!['won','refunded','lost'].includes(l.status);
  return `<article class="crm-kanban-card ${overdue?'overdue':''}" draggable="true" ondragstart="ARTYCRM.dragStart(event,'${attr(l.kind)}','${attr(encodeKey(l.id))}')" onclick="ARTYCRM.openLeadActions('${attr(l.kind)}','${attr(encodeKey(l.id))}')"><div class="crm-card-top"><span>${esc(l.reference||l.key)}</span><b>${leadPrimaryValue(l)}</b></div><h4>${esc(l.name||l.email)}</h4><p>${esc(l.title||'')}</p><div class="crm-card-tags">${l.owner?`<span>${esc(state.team.find(t=>t.email===l.owner)?.name||l.owner)}</span>`:''}${l.source?`<span>${esc(l.source)}</span>`:''}${(l.tags||[]).slice(0,2).map(x=>`<span>${esc(x)}</span>`).join('')}</div>${l.nextFollowUp?`<small class="crm-follow ${overdue?'late':''}">${overdue?T('En retard','Overdue'):T('Suivi','Follow-up')}: ${scheduleDate(l.nextFollowUp)}</small>`:''}${l.status==='lost'&&l.lostReason?`<small class="crm-lost-reason">${esc(lostLabel(l.lostReason))}</small>`:''}</article>`;
}
function renderLeads(){
  const p=document.getElementById('adminCrmLeadsPanel');if(!p||!has('leads'))return;
  if(state.errors.leads){p.innerHTML=crmNav('leads')+failure('leads');return}
  const leads=filteredLeads();
  p.innerHTML=`${crmNav('leads')}<div class="crm-head"><div><span>CRM</span><h2>${T('Des échanges aux projets.','From conversations to projects.')}</h2><p>${T('Retrouvez chaque opportunité et sa prochaine action.','Find every opportunity and its next action.')}</p></div><div class="crm-head-actions"><button class="btn btn-ghost" onclick="ARTYCRM.download('leads')">${T('Exporter','Export')}</button><button class="crm-primary" onclick="ARTYCRM.newLead()">+ ${T('Nouveau prospect','New lead')}</button></div></div>
  <div class="crm-preset-row" role="group" aria-label="${T('Vues rapides','Quick views')}">${[['open',T('En cours','Open')],['mine',T('Mes prospects','My leads')],['no_next',T('Sans suivi','No next action')],['closed',T('Terminés','Closed')],['all',T('Tous','All')]].map(([k,v])=>`<button aria-pressed="${state.leadPreset===k}" class="${state.leadPreset===k?'active':''}" onclick="ARTYCRM.leadPreset('${k}')">${v}</button>`).join('')}<div class="crm-view-toggle"><button aria-pressed="${state.leadView==='list'}" onclick="ARTYCRM.leadView('list')">${T('Liste','List')}</button><button aria-pressed="${state.leadView==='board'}" onclick="ARTYCRM.leadView('board')">${T('Tableau','Board')}</button></div></div>
  <div class="crm-toolbar"><input aria-label="${T('Rechercher un prospect','Search leads')}" type="search" value="${attr(state.leadQuery)}" placeholder="${T('Rechercher nom, courriel, sujet…','Search name, email, subject…')}" oninput="ARTYCRM.searchLeads(this.value)"><select aria-label="${T('Responsable','Owner')}" onchange="ARTYCRM.filterOwner(this.value)"><option value="all">${T('Toute l’équipe','All team')}</option>${state.team.map(t=>`<option value="${attr(t.email)}" ${state.leadOwner===t.email?'selected':''}>${esc(t.name)}</option>`).join('')}</select><select aria-label="${T('Étape','Stage')}" onchange="ARTYCRM.filterStatus(this.value)"><option value="all">${T('Toutes les étapes','All stages')}</option>${statusOrder.map(k=>`<option value="${k}" ${state.leadStatus===k?'selected':''}>${statusLabel(k)}</option>`).join('')}</select><span class="crm-result-count">${leads.length} ${T('résultat(s)','result(s)')}</span></div>
  ${state.leadView==='board'?`<div class="crm-kanban">${statusOrder.filter(k=>state.leadPreset!=='open'||!['won','refunded','lost'].includes(k)).map(k=>`<section class="crm-kanban-col" data-stage="${k}" ondragover="event.preventDefault()" ondrop="ARTYCRM.dropStage(event,'${k}')"><header><span class="crm-stage-dot ${k}"></span><strong>${statusLabel(k)}</strong><b>${leads.filter(l=>l.status===k).length}</b></header><div class="crm-kanban-list">${leads.filter(l=>l.status===k).map(leadCard).join('')||`<div class="crm-drop-empty">${T('Aucun prospect','No leads')}</div>`}</div></section>`).join('')}</div>`:`<div class="crm-opportunity-list"><div class="crm-opportunity-heading"><span>${T('Client / projet','Client / project')}</span><span>${T('Étape','Stage')}</span><span>${T('Prochain suivi','Next action')}</span><span>${T('Valeur','Value')}</span></div>${leads.map(l=>`<button class="crm-opportunity" onclick="ARTYCRM.openLeadActions('${l.kind}','${encodeKey(l.id)}')"><span><strong>${esc(l.name||l.email)}</strong><small>${esc(l.title||'')}</small><small>${esc(l.owner||T('Non assigné','Unassigned'))}</small></span><span><b class="crm-pill ${l.status}">${statusLabel(l.status)}</b></span><span><small>${l.nextFollowUp?scheduleDate(l.nextFollowUp):T('À planifier','Not scheduled')}</small><small>${l.nextFollowUp?taskType(l.followUpType):''}</small></span><strong>${leadPrimaryValue(l)}</strong></button>`).join('')||`<div class="crm-empty">${T('Aucun prospect dans cette vue.','No leads in this view.')}</div>`}</div>`}`;
}

function ownerOptions(selected=''){return `<option value="">${T('Non assigné','Unassigned')}</option>${state.team.map(t=>`<option value="${attr(t.email)}" ${selected===t.email?'selected':''}>${esc(t.name)}${t.role==='admin'?' · '+T('Admin','Admin'):''}</option>`).join('')}`}
function modalLead(kind,idEncoded){
  const id=decodeURIComponent(idEncoded);
  return state.leads.find(l=>l.kind===kind&&String(l.id)===String(id))||null;
}
function showLeadModal(){
  const m=document.getElementById('crmLeadModal');if(m){if(m.hidden)state.returnFocus=document.activeElement;m.hidden=false}document.body.classList.add('crm-modal-open');m?.querySelector('.crm-modal-close')?.focus();
}
function openLeadActions(kind,idEncoded){
  const lead=modalLead(kind,idEncoded);if(!lead)return;
  state.editingLead={...lead};renderLeadActions();showLeadModal();
}
function leadPrimaryValue(l){return money(['won','refunded'].includes(l.status)?Number(l.finalValue||0):Number(l.value||l.expectedValue||0))}
function leadPaymentLabel(l){if(l.quoteRefundStatus==='refunded'||l.quotePaymentStatus==='refunded')return T('Remboursé','Refunded');if(l.quoteRefundStatus==='partial_refund')return T('Partiellement remboursé','Partially refunded');if(l.quoteRefundStatus==='refund_pending'||l.quotePaymentStatus==='refund_pending')return T('Remboursement en cours','Refund in progress');if(l.quotePaymentStatus==='paid')return T('Payé','Paid');return l.quotePaymentStatus||'—'}
function canDeleteManualLead(l){
  if(!l||l.kind!=='manual')return false;
  if(currentUser?.role==='admin')return true;
  return currentUser?.role==='staff'&&String(l.createdBy||'').trim().toLowerCase()===String(currentUser?.email||'').trim().toLowerCase();
}
function renderLeadActions(){
  const host=document.getElementById('crmLeadEditorBody'),l=state.editingLead;if(!host||!l)return;
  const terminal=['won','refunded','lost'].includes(l.status);
  host.innerHTML=`<div class="crm-action-profile">
    <div class="crm-editor-head"><span>${esc(statusLabel(l.status))}</span><h2>${esc(l.name||l.email)}</h2><p>${esc(l.title||'')} ${l.reference?'· '+esc(l.reference):''}</p></div>
    <div class="crm-action-summary">
      <div><small>${T('Valeur','Value')}</small><strong>${leadPrimaryValue(l)}</strong></div>
      <div><small>${T('Responsable','Owner')}</small><strong>${esc(state.team.find(t=>t.email===l.owner)?.name||l.owner||T('Non assigné','Unassigned'))}</strong></div>
      <div><small>${T('Prochain suivi','Next follow-up')}</small><strong>${l.nextFollowUp?esc(scheduleDate(l.nextFollowUp)):T('Aucun','None')}</strong></div>
      <div><small>${T('Paiement','Payment')}</small><strong>${esc(leadPaymentLabel(l))}</strong></div>
    </div>
    ${l.kind==='event'&&l.quoteRefundStatus&&l.quoteRefundStatus!=='none'?`<div class="crm-refund-summary"><div><small>${T('Montant remboursé','Refund amount')}</small><strong>${money(l.quoteLastRefundAmount||l.quoteRefundedTotal||0)}</strong></div><div><small>${T('Revenu net','Net revenue')}</small><strong>${money(l.quoteNetPaid||0)}</strong></div><div><small>${T('Date','Date')}</small><strong>${l.quoteRefundedAt?esc(dateTime(l.quoteRefundedAt)):'—'}</strong></div><div><small>${T('Raison','Reason')}</small><strong>${esc(l.quoteRefundReason||'—')}</strong></div></div>`:''}
    <div class="crm-quick-actions"><button class="crm-action-tile primary" onclick="ARTYCRM.renderActivityForm()"><span aria-hidden="true">✓</span><strong>${T('Enregistrer un échange','Log conversation')}</strong><small>${T('Appel, courriel ou rencontre','Call, email or meeting')}</small></button>${has('customers')?`<button class="crm-action-tile" onclick="ARTYCRM.openClientFromLead()"><span aria-hidden="true">↗</span><strong>${T('Dossier client','Client profile')}</strong><small>${T('Achats, demandes et historique','Purchases, requests & history')}</small></button>`:''}
      ${true?`<button class="crm-action-tile primary" onclick="ARTYCRM.newTaskForm()"><span>↗</span><strong>${T('Planifier un suivi','Schedule follow-up')}</strong><small>${T('Date, priorité et historique','Date, priority & history')}</small></button>`:''}
      ${l.status!=='won'?`<button class="crm-action-tile quote" onclick="ARTYCRM.renderQuoteAction()"><span>$</span><strong>${T('Envoyer un devis','Send quote')}</strong><small>${T('Courriel avec paiement Stripe sécurisé','Email with secure Stripe payment')}</small></button>`:''}
      <button class="crm-action-tile" onclick="ARTYCRM.emailLead()"><span>@</span><strong>${T('Envoyer un courriel','Email client')}</strong><small>${esc(l.email||'')}</small></button>
      ${l.phone?`<button class="crm-action-tile" onclick="ARTYCRM.callLead()"><span>☎</span><strong>${T('Appeler','Call')}</strong><small>${esc(l.phone)}</small></button>`:''}
      <button class="crm-action-tile" onclick="ARTYCRM.openLeadCalendar()"><span>▣</span><strong>${T('Google Calendar','Google Calendar')}</strong><small>${l.nextFollowUp?T('Ouvrir ce suivi','Open this follow-up'):T('Ouvrir le calendrier','Open calendar')}</small></button>
      ${l.status==='new'?`<button class="crm-action-tile" onclick="ARTYCRM.quickLeadStatus('contacted')"><span>✓</span><strong>${T('Marquer contacté','Mark contacted')}</strong><small>${T('Met à jour le pipeline','Updates the pipeline')}</small></button>`:''}
      ${l.kind==='event'&&l.status==='won'&&has('events')&&Number(l.quoteNetPaid||0)>0&&l.quoteRefundStatus!=='refund_pending'?`<button class="crm-action-tile danger" onclick="ARTYCRM.refundEventLead()"><span>↩</span><strong>${T('Rembourser','Refund payment')}</strong><small>${T('Remboursement Stripe sécurisé','Secure Stripe refund')}</small></button>`:''}
      ${!terminal?`<button class="crm-action-tile danger" onclick="ARTYCRM.renderLostAction()"><span>×</span><strong>${T('Marquer perdu','Mark lost')}</strong><small>${T('Enregistrer la raison','Record the reason')}</small></button>`:''}
      <button class="crm-action-tile secondary" onclick="ARTYCRM.renderLeadEditor()"><span>⋯</span><strong>${T('Modifier les détails','Edit details')}</strong><small>${T('Champs avancés du prospect','Advanced lead fields')}</small></button>
      ${canDeleteManualLead(l)?`<button class="crm-action-tile danger" onclick="ARTYCRM.deleteManualLead()"><span>⌫</span><strong>${T('Supprimer le prospect','Delete lead')}</strong><small>${T('Supprimer définitivement','Delete permanently')}</small></button>`:''}
    </div>
    ${l.kind==='event'&&l.paymentLinkUrl?`<div class="crm-secure-link"><div><strong>${T('Lien de devis sécurisé','Secure quote link')}</strong><small>${(l.quoteEmailStatus==='sent'?T('Courriel du devis envoyé.','Quote email sent.'):T('Vérifiez l’envoi du devis avant de relancer.','Check quote delivery before following up.'))}</small></div><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.openSecureQuote()">${T('Ouvrir','Open')}</button></div>`:''}
    ${taskPanel(l)}<div class="crm-action-footer"><button class="btn btn-ghost" onclick="ARTYCRM.closeLeadEditor()">${T('Fermer','Close')}</button></div>
  </div>`;
}
function calendarNotice(result){const action=result?.calendarSync?.action;
  if(action==='error')return showToast(T('Enregistré. Le calendrier demande une nouvelle synchronisation.','Saved. Calendar needs another sync.'),'warning');
  if(action==='not_configured')return showToast(T('Enregistré dans le CRM. Google Calendar n’est pas connecté.','Saved in CRM. Google Calendar is not connected.'),'success');
  showToast(['created','updated'].includes(action)?T('Enregistré et synchronisé avec le calendrier','Saved and synced to Calendar'):T('Enregistré','Saved'),'success');
}
async function openTask(kind,idEncoded,taskEncoded=''){
  await loadLeads();const lead=modalLead(kind,idEncoded);if(!lead)return;
  state.editingLead={...lead};state.taskMode=taskEncoded?'complete':'create';state.taskId=taskEncoded?decodeURIComponent(taskEncoded):'';renderFollowUpAction();showLeadModal();
}
function activityLabel(a){
  return ({task_created:T('Suivi planifié','Follow-up scheduled'),task_rescheduled:T('Suivi reporté','Follow-up rescheduled'),task_completed:T('Suivi terminé','Follow-up completed'),task_cancelled:T('Suivi annulé','Follow-up cancelled'),note_updated:T('Note mise à jour','Note updated'),interaction:taskType(a.channel)})[a.type]||T('Activité','Activity');
}
function activitiesHTML(activities){return activities.slice().reverse().map(a=>`<article class="crm-history-entry"><span class="crm-history-dot"></span><div><strong>${esc(activityLabel(a))}${a.outcome?' · '+esc(outcomeLabel(a.outcome)):''}</strong><small>${dateTime(a.at)} · ${esc(a.by||'')}</small>${a.dueAt?`<span>${scheduleDate(a.dueAt)}</span>`:''}${a.note?`<p>${esc(a.note)}</p>`:''}</div></article>`).join('')||`<p class="crm-muted">${T('Les prochains échanges enregistrés apparaîtront ici.','Your next recorded conversations will appear here.')}</p>`}
function outcomeOptions(selected=''){return `<option value="">${T('Choisir le résultat','Choose an outcome')}</option>${['reached','no_answer','email_sent','meeting_done','quote_followed','other'].map(x=>`<option value="${x}" ${x===selected?'selected':''}>${outcomeLabel(x)}</option>`).join('')}`}
function taskTypeOptions(selected='call'){return ['call','email','meeting','quote','other'].map(x=>`<option value="${x}" ${selected===x?'selected':''}>${taskType(x)}</option>`).join('')}
function renderFollowUpAction(){
  const host=document.getElementById('crmLeadEditorBody'),l=state.editingLead;if(!host||!l)return;
  const task=(l.tasks||[]).find(t=>t.id===state.taskId),mode=task?state.taskMode:'create',complete=mode==='complete';
  state.taskRequestKey=crypto.randomUUID();
  host.innerHTML=`<div class="crm-editor-head"><span>${esc(l.name||l.email)}</span><h2>${complete?T('Comment s’est passé le suivi ?','How did the follow-up go?'):task?T('Reporter ce suivi','Reschedule this follow-up'):T('Planifier le prochain échange','Plan the next conversation')}</h2><p>${T('Chaque action reste dans l’historique du client.','Every action stays in the client’s history.')}</p></div><form id="crmTaskForm" onsubmit="event.preventDefault();ARTYCRM.saveFollowUpAction()"><div class="crm-action-form">
  ${complete?`<label class="wide">${T('Résultat','Outcome')}<select id="taskOutcome" required>${outcomeOptions()}</select></label>`:`<label>${T('Date et heure','Date & time')}<input id="taskDue" type="datetime-local" required value="${attr(task?.dueAt?.slice(0,16)||'')}"></label><label>${T('Type','Type')}<select id="taskType">${taskTypeOptions(task?.type)}</select></label><label>${T('Priorité','Priority')}<select id="taskPriority"><option value="normal">${T('Normale','Normal')}</option><option value="high" ${task?.priority==='high'?'selected':''}>${T('Importante','High')}</option></select></label><label>${T('Durée','Duration')}<select id="taskDuration">${[15,30,45,60,90,120].map(n=>`<option value="${n}" ${Number(task?.duration||30)===n?'selected':''}>${n} min</option>`).join('')}</select></label>`}
  <label class="wide">${T('Note / détails','Notes / details')}<textarea id="taskNote" rows="4" maxlength="3000" placeholder="${T('Contexte, demande du client, prochaine étape…','Context, client request, next step…')}">${esc(complete?'':task?.note||'')}</textarea></label>
  ${complete?`<label>${T('Prochain suivi (facultatif)','Next follow-up (optional)')}<input id="taskNextDue" type="datetime-local"></label><label>${T('Type du prochain suivi','Next follow-up type')}<select id="taskNextType">${taskTypeOptions()}</select></label>`:''}</div>
  <p class="crm-form-note">${T('Horaires','Time zone')}: ${esc(state.actions?.timeZone||'America/Toronto')}. ${T('Enregistré dans le CRM; synchronisé si Google Calendar est connecté et un responsable est assigné.','Saved in CRM; synced when Google Calendar is connected and an owner is assigned.')}</p>
  <div class="crm-editor-footer"><button type="button" class="btn btn-ghost" onclick="ARTYCRM.renderLeadActions()">${T('Retour','Back')}</button>${task?`<button type="button" class="btn btn-ghost" onclick="ARTYCRM.cancelTask()">${T('Annuler ce suivi','Cancel task')}</button>`:''}<button type="submit" class="crm-primary">${complete?T('Terminer et enregistrer','Complete & save'):T('Enregistrer le suivi','Save follow-up')}</button></div></form>`;
}
async function saveFollowUpAction(){
  const form=document.getElementById('crmTaskForm'),l=state.editingLead;if(!l||!form?.reportValidity())return;
  const task=(l.tasks||[]).find(t=>t.id===state.taskId),complete=task&&state.taskMode==='complete',val=id=>document.getElementById(id)?.value||'';
  const body={expectedRevision:l.revision,note:val('taskNote'),requestKey:state.taskRequestKey};
  if(complete){body.action='complete';body.outcome=val('taskOutcome');if(val('taskNextDue'))body.nextTask={dueAt:val('taskNextDue'),type:val('taskNextType')}}
  else Object.assign(body,{action:'reschedule',dueAt:val('taskDue'),type:val('taskType'),duration:Number(val('taskDuration'))||30,priority:val('taskPriority')});
  try{const result=await api('/api/admin/crm/leads/'+l.kind+'/'+encodeKey(l.id)+'/tasks'+(task?'/'+encodeKey(task.id):''),{method:task?'PATCH':'POST',body:JSON.stringify(body)});await refreshLeadAfterAction(l.kind,l.id);calendarNotice(result);renderLeadActions()}catch(e){showToast(e.message,'error')}
}
async function cancelTask(){
  const l=state.editingLead;if(!l||!state.taskId)return;
  if(!confirm(T('Annuler ce suivi ? Il restera dans l’historique.','Cancel this follow-up? It will remain in history.')))return;
  try{const result=await api('/api/admin/crm/leads/'+l.kind+'/'+encodeKey(l.id)+'/tasks/'+encodeKey(state.taskId),{method:'PATCH',body:JSON.stringify({action:'cancel',expectedRevision:l.revision})});await refreshLeadAfterAction(l.kind,l.id);calendarNotice(result);renderLeadActions()}catch(e){showToast(e.message,'error')}
}
function renderActivityForm(){
  const l=state.editingLead;if(!l)return;state.activityRequestKey=crypto.randomUUID();
  document.getElementById('crmLeadEditorBody').innerHTML=`<div class="crm-editor-head"><span>${esc(l.name)}</span><h2>${T('Enregistrer un échange','Log a conversation')}</h2><p>${T('Ajoutez un échange déjà effectué. Aucun courriel n’est envoyé par ce formulaire.','Record a conversation that already happened. This form does not send email.')}</p></div><form id="crmActivityForm" onsubmit="event.preventDefault();ARTYCRM.saveActivity()"><div class="crm-action-form"><label>${T('Canal','Channel')}<select id="activityType">${['call','email','meeting'].map(x=>`<option value="${x}">${taskType(x)}</option>`).join('')}</select></label><label>${T('Résultat','Outcome')}<select id="activityOutcome" required>${outcomeOptions()}</select></label><label class="wide">${T('Ce qu’il faut retenir','What to remember')}<textarea id="activityNote" maxlength="3000" rows="4"></textarea></label><label>${T('Prochain suivi (facultatif)','Next follow-up (optional)')}<input id="activityNext" type="datetime-local"></label><label>${T('Type de suivi','Follow-up type')}<select id="activityNextType">${taskTypeOptions()}</select></label></div><div class="crm-editor-footer"><button type="button" class="btn btn-ghost" onclick="ARTYCRM.renderLeadActions()">${T('Retour','Back')}</button><button type="submit" class="crm-primary">${T('Enregistrer','Save conversation')}</button></div></form>`;
}
async function saveActivity(){
  const l=state.editingLead;if(!l||!document.getElementById('crmActivityForm')?.reportValidity())return;
  const val=id=>document.getElementById(id)?.value||'',body={type:val('activityType'),outcome:val('activityOutcome'),note:val('activityNote'),requestKey:state.activityRequestKey,expectedRevision:l.revision};
  if(val('activityNext'))body.nextTask={dueAt:val('activityNext'),type:val('activityNextType')};
  try{const result=await api('/api/admin/crm/leads/'+l.kind+'/'+encodeKey(l.id)+'/activities',{method:'POST',body:JSON.stringify(body)});await refreshLeadAfterAction(l.kind,l.id);calendarNotice(result);renderLeadActions()}catch(e){showToast(e.message,'error')}
}
function taskForm(id,mode){state.taskId=decodeURIComponent(id);state.taskMode=mode;renderFollowUpAction()}
function newTaskForm(){state.taskId='';state.taskMode='create';renderFollowUpAction()}
function taskPanel(l){const pending=(l.tasks||[]).filter(t=>t.status==='open').sort((a,b)=>a.dueAt.localeCompare(b.dueAt));return `<section class="crm-task-section"><div class="crm-section-head"><h3>${T('Prochains échanges','Next conversations')}</h3><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.newTaskForm()">+ ${T('Planifier','Schedule')}</button></div>${pending.map(t=>`<div class="crm-task-line"><div><strong>${taskType(t.type)}</strong><span>${scheduleDate(t.dueAt)}</span>${t.note?`<small>${esc(t.note)}</small>`:''}<small class="crm-muted">${({created:T('Calendrier synchronisé','Calendar synced'),updated:T('Calendrier synchronisé','Calendar synced'),error:T('Synchronisation à vérifier','Sync needs attention'),not_configured:T('CRM seulement · calendrier non connecté','CRM only · Calendar not connected')})[t.calendar?.status]||T('Enregistré dans le CRM','Saved in CRM')}</small></div><div><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.taskForm('${encodeKey(t.id)}','reschedule')">${T('Reporter','Reschedule')}</button><button class="crm-complete" onclick="ARTYCRM.taskForm('${encodeKey(t.id)}','complete')">${T('Terminer','Complete')}</button></div></div>`).join('')||`<p class="crm-muted">${T('Aucun suivi planifié pour ce projet.','No follow-up scheduled for this project.')}</p>`}${(l.tasks||[]).some(t=>['error','not_configured'].includes(t.calendar?.status))?`<button class="btn btn-ghost" onclick="ARTYCRM.retryCalendar()">${T('Réessayer la synchronisation','Retry Calendar sync')}</button>`:''}</section><details class="crm-history" open><summary>${T('Historique des échanges','Conversation history')} <span>${(l.activities||[]).length}</span></summary>${activitiesHTML(l.activities||[])}</details>`}
async function retryCalendar(){const l=state.editingLead;if(!l)return;try{const result=await api('/api/admin/crm/leads/'+l.kind+'/'+encodeKey(l.id)+'/calendar-sync',{method:'POST',body:'{}'});await refreshLeadAfterAction(l.kind,l.id);calendarNotice(result);renderLeadActions()}catch(e){showToast(e.message,'error')}}
async function openClientFromLead(){const email=state.editingLead?.email;if(!email||!has('customers'))return;closeLeadEditor();await section('customers');await openCustomer(encodeKey(email))}
async function openSupport(id){if(!has('support'))return;switchAdminTab('support');await window.ARTYSupport?.load();window.ARTYSupport?.open(decodeURIComponent(id))}

function quoteProvinceOptions(selected='QC'){
  const provinces=[['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],['NL','Newfoundland and Labrador'],['NS','Nova Scotia'],['NT','Northwest Territories'],['NU','Nunavut'],['ON','Ontario'],['PE','Prince Edward Island'],['QC','Quebec'],['SK','Saskatchewan'],['YT','Yukon']];
  return provinces.map(([code,name])=>`<option value="${code}" ${String(selected||'').toUpperCase()===code?'selected':''}>${code} — ${name}</option>`).join('');
}
function quoteAddressFromForm(){
  return{line1:document.getElementById('quickQuoteAddress')?.value.trim()||'',city:document.getElementById('quickQuoteCity')?.value.trim()||'',province:document.getElementById('quickQuoteProvince')?.value||'QC',postal:document.getElementById('quickQuotePostal')?.value.trim()||'',country:'Canada'};
}
function renderQuoteAction(){
  const host=document.getElementById('crmLeadEditorBody'),l=state.editingLead;if(!host||!l)return;
  const needsConversion=l.kind!=='event',address=l.quoteAddress||{},subtotal=Number(l.quoteSubtotal??l.expectedValue??l.value??0)||0;
  host.innerHTML=`<div class="crm-editor-head"><span>${T('Devis sécurisé','Secure quote')}</span><h2>${T('Envoyer le devis au client','Send quote to client')}</h2><p>${esc(l.name||l.email)} · ${esc(l.email||'')}</p></div>
    <div class="crm-quote-banner"><div><strong>${T('Paiement Stripe sécurisé','Secure Stripe payment')}</strong><small>${T('Entrez le prix avant taxes, ajoutez les frais de livraison si nécessaire. ARTY calcule ensuite automatiquement les taxes selon la province du client.','Enter the price before tax and add shipping if needed. ARTY then calculates taxes automatically from the customer province.')}</small></div></div>
    <div class="crm-action-form">
      ${needsConversion?`<label>${T('Type d’événement / projet','Event / project type')}<input id="quickQuoteEventType" value="${attr(l.eventType||l.title||'')}" placeholder="${T('Événement privé, corporatif…','Private event, corporate…')}"></label>
      <label>${T('Nombre de personnes','Guests')}<input id="quickQuoteGuests" type="number" min="1" max="1000" value="1"></label>
      <label>${T('Date souhaitée','Preferred date')}<input id="quickQuotePreferredDate" type="date" value="${attr((l.preferredDate||'').slice(0,10))}"></label>`:''}
      <label>${T('Prix avant taxes (CAD)','Price before tax (CAD)')}<input id="quickQuoteAmount" type="number" min=".50" step=".01" value="${subtotal||''}" placeholder="500.00" oninput="ARTYCRM.previewQuoteAction()"></label>
      <label>${T('Livraison / déplacement (CAD)','Shipping / travel fee (CAD)')}<input id="quickQuoteShipping" type="number" min="0" step=".01" value="${Number(l.quoteShipping||0)}" oninput="ARTYCRM.previewQuoteAction()"></label>
      <label class="wide">${T('Adresse','Address')}<input id="quickQuoteAddress" value="${attr(address.line1||l.location||'')}" placeholder="123 Main St" oninput="ARTYCRM.previewQuoteAction()"></label>
      <label>${T('Ville','City')}<input id="quickQuoteCity" value="${attr(address.city||'')}" oninput="ARTYCRM.previewQuoteAction()"></label>
      <label>${T('Province','Province')}<select id="quickQuoteProvince" onchange="ARTYCRM.previewQuoteAction()">${quoteProvinceOptions(address.province||'QC')}</select></label>
      <label>${T('Code postal','Postal code')}<input id="quickQuotePostal" value="${attr(address.postal||'')}" placeholder="J8X 1A1"></label>
      <label class="wide">${T('Description visible au client','Description shown to client')}<textarea id="quickQuoteDescription" rows="5" placeholder="${T('Ex.: Expérience artistique privée pour 20 personnes, matériel inclus…','E.g. Private art experience for 20 guests, materials included…')}">${esc(l.quoteDescription||'')}</textarea></label>
    </div>
    <div class="crm-quote-total" id="quickQuoteTotal"><span>${T('Calcul du total…','Calculating total…')}</span></div>
    ${needsConversion?`<div class="crm-form-note">${T('Ce prospect sera transformé en opportunité événement afin d’utiliser le paiement sécurisé, sans créer de doublon dans le pipeline.','This lead will be converted into an event opportunity for secure payment without creating a duplicate in the pipeline.')}</div>`:''}
    <div class="crm-editor-footer"><button class="btn btn-ghost" onclick="ARTYCRM.renderLeadActions()">${T('Retour','Back')}</button><button class="btn btn-orange" onclick="ARTYCRM.sendQuoteAction()">${T('Envoyer le devis sécurisé','Send secure quote')}</button></div>`;
  previewQuoteAction();
}
async function previewQuoteAction(){
  const box=document.getElementById('quickQuoteTotal');if(!box)return null;
  const subtotal=Number(document.getElementById('quickQuoteAmount')?.value)||0,shipping=Number(document.getElementById('quickQuoteShipping')?.value)||0;
  if(subtotal<.5){box.innerHTML=`<span>${T('Entrez un prix avant taxes.','Enter a price before tax.')}</span>`;return null}
  try{
    const data=await api('/api/admin/crm/quote-preview',{method:'POST',body:JSON.stringify({subtotal,shipping,address:quoteAddressFromForm()})});
    box.innerHTML=`<div><span>${T('Sous-total','Subtotal')}</span><strong>${money(data.subtotal)}</strong></div><div><span>${T('Livraison / déplacement','Shipping / travel')}</span><strong>${money(data.shipping)}</strong></div>${(data.taxLines||[]).map(line=>`<div><span>${esc(line.label)} ${Number(line.rate)}%</span><strong>${money(line.amount)}</strong></div>`).join('')}<div class="total"><span>${T('Total à payer','Total due')}</span><strong>${money(data.total)}</strong></div>`;
    return data;
  }catch(e){box.innerHTML=`<span class="error">${esc(e.message)}</span>`;return null}
}
async function sendQuoteAction(){
  let l=state.editingLead;
  const subtotal=Number(document.getElementById('quickQuoteAmount')?.value)||0,shipping=Number(document.getElementById('quickQuoteShipping')?.value)||0,quoteDescription=document.getElementById('quickQuoteDescription')?.value.trim()||'',address=quoteAddressFromForm();
  if(!l)return;if(subtotal<.5)return showToast(T('Entrez un montant valide','Enter a valid amount'),'error');
  const pricing=await previewQuoteAction();if(!pricing)return;
  if(!confirm(T(`Envoyer ce devis de ${money(pricing.total)} au client maintenant?`,`Send this ${money(pricing.total)} quote to the customer now?`)))return;
  try{
    if(l.kind!=='event'){
      const converted=await api('/api/admin/crm/leads/'+encodeKey(l.kind)+'/'+encodeKey(l.id)+'/convert-event',{method:'POST',body:JSON.stringify({
        eventType:document.getElementById('quickQuoteEventType')?.value||l.title||'ARTY event',
        guests:Number(document.getElementById('quickQuoteGuests')?.value)||1,
        preferredDate:document.getElementById('quickQuotePreferredDate')?.value||'',
        address
      })});
      if(!converted.lead)throw new Error(T('Conversion du prospect impossible','Could not convert lead'));
      l=converted.lead;state.editingLead={...l};
    }
    const result=await api('/api/admin/event-requests/'+encodeKey(l.id)+'/payment-link',{method:'POST',body:JSON.stringify({quoteSubtotal:subtotal,quoteShipping:shipping,quoteAddress:address,quoteDescription})});
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
async function refundEventLead(){
  const l=state.editingLead;if(!l||l.kind!=='event'||!has('events'))return;
  const refundable=Math.max(0,Number(l.quoteNetPaid??l.finalValue??0)-Number(l.quoteRefundPendingTotal||0));
  if(refundable<=0)return showToast(T('Aucun montant remboursable','No refundable amount'),'error');
  const raw=prompt(T(`Montant à rembourser (max ${money(refundable)})`,`Refund amount (max ${money(refundable)})`),Number(refundable).toFixed(2));if(raw===null)return;
  const amount=Number(raw);if(!Number.isFinite(amount)||amount<=0||amount>refundable)return showToast(T('Montant invalide','Invalid refund amount'),'error');
  const reason=prompt(T('Raison du remboursement','Refund reason'),T('Demande client','Customer request'))||T('Demande client','Customer request');
  if(!confirm(T(`Confirmer le remboursement de ${money(amount)}? ARTY enverra le remboursement directement à Stripe.`,`Confirm the ${money(amount)} refund? ARTY will send it directly to Stripe.`)))return;
  try{
    const result=await api('/api/admin/event-requests/'+encodeKey(l.id)+'/refund',{method:'POST',body:JSON.stringify({amount,reason})});
    await refreshLeadAfterAction('event',l.id);
    const processing=['pending','requires_action'].includes(String(result.stripeStatus||''));
    showToast(processing?T('Remboursement Stripe en traitement','Stripe refund is processing'):T('Remboursement effectué dans Stripe','Refund completed in Stripe'),'success');
    renderLeadActions();
  }catch(e){showToast(e.message,'error')}
}
async function quickLeadStatus(status,extra={}){
  const l=state.editingLead;if(!l)return;
  try{await api('/api/admin/crm/leads/'+encodeKey(l.kind)+'/'+encodeKey(l.id),{method:'PATCH',body:JSON.stringify({status,expectedRevision:l.revision,...extra})});await refreshLeadAfterAction(l.kind,l.id);showToast(T('Pipeline mis à jour','Pipeline updated'),'success');renderLeadActions()}catch(e){showToast(e.message,'error')}
}
async function refreshLeadAfterAction(kind,id){
  await Promise.all([loadLeads(),loadOverview(),loadCustomers()]);
  const refreshed=state.leads.find(x=>x.kind===kind&&String(x.id)===String(id));if(refreshed)state.editingLead={...refreshed};
  if(state.activeSection==='overview')renderOverview();else if(state.activeSection==='customers'){if(state.customer?.summary?.email)state.customer=await api('/api/admin/crm/customers/'+encodeKey(state.customer.summary.email));renderCustomers()}else renderLeads();
}
function emailLead(){const l=state.editingLead;if(!l?.email)return;const subject='ARTY — '+(l.reference||l.title||T('Suivi','Follow-up'));window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeKey(l.email)+'&su='+encodeKey(subject),'_blank','noopener')}
function callLead(){const l=state.editingLead;if(l?.phone)window.location.href='tel:'+String(l.phone).replace(/[^+0-9]/g,'')}
function openLeadCalendar(){const l=state.editingLead,url=l?.calendar?.htmlLink||'https://calendar.google.com/calendar/u/0/r';window.open(url,'_blank','noopener')}
function openSecureQuote(){const url=state.editingLead?.paymentLinkUrl;if(url)window.open(url,'_blank','noopener')}

function openLeadEditor(kind,idEncoded,forcedStatus=''){
  const id=decodeURIComponent(idEncoded),lead=kind?state.leads.find(l=>l.kind===kind&&String(l.id)===String(id)):null;
  state.editingLead=lead?{...lead}:{kind:'manual',id:'',status:'new',name:'',email:'',phone:'',title:'',eventType:'',preferredDate:'',expectedValue:0,value:0,finalValue:0,source:'manual',campaign:'',owner:currentUser?.email||'',nextFollowUp:'',followUpType:'call',followUpDuration:30,tags:[],adminNote:'',lostReason:'',message:''};
  if(forcedStatus)state.editingLead.status=forcedStatus;
  renderLeadEditor();showLeadModal();
}
async function newLead(){await loadLeads();openLeadEditor('','')}
function closeLeadEditor(){if(state.saving)return;const m=document.getElementById('crmLeadModal');if(m)m.hidden=true;document.body.classList.remove('crm-modal-open');state.editingLead=null;if(state.returnFocus?.isConnected)state.returnFocus.focus({preventScroll:true})}
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
async function deleteManualLead(){
  const l=state.editingLead;if(!canDeleteManualLead(l))return;
  if(!confirm(T('Supprimer définitivement ce prospect? Cette action est irréversible.','Delete this lead permanently? This cannot be undone.')))return;
  try{
    await api('/api/admin/crm/leads/manual/'+encodeKey(l.id),{method:'DELETE'});
    closeLeadEditor();
    await Promise.all([loadLeads(),loadOverview(),loadCustomers()]);
    renderLeads();
    showToast(T('Prospect supprimé','Lead deleted'),'success');
  }catch(e){showToast(e.message,'error')}
}

async function saveLeadEditor(){
  const l=state.editingLead;if(!l)return;const isNew=!l.id,manual=isNew||l.kind==='manual';
  const body={
    expectedRevision:l.revision,
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
    const result=isNew?await api('/api/admin/crm/leads',{method:'POST',body:JSON.stringify(body)}):await api('/api/admin/crm/leads/'+encodeKey(l.kind)+'/'+encodeKey(l.id),{method:'PATCH',body:JSON.stringify(body)});
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
  if(['won','refunded','lost'].includes(status)){openLeadEditor(lead.kind,encodeKey(lead.id),status);return}
  try{await api('/api/admin/crm/leads/'+encodeKey(lead.kind)+'/'+encodeKey(lead.id),{method:'PATCH',body:JSON.stringify({status,expectedRevision:lead.revision})});await Promise.all([loadLeads(),loadOverview()]);renderLeads()}catch(e){showToast(e.message,'error')}
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
  if(!(has('crm_dashboard')||has('customers')||has('leads')))return;
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
      if(tab==='crm'){if(window.artyCanOpenAdminTab&&!window.artyCanOpenAdminTab('crm'))return;return showCrm(button)}
      closeLeadEditor();
      document.querySelectorAll('#page-admin [id^="adminCrm"][id$="Panel"]').forEach(panel=>panel.style.display='none');
      const result=base.call(this,tab,button,...rest);
      if(tab==='events'&&typeof window.loadEventRequests==='function')Promise.resolve(window.loadEventRequests()).then(()=>window.renderAdminEvents?.()).catch(()=>{});
      return result;
    };wrapped.__crmV2Wrapped=true;window.switchAdminTab=wrapped;
  }
  const loadBase=window.loadAdminData;
  if(typeof loadBase==='function'&&!loadBase.__crmV2Wrapped){
    const wrapped=async function(...args){const result=await loadBase.apply(this,args);ensure();return result};wrapped.__crmV2Wrapped=true;window.loadAdminData=wrapped;
  }
}

function styles(){}

async function guarded(fn){if(state.saving)return;state.saving=true;const modal=document.getElementById('crmLeadModal');modal?.setAttribute('aria-busy','true');modal?.querySelectorAll('button').forEach(b=>b.disabled=true);try{return await fn()}finally{state.saving=false;modal?.removeAttribute('aria-busy');modal?.querySelectorAll('button').forEach(b=>b.disabled=false)}}
function saveView(key,value){try{localStorage.setItem('arty-crm-view-'+key,value)}catch{}}
try{state.leadView=localStorage.getItem('arty-crm-view-mode')==='board'?'board':'list';const preset=localStorage.getItem('arty-crm-view-preset');if(['open','mine','no_next','closed','all'].includes(preset))state.leadPreset=preset}catch{}
document.addEventListener('keydown',e=>{const m=document.getElementById('crmLeadModal');if(!m||m.hidden)return;if(e.key==='Escape'){e.preventDefault();closeLeadEditor()}if(e.key==='Tab'){const nodes=[...m.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary')].filter(n=>n.getAttribute('tabindex')!=='-1'&&!n.closest('[hidden]'));if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});

window.ARTYCRM={
  openTask,taskForm,newTaskForm,renderActivityForm,saveActivity:()=>guarded(saveActivity),retryCalendar:()=>guarded(retryCalendar),openClientFromLead,openSupport,
  activityFilter:q=>{state.activityFilter=q;renderCustomerDetail()},
  dayQueue:q=>{state.dayQueue=q;renderOverview()},dayOwner:q=>{state.dayOwner=q;renderOverview()},leadPreset:q=>{state.leadPreset=q;saveView('preset',q);renderLeads()},leadView:q=>{state.leadView=q;saveView('mode',q);renderLeads()},
  install,loadAll,renderOverview,renderCustomers,renderLeads,openCustomer,section,connectGoogleCalendar,disconnectGoogleCalendar,previewQuoteAction,
  searchCustomers:q=>{state.customerQuery=q;preserveSearch(renderCustomers)},filterCustomers:v=>{state.customerFilter=v;renderCustomers()},
  searchLeads:q=>{state.leadQuery=q;preserveSearch(renderLeads)},filterOwner:v=>{state.leadOwner=v;renderLeads()},filterStatus:v=>{state.leadStatus=v;renderLeads()},
  saveCustomerTags,addCustomerNote,saveAccount,toggleAccount,sendPasswordReset,resendWelcome,
  newLead,openLeadActions,openLeadEditor,renderLeadEditor,renderLeadActions,renderFollowUpAction,saveFollowUpAction:()=>guarded(saveFollowUpAction),cancelTask:()=>guarded(cancelTask),renderQuoteAction,sendQuoteAction,renderLostAction,saveLostAction,refundEventLead,quickLeadStatus,emailLead,callLead,openLeadCalendar,openSecureQuote,closeLeadEditor,saveLeadEditor,deleteManualLead,dragStart,dropStage,openLeadByKey,download
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();