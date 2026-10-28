/* Creation ARTY: consent-aware site analytics + Interac manual ticket controls */
(()=>{
if(window.__artyInsightsLoaded)return;window.__artyInsightsLoaded=true;
const en=()=>typeof I18n!=='undefined'&&I18n.language?.()==='en';
const t=(fr,english)=>en()?english:fr;
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>new Intl.NumberFormat(en()?'en-CA':'fr-CA').format(Number(v)||0);
const money=v=>new Intl.NumberFormat(en()?'en-CA':'fr-CA',{style:'currency',currency:'CAD'}).format(Number(v)||0);
const consent=()=>{try{return JSON.parse(localStorage.getItem('arty_marketing_consent_v1')||'null')?.analytics===true}catch{return false}};
const unique=()=>crypto?.randomUUID?.()||(Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2));
function id(store,key){try{let value=store.getItem(key);if(!value){value=unique();store.setItem(key,value)}return value}catch{return unique()}}
let last='',lastAt=0;
function measure(event){
 if(!consent()||!['page_view','view_item','view_event','add_to_cart','begin_checkout','lead'].includes(event))return;
 const page=location.pathname+location.hash.split('?')[0].replace(/(#\/ticket\/)[^/]+/i,'$1private').replace(/(#\/event-quote\/)[^/]+/i,'$1private'),now=Date.now();
 if(event==='page_view'&&last===page&&now-lastAt<1800)return;
 if(event==='page_view'){last=page;lastAt=now}
 let source=new URLSearchParams(location.search).get('utm_source')||'';
 if(!source){try{const ref=new URL(document.referrer);if(ref.hostname!==location.hostname)source=ref.hostname}catch{}}
 const payload={event,consent:true,page,source:source||'direct',visitor:id(localStorage,'arty_insights_visitor'),session:id(sessionStorage,'arty_insights_session'),device:/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Mobile|Android|iPhone/i.test(navigator.userAgent)?'mobile':'desktop'};
 fetch('/api/marketing-insights/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true,credentials:'same-origin'}).catch(()=>{});
}
window.addEventListener('arty:marketing-event',e=>measure(e.detail?.event));
window.addEventListener('pageshow',()=>setTimeout(()=>measure('page_view'),300));
document.addEventListener('click',e=>{if(e.target.closest('#artyConsentBanner button,#artyConsentModal button'))setTimeout(()=>measure('page_view'),200)});
function css(){
 if(document.getElementById('artyInsightsStyles'))return;
 const tag=document.createElement('style');tag.id='artyInsightsStyles';
 tag.textContent='.arty-insights{margin:18px 0;padding:20px;background:#fff;border:1px solid #e1e7e3;border-radius:18px}.arty-insights-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.arty-insights-head h3{margin:0}.arty-insights-head p{font-size:.83rem;color:#6a756f;margin:6px 0}.arty-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin:18px 0}.arty-stat{padding:14px;border-radius:12px;background:#f7f9f7;border:1px solid #e9eee9;min-width:0}.arty-stat strong{display:block;font-size:1.45rem;overflow-wrap:anywhere;color:#245e5e}.arty-stat small{font-size:.76rem;color:#6b746e}.arty-stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.arty-stat-panel{border:1px solid #ebefea;padding:15px;border-radius:14px;min-width:0}.arty-stat-panel h4{margin:0 0 10px}.arty-stat-row{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #edf0eb;padding:8px 0;font-size:.84rem}.arty-stat-row span{overflow-wrap:anywhere}.arty-spark{height:90px;display:flex;align-items:end;gap:3px;border-bottom:1px solid #e4e7e1}.arty-spark i{flex:1;min-width:2px;background:#2b97a2;border-radius:3px 3px 0 0}.arty-stat-note{font-size:.77rem;color:#67736f;line-height:1.5;margin:12px 0}.arty-manual{padding:17px;margin:16px 0;background:#f8fbf9;border:1px solid #dce7e0;border-radius:16px}.arty-manual h4{margin:0 0 5px}.arty-manual p{font-size:.84rem;color:#64736b;margin:0 0 12px}.arty-manual-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.arty-manual-grid label{display:grid;gap:5px;font-size:.78rem;font-weight:700}.arty-manual-grid input{box-sizing:border-box;min-width:0;width:100%;padding:10px;border:1px solid #dce3dc;border-radius:9px;background:#fff;font:inherit}.arty-manual-bottom{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}.arty-manual-bottom label{display:flex;gap:8px;font-size:.83rem;max-width:630px}@media(max-width:820px){.arty-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.arty-stat-grid{grid-template-columns:1fr}.arty-manual-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.arty-manual-grid{grid-template-columns:1fr}.arty-insights{padding:14px}}';
 document.head.append(tag);
}
function card(label,value){return '<div class="arty-stat"><strong>'+safe(value)+'</strong><small>'+safe(label)+'</small></div>'}
function rows(list){return list?.length?list.map(x=>'<div class="arty-stat-row"><span>'+safe(x.name)+'</span><strong>'+num(x.count)+'</strong></div>').join(''):'<p class="arty-stat-note">'+t('Aucune donnée encore','No data yet')+'</p>'}
let loading=false;
async function loadReport(){
 const root=document.getElementById('artyInsights');const out=document.getElementById('artyInsightsReport');
 if(!root||!out||loading)return;loading=true;out.textContent=t('Chargement…','Loading…');
 try{
 const res=await artyFetch('/api/admin/marketing-insights?days='+root.querySelector('select').value,{headers:authH()});
 const d=await res.json();if(!res.ok)throw Error(d.error||'Report unavailable');
 const c=d.counts||{},max=Math.max(1,...d.timeline.map(x=>x.views));
 const spark=d.timeline.map(x=>'<i title="'+safe(x.date)+' : '+num(x.views)+'" style="height:'+Math.round(100*x.views/max)+'%"></i>').join('');
 out.innerHTML='<div class="arty-stats">'+
 card(t('Pages vues','Page views'),num(d.pageViews))+card(t('Visites / sessions','Visits / sessions'),num(d.sessions))+
 card(t('Visiteurs uniques quotidiens (cumul)','Daily unique visitors (sum)'),num(d.visitorsDailySum))+card(t('Comptes créés','Accounts created'),num(d.signups))+
 card(t('Connexions','Logins'),num(d.logins))+card(t('Pages événements consultées','Event views'),num(c.view_event))+
 card(t('Ajouts au panier','Adds to cart'),num(c.add_to_cart))+card(t('Débuts de paiement','Checkout starts'),num(c.begin_checkout))+
 card(t('Commandes payées','Paid orders'),num(d.orders))+card(t('Revenus en ligne','Online revenue'),money(d.revenue))+
 card(t('Réservations manuelles','Manual bookings'),num(d.manualBookings))+card(t('Places manuelles','Manual admissions'),num(d.manualAdmissions))+'</div>'+
 '<div class="arty-stat-grid"><section class="arty-stat-panel"><h4>'+t('Visites quotidiennes','Daily traffic')+'</h4><div class="arty-spark">'+spark+'</div><p class="arty-stat-note">'+safe(d.from)+' — '+safe(d.to)+'</p></section>'+
 '<section class="arty-stat-panel"><h4>'+t('Sources de trafic','Traffic sources')+'</h4>'+rows(d.sources)+'</section>'+
 '<section class="arty-stat-panel"><h4>'+t('Pages populaires','Popular pages')+'</h4>'+rows(d.topPages)+'</section>'+
 '<section class="arty-stat-panel"><h4>'+t('Appareils','Devices')+'</h4>'+rows(d.devices)+'</section></div>'+
 '<p class="arty-stat-note">'+t('Statistiques de visites disponibles seulement depuis l’installation et pour les visiteurs ayant accepté la mesure. Les visiteurs uniques sont cumulés par jour et peuvent se répéter entre jours. Les comptes et commandes proviennent des données existantes du site; les billets Interac sont distincts des revenus Stripe.','Visit analytics starts after installation and only includes visitors who consent. Daily uniques are summed and may repeat across days. Accounts and orders come from existing site records; Interac tickets are separate from Stripe revenue.')+'</p>';
 }catch(err){out.textContent=err.message}finally{loading=false}
}
window.artyLoadReport=loadReport;
function addMarketing(){
 const panel=document.getElementById('adminMarketingPanel');
 if(!panel||panel.style.display==='none'||!panel.querySelector('.marketing-admin-head')||panel.querySelector('#artyInsights'))return;
 const box=document.createElement('section');box.id='artyInsights';box.className='arty-insights';
 box.innerHTML='<div class="arty-insights-head"><div><h3>'+t('Statistiques du site','Website analytics')+'</h3><p>'+t('Visiteurs, conversions, campagnes et ventes','Visitors, conversions, campaigns and sales')+'</p></div><select aria-label="'+t('Période','Period')+'"><option value="7">'+t('7 jours','7 days')+'</option><option value="30" selected>'+t('30 jours','30 days')+'</option><option value="90">'+t('90 jours','90 days')+'</option></select></div><div id="artyInsightsReport"></div>';
 box.querySelector('select').addEventListener('change',loadReport);
 panel.querySelector('.marketing-admin-head').insertAdjacentElement('afterend',box);loadReport();
}
function addTickets(){
 const manager=document.getElementById('adminGuestManager');if(!manager||manager.querySelector('#artyManualTicket'))return;
 const selected=typeof adminGuestEventId!=='undefined'?String(adminGuestEventId):'';
 const ev=(typeof adminEvents!=='undefined'?adminEvents:[]).find(x=>String(x.id)===selected);if(!ev)return;
 const box=document.createElement('section');box.className='arty-manual';box.id='artyManualTicket';
 box.innerHTML='<h4>'+t('Créer un billet — paiement Interac','Issue a ticket — Interac payment')+'</h4><p>'+t('Vérifiez le dépôt dans votre banque avant de confirmer. Le billet utilise le même code-barres et la même liste d’invités.','Verify the bank deposit before confirming. The ticket uses the existing barcode and guest list.')+'</p>'+
 '<form id="artyManualForm"><div class="arty-manual-grid">'+
 '<label>'+t('Nom','Name')+'<input name="name" required maxlength="120" autocomplete="name"></label>'+
 '<label>'+t('Courriel','Email')+'<input name="email" type="email" required autocomplete="email"></label>'+
 '<label>'+t('Téléphone','Phone')+'<input name="phone" type="tel"></label>'+
 '<label>'+t('Places','Admissions')+'<input name="guests" type="number" required min="1" max="50" value="1"></label>'+
 '<label>'+t('Montant reçu (CAD)','Amount received (CAD)')+'<input name="amount" type="number" required min="0" max="100000" step=".01" value="'+safe(Number(ev.price||0).toFixed(2))+'"></label>'+
 '<label>'+t('Référence de virement','Transfer reference')+'<input name="paymentReference" required maxlength="100"></label></div>'+
 '<div class="arty-manual-bottom"><label><input name="paymentConfirmed" type="checkbox" required>'+t('Je confirme avoir vérifié la réception du paiement.','I confirm the payment has been received.')+'</label>'+
 '<button type="submit" class="btn btn-orange">'+t('Créer et envoyer par courriel','Create and send email')+'</button></div></form>';
 manager.querySelector('.admin-guest-head')?.insertAdjacentElement('afterend',box);
 const form=box.querySelector('form');form.addEventListener('submit',async e=>{
  e.preventDefault();const button=form.querySelector('button');button.disabled=true;
  const f=new FormData(form),body={eventId:Number(selected),guests:Number(f.get('guests')),amount:Number(f.get('amount')),name:f.get('name'),email:f.get('email'),phone:f.get('phone'),paymentReference:f.get('paymentReference'),paymentConfirmed:f.has('paymentConfirmed'),locale:en()?'en':'fr'};
  try{
   const res=await artyFetch('/api/admin/bookings/manual',{method:'POST',headers:authH(),body:JSON.stringify(body)}),data=await res.json();
   if(!res.ok)throw Error(data.error||'Ticket error');
   await loadAdminBookings();renderAdminEvents();
   showToast(data.emailStatus==='sent'?t('Billet créé et envoyé.','Ticket issued and emailed.'):t('Billet créé, mais le courriel a échoué. Renvoyez-le depuis la liste des invités.','Ticket issued, but email failed. Resend from the guest list.'),data.emailStatus==='sent'?'success':'error');
  }catch(err){showToast(err.message,'error');button.disabled=false}
 });
}
function refresh(){try{css();addMarketing();addTickets()}catch(err){console.warn('ARTY reporting:',err.message)}}
function init(){const observer=new MutationObserver(refresh);observer.observe(document.body,{subtree:true,childList:true});refresh()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
