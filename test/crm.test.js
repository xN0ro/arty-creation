'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crm=require('../crm-core');

function fixture(){
  return {
    users:[{id:1,name:'Marie Tremblay',email:'Marie@Example.com',phone:'819-555-0001',createdAt:'2026-09-01T12:00:00Z',lastLoginAt:'2026-09-08T12:00:00Z'}],
    orders:[
      {id:'O1',userId:1,customer:{name:'Marie Tremblay',email:'marie@example.com'},paymentStatus:'paid',status:'livrée',total:100,createdAt:'2026-09-03T12:00:00Z'},
      {id:'O2',guestEmail:'guest@example.com',customer:{name:'Guest Client',email:'guest@example.com'},paymentStatus:'paid',status:'payée',total:75,createdAt:'2026-09-04T12:00:00Z'}
    ],
    eventRequests:[{id:10,reference:'EVT-X',name:'Marie Tremblay',email:'MARIE@example.com',eventType:'Birthday',quoteAmount:450,createdAt:'2026-09-05T12:00:00Z',marketingAttribution:{lastTouch:{source:'instagram',campaign:'fall-events'}},crm:{status:'quote_sent'}}],
    bookings:[],
    contactRequests:[{id:'c1',reference:'MSG-X',name:'New Lead',email:'lead@example.com',channel:'contact',createdAt:'2026-09-06T12:00:00Z',crm:{status:'new'}}],
    crmLeads:[],
    crmCustomers:{}
  };
}

test('customer index joins account, order and lead records by normalized email',()=>{
  const db=fixture(),customers=crm.buildCustomerIndex(db);
  const marie=customers.find(c=>c.email==='marie@example.com');
  assert.ok(marie);
  assert.equal(marie.hasAccount,true);
  assert.equal(marie.orderCount,1);
  assert.equal(marie.eventRequestCount,1);
  assert.equal(marie.lifetimeSpend,100);
  assert.equal(marie.lastLoginAt,'2026-09-08T12:00:00Z');
  assert.ok(customers.find(c=>c.email==='guest@example.com'));
});

test('manual leads join the same customer and preserve assignment fields',()=>{
  const db=fixture();
  const lead=crm.createManualLead(db,{name:'Marie Tremblay',email:'marie@example.com',title:'Corporate call',value:1200,owner:'sales@example.com',source:'phone'},'admin@example.com');
  assert.equal(lead.kind,'manual');
  assert.equal(lead.owner,'sales@example.com');
  assert.equal(lead.expectedValue,1200);
  const marie=crm.buildCustomerIndex(db).find(c=>c.email==='marie@example.com');
  assert.equal(marie.leadCount,2);
  assert.ok(marie.owners.includes('sales@example.com'));
});

test('lead stage changes keep an audit history and won value',()=>{
  const db=fixture();
  let lead=crm.updateLead(db,'event',10,{status:'follow_up',nextFollowUp:'2026-09-25',tags:['Corporate']},'sales@example.com');
  assert.equal(lead.status,'follow_up');
  assert.equal(db.eventRequests[0].crm.statusHistory.at(-1).status,'follow_up');
  lead=crm.updateLead(db,'event',10,{status:'won',finalValue:525},'sales@example.com');
  assert.equal(lead.status,'won');
  assert.equal(lead.finalValue,525);
  assert.ok(lead.wonAt);
  assert.equal(db.eventRequests[0].crm.tags[0],'Corporate');
});

test('customer notes, tags and marketing preferences remain separate from login credentials',()=>{
  const db=fixture();
  crm.updateCustomerTags(db,'marie@example.com',['VIP','Corporate']);
  const note=crm.addCustomerNote(db,'marie@example.com','Prefers Saturday events','admin@example.com');
  const prefs=crm.updateCustomerPreferences(db,'marie@example.com',{preferredLanguage:'en',marketingConsent:true,marketingConsentSource:'account'},'marie@example.com');
  assert.ok(note.id.startsWith('NOTE-'));
  assert.deepEqual(db.crmCustomers['marie@example.com'].tags,['VIP','Corporate']);
  assert.equal(prefs.preferredLanguage,'en');
  assert.equal(prefs.marketingConsent,true);
  assert.equal(db.users[0].password,undefined);
});

test('reporting separates open pipeline from won revenue and attributes the source',()=>{
  const db=fixture();
  crm.updateLead(db,'event',10,{status:'won',finalValue:500},'sales@example.com');
  crm.createManualLead(db,{name:'Phone Lead',email:'phone@example.com',title:'Private event',value:300,source:'phone'},'sales@example.com');
  const summary=crm.crmSummary(db),report=crm.crmReporting(db);
  assert.equal(summary.wonValue,500);
  assert.equal(summary.openPipelineValue,300);
  const instagram=report.sources.find(row=>row.source==='instagram');
  assert.equal(instagram.won,1);
  assert.equal(instagram.value,500);
});

test('lost reasons are stored only for lost leads',()=>{
  const db=fixture();
  let lead=crm.updateLead(db,'event',10,{status:'lost',lostReason:'price'},'sales@example.com');
  assert.equal(lead.lostReason,'price');
  lead=crm.updateLead(db,'event',10,{status:'contacted'},'sales@example.com');
  assert.equal(lead.lostReason,'');
});


test('event workflow automatically advances CRM without regressing later sales work',()=>{
  const db=fixture();
  let lead=crm.syncEventWorkflow(db,10,'request_created','system:event-request');
  assert.equal(lead.status,'quote_sent');
  lead=crm.syncEventWorkflow(db,10,'contacted','sales@example.com');
  assert.equal(lead.status,'quote_sent');
  lead=crm.syncEventWorkflow(db,10,'quote_sent','sales@example.com');
  assert.equal(lead.status,'quote_sent');
});

test('quote and payment workflow automatically moves qualified to quote sent to won',()=>{
  const db=fixture();
  db.eventRequests[0].crm={status:'new'};
  let lead=crm.syncEventWorkflow(db,10,'quote_drafted','sales@example.com');
  assert.equal(lead.status,'qualified');
  lead=crm.syncEventWorkflow(db,10,'quote_sent','sales@example.com');
  assert.equal(lead.status,'quote_sent');
  db.eventRequests[0].quotePaymentStatus='paid';
  db.eventRequests[0].paymentAmountReceived=525;
  lead=crm.syncEventWorkflow(db,10,'payment_succeeded','system:stripe-webhook');
  assert.equal(lead.status,'won');
  assert.equal(lead.finalValue,525);
  assert.ok(lead.wonAt);
});


test('fully refunded events leave Won, keep refund details, and no longer count as won revenue',()=>{
  const db=fixture(),request=db.eventRequests[0];
  request.paymentAmountReceived=450;
  request.quoteRefundedTotal=450;
  request.quoteNetPaid=0;
  request.quoteRefundStatus='refunded';
  request.quotePaymentStatus='refunded';
  request.quoteRefunds=[{amount:450,reason:'Customer cancelled',providerStatus:'succeeded',completedAt:'2026-09-19T16:00:00Z'}];
  crm.updateLead(db,'event',10,{status:'won',finalValue:450},'system:stripe');
  const lead=crm.updateLead(db,'event',10,{status:'refunded',finalValue:0},'system:refund');
  assert.equal(lead.status,'refunded');
  assert.equal(lead.finalValue,0);
  assert.equal(lead.value,0);
  assert.equal(lead.quoteRefundedTotal,450);
  assert.equal(lead.quoteRefundReason,'Customer cancelled');
  assert.equal(lead.quoteRefundedAt,'2026-09-19T16:00:00Z');
  assert.ok(lead.refundedAt);
  const summary=crm.crmSummary(db),report=crm.crmReporting(db);
  assert.equal(summary.wonValue,0);
  assert.equal(summary.byStatus.refunded,1);
  assert.equal(report.totals.refunded,1);
  const instagram=report.sources.find(row=>row.source==='instagram');
  assert.equal(instagram.won,0);
  assert.equal(instagram.value,0);
});

test('a paid event overrides a manually lost stage because successful payment is authoritative',()=>{
  const db=fixture();
  db.eventRequests[0].crm={status:'lost',lostReason:'price'};
  db.eventRequests[0].paymentAmountReceived=450;
  const lead=crm.syncEventWorkflow(db,10,'payment_succeeded','system:stripe-webhook');
  assert.equal(lead.status,'won');
  assert.equal(lead.lostReason,'');
});
