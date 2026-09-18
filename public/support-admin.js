(()=>{
'use strict';

const state={tickets:[],team:[],selectedId:'',query:'',status:'open',priority:'all',assignee:'all',topic:'all',loading:false};
const en=()=>{try{return I18n.language?.()==='en'}catch{return false}};
const T=(fr,enText)=>en()?enText:fr;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=esc;
const money=v=>new Intl.NumberFormat(en()?'en-CA':'fr-CA',{style:'currency',currency:'CAD'}).format(Number(v)||0);
const dt=v=>v?new Date(v).toLocaleString(en()?'en-CA':'fr-CA',{dateStyle:'medium',timeStyle:'short'}):'—';
const dateOnly=v=>v?new Date(v).toLocaleDateString(en()?'en-CA':'fr-CA'):'—';
const age=v=>{if(!v)return'';const m=Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/60000));if(m<60)return T(m+' min',m+' min');const h=Math.floor(m/60);if(h<24)return T(h+' h',h+' h');const d=Math.floor(h/24);return T(d+' j',d+' d')};
const has=p=>currentUser?.role==='admin'||(currentUser?.permissions||[]).includes(p);

async function api(path,opts={}){
  const headers={...(opts.headers||{}),...authH()};if(opts.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
  const r=await artyFetch(path,{...opts,headers}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||T('Erreur support','Support error'));return d;
}
function statusLabel(s){return({nouvelle:T('Nouvelle','New'),'en cours':T('En cours','In progress'),'répondue':T('Répondue','Answered'),'fermée':T('Fermée','Closed')})[s]||s}
function priorityLabel(p){return({low:T('Faible','Low'),normal:T('Normale','Normal'),high:T('Élevée','High'),urgent:T('Urgente','Urgent')})[p]||p}
function topicLabel(t){return({commande:T('Commande','Order'),livraison:T('Livraison','Shipping'),produit:T('Produit','Product'),paiement:T('Paiement','Payment'),'événement':T('Événement','Event'),autre:T('Autre','Other')})[t]||t}
function selected(){return state.tickets.find(t=>String(t.id)===String(state.selectedId))||state.tickets[0]||null}
function openTicket(t){return t.status!=='fermée'}
function waitingOnTeam(t){const messages=t.messages||[];return openTicket(t)&&(!messages.length||messages[messages.length-1]?.role==='customer')}
function unreadish(t){return t.status==='nouvelle'||waitingOnTeam(t)}
function filtered(){
  const q=state.query.trim().toLowerCase();
  return state.tickets.filter(t=>{
    if(state.status==='open'&&!openTicket(t))return false;
    if(state.status==='waiting'&&!waitingOnTeam(t))return false;
    if(state.status!=='all'&&!['open','waiting'].includes(state.status)&&t.status!==state.status)return false;
    if(state.priority!=='all'&&String(t.priority)!==state.priority)return false;
    if(state.assignee!=='all'&&String(t.assignedTo||'')!==state.assignee)return false;
    if(state.topic!=='all'&&String(t.topic)!==state.topic)return false;
    if(q&&![t.id,t.subject,t.customer?.name,t.customer?.email,t.orderId,t.topic,...(t.customerContext?.tags||[])].join(' ').toLowerCase().includes(q))return false;
    return true;
  });
}
async function load(){
  if(!has('support'))return;
  state.loading=true;render();
  try{
    const [tickets,team]=await Promise.all([api('/api/admin/support-requests'),api('/api/admin/support/team')]);
    state.tickets=tickets;state.team=team;
    if(!state.selectedId||!state.tickets.some(t=>String(t.id)===String(state.selectedId)))state.selectedId=filtered()[0]?.id||state.tickets[0]?.id||'';
  }catch(e){console.error(e);showToast(e.message,'error')}
  finally{state.loading=false;render()}
}
function stat(label,value,sub=''){return `<div class="support-pro-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
function ticketCard(t){
  const wait=waitingOnTeam(t);
  return `<button type="button" class="support-pro-ticket ${String(state.selectedId)===String(t.id)?'active':''} ${wait?'waiting':''}" onclick="ARTYSupport.open('${attr(t.id)}')">
    <div class="support-pro-ticket-top"><span class="support-priority ${attr(t.priority||'normal')}">${esc(priorityLabel(t.priority||'normal'))}</span><small>${esc(age(t.updatedAt||t.createdAt))}</small></div>
    <strong>${esc(t.subject||t.id)}</strong>
    <p>${esc(t.customer?.name||t.customer?.email||'')}</p>
    <div class="support-pro-ticket-meta"><span>${esc(topicLabel(t.topic))}</span>${t.orderId?`<span>${esc(t.orderId)}</span>`:''}${t.assignedTo?`<span>${esc(state.team.find(x=>x.email===t.assignedTo)?.name||t.assignedTo)}</span>`:''}</div>
    <div class="support-pro-ticket-foot"><span class="support-status ${attr(String(t.status||'').replace(/\s/g,'-'))}">${esc(statusLabel(t.status))}</span>${wait?`<b>${T('Réponse requise','Reply needed')}</b>`:''}</div>
  </button>`;
}
function teamOptions(selected=''){return `<option value="">${T('Non assigné','Unassigned')}</option>${state.team.map(x=>`<option value="${attr(x.email)}" ${selected===x.email?'selected':''}>${esc(x.name)}${x.role==='admin'?' · Admin':''}</option>`).join('')}`}
function messageThread(t){
  const messages=t.messages||[];
  return messages.map(m=>`<div class="support-thread-message ${m.role==='staff'?'staff':'customer'}"><div><strong>${m.role==='staff'?T('Équipe ARTY','ARTY team'):esc(t.customer?.name||T('Client','Customer'))}</strong><small>${esc(dt(m.at))}${m.by?` · ${esc(m.by)}`:''}</small></div><p>${esc(m.body)}</p></div>`).join('')||`<div class="support-empty">${T('Aucun message.','No messages.')}</div>`;
}
function orderContext(t){
  const o=t.orderContext;if(!o)return t.orderId?`<div class="support-context-empty">${T('Commande liée','Linked order')}: <strong>${esc(t.orderId)}</strong></div>`:'';
  return `<div class="support-context-card"><div class="support-context-head"><span>${T('Commande','Order')}</span><strong>${esc(o.id)}</strong></div><div class="support-context-grid"><div><small>${T('Statut','Status')}</small><strong>${esc(o.status||'—')}</strong></div><div><small>${T('Paiement','Payment')}</small><strong>${esc(o.paymentStatus||'—')}</strong></div><div><small>${T('Total','Total')}</small><strong>${money(o.total)}</strong></div><div><small>${T('Date','Date')}</small><strong>${dateOnly(o.createdAt)}</strong></div></div>${o.tracking?.number?`<small class="support-tracking">${T('Suivi','Tracking')}: ${esc(o.tracking.number)}</small>`:''}</div>`;
}
function customerContext(t){
  const c=t.customerContext||{};
  return `<div class="support-context-card"><div class="support-context-head"><span>${T('Client','Customer')}</span><strong>${esc(t.customer?.name||t.customer?.email||'')}</strong></div><p class="support-customer-email">${esc(t.customer?.email||'')}</p><div class="support-context-grid"><div><small>${T('Commandes','Orders')}</small><strong>${Number(c.orderCount||0)}</strong></div><div><small>${T('Dépenses','Spend')}</small><strong>${money(c.lifetimeSpend||0)}</strong></div><div><small>${T('Prospects','Leads')}</small><strong>${Number(c.leadCount||0)}</strong></div><div><small>${T('Dernière activité','Last activity')}</small><strong>${dateOnly(c.lastActivity)}</strong></div></div>${(c.tags||[]).length?`<div class="support-tags">${c.tags.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}<button class="btn btn-ghost btn-sm" onclick="ARTYSupport.emailCustomer()">${T('Écrire au client','Email customer')}</button></div>`;
}
function detail(t){
  if(!t)return `<div class="support-pro-detail support-empty">${T('Sélectionnez une demande.','Select a ticket.')}</div>`;
  const notes=t.internalNotes||[];
  return `<section class="support-pro-detail">
    <div class="support-detail-head"><div><span>${esc(t.id)} · ${esc(topicLabel(t.topic))}</span><h2>${esc(t.subject)}</h2><p>${esc(t.customer?.name||'')} · ${esc(t.customer?.email||'')} · ${esc(dt(t.createdAt))}</p></div><div class="support-head-badges"><span class="support-priority ${attr(t.priority||'normal')}">${esc(priorityLabel(t.priority||'normal'))}</span><span class="support-status ${attr(String(t.status||'').replace(/\s/g,'-'))}">${esc(statusLabel(t.status))}</span></div></div>
    <div class="support-control-grid">
      <label>${T('Statut','Status')}<select id="supportProStatus"><option value="nouvelle" ${t.status==='nouvelle'?'selected':''}>${T('Nouvelle','New')}</option><option value="en cours" ${t.status==='en cours'?'selected':''}>${T('En cours','In progress')}</option><option value="répondue" ${t.status==='répondue'?'selected':''}>${T('Répondue','Answered')}</option><option value="fermée" ${t.status==='fermée'?'selected':''}>${T('Fermée','Closed')}</option></select></label>
      <label>${T('Priorité','Priority')}<select id="supportProPriority">${['low','normal','high','urgent'].map(p=>`<option value="${p}" ${t.priority===p?'selected':''}>${esc(priorityLabel(p))}</option>`).join('')}</select></label>
      <label>${T('Responsable','Assignee')}<select id="supportProAssignee">${teamOptions(t.assignedTo||'')}</select></label>
      <button class="btn btn-ghost btn-sm support-save-meta" onclick="ARTYSupport.saveMeta()">${T('Enregistrer','Save')}</button>
    </div>
    <div class="support-detail-layout">
      <div class="support-conversation">
        <div class="support-section-title"><div><span>${T('Conversation','Conversation')}</span><h3>${T('Échanges avec le client','Customer conversation')}</h3></div><small>${(t.messages||[]).length} ${T('message(s)','message(s)')}</small></div>
        <div class="support-thread">${messageThread(t)}</div>
        ${t.status!=='fermée'?`<div class="support-reply-box"><textarea id="supportProReply" rows="4" placeholder="${T('Écrivez une réponse claire au client…','Write a clear reply to the customer…')}"></textarea><div><small>${T('La réponse sera envoyée par courriel et visible dans le compte ARTY du client.','The reply will be emailed and visible in the customer’s ARTY account.')}</small><button class="btn btn-teal" onclick="ARTYSupport.reply()">${T('Envoyer la réponse','Send reply')}</button></div></div>`:`<div class="support-closed-note">${T('Cette demande est fermée. Changez son statut pour la rouvrir.','This ticket is closed. Change its status to reopen it.')}</div>`}
      </div>
      <aside class="support-context">
        ${customerContext(t)}
        ${orderContext(t)}
        <div class="support-context-card"><div class="support-context-head"><span>${T('Notes internes','Internal notes')}</span><strong>${notes.length}</strong></div><div class="support-note-list">${notes.slice().reverse().map(n=>`<div><p>${esc(n.body)}</p><small>${esc(dt(n.at))} · ${esc(n.by||'')}</small></div>`).join('')||`<small>${T('Aucune note interne.','No internal notes.')}</small>`}</div><textarea id="supportProNote" rows="3" placeholder="${T('Note visible uniquement par l’équipe…','Team-only note…')}"></textarea><button class="btn btn-ghost btn-sm" onclick="ARTYSupport.addNote()">${T('Ajouter la note','Add note')}</button></div>
      </aside>
    </div>
  </section>`;
}
function render(){
  const panel=document.getElementById('adminSupportPanel');if(!panel||!has('support'))return;
  if(state.loading&&!state.tickets.length){panel.innerHTML=`<div class="support-loading">${T('Chargement du service client…','Loading customer support…')}</div>`;return}
  const rows=filtered(),current=selected(),open=state.tickets.filter(openTicket).length,waiting=state.tickets.filter(waitingOnTeam).length,urgent=state.tickets.filter(t=>openTicket(t)&&t.priority==='urgent').length,answered=state.tickets.filter(t=>t.status==='répondue').length;
  panel.innerHTML=`<div class="support-pro-shell">
    <div class="support-pro-head"><div><span>ARTY SUPPORT</span><h2>${T('Service à la clientèle','Customer support')}</h2><p>${T('Traitez rapidement les demandes, gardez le contexte client et répartissez le travail entre les membres de l’équipe.','Resolve requests quickly, keep customer context, and distribute work across the team.')}</p></div><button class="btn btn-ghost btn-sm" onclick="ARTYSupport.refresh()">${T('Actualiser','Refresh')}</button></div>
    <div class="support-pro-stats">${stat(T('Ouvertes','Open'),open)}${stat(T('Réponse requise','Need reply'),waiting)}${stat(T('Urgentes','Urgent'),urgent)}${stat(T('Répondues','Answered'),answered)}</div>
    <div class="support-pro-toolbar"><input type="search" value="${attr(state.query)}" placeholder="${T('Rechercher client, sujet, commande…','Search customer, subject, order…')}" oninput="ARTYSupport.search(this.value)"><select onchange="ARTYSupport.filter('status',this.value)"><option value="open" ${state.status==='open'?'selected':''}>${T('Demandes ouvertes','Open tickets')}</option><option value="waiting" ${state.status==='waiting'?'selected':''}>${T('Réponse requise','Need reply')}</option><option value="all" ${state.status==='all'?'selected':''}>${T('Toutes','All')}</option><option value="nouvelle" ${state.status==='nouvelle'?'selected':''}>${T('Nouvelles','New')}</option><option value="en cours" ${state.status==='en cours'?'selected':''}>${T('En cours','In progress')}</option><option value="répondue" ${state.status==='répondue'?'selected':''}>${T('Répondues','Answered')}</option><option value="fermée" ${state.status==='fermée'?'selected':''}>${T('Fermées','Closed')}</option></select><select onchange="ARTYSupport.filter('priority',this.value)"><option value="all">${T('Toutes priorités','All priorities')}</option>${['urgent','high','normal','low'].map(p=>`<option value="${p}" ${state.priority===p?'selected':''}>${esc(priorityLabel(p))}</option>`).join('')}</select><select onchange="ARTYSupport.filter('assignee',this.value)"><option value="all">${T('Toute l’équipe','All team')}</option><option value="">${T('Non assignées','Unassigned')}</option>${state.team.map(x=>`<option value="${attr(x.email)}" ${state.assignee===x.email?'selected':''}>${esc(x.name)}</option>`).join('')}</select><select onchange="ARTYSupport.filter('topic',this.value)"><option value="all">${T('Tous sujets','All topics')}</option>${['commande','livraison','produit','paiement','événement','autre'].map(x=>`<option value="${attr(x)}" ${state.topic===x?'selected':''}>${esc(topicLabel(x))}</option>`).join('')}</select></div>
    <div class="support-pro-workspace"><div class="support-pro-queue"><div class="support-queue-head"><strong>${rows.length} ${T('demande(s)','ticket(s)')}</strong><small>${T('Triées par activité récente','Sorted by recent activity')}</small></div><div class="support-ticket-list">${rows.map(ticketCard).join('')||`<div class="support-empty">${T('Aucune demande pour ces filtres.','No tickets match these filters.')}</div>`}</div></div>${detail(current)}</div>
  </div>`;
}
async function saveMeta(){
  const t=selected();if(!t)return;
  const body={status:document.getElementById('supportProStatus')?.value||t.status,priority:document.getElementById('supportProPriority')?.value||t.priority,assignedTo:document.getElementById('supportProAssignee')?.value||''};
  try{const d=await api('/api/admin/support-requests/'+encodeURIComponent(t.id),{method:'PATCH',body:JSON.stringify(body)});replace(d.request);showToast(T('Demande mise à jour','Ticket updated'),'success');render()}catch(e){showToast(e.message,'error')}
}
async function reply(){
  const t=selected(),el=document.getElementById('supportProReply'),message=el?.value.trim()||'';if(!t||message.length<2)return showToast(T('Écrivez une réponse','Write a reply'),'error');
  try{const d=await api('/api/admin/support-requests/'+encodeURIComponent(t.id)+'/reply',{method:'POST',body:JSON.stringify({message,status:'répondue'})});replace(d.request);showToast(d.emailStatus==='sent'?T('Réponse envoyée au client','Reply sent to customer'):T('Réponse enregistrée; vérifiez la livraison courriel','Reply saved; check email delivery'),d.emailStatus==='sent'?'success':'warning');render()}catch(e){showToast(e.message,'error')}
}
async function addNote(){
  const t=selected(),el=document.getElementById('supportProNote'),note=el?.value.trim()||'';if(!t||note.length<2)return showToast(T('Écrivez une note','Write a note'),'error');
  try{const d=await api('/api/admin/support-requests/'+encodeURIComponent(t.id)+'/note',{method:'POST',body:JSON.stringify({note})});replace(d.request);showToast(T('Note interne ajoutée','Internal note added'),'success');render()}catch(e){showToast(e.message,'error')}
}
function replace(ticket){const i=state.tickets.findIndex(x=>String(x.id)===String(ticket.id));if(i>=0)state.tickets[i]=ticket;else state.tickets.unshift(ticket)}
function emailCustomer(){const t=selected();if(!t?.customer?.email)return;window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(t.customer.email)+'&su='+encodeURIComponent('ARTY — '+t.subject),'_blank','noopener')}
function styles(){
  if(document.getElementById('artySupportProStyles'))return;const s=document.createElement('style');s.id='artySupportProStyles';s.textContent=`
  .support-pro-shell{display:grid;gap:15px}.support-pro-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.support-pro-head>div>span{font-size:.67rem;font-weight:900;letter-spacing:.12em;color:var(--teal)}.support-pro-head h2{margin:3px 0;font-size:1.7rem}.support-pro-head p{margin:0;color:var(--text-light);max-width:760px}.support-pro-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.support-pro-stat{padding:14px 15px;border:1px solid var(--border-light);border-radius:15px;background:#fff}.support-pro-stat span,.support-pro-stat small{display:block;color:var(--text-light);font-size:.68rem}.support-pro-stat strong{display:block;font-size:1.3rem;margin-top:3px}.support-pro-toolbar{display:flex;gap:8px;flex-wrap:wrap}.support-pro-toolbar input,.support-pro-toolbar select{height:40px;border:1px solid var(--border);border-radius:10px;background:#fff;padding:0 10px}.support-pro-toolbar input{flex:1;min-width:240px}.support-pro-workspace{display:grid;grid-template-columns:minmax(300px,.75fr) minmax(0,1.5fr);gap:12px;align-items:start}.support-pro-queue,.support-pro-detail{border:1px solid var(--border-light);border-radius:17px;background:#fff;overflow:hidden}.support-queue-head{display:flex;justify-content:space-between;gap:10px;padding:13px 14px;border-bottom:1px solid var(--border-light)}.support-queue-head small{color:var(--text-light)}.support-ticket-list{max-height:760px;overflow:auto}.support-pro-ticket{display:grid;gap:5px;width:100%;padding:13px 14px;border:0;border-bottom:1px solid var(--border-light);background:#fff;text-align:left;color:inherit;cursor:pointer}.support-pro-ticket:hover{background:var(--bg2)}.support-pro-ticket.active{background:var(--teal-pale)}.support-pro-ticket.waiting{box-shadow:inset 3px 0 0 var(--orange)}.support-pro-ticket-top,.support-pro-ticket-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}.support-pro-ticket>strong{font-size:.8rem}.support-pro-ticket>p{margin:0;color:var(--text-light);font-size:.68rem}.support-pro-ticket-meta{display:flex;gap:5px;flex-wrap:wrap}.support-pro-ticket-meta span,.support-tags span{padding:3px 6px;border-radius:999px;background:var(--bg2);font-size:.57rem;color:var(--text-light)}.support-pro-ticket-foot b{font-size:.57rem;color:var(--orange)}.support-priority,.support-status{display:inline-flex;width:max-content;padding:4px 7px;border-radius:999px;font-size:.57rem;font-weight:900}.support-priority.low{background:#f3f4f5;color:#667}.support-priority.normal{background:#eef7fa;color:#24788a}.support-priority.high{background:#fff0e3;color:#b65c19}.support-priority.urgent{background:#fff0ef;color:#b3322d}.support-status.nouvelle{background:#fff0e3;color:#b65c19}.support-status.en-cours{background:#eef7fa;color:#24788a}.support-status.répondue{background:#edf8f2;color:#247a4d}.support-status.fermée{background:#f1f1f1;color:#666}.support-pro-detail{padding:17px}.support-detail-head{display:flex;justify-content:space-between;gap:15px;border-bottom:1px solid var(--border-light);padding-bottom:14px}.support-detail-head>div:first-child>span{font-size:.63rem;font-weight:900;color:var(--teal)}.support-detail-head h2{margin:3px 0;font-size:1.25rem}.support-detail-head p{margin:0;color:var(--text-light);font-size:.7rem}.support-head-badges{display:flex;gap:6px;align-items:flex-start}.support-control-grid{display:grid;grid-template-columns:1fr 1fr 1.3fr auto;gap:8px;align-items:end;padding:13px 0}.support-control-grid label{display:grid;gap:5px;font-size:.64rem;font-weight:800}.support-control-grid select{height:39px;border:1px solid var(--border);border-radius:9px;background:#fff;padding:0 8px}.support-save-meta{height:39px}.support-detail-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:12px}.support-conversation,.support-context-card{border:1px solid var(--border-light);border-radius:14px;background:#fff}.support-conversation{padding:14px}.support-section-title,.support-context-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.support-section-title span,.support-context-head span{font-size:.58rem;color:var(--teal);font-weight:900;text-transform:uppercase;letter-spacing:.09em}.support-section-title h3{margin:2px 0;font-size:.94rem}.support-section-title small{color:var(--text-light)}.support-thread{display:grid;gap:9px;margin:13px 0;max-height:430px;overflow:auto}.support-thread-message{max-width:88%;padding:10px 11px;border-radius:12px;background:var(--bg2)}.support-thread-message.staff{margin-left:auto;background:var(--teal-pale)}.support-thread-message>div{display:flex;justify-content:space-between;gap:10px}.support-thread-message strong{font-size:.68rem}.support-thread-message small{font-size:.57rem;color:var(--text-light)}.support-thread-message p{margin:5px 0 0;white-space:pre-wrap;font-size:.72rem;line-height:1.5}.support-reply-box{display:grid;gap:8px;padding-top:12px;border-top:1px solid var(--border-light)}.support-reply-box textarea,.support-context-card textarea{width:100%;border:1px solid var(--border);border-radius:10px;padding:10px;font:inherit}.support-reply-box>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.support-reply-box small{color:var(--text-light);font-size:.61rem;max-width:70%}.support-context{display:grid;gap:10px}.support-context-card{padding:12px}.support-customer-email{font-size:.68rem;color:var(--text-light);margin:5px 0 10px}.support-context-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:9px 0}.support-context-grid>div{display:grid;gap:2px;padding:8px;border-radius:9px;background:var(--bg2)}.support-context-grid small{font-size:.57rem;color:var(--text-light)}.support-context-grid strong{font-size:.7rem;overflow-wrap:anywhere}.support-tags{display:flex;gap:4px;flex-wrap:wrap;margin:8px 0}.support-note-list{display:grid;gap:7px;margin:8px 0;max-height:180px;overflow:auto}.support-note-list>div{padding:8px;border-radius:9px;background:#fff8ed}.support-note-list p{margin:0;font-size:.68rem;white-space:pre-wrap}.support-note-list small,.support-tracking{font-size:.56rem;color:var(--text-light)}.support-context-card textarea{margin:7px 0}.support-empty,.support-loading,.support-closed-note,.support-context-empty{padding:24px;text-align:center;color:var(--text-light);font-size:.75rem}.support-closed-note{background:var(--bg2);border-radius:10px}
  .account-ticket-thread{display:grid;gap:10px}.account-support-thread{display:grid;gap:8px;margin-top:8px}.account-support-thread-message{max-width:90%;padding:10px 11px;border-radius:12px;background:var(--bg2)}.account-support-thread-message.staff{margin-left:auto;background:var(--teal-pale)}.account-support-thread-message>div{display:flex;justify-content:space-between;gap:10px}.account-support-thread-message strong{font-size:.68rem}.account-support-thread-message small{font-size:.58rem;color:var(--text-light)}.account-support-thread-message p{margin:5px 0 0;white-space:pre-wrap;font-size:.72rem;line-height:1.5}.account-support-customer-reply{display:grid;gap:8px;padding-top:10px;border-top:1px solid var(--border-light)}.account-support-customer-reply textarea{width:100%;border:1px solid var(--border);border-radius:10px;padding:10px;font:inherit}.account-support-customer-reply button{justify-self:end}.account-support-closed-note{padding:9px 10px;border-radius:9px;background:var(--bg2);font-size:.67rem;color:var(--text-light)}
  @media(max-width:1100px){.support-pro-workspace{grid-template-columns:1fr}.support-ticket-list{max-height:360px}.support-detail-layout{grid-template-columns:1fr}.support-control-grid{grid-template-columns:1fr 1fr}.support-save-meta{grid-column:1/-1}.support-pro-stats{grid-template-columns:1fr 1fr}}
  @media(max-width:680px){.support-pro-head{align-items:stretch;flex-direction:column}.support-pro-toolbar>*{width:100%;min-width:0!important}.support-detail-head{flex-direction:column}.support-control-grid,.support-context-grid{grid-template-columns:1fr}.support-thread-message{max-width:96%}.support-reply-box>div{align-items:stretch;flex-direction:column}.support-reply-box small{max-width:none}.support-pro-stats{grid-template-columns:1fr 1fr}}
  `;document.head.appendChild(s)
}
function install(){
  styles();
  const base=window.switchAdminTab;
  if(typeof base==='function'&&!base.__supportProWrapped){
    const wrapped=function(tab,button,...rest){const result=base.call(this,tab,button,...rest);if(tab==='support'){setTimeout(()=>load(),0)}return result};
    wrapped.__supportProWrapped=true;window.switchAdminTab=wrapped;
  }
  if(location.hash==='#/admin'&&document.querySelector('#adminSupportPanel')?.style.display!=='none')load();
}
window.ARTYSupport={load,refresh:load,render,open:id=>{state.selectedId=id;render()},search:q=>{state.query=q;render()},filter:(key,value)=>{state[key]=value;if(!filtered().some(x=>String(x.id)===String(state.selectedId)))state.selectedId=filtered()[0]?.id||'';render()},saveMeta,reply,addNote,emailCustomer};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();