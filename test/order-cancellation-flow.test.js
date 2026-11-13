'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','core-server.js'),'utf8');
const cancellation=require('../order-cancellation');
function adminHarness(initial){
  const db={orders:[{id:'O1',statusHistory:[],...initial}]};
  const start=source.indexOf("app.put('/api/admin/orders/:id/status'"),end=source.indexOf("app.get('/api/admin/analytics'",start);
  assert.ok(start>=0&&end>start);
  let handler;
  new Function('app','adminOnly','readDB','writeDB','I18n','eventTicketItems','orderCancellation','releaseInventoryForItems','releaseEventSeatsForOrder','cancelOrderTicketBookings','ensurePaidOrderBookings','deliverPaidOrderCommunications','deliverOrderStatusEmail',source.slice(start,end))(
    {put:(route,middleware,cb)=>{handler=cb}},()=>{},()=>db,()=>{},
    {t:x=>x},()=>[],cancellation,()=>{},()=>{},()=>{},()=>{},
    async()=>({status:'not_sent',tickets:[]}),async()=>({status:'not_sent'})
  );
  async function change(status,note){
    const res={code:200,status(code){this.code=code;return this},json(value){this.body=value;return this}};
    await handler({params:{id:'O1'},body:{status,...(note!==undefined?{cancelNote:note}:{})},session:{email:'owner@example.test'}},res);
    return res;
  }
  return {db,change};
}
function stripeSync(){
  const start=source.indexOf('function markOrderPaid('),end=source.indexOf('function verifyStripeSignature',start);
  assert.ok(start>=0&&end>start);
  return new Function('orderCancellation','releaseInventoryForItems','I18n',source.slice(start,end)+'\nreturn syncOrderFromStripePaymentIntent')(
    cancellation,()=>{},{t:x=>x});
}
test('admin cancelling an already paid order records actor and requires a refund',async()=>{
 const h=adminHarness({status:'payée',paymentStatus:'paid',total:125});
 const res=await h.change('annulée','Buyer asked to cancel');
 assert.equal(res.code,200);
 const o=h.db.orders[0];
 assert.equal(o.status,'annulée');
 assert.equal(o.paymentStatus,'refund_needed');
 assert.equal(o.cancellation.reason,'admin_cancelled');
 assert.equal(o.cancellation.note,'Buyer asked to cancel');
 assert.equal(o.cancellation.by,'owner@example.test');
 assert.equal(o.statusHistory.at(-1).cancellationReason,'admin_cancelled');
});
test('a subsequent refund status change preserves original cancellation audit',async()=>{
 const h=adminHarness({status:'payée',paymentStatus:'paid',total:125});
 await h.change('annulée','Requested by customer');
 await h.change('remboursée');
 assert.equal(h.db.orders[0].cancellation.reason,'admin_cancelled');
 assert.equal(h.db.orders[0].cancellation.note,'Requested by customer');
 assert.equal(h.db.orders[0].refundStatus,'refunded');
});
test('Stripe cancellation is idempotent and successful recovery clears an obsolete reason',()=>{
 const sync=stripeSync();
 const db={orders:[{id:'O1',status:'en attente de paiement',paymentStatus:'pending'}]};
 const intent={id:'pi_test',status:'canceled',metadata:{orderId:'O1'}};
 sync(db,intent,'webhook:payment_intent.canceled');
 assert.equal(db.orders[0].cancellation.reason,'stripe_cancelled');
 sync(db,intent,'webhook:payment_intent.canceled');
 assert.equal(db.orders[0].statusHistory.length,1);
 sync(db,{...intent,status:'succeeded',amount_received:3000},'test-success');
 assert.equal(db.orders[0].status,'payée');
 assert.equal(db.orders[0].paymentStatus,'paid');
 assert.equal(db.orders[0].cancellation,undefined);
});
