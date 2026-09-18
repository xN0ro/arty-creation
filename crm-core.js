'use strict';

const CRM_LEAD_STATUSES = Object.freeze(['new','contacted','qualified','quote_sent','follow_up','won','lost']);
const CRM_LOST_REASONS = Object.freeze(['price','no_response','date_unavailable','cancelled','not_fit','competitor','other']);

function text(value,max=300){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}
function emailKey(value){return text(value,240).toLowerCase()}
function money(value){return Number((Number(value)||0).toFixed(2))}
function list(value,max=20){return Array.from(new Set((Array.isArray(value)?value:[]).map(v=>text(v,80)).filter(Boolean))).slice(0,max)}
function iso(value){const d=new Date(value||0);return Number.isFinite(d.getTime())?d.toISOString():''}
function today(){return new Date().toISOString().slice(0,10)}
function dayDiff(a,b){const aa=new Date(a||0).getTime(),bb=new Date(b||0).getTime();return aa&&bb?Math.max(0,(bb-aa)/86400000):0}
function cleanAttribution(raw={}){
  const out={},src=raw&&typeof raw==='object'?raw:{};
  for(const side of ['firstTouch','lastTouch']){
    const input=src[side]&&typeof src[side]==='object'?src[side]:{};
    const touch={};
    for(const [key,max] of Object.entries({source:80,medium:80,campaign:140,content:140,term:140,landingPage:500,referrer:500,capturedAt:60})){
      const value=text(input[key],max);if(value)touch[key]=value;
    }
    if(Object.keys(touch).length)out[side]=touch;
  }
  if(text(src.sessionId,100))out.sessionId=text(src.sessionId,100);
  return out;
}
function crmMeta(raw={}){
  const status=CRM_LEAD_STATUSES.includes(String(raw.status||''))?String(raw.status):'new';
  return {
    status,
    nextFollowUp:text(raw.nextFollowUp,40),
    followUpType:['call','email','meeting','quote','other'].includes(String(raw.followUpType||''))?String(raw.followUpType):'call',
    followUpDuration:Math.max(5,Math.min(480,Number(raw.followUpDuration)||30)),
    calendar:{
      eventId:text(raw.calendar?.eventId,240),
      htmlLink:text(raw.calendar?.htmlLink,1000),
      status:text(raw.calendar?.status,80),
      syncedAt:text(raw.calendar?.syncedAt,60),
      error:text(raw.calendar?.error,1000)
    },
    owner:text(raw.owner,240),
    tags:list(raw.tags),
    adminNote:text(raw.adminNote,3000),
    lostReason:CRM_LOST_REASONS.includes(String(raw.lostReason||''))?String(raw.lostReason):'',
    finalValue:money(raw.finalValue),
    wonAt:text(raw.wonAt,60),
    lostAt:text(raw.lostAt,60),
    createdBy:text(raw.createdBy,240),
    updatedBy:text(raw.updatedBy,240),
    updatedAt:text(raw.updatedAt,60),
    statusHistory:Array.isArray(raw.statusHistory)?raw.statusHistory.slice(-100).map(h=>({
      status:CRM_LEAD_STATUSES.includes(String(h.status||''))?String(h.status):'new',
      at:text(h.at,60),by:text(h.by,240)
    })):[]
  };
}
function ensureCustomerStore(db){
  if(!db.crmCustomers||typeof db.crmCustomers!=='object'||Array.isArray(db.crmCustomers))db.crmCustomers={};
  return db.crmCustomers;
}
function customerMeta(db,email){
  const key=emailKey(email),raw=ensureCustomerStore(db)[key]||{};
  return {
    tags:list(raw.tags),
    notes:Array.isArray(raw.notes)?raw.notes.slice(-100):[],
    preferredLanguage:['fr','en'].includes(raw.preferredLanguage)?raw.preferredLanguage:'',
    marketingConsent:raw.marketingConsent===true,
    marketingConsentAt:text(raw.marketingConsentAt,60),
    marketingConsentSource:text(raw.marketingConsentSource,120),
    updatedAt:text(raw.updatedAt,60)
  };
}
function orderEmail(order,usersById){
  const user=usersById.get(String(order?.userId||''));
  return emailKey(order?.customer?.email||order?.guestEmail||user?.email);
}
function orderName(order,usersById){
  const user=usersById.get(String(order?.userId||''));
  return text(order?.customer?.name||user?.name,140);
}
function paidOrder(order){
  return !order?.isTest && order?.paymentStatus==='paid' && !['annulée','remboursée','cancelled','refunded'].includes(String(order?.status||'').toLowerCase());
}
function buildCustomerIndex(db={}){
  const users=Array.isArray(db.users)?db.users:[];
  const orders=Array.isArray(db.orders)?db.orders:[];
  const eventRequests=Array.isArray(db.eventRequests)?db.eventRequests:[];
  const bookings=Array.isArray(db.bookings)?db.bookings:[];
  const contacts=Array.isArray(db.contactRequests)?db.contactRequests:[];
  const manualLeads=Array.isArray(db.crmLeads)?db.crmLeads:[];
  const usersById=new Map(users.map(u=>[String(u.id),u]));
  const map=new Map();

  function ensure(email,name='',phone=''){
    const key=emailKey(email);if(!key)return null;
    if(!map.has(key))map.set(key,{key,email:key,name:text(name,140),phone:text(phone,80),account:null,orders:[],eventRequests:[],bookings:[],contacts:[],manualLeads:[],meta:customerMeta(db,key)});
    const item=map.get(key);
    if(!item.name&&name)item.name=text(name,140);
    if(!item.phone&&phone)item.phone=text(phone,80);
    return item;
  }

  for(const user of users){const c=ensure(user.email,user.name,user.phone);if(c)c.account=user}
  for(const order of orders){const c=ensure(orderEmail(order,usersById),orderName(order,usersById),order?.customer?.phone);if(c)c.orders.push(order)}
  for(const request of eventRequests){const c=ensure(request.email,request.name,request.phone);if(c)c.eventRequests.push(request)}
  for(const booking of bookings){const c=ensure(booking.email||booking.customer?.email,booking.name||booking.customer?.name,booking.phone||booking.customer?.phone);if(c)c.bookings.push(booking)}
  for(const contact of contacts){const c=ensure(contact.email,contact.name,contact.phone);if(c)c.contacts.push(contact)}
  for(const lead of manualLeads){const c=ensure(lead.email,lead.name,lead.phone);if(c)c.manualLeads.push(lead)}

  return Array.from(map.values()).map(c=>{
    const paid=c.orders.filter(paidOrder),lifetimeSpend=money(paid.reduce((sum,o)=>sum+Number(o.total||0),0));
    const dates=[
      c.account?.createdAt,c.account?.lastLoginAt,c.meta.updatedAt,
      ...c.orders.map(o=>o.updatedAt||o.paidAt||o.createdAt),
      ...c.eventRequests.map(r=>r.crm?.updatedAt||r.updatedAt||r.createdAt),
      ...c.bookings.map(b=>b.updatedAt||b.bookedAt||b.createdAt),
      ...c.contacts.map(x=>x.crm?.updatedAt||x.updatedAt||x.createdAt),
      ...c.manualLeads.map(x=>x.crm?.updatedAt||x.updatedAt||x.createdAt)
    ].filter(Boolean).map(String).sort();
    return {
      key:c.key,email:c.email,name:c.name||c.email,phone:c.phone||'',
      hasAccount:!!c.account,accountId:c.account?.id??null,createdAt:c.account?.createdAt||'',
      lastLoginAt:c.account?.lastLoginAt||'',disabled:!!c.account?.accountDisabledAt,disabledAt:c.account?.accountDisabledAt||'',
      orderCount:c.orders.filter(o=>!o.isTest).length,paidOrderCount:paid.length,lifetimeSpend,
      averageOrder:paid.length?money(lifetimeSpend/paid.length):0,
      eventRequestCount:c.eventRequests.length,bookingCount:c.bookings.length,contactCount:c.contacts.length,
      leadCount:c.eventRequests.length+c.contacts.length+c.manualLeads.length,lastActivity:dates.length?dates[dates.length-1]:'',
      owners:list([
        ...c.eventRequests.map(x=>x.crm?.owner),
        ...c.contacts.map(x=>x.crm?.owner),
        ...c.manualLeads.map(x=>x.crm?.owner)
      ].filter(Boolean),50),
      tags:c.meta.tags,preferredLanguage:c.meta.preferredLanguage||c.account?.locale||'',
      marketingConsent:c.meta.marketingConsent,marketingConsentAt:c.meta.marketingConsentAt
    };
  }).sort((a,b)=>String(b.lastActivity||'').localeCompare(String(a.lastActivity||'')));
}
function customerDetail(db={},key=''){
  const email=emailKey(key),summary=buildCustomerIndex(db).find(c=>c.key===email);if(!summary)return null;
  const users=Array.isArray(db.users)?db.users:[],user=users.find(u=>emailKey(u.email)===email)||null,usersById=new Map(users.map(u=>[String(u.id),u]));
  const orders=(db.orders||[]).filter(o=>orderEmail(o,usersById)===email).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const eventRequests=(db.eventRequests||[]).filter(r=>emailKey(r.email)===email).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const bookings=(db.bookings||[]).filter(b=>emailKey(b.email||b.customer?.email)===email).sort((a,b)=>String(b.bookedAt||b.createdAt||'').localeCompare(String(a.bookedAt||a.createdAt||'')));
  const contacts=(db.contactRequests||[]).filter(c=>emailKey(c.email)===email).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const manualLeads=(db.crmLeads||[]).filter(l=>emailKey(l.email)===email).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const meta=customerMeta(db,email),timeline=[];
  if(user?.createdAt)timeline.push({type:'account',at:user.createdAt,label:'account_created',id:String(user.id)});
  if(user?.lastLoginAt)timeline.push({type:'login',at:user.lastLoginAt,label:'last_login',id:String(user.id)});
  for(const o of orders)timeline.push({type:'order',at:o.paidAt||o.createdAt||'',label:'order',id:String(o.id),status:o.status||'',amount:money(o.total),detail:(o.items||[]).map(i=>i.name).filter(Boolean).slice(0,3).join(', ')});
  for(const r of eventRequests)timeline.push({type:'event_request',at:r.crm?.updatedAt||r.updatedAt||r.createdAt||'',label:'event_request',id:String(r.id),status:crmMeta(r.crm).status,amount:money(r.crm?.finalValue||r.quoteAmount),detail:r.eventType||r.eventName||''});
  for(const b of bookings)timeline.push({type:'booking',at:b.bookedAt||b.createdAt||'',label:'booking',id:String(b.id),status:b.status||'',detail:b.event?.title||b.eventTitle||''});
  for(const c of contacts)timeline.push({type:'contact',at:c.crm?.updatedAt||c.createdAt||'',label:'contact',id:String(c.id),status:crmMeta(c.crm).status,detail:c.channel||''});
  for(const l of manualLeads)timeline.push({type:'lead',at:l.crm?.updatedAt||l.createdAt||'',label:'manual_lead',id:String(l.id),status:crmMeta(l.crm).status,amount:money(l.crm?.finalValue||l.value),detail:l.title||''});
  for(const n of meta.notes)timeline.push({type:'note',at:n.createdAt||'',label:'note',id:String(n.id||''),detail:n.text||'',author:n.author||''});
  timeline.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  return {
    summary,
    account:user?{id:user.id,name:user.name,email:user.email,phone:user.phone||'',picture:user.picture||'',provider:user.provider||'',createdAt:user.createdAt||'',lastLoginAt:user.lastLoginAt||'',accountDisabledAt:user.accountDisabledAt||'',defaultAddress:user.defaultAddress||{}}:null,
    preferences:meta,orders,eventRequests,bookings,contacts,manualLeads,notes:meta.notes,timeline
  };
}
function leadBase(kind,id,name,email,phone,title,createdAt,rawCrm={}){
  const crm=crmMeta(rawCrm);
  return {key:`${kind}:${id}`,kind,id:String(id),name:text(name,140),email:emailKey(email),phone:text(phone,80),title:text(title,180),createdAt:text(createdAt,60),...crm};
}
function leadFromEvent(request){
  const base=leadBase('event',request.id,request.name,request.email,request.phone,request.eventType||request.eventName||'Event',request.createdAt,request.crm);
  const attribution=cleanAttribution(request.marketingAttribution),touch=attribution.lastTouch||attribution.firstTouch||{};
  return {...base,reference:request.reference||'',value:money(base.finalValue||request.quoteAmount),expectedValue:money(request.quoteAmount),operationalStatus:request.status||'',quotePaymentStatus:request.quotePaymentStatus||'',source:touch.source||'',campaign:touch.campaign||'',medium:touch.medium||'',eventType:request.eventType||request.eventName||'',preferredDate:request.preferredDate||''};
}
function leadFromContact(contact){
  const base=leadBase('contact',contact.id,contact.name,contact.email,contact.phone,contact.channel==='events'?'Event inquiry':'General inquiry',contact.createdAt,contact.crm);
  const attribution=cleanAttribution(contact.marketingAttribution),touch=attribution.lastTouch||attribution.firstTouch||{};
  return {...base,reference:contact.reference||'',value:money(base.finalValue),expectedValue:0,operationalStatus:'',quotePaymentStatus:'',source:touch.source||'',campaign:touch.campaign||'',medium:touch.medium||'',eventType:contact.channel==='events'?'Event inquiry':'General inquiry',preferredDate:''};
}
function leadFromManual(lead){
  const base=leadBase('manual',lead.id,lead.name,lead.email,lead.phone,lead.title||lead.eventType||'Lead',lead.createdAt,lead.crm);
  return {...base,reference:lead.reference||'',value:money(base.finalValue||lead.value),expectedValue:money(lead.value),operationalStatus:'',quotePaymentStatus:'',source:text(lead.source,80),campaign:text(lead.campaign,140),medium:text(lead.medium,80),eventType:text(lead.eventType,180),preferredDate:text(lead.preferredDate,30),message:text(lead.message,3000)};
}
function buildLeads(db={}){
  const eventLeads=(db.eventRequests||[]).map(leadFromEvent);
  const contactLeads=(db.contactRequests||[]).filter(c=>['contact','events'].includes(String(c.channel||'contact'))).map(leadFromContact);
  const manualLeads=(db.crmLeads||[]).map(leadFromManual);
  return [...eventLeads,...contactLeads,...manualLeads].sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
}
function crmSummary(db={}){
  const leads=buildLeads(db),customers=buildCustomerIndex(db),open=leads.filter(l=>!['won','lost'].includes(l.status)),day=today();
  return {
    customers:customers.length,accountCustomers:customers.filter(c=>c.hasAccount).length,leads:leads.length,
    newLeads:leads.filter(l=>l.status==='new').length,
    followUpsDue:open.filter(l=>l.nextFollowUp&&l.nextFollowUp.slice(0,10)<day).length,
    followUpsToday:open.filter(l=>l.nextFollowUp&&l.nextFollowUp.slice(0,10)===day).length,
    openPipelineValue:money(open.reduce((sum,l)=>sum+Number(l.value||l.expectedValue||0),0)),
    wonValue:money(leads.filter(l=>l.status==='won').reduce((sum,l)=>sum+Number(l.finalValue||l.value||0),0)),
    byStatus:CRM_LEAD_STATUSES.reduce((acc,s)=>(acc[s]=leads.filter(l=>l.status===s).length,acc),{})
  };
}
function createManualLead(db,input={},actor=''){
  if(!db.crmLeads||!Array.isArray(db.crmLeads))db.crmLeads=[];
  const name=text(input.name,140),email=emailKey(input.email),phone=text(input.phone,80),title=text(input.title||input.eventType||'Lead',180);
  if(!name||!email)return null;
  const createdAt=new Date().toISOString(),id=`LEAD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  const lead={
    id,reference:id,name,email,phone,title,eventType:text(input.eventType,180),preferredDate:text(input.preferredDate,30),
    value:money(input.value),source:text(input.source||'manual',80),campaign:text(input.campaign,140),medium:text(input.medium,80),message:text(input.message,3000),
    createdAt,updatedAt:createdAt,
    crm:{status:CRM_LEAD_STATUSES.includes(String(input.status||''))?String(input.status):'new',nextFollowUp:text(input.nextFollowUp,40),followUpType:['call','email','meeting','quote','other'].includes(String(input.followUpType||''))?String(input.followUpType):'call',followUpDuration:Math.max(5,Math.min(480,Number(input.followUpDuration)||30)),calendar:{eventId:'',htmlLink:'',status:'',syncedAt:'',error:''},owner:text(input.owner,240),tags:list(input.tags),adminNote:text(input.adminNote,3000),lostReason:'',finalValue:0,wonAt:'',lostAt:'',createdBy:text(actor,240),updatedBy:text(actor,240),updatedAt:createdAt,statusHistory:[{status:'new',at:createdAt,by:text(actor,240)}]}
  };
  db.crmLeads.push(lead);return leadFromManual(lead);
}
function syncEventWorkflow(db,id,signal,actor='system',options={}){
  const request=(db.eventRequests||[]).find(item=>String(item.id)===String(id));
  if(!request)return null;
  const signalMap={
    request_created:'new',
    contacted:'contacted',
    quote_drafted:'qualified',
    quote_sent:'quote_sent',
    payment_pending:'quote_sent',
    payment_succeeded:'won',
    manual_paid:'won'
  };
  const desired=signalMap[String(signal||'')];
  if(!desired)return leadFromEvent(request);
  const current=crmMeta(request.crm);
  const rank={new:0,contacted:1,qualified:2,quote_sent:3,follow_up:4,won:5,lost:5};
  if(desired==='won'){
    return updateLead(db,'event',id,{status:'won',finalValue:money(request.paymentAmountReceived||request.quoteAmount||current.finalValue||0)},actor);
  }
  if(current.status==='won')return leadFromEvent(request);
  if(current.status==='lost'&&!options.reopen)return leadFromEvent(request);
  if((rank[current.status]??0)>(rank[desired]??0)&&!options.allowRegression)return leadFromEvent(request);
  return updateLead(db,'event',id,{status:desired},actor);
}
function updateLead(db,kind,id,patch={},actor=''){
  const collection=kind==='event'?(db.eventRequests||[]):kind==='contact'?(db.contactRequests||[]):kind==='manual'?(db.crmLeads||[]):null;if(!collection)return null;
  const item=collection.find(x=>String(x.id)===String(id));if(!item)return null;
  const current=crmMeta(item.crm),nextStatus=CRM_LEAD_STATUSES.includes(String(patch.status||''))?String(patch.status):current.status,now=new Date().toISOString();
  const history=[...current.statusHistory];
  if(nextStatus!==current.status)history.push({status:nextStatus,at:now,by:text(actor,240)});
  let wonAt=current.wonAt,lostAt=current.lostAt,lostReason=current.lostReason;
  if(nextStatus==='won'){wonAt=wonAt||now;lostAt='';lostReason=''}
  else if(nextStatus==='lost'){lostAt=lostAt||now;wonAt='';lostReason=CRM_LOST_REASONS.includes(String(patch.lostReason||''))?String(patch.lostReason):lostReason}
  else {wonAt='';lostAt='';if(nextStatus!=='lost')lostReason=''}
  item.crm={
    ...current,status:nextStatus,nextFollowUp:text(patch.nextFollowUp??current.nextFollowUp,40),
    followUpType:['call','email','meeting','quote','other'].includes(String(patch.followUpType??current.followUpType))?String(patch.followUpType??current.followUpType):current.followUpType,
    followUpDuration:Math.max(5,Math.min(480,Number(patch.followUpDuration??current.followUpDuration)||30)),
    calendar:current.calendar,
    owner:text(patch.owner??current.owner,240),
    tags:patch.tags===undefined?current.tags:list(patch.tags),adminNote:text(patch.adminNote??current.adminNote,3000),
    lostReason,finalValue:patch.finalValue===undefined?current.finalValue:money(patch.finalValue),wonAt,lostAt,
    createdBy:current.createdBy||text(actor,240),updatedBy:text(actor,240),updatedAt:now,statusHistory:history.slice(-100)
  };
  if(kind==='manual'){
    if(patch.name!==undefined)item.name=text(patch.name,140);
    if(patch.email!==undefined)item.email=emailKey(patch.email);
    if(patch.phone!==undefined)item.phone=text(patch.phone,80);
    if(patch.title!==undefined)item.title=text(patch.title,180);
    if(patch.eventType!==undefined)item.eventType=text(patch.eventType,180);
    if(patch.preferredDate!==undefined)item.preferredDate=text(patch.preferredDate,30);
    if(patch.value!==undefined)item.value=money(patch.value);
    if(patch.source!==undefined)item.source=text(patch.source,80);
    if(patch.campaign!==undefined)item.campaign=text(patch.campaign,140);
    if(patch.message!==undefined)item.message=text(patch.message,3000);
  }
  item.updatedAt=now;
  return kind==='event'?leadFromEvent(item):kind==='contact'?leadFromContact(item):leadFromManual(item);
}
function updateCustomerTags(db,email,tags){
  const key=emailKey(email);if(!key)return null;const store=ensureCustomerStore(db),existing=store[key]||{};
  store[key]={...existing,tags:list(tags),notes:Array.isArray(existing.notes)?existing.notes:[],updatedAt:new Date().toISOString()};return store[key];
}
function addCustomerNote(db,email,note,actor=''){
  const key=emailKey(email),value=text(note,3000);if(!key||!value)return null;const store=ensureCustomerStore(db),existing=store[key]||{},notes=Array.isArray(existing.notes)?existing.notes:[];
  const item={id:`NOTE-${Date.now().toString(36).toUpperCase()}`,text:value,author:text(actor,240),createdAt:new Date().toISOString()};
  store[key]={...existing,tags:list(existing.tags),notes:[...notes,item].slice(-100),updatedAt:item.createdAt};return item;
}
function updateCustomerPreferences(db,email,input={},actor=''){
  const key=emailKey(email);if(!key)return null;const store=ensureCustomerStore(db),existing=store[key]||{},now=new Date().toISOString();
  const next={...existing,tags:list(existing.tags),notes:Array.isArray(existing.notes)?existing.notes:[],updatedAt:now,updatedBy:text(actor,240)};
  if(['fr','en'].includes(input.preferredLanguage))next.preferredLanguage=input.preferredLanguage;
  if(input.marketingConsent!==undefined){
    const consent=input.marketingConsent===true;
    next.marketingConsent=consent;
    next.marketingConsentAt=now;
    next.marketingConsentSource=text(input.marketingConsentSource||'account',120);
  }
  store[key]=next;return customerMeta(db,key);
}
function crmActionCenter(db={}){
  const leads=buildLeads(db),day=today(),open=leads.filter(l=>!['won','lost'].includes(l.status));
  const overdue=open.filter(l=>l.nextFollowUp&&l.nextFollowUp.slice(0,10)<day).slice(0,20);
  const dueToday=open.filter(l=>l.nextFollowUp&&l.nextFollowUp.slice(0,10)===day).slice(0,20);
  const newLeads=open.filter(l=>l.status==='new').slice(0,20);
  const quoteWaiting=open.filter(l=>l.status==='quote_sent'||l.operationalStatus==='devis préparé'||l.operationalStatus==='paiement prêt').slice(0,20);
  const orderPaymentsPending=(db.orders||[]).filter(o=>!o.isTest&&o.paymentStatus==='pending').length;
  const eventPaymentsPending=(db.eventRequests||[]).filter(r=>['ready','pending'].includes(String(r.quotePaymentStatus||''))).length;
  const paymentPending=orderPaymentsPending+eventPaymentsPending;
  const recentOrders=(db.orders||[]).filter(o=>!o.isTest).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,6).map(o=>({id:o.id,total:money(o.total),status:o.status||'',paymentStatus:o.paymentStatus||'',createdAt:o.createdAt||''}));
  const lowInventory=(db.kits||[]).filter(k=>k.inStock===false||(Number.isFinite(Number(k.stockQty))&&Number(k.stockQty)<=Number(k.lowStockThreshold??3))).slice(0,12).map(k=>({id:k.id,name:k.name||'',stockQty:Number(k.stockQty)||0,inStock:k.inStock!==false}));
  return {newLeads,overdue,dueToday,quoteWaiting,paymentPending,orderPaymentsPending,eventPaymentsPending,recentOrders,lowInventory};
}
function crmReporting(db={}){
  const leads=buildLeads(db),customers=buildCustomerIndex(db),won=leads.filter(l=>l.status==='won'),qualified=leads.filter(l=>['qualified','quote_sent','follow_up','won','lost'].includes(l.status));
  const quoted=leads.filter(l=>['quote_sent','follow_up','won','lost'].includes(l.status));
  const sourceMap={};
  for(const lead of leads){
    const key=lead.source||'direct/manual';if(!sourceMap[key])sourceMap[key]={source:key,leads:0,won:0,value:0};
    sourceMap[key].leads++;if(lead.status==='won'){sourceMap[key].won++;sourceMap[key].value+=Number(lead.finalValue||lead.value||0)}
  }
  const eventMap={};
  for(const lead of leads.filter(l=>l.eventType)){
    const key=lead.eventType;if(!eventMap[key])eventMap[key]={eventType:key,leads:0,won:0,value:0};
    eventMap[key].leads++;if(lead.status==='won'){eventMap[key].won++;eventMap[key].value+=Number(lead.finalValue||lead.value||0)}
  }
  const salesCycles=won.map(l=>dayDiff(l.createdAt,l.wonAt||l.updatedAt)).filter(Number.isFinite);
  const paying=customers.filter(c=>c.paidOrderCount>0),repeat=paying.filter(c=>c.paidOrderCount>1);
  return {
    totals:{leads:leads.length,qualified:qualified.length,quoted:quoted.length,won:won.length,lost:leads.filter(l=>l.status==='lost').length},
    rates:{
      leadToQuote:leads.length?Number((quoted.length/leads.length*100).toFixed(1)):0,
      quoteToWon:quoted.length?Number((won.length/quoted.length*100).toFixed(1)):0,
      repeatCustomer:paying.length?Number((repeat.length/paying.length*100).toFixed(1)):0
    },
    averageWonValue:won.length?money(won.reduce((s,l)=>s+Number(l.finalValue||l.value||0),0)/won.length):0,
    averageSalesCycleDays:salesCycles.length?Number((salesCycles.reduce((a,b)=>a+b,0)/salesCycles.length).toFixed(1)):0,
    sources:Object.values(sourceMap).map(r=>({...r,value:money(r.value),conversion:r.leads?Number((r.won/r.leads*100).toFixed(1)):0})).sort((a,b)=>b.value-a.value),
    eventTypes:Object.values(eventMap).map(r=>({...r,value:money(r.value),conversion:r.leads?Number((r.won/r.leads*100).toFixed(1)):0})).sort((a,b)=>b.value-a.value)
  };
}

module.exports={
  CRM_LEAD_STATUSES,CRM_LOST_REASONS,emailKey,crmMeta,cleanAttribution,buildCustomerIndex,customerDetail,buildLeads,crmSummary,
  createManualLead,updateLead,syncEventWorkflow,updateCustomerTags,addCustomerNote,updateCustomerPreferences,crmActionCenter,crmReporting
};
