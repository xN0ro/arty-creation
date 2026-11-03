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

test('cart quantity handles configured kit IDs, normal IDs, and ticket IDs without collisions',()=>{
  const {cartQuantityForKit,cartQuantityForEvent}=require('../public/marketing-purchase-core');
  const cart=[
    {id:'kit-4-xl-easel',type:'kit',customData:{kitId:4,sizeId:'xl'},qty:2},
    {id:'kit-40-large',type:'kit',customData:{kitId:40},qty:5},
    {id:'4',type:'kit',qty:1},
    {id:'event-ticket-4',type:'event-ticket',customData:{eventId:4},qty:3},
    {id:'event-ticket-40',type:'event-ticket',customData:{eventId:40},qty:1}
  ];
  assert.equal(cartQuantityForKit(cart,4),3);
  assert.equal(cartQuantityForKit(cart,40),5);
  assert.equal(cartQuantityForEvent(cart,4),3);
  assert.equal(cartQuantityForEvent(cart,40),1);
  assert.equal(cartQuantityForKit([],4),0);
});
test('configured kit purchase uses catalog content ID for reporting',()=>{
  const p=buildPurchasePayload(order({items:[{id:'kit-4-xl-easel',kitId:4,type:'kit',qty:1,price:24.98}]}));
  assert.deepEqual(p.content_ids,['ARTY-PRODUCT-4']);
  assert.equal(p.content_category,'kit');
});
test('only one marketing client is included and admin fix runs after it',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const loader=fs.readFileSync(path.join(__dirname,'..','public','i18n-admin.js'),'utf8');
  assert.equal((html.match(/src="marketing-client\.js/g)||[]).length,1);
  assert.doesNotMatch(loader,/marketing-client\.js/);
  assert.doesNotMatch(loader,/marketing-admin-fix\.js/);
  assert.ok(html.indexOf('marketing-client.js')<html.indexOf('marketing-admin-fix.js'));
  const client=fs.readFileSync(path.join(__dirname,'..','public','marketing-client.js'),'utf8');
  assert.match(client,/cartQuantityForKit\?\.\(cart,id\)/);
  assert.match(client,/cartQuantityForEvent\?\.\(cart,eid\)/);
});
