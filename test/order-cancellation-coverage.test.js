'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const backend=fs.readFileSync(path.join(__dirname,'..','core-server.js'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const cancellation=require('../order-cancellation');
function ui(lang='en'){
 const start=client.indexOf('function adminCancellationMeta('),end=client.indexOf('function adminPaymentMeta(',start);
 assert.ok(start>=0&&end>start,'cancellation UI helpers exist');
 return new Function('I18n','safeText','profileDate','profileIcon',client.slice(start,end)+
   '\nreturn {adminCancellationMeta,adminCancellationDetailHtml};')(
   {language:()=>lang},
   x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
   x=>x,()=>'<svg></svg>'
 );
}
test('each code has an English and French description',()=>{
 for(const reason of cancellation.REASONS){
   for(const language of ['fr','en']){
     const detail=ui(language).adminCancellationMeta({status:'annulée',cancellationInfo:{reason}});
     assert.ok(detail.label&&detail.description);
     assert.notEqual(detail.label,language==='fr'?'Motif non enregistré':'Reason not recorded');
   }
 }
});
test('the admin list and details show the same reason',()=>{
 assert.match(client,/admin-order-cancel-label/);
 assert.match(client,/adminCancellationDetailHtml\(order\)/);
 assert.match(client,/adminOrderDetailContent/);
 const view=ui('en').adminCancellationDetailHtml({status:'annulée',paymentStatus:'cancelled',cancellationInfo:{reason:'reservation_expired',at:'2026-11-12T19:00:00Z'}});
 assert.match(view,/Reservation expired/);
 assert.match(view,/The temporary ticket reservation expired/);
});
test('paid order cancelled by admin clearly warns that a refund may still be required',()=>{
 const html=ui('en').adminCancellationDetailHtml({status:'annulée',paymentStatus:'refund_needed',cancellationInfo:{reason:'admin_cancelled'}});
 assert.match(html,/refund still needs to be processed/);
});
test('older records without evidence explicitly say the reason is unknown',()=>{
 const old={status:'annulée',paymentStatus:'cancelled'};
 const info=cancellation.cancellationDetails(old);
 assert.equal(info.reason,'unknown');
 assert.equal(ui('fr').adminCancellationMeta({...old,cancellationInfo:info}).label,'Motif non enregistré');
});
test('all new cancellation entry points record the verified cause',()=>{
 assert.match(backend,/recordCancellation\(persisted,'payment_setup_failed'/);
 assert.match(backend,/recordCancellation\(current,'reservation_expired'/);
 assert.match(backend,/recordCancellation\(order,source==='ticket-hold-expiry'\?'reservation_expired':'stripe_cancelled'/);
 assert.match(backend,/recordCancellation\(order,'admin_cancelled'/);
 assert.match(backend,/cancellationReason:'reservation_expired'/);
});
test('admin cancellation notes are bounded and not leaked through customer order view',()=>{
 assert.match(client,/detailCancelNote-/);
 assert.match(backend,/String\(req\.body\.cancelNote\|\|''\)\.trim\(\)\.slice\(0,500\)/);
 const method=backend.slice(backend.indexOf('function customerOrderView(order) {'),backend.indexOf("app.get('/api/orders/mine'"));
 assert.match(method,/userId, cancellation, \.\.\.safeOrder/);
 assert.match(method,/cancellation:cancellation\?\{reason:cancellation\.reason,at:cancellation\.at\}/);
});
