'use strict';

const CRM_LEAD_STATUSES = Object.freeze(['new','contacted','qualified','quote_sent','follow_up','won','lost']);

function text(value,max=300){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}
function emailKey(value){return text(value,240).toLowerCase()}
function money(value){return Number((Number(value)||0).toFixed(2))}
function list(value,max=20){return Array.from(new Set((Array.isArray(value)?value:[]).map(v=>text(v,80)).filter(Boolean))).slice(0,max)}
function crmMeta(raw={}){
  const status=CRM_LEAD_STATUSES.includes(String(raw.status||''))?String(raw.status):'new';
  return {
    status,
    nextFollowUp:text(raw.nextFollowUp,30),
    owner:text(raw.owner,140),
    tags:list(raw.tags),
    adminNote:text(raw.adminNote,3000),
    updatedAt:text(raw.updatedAt,60)
  };
}
function customerMeta(db,email){
  const key=emailKey(email);
  const raw=(db.crmCustomers&&typeof db.crmCustomers==='object'&&!Array.isArray(db.crmCustomers))?db.crmCustomers[key]:null;
  return {tags:list(raw?.tags),notes:Array.isArray(raw?.notes)?raw.notes.slice(-100):[]};
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
  return !order?.isTest && order?.paymentStatus==='paid' && !['annulée','remboursée'].includes(String(order?.status||'').toLowerCase());
}
function buildCustomerIndex(db={}){
  const users=Array.isArray(db.users)?db.users:[];
  const orders=Array.isArray(db.orders)?db.orders:[];
  const eventRequests=Array.isArray(db.eventRequests)?db.eventRequests:[];
  const bookings=Array.isArray(db.bookings)?db.bookings:[];
  const contacts=Array.isArray(db.contactRequests)?db.contactRequests:[];
  const usersById=new Map(users.map(u=>[String(u.id),u]));
  const map=new Map();

  function ensure(email,name='',phone=''){
    const key=emailKey(email); if(!key)return null;
    if(!map.has(key))map.set(key,{key,email:key,name:text(name,140),phone:text(phone,80),account:null,orders:[],eventRequests:[],bookings:[],contacts:[],meta:customerMeta(db,key)});
    const item=map.get(key);
    if(!item.name&&name)item.name=text(name,140);
    if(!item.phone&&phone)item.phone=text(phone,80);
    return item;
  }

  for(const user of users){const c=ensure(user.email,user.name,user.phone);if(c)c.account=user}
  for(const order of orders){const email=orderEmail(order,usersById),c=ensure(email,orderName(order,usersById),order?.customer?.phone);if(c)c.orders.push(order)}
  for(const request of eventRequests){const c=ensure(request.email,request.name,request.phone);if(c)c.eventRequests.push(request)}
  for(const booking of bookings){const c=ensure(booking.email||booking.customer?.email,booking.name||booking.customer?.name,booking.phone||booking.customer?.phone);if(c)c.bookings.push(booking)}
  for(const contact of contacts){const c=ensure(contact.email,contact.name,contact.phone);if(c)c.contacts.push(contact)}

  return Array.from(map.values()).map(c=>{
    const paid=c.orders.filter(paidOrder);
    const lifetimeSpend=money(paid.reduce((sum,o)=>sum+Number(o.total||0),0));
    const dates=[
      c.account?.createdAt,
      ...c.orders.map(o=>o.updatedAt||o.paidAt||o.createdAt),
      ...c.eventRequests.map(r=>r.updatedAt||r.createdAt),
      ...c.bookings.map(b=>b.updatedAt||b.bookedAt||b.createdAt),
      ...c.contacts.map(x=>x.createdAt)
    ].filter(Boolean).map(String).sort();
    return {
      key:c.key,email:c.email,name:c.name||c.email,phone:c.phone||'',
      hasAccount:!!c.account,accountId:c.account?.id??null,createdAt:c.account?.createdAt||'',
      orderCount:c.orders.filter(o=>!o.isTest).length,paidOrderCount:paid.length,lifetimeSpend,
      averageOrder:paid.length?money(lifetimeSpend/paid.length):0,
      eventRequestCount:c.eventRequests.length,bookingCount:c.bookings.length,contactCount:c.contacts.length,
      lastActivity:dates.length?dates[dates.length-1]:'',
      tags:c.meta.tags
    };
  }).sort((a,b)=>String(b.lastActivity||'').localeCompare(String(a.lastActivity||'')));
}
function customerDetail(db={},key=''){
  const email=emailKey(key);
  const summary=buildCustomerIndex(db).find(c=>c.key===email);
  if(!summary)return null;
  const users=Array.isArray(db.users)?db.users:[];
  const user=users.find(u=>emailKey(u.email)===email)||null;
  const usersById=new Map(users.map(u=>[String(u.id),u]));
  const orders=(db.orders||[]).filter(o=>orderEmail(o,usersById)===email).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const eventRequests=(db.eventRequests||[]).filter(r=>emailKey(r.email)===email).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const bookings=(db.bookings||[]).filter(b=>emailKey(b.email||b.customer?.email)===email).sort((a,b)=>String(b.bookedAt||b.createdAt||'').localeCompare(String(a.bookedAt||a.createdAt||'')));
  const contacts=(db.contactRequests||[]).filter(c=>emailKey(c.email)===email).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const meta=customerMeta(db,email);
  const timeline=[];
  if(user?.createdAt)timeline.push({type:'account',at:user.createdAt,label:'account_created',id:String(user.id)});
  for(const o of orders)timeline.push({type:'order',at:o.paidAt||o.createdAt||'',label:'order',id:String(o.id),status:o.status||'',amount:money(o.total),detail:(o.items||[]).map(i=>i.name).filter(Boolean).slice(0,3).join(', ')});
  for(const r of eventRequests)timeline.push({type:'event_request',at:r.createdAt||'',label:'event_request',id:String(r.id),status:crmMeta(r.crm).status,amount:money(r.quoteAmount),detail:r.eventType||r.eventName||''});
  for(const b of bookings)timeline.push({type:'booking',at:b.bookedAt||b.createdAt||'',label:'booking',id:String(b.id),status:b.status||'',detail:b.event?.title||b.eventTitle||''});
  for(const c of contacts)timeline.push({type:'contact',at:c.createdAt||'',label:'contact',id:String(c.id),status:crmMeta(c.crm).status,detail:c.channel||''});
  for(const n of meta.notes)timeline.push({type:'note',at:n.createdAt||'',label:'note',id:String(n.id||''),detail:n.text||'',author:n.author||''});
  timeline.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  return {summary,account:user?{id:user.id,name:user.name,email:user.email,phone:user.phone||'',picture:user.picture||'',provider:user.provider||'',createdAt:user.createdAt||'',defaultAddress:user.defaultAddress||{}}:null,orders,eventRequests,bookings,contacts,notes:meta.notes,timeline};
}
function leadFromEvent(request){
  const crm=crmMeta(request.crm);
  return {key:`event:${request.id}`,kind:'event',id:String(request.id),reference:request.reference||'',name:request.name||'',email:emailKey(request.email),phone:request.phone||'',title:request.eventType||request.eventName||'Event',createdAt:request.createdAt||'',updatedAt:request.updatedAt||request.createdAt||'',value:money(request.quoteAmount),operationalStatus:request.status||'',source:request.marketingAttribution?.lastTouch?.source||request.marketingAttribution?.firstTouch?.source||'',campaign:request.marketingAttribution?.lastTouch?.campaign||request.marketingAttribution?.firstTouch?.campaign||'',...crm};
}
function leadFromContact(contact){
  const crm=crmMeta(contact.crm);
  return {key:`contact:${contact.id}`,kind:'contact',id:String(contact.id),reference:contact.reference||'',name:contact.name||'',email:emailKey(contact.email),phone:contact.phone||'',title:contact.channel==='events'?'Event inquiry':'General inquiry',createdAt:contact.createdAt||'',updatedAt:crm.updatedAt||contact.createdAt||'',value:0,operationalStatus:'',source:contact.marketingAttribution?.lastTouch?.source||contact.marketingAttribution?.firstTouch?.source||'',campaign:contact.marketingAttribution?.lastTouch?.campaign||contact.marketingAttribution?.firstTouch?.campaign||'',...crm};
}
function buildLeads(db={}){
  const eventLeads=(db.eventRequests||[]).map(leadFromEvent);
  const contactLeads=(db.contactRequests||[]).filter(c=>['contact','events'].includes(String(c.channel||'contact'))).map(leadFromContact);
  return [...eventLeads,...contactLeads].sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
}
function crmSummary(db={}){
  const leads=buildLeads(db),customers=buildCustomerIndex(db);
  const open=leads.filter(l=>!['won','lost'].includes(l.status));
  const today=new Date().toISOString().slice(0,10);
  return {
    customers:customers.length,
    accountCustomers:customers.filter(c=>c.hasAccount).length,
    leads:leads.length,
    newLeads:leads.filter(l=>l.status==='new').length,
    followUpsDue:open.filter(l=>l.nextFollowUp&&l.nextFollowUp.slice(0,10)<=today).length,
    openPipelineValue:money(open.reduce((sum,l)=>sum+Number(l.value||0),0)),
    wonValue:money(leads.filter(l=>l.status==='won').reduce((sum,l)=>sum+Number(l.value||0),0)),
    byStatus:CRM_LEAD_STATUSES.reduce((acc,s)=>(acc[s]=leads.filter(l=>l.status===s).length,acc),{})
  };
}
function updateLead(db,kind,id,patch={},actor=''){
  const collection=kind==='event'?(db.eventRequests||[]):kind==='contact'?(db.contactRequests||[]):null;
  if(!collection)return null;
  const item=collection.find(x=>String(x.id)===String(id));if(!item)return null;
  const current=crmMeta(item.crm),status=CRM_LEAD_STATUSES.includes(String(patch.status||''))?String(patch.status):current.status;
  item.crm={...current,status,nextFollowUp:text(patch.nextFollowUp??current.nextFollowUp,30),owner:text(patch.owner??current.owner,140),tags:patch.tags===undefined?current.tags:list(patch.tags),adminNote:text(patch.adminNote??current.adminNote,3000),updatedAt:new Date().toISOString(),updatedBy:text(actor,240)};
  item.updatedAt=item.updatedAt||item.crm.updatedAt;
  return kind==='event'?leadFromEvent(item):leadFromContact(item);
}
function ensureCustomerStore(db){if(!db.crmCustomers||typeof db.crmCustomers!=='object'||Array.isArray(db.crmCustomers))db.crmCustomers={};return db.crmCustomers}
function updateCustomerTags(db,email,tags){const key=emailKey(email);if(!key)return null;const store=ensureCustomerStore(db),existing=store[key]||{};store[key]={...existing,tags:list(tags),notes:Array.isArray(existing.notes)?existing.notes:[]};return store[key]}
function addCustomerNote(db,email,note,actor=''){const key=emailKey(email),value=text(note,3000);if(!key||!value)return null;const store=ensureCustomerStore(db),existing=store[key]||{},notes=Array.isArray(existing.notes)?existing.notes:[];const item={id:`NOTE-${Date.now().toString(36).toUpperCase()}`,text:value,author:text(actor,240),createdAt:new Date().toISOString()};store[key]={...existing,tags:list(existing.tags),notes:[...notes,item].slice(-100)};return item}

module.exports={CRM_LEAD_STATUSES,emailKey,crmMeta,buildCustomerIndex,customerDetail,buildLeads,crmSummary,updateLead,updateCustomerTags,addCustomerNote};
