'use strict';

// Small, per-user admin notifications. Only actionable new customer
// messages, confirmed sales, and new commercial leads appear here.
const CATEGORIES=['support','orders','crm'];
const occurredAt=value=>String(value||'').trim();
const validAt=value=>{const parsed=Date.parse(occurredAt(value));return Number.isFinite(parsed)?new Date(parsed).toISOString():''};
function visibleSections(session={}){
  const permissions=new Set(session.permissions||[]);
  const admin=session.role==='admin';
  return {
    support:admin||permissions.has('support'),
    orders:admin||permissions.has('orders'),
    crm:admin||permissions.has('leads')
  };
}
function makeFeed(db,session={}){
  const allowed=visibleSections(session),actor=String(session.email||'').toLowerCase();
  const messages=[];
  if(allowed.support)for(const item of db.supportRequests||[]){
    const lastCustomer=(item.messages||[]).filter(m=>m.role==='customer').sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')))[0];
    const at=validAt(lastCustomer?.at||item.createdAt);
    if(at)messages.push({id:'support:'+item.id,kind:'support',at,title:item.subject||'Customer request',detail:item.customer?.name||'',targetId:String(item.id)});
  }
  if(allowed.orders){
    for(const order of db.orders||[]){
      if(order.isTest||order.paymentStatus!=='paid'||['annulée','remboursée'].includes(String(order.status||'')))continue;
      const at=validAt(order.paidAt||order.updatedAt||order.createdAt);
      if(at)messages.push({id:'order:'+order.id,kind:'orders',at,title:'Paid website order',detail:String(order.id),targetId:String(order.id)});
    }
    for(const booking of db.bookings||[]){
      if(booking.paymentMethod!=='e_transfer'||booking.paymentStatus!=='paid'||booking.isTest||booking.sourceOrderId||['annulée','remboursée','cancelled'].includes(String(booking.status||'')))continue;
      const at=validAt(booking.manualPayment?.confirmedAt||booking.bookedAt);
      if(at)messages.push({id:'manual:'+booking.id,kind:'orders',at,title:'Interac ticket sale',detail:String(booking.id),targetId:String(booking.id)});
    }
    for(const request of db.eventRequests||[]){
      if(request.isTest||request.quotePaymentStatus!=='paid'||request.quoteRefundStatus==='refunded')continue;
      const at=validAt(request.quotePaidAt||request.paidAt||request.updatedAt||request.createdAt);
      if(at)messages.push({id:'quote:'+request.id,kind:'orders',at,title:'Paid private-event quote',detail:String(request.reference||request.id),targetId:String(request.id)});
    }
  }
  if(allowed.crm){
    const hidden=new Set((db.crmHiddenLeads||[]).map(x=>typeof x==='string'?x:String(x.key||'')));
    for(const [kind,collection] of [['event',db.eventRequests||[]],['manual',db.crmLeads||[]]]){
      for(const lead of collection){
        if(lead.convertedEventRequestId||hidden.has(kind+':'+lead.id))continue;
        if(session.role!=='admin'&&!new Set(session.permissions||[]).has('crm_manager')&&String(lead.crm?.owner||'').toLowerCase()!==actor)continue;
        const at=validAt(lead.createdAt);
        if(at)messages.push({id:'lead:'+kind+':'+lead.id,kind:'crm',at,title:kind==='event'?'New event opportunity':'New sales lead',detail:String(lead.name||''),targetId:String(lead.id)});
      }
    }
  }
  return messages.sort((a,b)=>b.at.localeCompare(a.at));
}
function getAlertSnapshot(db,session={},now=new Date().toISOString()){
  const baseline=validAt(db.adminNotificationsBaselineAt)||now;
  const actor=String(session.userId??session.email??'');
  const reads=db.adminNotificationReads?.[actor]||{};
  const all=makeFeed(db,session);
  const counts={support:0,orders:0,crm:0},through={support:'',orders:'',crm:''},unread=[];
  for(const item of all){
    const seen=validAt(reads[item.kind])||baseline;
    if(item.at>seen){
      unread.push(item);
      counts[item.kind]++;
      if(!through[item.kind]||item.at>through[item.kind])through[item.kind]=item.at;
    }
  }
  return {counts,total:counts.support+counts.orders+counts.crm,through,items:unread.slice(0,25),allowed:visibleSections(session)};
}
function markCategorySeen(db,session,kind,through){
  if(!CATEGORIES.includes(kind)||!visibleSections(session)[kind])return null;
  const stamp=validAt(through);
  if(!stamp||Date.parse(stamp)>Date.now()+5000)return null;
  const baseline=validAt(db.adminNotificationsBaselineAt)||new Date().toISOString();
  const actor=String(session.userId??session.email??'');
  db.adminNotificationReads ||= {};
  db.adminNotificationReads[actor] ||= {};
  const previous=validAt(db.adminNotificationReads[actor][kind])||baseline;
  db.adminNotificationReads[actor][kind]=stamp>previous?stamp:previous;
  return db.adminNotificationReads[actor][kind];
}
module.exports={CATEGORIES,visibleSections,makeFeed,getAlertSnapshot,markCategorySeen};
