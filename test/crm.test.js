'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crm=require('../crm-core');

function fixture(){
  return {
    users:[{id:1,name:'Marie Tremblay',email:'Marie@Example.com',phone:'819-555-0001',createdAt:'2026-09-01T12:00:00Z'}],
    orders:[
      {id:'O1',userId:1,customer:{name:'Marie Tremblay',email:'marie@example.com'},paymentStatus:'paid',status:'livrée',total:100,createdAt:'2026-09-03T12:00:00Z'},
      {id:'O2',guestEmail:'guest@example.com',customer:{name:'Guest Client',email:'guest@example.com'},paymentStatus:'paid',status:'payée',total:75,createdAt:'2026-09-04T12:00:00Z'}
    ],
    eventRequests:[{id:10,reference:'EVT-X',name:'Marie Tremblay',email:'MARIE@example.com',eventType:'Birthday',quoteAmount:450,createdAt:'2026-09-05T12:00:00Z',crm:{status:'quote_sent'}}],
    bookings:[],
    contactRequests:[{id:'c1',reference:'MSG-X',name:'New Lead',email:'lead@example.com',channel:'contact',createdAt:'2026-09-06T12:00:00Z',crm:{status:'new'}}],
    crmCustomers:{}
  };
}

test('customer index joins records by normalized email',()=>{
  const db=fixture(),customers=crm.buildCustomerIndex(db);
  const marie=customers.find(c=>c.email==='marie@example.com');
  assert.ok(marie);
  assert.equal(marie.hasAccount,true);
  assert.equal(marie.orderCount,1);
  assert.equal(marie.eventRequestCount,1);
  assert.equal(marie.lifetimeSpend,100);
  assert.ok(customers.find(c=>c.email==='guest@example.com'));
});

test('lead pipeline includes event and eligible contact inquiries',()=>{
  const db=fixture(),leads=crm.buildLeads(db);
  assert.equal(leads.length,2);
  assert.equal(leads.find(l=>l.kind==='event').status,'quote_sent');
  assert.equal(leads.find(l=>l.kind==='contact').status,'new');
});

test('lead updates and customer notes persist in supplied db',()=>{
  const db=fixture();
  const lead=crm.updateLead(db,'event',10,{status:'follow_up',nextFollowUp:'2026-09-25',tags:['Corporate']},'admin@example.com');
  assert.equal(lead.status,'follow_up');
  assert.equal(db.eventRequests[0].crm.tags[0],'Corporate');
  const note=crm.addCustomerNote(db,'marie@example.com','Prefers Saturday events','admin@example.com');
  assert.ok(note.id.startsWith('NOTE-'));
  assert.equal(db.crmCustomers['marie@example.com'].notes.length,1);
});

test('summary calculates open pipeline value and won value separately',()=>{
  const db=fixture();
  db.eventRequests.push({id:11,name:'Won',email:'won@example.com',eventType:'Corporate',quoteAmount:900,createdAt:'2026-09-07T12:00:00Z',crm:{status:'won'}});
  const summary=crm.crmSummary(db);
  assert.equal(summary.openPipelineValue,450);
  assert.equal(summary.wonValue,900);
  assert.equal(summary.byStatus.won,1);
});