/* ARTY CRM — customers + sales leads */
(()=>{
  'use strict';
  const state={customers:[],leads:[],summary:null,customer:null,q:'',leadStatus:'all'};
  const EN=()=>typeof I18n!=='undefined'&&I18n.language?.()==='en';
  const T=(fr,en)=>EN()?en:fr;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat(EN()?'en-CA':'fr-CA',{style:'currency',currency:'CAD'}).format(Number(v)||0);
  const date=v=>v?new Date(v).toLocaleDateString(EN()?'en-CA':'fr-CA'):'—';
  const statuses={
    new:[T('Nouveau','New'),'new'],contacted:[T('Contacté','Contacted'),'contacted'],qualified:[T('Qualifié','Qualified'),'qualified'],
    quote_sent:[T('Devis envoyé','Quote sent'),'quote'],follow_up:[T('Suivi','Follow-up'),'follow'],won:[T('Gagné','Won'),'won'],lost:[T('Perdu','Lost'),'lost']
  };
  function canUse(){return currentUser?.role==='admin'||(currentUser?.permissions||[]).includes('dashboard')}
  function ensure(){
    if(!canUse())return;
    const tabs=document.querySelector('.admin-tabs'); if(!tabs)return;
    if(!tabs.querySelector('[data-crm-customers]')){
      const dash=tabs.querySelector('.admin-tab');
      const a=document.createElement('button');a.type='button';a.className='admin-tab';a.dataset.crmCustomers='1';a.textContent=T('Clients','Customers');a.onclick=()=>window.switchAdminTab('crmCustomers',a);
      const b=document.createElement('button');b.type='button';b.className='admin-tab';b.dataset.crmLeads='1';b.textContent=T('Prospects','Leads');b.onclick=()=>window.switchAdminTab('crmLeads',b);
      dash?.insertAdjacentElement('afterend',b); b.insertAdjacentElement('beforebegin',a);
    }
    const page=document.getElementById('page-admin');
    if(page&&!document.getElementById('adminCrmCustomersPanel')){const p=document.createElement('div');p.id='adminCrmCustomersPanel';p.style.display='none';document.getElementById('adminDashboardPanel')?.insertAdjacentElement('afterend',p)}
    if(page&&!document.getElementById('adminCrmLeadsPanel')){const p=document.createElement('div');p.id='adminCrmLeadsPanel';p.style.display='none';document.getElementById('adminCrmCustomersPanel')?.insertAdjacentElement('afterend',p)}
    styles();
  }
  async function api(path,opts={}){const r=await artyFetch(path,{...opts,headers:{...(opts.headers||{}),...authH()}}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||T('Erreur CRM','CRM error'));return d}
  async function load(){
    ensure(); if(!canUse())return;
    try{const [s,c,l]=await Promise.all([api('/api/admin/crm/summary'),api('/api/admin/crm/customers'),api('/api/admin/crm/leads')]);state.summary=s;state.customers=c;state.leads=l}catch(e){console.error('ARTY CRM',e)}
  }
  function stat(label,value,sub=''){return `<div class="crm-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
  function renderCustomers(){
    const p=document.getElementById('adminCrmCustomersPanel');if(!p)return;
    const q=state.q.trim().toLowerCase(),rows=state.customers.filter(c=>!q||[c.name,c.email,c.phone,...(c.tags||[])].join(' ').toLowerCase().includes(q));
    p.innerHTML=`<div class="crm-head"><div><span>CRM</span><h2>${T('Clients','Customers')}</h2><p>${T('Une vue unique des comptes, commandes, événements et interactions.','One view of accounts, orders, events and customer activity.')}</p></div></div>
      <div class="crm-stats">${stat(T('Contacts','Contacts'),state.summary?.customers||0)}${stat(T('Comptes ARTY','ARTY accounts'),state.summary?.accountCustomers||0)}${stat(T('Prospects ouverts','Open leads'),(state.summary?.leads||0)-(state.summary?.byStatus?.won||0)-(state.summary?.byStatus?.lost||0))}${stat(T('Valeur pipeline','Pipeline value'),money(state.summary?.openPipelineValue||0))}</div>
      <div class="crm-toolbar"><input type="search" value="${esc(state.q)}" placeholder="${T('Rechercher nom, courriel, téléphone ou étiquette…','Search name, email, phone or tag…')}" oninput="ARTYCRM.searchCustomers(this.value)"></div>
      <div class="crm-layout"><div class="crm-list"><div class="crm-table-head"><span>${T('Client','Customer')}</span><span>${T('Activité','Activity')}</span><span>${T('Valeur','Value')}</span></div>
      ${rows.map(c=>`<button class="crm-customer-row" onclick="ARTYCRM.openCustomer('${encodeURIComponent(c.email)}')"><span><strong>${esc(c.name)}</strong><small>${esc(c.email)}${c.phone?' · '+esc(c.phone):''}</small><i>${c.hasAccount?T('Compte ARTY','ARTY account'):T('Contact seulement','Contact only')}</i></span><span><b>${c.orderCount} ${T('commande(s)','order(s)')}</b><small>${c.eventRequestCount} ${T('demande(s) événement','event request(s)')} · ${date(c.lastActivity)}</small></span><span><strong>${money(c.lifetimeSpend)}</strong><small>${(c.tags||[]).map(x=>esc(x)).join(' · ')||'—'}</small></span></button>`).join('')||`<div class="crm-empty">${T('Aucun client trouvé.','No customers found.')}</div>`}</div><div class="crm-detail" id="crmCustomerDetail">${T('Sélectionnez un client pour voir son historique.','Select a customer to view their history.')}</div></div>`;
  }
  async function openCustomer(encoded,from=''){
    const email=decodeURIComponent(encoded);
    if(from==='crmLeads'){
      const tab=document.querySelector('[data-crm-customers]');
      showTab('crmCustomers',tab);
    }
    try{state.customer=await api('/api/admin/crm/customers/'+encodeURIComponent(email));renderCustomerDetail()}catch(e){showToast(e.message,'error')}
  }
  function timelineLabel(x){return({account:T('Compte créé','Account created'),order:T('Commande','Order'),event_request:T('Demande événement','Event request'),booking:T('Réservation','Booking'),contact:T('Message','Message'),note:T('Note interne','Internal note')})[x.type]||x.type}
  function renderCustomerDetail(){
    const host=document.getElementById('crmCustomerDetail'),d=state.customer;if(!host||!d)return;
    const c=d.summary;
    host.innerHTML=`<div class="crm-detail-head"><div><span>${c.hasAccount?T('Client avec compte','Account customer'):T('Contact / prospect','Contact / lead')}</span><h3>${esc(c.name)}</h3><p>${esc(c.email)}${c.phone?' · '+esc(c.phone):''}</p></div><strong>${money(c.lifetimeSpend)}</strong></div>
      <div class="crm-mini-grid"><div><span>${T('Commandes payées','Paid orders')}</span><b>${c.paidOrderCount}</b></div><div><span>${T('Panier moyen','Average order')}</span><b>${money(c.averageOrder)}</b></div><div><span>${T('Événements','Events')}</span><b>${c.eventRequestCount}</b></div></div>
      <div class="crm-form-block"><label>${T('Étiquettes internes','Internal tags')}</label><input id="crmCustomerTags" value="${esc((c.tags||[]).join(', '))}" placeholder="VIP, Corporate, Repeat customer"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.saveCustomerTags()">${T('Sauvegarder','Save')}</button></div>
      <div class="crm-form-block"><label>${T('Ajouter une note','Add note')}</label><textarea id="crmCustomerNote" rows="2" placeholder="${T('Préférences, contexte, prochain échange…','Preferences, context, next conversation…')}"></textarea><button class="btn btn-orange btn-sm" onclick="ARTYCRM.addCustomerNote()">${T('Ajouter','Add')}</button></div>
      <h4>${T('Historique','Timeline')}</h4><div class="crm-timeline">${(d.timeline||[]).map(x=>`<div><i></i><span><strong>${esc(timelineLabel(x))}</strong><small>${date(x.at)}${x.status?' · '+esc(x.status):''}${x.amount?' · '+money(x.amount):''}</small><p>${esc(x.detail||'')}</p></span></div>`).join('')||`<p class="crm-empty">${T('Aucune activité.','No activity.')}</p>`}</div>`;
  }
  function renderLeads(){
    const p=document.getElementById('adminCrmLeadsPanel');if(!p)return;
    const filter=state.leadStatus,leads=state.leads.filter(l=>filter==='all'||l.status===filter);
    p.innerHTML=`<div class="crm-head"><div><span>CRM</span><h2>${T('Prospects et ventes','Leads & sales')}</h2><p>${T('Suivez chaque demande jusqu’au devis, au suivi et à la vente.','Track each inquiry through quote, follow-up and sale.')}</p></div></div>
      <div class="crm-stats">${stat(T('Nouveaux','New'),state.summary?.newLeads||0)}${stat(T('Suivis dus','Follow-ups due'),state.summary?.followUpsDue||0)}${stat(T('Pipeline ouvert','Open pipeline'),money(state.summary?.openPipelineValue||0))}${stat(T('Gagné','Won'),money(state.summary?.wonValue||0))}</div>
      <div class="crm-toolbar"><select onchange="ARTYCRM.filterLeads(this.value)"><option value="all">${T('Tous les statuts','All statuses')}</option>${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${filter===k?'selected':''}>${esc(v[0])}</option>`).join('')}</select></div>
      <div class="crm-lead-grid">${leads.map(l=>leadCard(l)).join('')||`<div class="crm-empty">${T('Aucun prospect dans ce filtre.','No leads in this filter.')}</div>`}</div>`;
  }
  function leadCard(l){
    const st=statuses[l.status]||statuses.new;
    return `<article class="crm-lead-card"><div class="crm-lead-top"><span class="crm-badge ${st[1]}">${esc(st[0])}</span><small>${esc(l.reference||l.key)}</small></div><h3>${esc(l.name||l.email)}</h3><p>${esc(l.title)} · ${esc(l.email)}${l.phone?' · '+esc(l.phone):''}</p>
      <div class="crm-lead-meta"><span>${T('Valeur','Value')}<strong>${money(l.value)}</strong></span><span>${T('Créé','Created')}<strong>${date(l.createdAt)}</strong></span><span>${T('Source','Source')}<strong>${esc(l.source||'—')}</strong></span></div>
      <div class="crm-lead-fields"><label>${T('Étape','Stage')}<select data-status>${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${l.status===k?'selected':''}>${esc(v[0])}</option>`).join('')}</select></label><label>${T('Prochain suivi','Next follow-up')}<input data-follow type="date" value="${esc((l.nextFollowUp||'').slice(0,10))}"></label><label>${T('Étiquettes','Tags')}<input data-tags value="${esc((l.tags||[]).join(', '))}" placeholder="Corporate, VIP"></label><label class="wide">${T('Note interne','Internal note')}<textarea data-note rows="2">${esc(l.adminNote||'')}</textarea></label></div>
      <div class="crm-lead-actions"><button class="btn btn-ghost btn-sm" onclick="ARTYCRM.openCustomer('${encodeURIComponent(l.email)}','crmLeads')">${T('Voir le client','View customer')}</button><button class="btn btn-orange btn-sm" onclick="ARTYCRM.saveLead(this,'${esc(l.kind)}','${esc(l.id)}')">${T('Sauvegarder','Save')}</button></div></article>`;
  }
  async function saveLead(btn,kind,id){
    const card=btn.closest('.crm-lead-card');if(!card)return;
    try{await api(`/api/admin/crm/leads/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:card.querySelector('[data-status]').value,nextFollowUp:card.querySelector('[data-follow]').value,tags:card.querySelector('[data-tags]').value.split(',').map(x=>x.trim()).filter(Boolean),adminNote:card.querySelector('[data-note]').value})});showToast(T('Prospect mis à jour','Lead updated'),'success');await load();renderLeads()}catch(e){showToast(e.message,'error')}
  }
  async function saveCustomerTags(){if(!state.customer)return;const tags=document.getElementById('crmCustomerTags').value.split(',').map(x=>x.trim()).filter(Boolean);try{await api('/api/admin/crm/customers/'+encodeURIComponent(state.customer.summary.email)+'/tags',{method:'PUT',body:JSON.stringify({tags})});showToast(T('Étiquettes sauvegardées','Tags saved'),'success');await load();await openCustomer(encodeURIComponent(state.customer.summary.email));renderCustomers();renderCustomerDetail()}catch(e){showToast(e.message,'error')}}
  async function addCustomerNote(){if(!state.customer)return;const el=document.getElementById('crmCustomerNote'),note=el.value.trim();if(!note)return;try{await api('/api/admin/crm/customers/'+encodeURIComponent(state.customer.summary.email)+'/notes',{method:'POST',body:JSON.stringify({note})});showToast(T('Note ajoutée','Note added'),'success');await openCustomer(encodeURIComponent(state.customer.summary.email))}catch(e){showToast(e.message,'error')}}
  function showTab(tab,button){
    ensure();document.querySelectorAll('.admin-tab').forEach(x=>x.classList.remove('active'));button?.classList.add('active');
    document.querySelectorAll('#page-admin [id^="admin"][id$="Panel"]').forEach(x=>x.style.display='none');
    const panel=document.getElementById(tab==='crmCustomers'?'adminCrmCustomersPanel':'adminCrmLeadsPanel');if(panel)panel.style.display='block';
    load().then(()=>tab==='crmCustomers'?renderCustomers():renderLeads());
  }
  function install(){
    ensure();
    const base=window.switchAdminTab;
    if(typeof base==='function'&&!base.__crmWrapped){const wrapped=function(tab,button,...rest){if(tab==='crmCustomers'||tab==='crmLeads'){showTab(tab,button);return}return base.call(this,tab,button,...rest)};wrapped.__crmWrapped=true;window.switchAdminTab=wrapped}
    const loadBase=window.loadAdminData;if(typeof loadBase==='function'&&!loadBase.__crmWrapped){const wrapped=async function(...args){const result=await loadBase.apply(this,args);ensure();await load();return result};wrapped.__crmWrapped=true;window.loadAdminData=wrapped}
  }
  function styles(){if(document.getElementById('artyCrmStyles'))return;const s=document.createElement('style');s.id='artyCrmStyles';s.textContent=`
    .crm-head{display:flex;justify-content:space-between;align-items:end;margin:8px 0 18px}.crm-head>div>span{font-size:.75rem;font-weight:900;letter-spacing:.1em;color:var(--teal)}.crm-head h2{margin:2px 0;font-size:1.65rem}.crm-head p{margin:0;color:var(--muted)}
    .crm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.crm-stat{padding:16px;border:1px solid rgba(44,36,24,.08);border-radius:16px;background:#fff}.crm-stat span,.crm-stat small{display:block;color:var(--muted);font-size:.78rem}.crm-stat strong{display:block;font-size:1.45rem;margin:3px 0}
    .crm-toolbar{display:flex;gap:10px;margin:12px 0}.crm-toolbar input,.crm-toolbar select,.crm-form-block input,.crm-form-block textarea,.crm-lead-fields input,.crm-lead-fields select,.crm-lead-fields textarea{width:100%;border:1px solid rgba(44,36,24,.12);border-radius:11px;padding:10px 12px;background:#fff}.crm-toolbar input{max-width:520px}
    .crm-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(330px,.75fr);gap:16px}.crm-list,.crm-detail,.crm-lead-card{background:#fff;border:1px solid rgba(44,36,24,.08);border-radius:18px;overflow:hidden}.crm-table-head,.crm-customer-row{display:grid;grid-template-columns:1.4fr .9fr .6fr;gap:14px;align-items:center;padding:12px 16px}.crm-table-head{font-size:.72rem;font-weight:900;text-transform:uppercase;color:var(--muted);background:#fbfaf7}.crm-customer-row{border:0;border-top:1px solid rgba(44,36,24,.07);width:100%;text-align:left;background:#fff;cursor:pointer;color:inherit}.crm-customer-row:hover{background:#fffaf4}.crm-customer-row span{display:grid;gap:2px}.crm-customer-row small{color:var(--muted)}.crm-customer-row i{font-style:normal;font-size:.7rem;color:var(--teal)}.crm-detail{padding:18px;min-height:360px}.crm-detail-head{display:flex;justify-content:space-between;gap:12px}.crm-detail-head span{font-size:.72rem;font-weight:900;color:var(--teal);text-transform:uppercase}.crm-detail-head h3{margin:3px 0}.crm-detail-head p{margin:0;color:var(--muted);font-size:.84rem}.crm-detail-head>strong{font-size:1.3rem}.crm-mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.crm-mini-grid div{padding:10px;background:#fbfaf7;border-radius:10px}.crm-mini-grid span{display:block;font-size:.7rem;color:var(--muted)}.crm-form-block{display:grid;grid-template-columns:1fr auto;gap:8px;margin:12px 0}.crm-form-block label{grid-column:1/-1;font-size:.78rem;font-weight:800}.crm-timeline>div{display:grid;grid-template-columns:12px 1fr;gap:9px;padding:9px 0}.crm-timeline i{width:9px;height:9px;border-radius:50%;background:var(--teal);margin-top:5px}.crm-timeline span{display:block}.crm-timeline small{display:block;color:var(--muted);font-size:.73rem}.crm-timeline p{margin:3px 0 0;font-size:.82rem}
    .crm-lead-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.crm-lead-card{padding:16px}.crm-lead-top,.crm-lead-actions{display:flex;justify-content:space-between;gap:10px;align-items:center}.crm-lead-card h3{margin:10px 0 3px}.crm-lead-card>p{margin:0 0 12px;color:var(--muted);font-size:.82rem}.crm-badge{padding:5px 9px;border-radius:999px;font-size:.7rem;font-weight:900;background:#f0eee8}.crm-badge.won{background:#e5f5ec;color:#23764a}.crm-badge.lost{background:#f8e9e5;color:#95402f}.crm-badge.quote,.crm-badge.follow{background:#fff0df;color:#9b5a1d}.crm-badge.new{background:#e5f4f7;color:#16717d}.crm-lead-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.crm-lead-meta span{font-size:.68rem;color:var(--muted)}.crm-lead-meta strong{display:block;color:var(--text);font-size:.82rem}.crm-lead-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.crm-lead-fields label{font-size:.72rem;font-weight:800}.crm-lead-fields label.wide{grid-column:1/-1}.crm-lead-actions{margin-top:12px}.crm-empty{padding:24px;color:var(--muted);text-align:center}
    @media(max-width:980px){.crm-stats{grid-template-columns:1fr 1fr}.crm-layout{grid-template-columns:1fr}.crm-lead-grid{grid-template-columns:1fr}}@media(max-width:650px){.crm-stats{grid-template-columns:1fr}.crm-table-head{display:none}.crm-customer-row{grid-template-columns:1fr}.crm-lead-fields{grid-template-columns:1fr}.crm-lead-fields label.wide{grid-column:auto}}
  `;document.head.appendChild(s)}
  window.ARTYCRM={install,load,renderCustomers,renderLeads,openCustomer,searchCustomers:q=>{state.q=q;renderCustomers()},filterLeads:v=>{state.leadStatus=v;renderLeads()},saveLead,saveCustomerTags,addCustomerNote};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();