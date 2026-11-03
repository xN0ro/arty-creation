'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildPurchasePayload}=require('../public/marketing-purchase-core');
const order=(overrides={})=>({
  id:'ARTY-PAID-001',paymentStatus:'paid',paymentProvider:'stripe',paymentEnvironment:'live',
  isTest:false,refundStatus:'none',total:67.79,
  customer:{name:'Customer Name',email:'private@example.com'},
  items:[{id:'12',type:'kit',name:'Private custom title',qty:2,price:19.98}],
  ...overrides
});
test('kit purchase uses authoritative total, CAD and no customer PII',()=>{
  const p=buildPurchasePayload(order());
  assert.equal(p.value,67.79);
  assert.equal(p.currency,'CAD');
  assert.equal(p.transaction_id,'ARTY-PAID-001');
  assert.equal(p.arty_purchase_category,'kit');
  assert.deepEqual(p.content_ids,['ARTY-PRODUCT-12']);
  assert.equal(p.num_items,2);
  assert.equal(p.arty_event_id,'arty-purchase-ARTY-PAID-001');
  assert.doesNotMatch(JSON.stringify(p),/private@example.com|Customer Name|Private custom title/);
});
test('paid ticket purchase is distinct from a kit purchase',()=>{
  const p=buildPurchasePayload(order({total:113.98,items:[{id:'event-ticket-44',type:'event-ticket',eventId:44,qty:2,price:50}]}));
  assert.equal(p.arty_purchase_category,'event');
  assert.equal(p.arty_has_event,'yes');
  assert.equal(p.arty_has_kit,'no');
  assert.deepEqual(p.content_ids,['ARTY-EVENT-44']);
});
test('mixed cart reports one purchase containing both kinds of items',()=>{
  const p=buildPurchasePayload(order({total:91.75,items:[{type:'kit',id:'12',qty:1,price:19.98},{type:'event-ticket',eventId:44,id:'event-ticket-44',qty:1,price:50}]}));
  assert.equal(p.arty_purchase_category,'mixed');
  assert.equal(p.arty_has_event,'yes');
  assert.equal(p.arty_has_kit,'yes');
  assert.equal(p.items.length,2);
  assert.equal(p.num_items,2);
});
test('unpaid, test-mode, refunded and malformed orders are never conversions',()=>{
  for(const patch of [{paymentStatus:'pending'},{paymentStatus:'processing'},{paymentStatus:'refunded'},{paymentProvider:'manual'},{isTest:true},{paymentEnvironment:'test'},{refundStatus:'refunded'},{refundStatus:'refund_pending'},{total:0},{items:[]},{id:'bad order id'}]){
    assert.equal(buildPurchasePayload(order(patch)),null,JSON.stringify(patch));
  }
});
test('helper loads before marketing client and tracking requires a paid Stripe confirmation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  assert.ok(html.indexOf('marketing-purchase-core.js')>=0);
  assert.ok(html.indexOf('marketing-purchase-core.js')<html.indexOf('marketing-client.js'));
  const source=fs.readFileSync(path.join(__dirname,'..','public','marketing-client.js'),'utf8');
  assert.match(source,/path==='\/api\/stripe\/confirm-order'/);
  assert.match(source,/response\.clone\(\)\.json\(\)/);
  assert.match(source,/buildPurchasePayload\?\.\(order\)/);
  assert.match(source,/track\('purchase',payload\)/);
  assert.match(source,/if\(!metaReady&&!gaReady\)return false/);
});
