'use strict';

// Store a verified reason when an order actually becomes cancelled.
// Historical records may lack one: avoid inventing why a buyer left checkout.
const REASONS=Object.freeze([
  'reservation_expired',
  'payment_setup_failed',
  'stripe_cancelled',
  'admin_cancelled'
]);
const allowed=new Set(REASONS);
function recordCancellation(order,reason,{by='',note='',at=''}={}){
  if(!order||!allowed.has(reason))return null;
  // Webhook retries and background sweeps must not overwrite audit evidence.
  if(order.cancellation&&allowed.has(order.cancellation.reason))return order.cancellation;
  const timestamp=at&&Number.isFinite(Date.parse(at))?new Date(at).toISOString():new Date().toISOString();
  const entry={reason,at:timestamp,by:String(by||'').slice(0,180),note:String(note||'').trim().slice(0,500)};
  order.cancellation=entry;
  return entry;
}
function clearCancellation(order){
  if(order&&order.status!=='annulée')delete order.cancellation;
}
function cancellationDetails(order){
  if(!order||order.status!=='annulée')return null;
  if(order.cancellation&&allowed.has(order.cancellation.reason))
    return {...order.cancellation,legacy:false};
  // Older orders stored statusHistory with the acting admin email, or a
  // Stripe cancellation status, but not the exact reason.
  const manual=(order.statusHistory||[]).slice().reverse().find(entry=>
    entry.to==='annulée' && String(entry.by||'') &&
    !/^(stripe:|system:|ticket-hold)/.test(String(entry.by||'')));
  if(manual)return {reason:'admin_cancelled',at:manual.at||'',by:manual.by||'',note:'',legacy:true};
  if(order.stripe?.status==='canceled')return {reason:'stripe_cancelled',at:order.updatedAt||'',by:'stripe',note:'',legacy:true};
  return {reason:'unknown',at:'',by:'',note:'',legacy:true};
}
module.exports={REASONS,recordCancellation,clearCancellation,cancellationDetails};
