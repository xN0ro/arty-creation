'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crm=require('../crm-core');
function db(){
 return {users:[{id:1,email:'supportonly@example.test',name:'Support only'}],
 orders:[],bookings:[],crmCustomers:{},eventRequests:[{id:5,name:'Event Client',email:'sales@example.test',eventType:'Corporate',createdAt:'2026-11-12T12:00:00Z',crm:{status:'new'}}],
 crmLeads:[{id:'L1',name:'Sales Lead',email:'lead@example.test',title:'Workshop',createdAt:'2026-11-12T12:00:00Z',crm:{status:'new'}}],
 contactRequests:[{id:'C1',name:'Support only',email:'supportonly@example.test',channel:'contact',createdAt:'2026-11-12T12:01:00Z',subject:'Tech support'}],
 supportRequests:[{id:'S1',customer:{email:'supportonly@example.test'},subject:'Technical problem',createdAt:'2026-11-12T12:01:00Z',messages:[{at:'2026-11-12T12:01:00Z',body:'Need help'}]}]};
}
test('technical support and contact submissions never become sales leads',()=>{
 const data=db(),leads=crm.buildLeads(data),customers=crm.buildCustomerIndex(data);
 assert.deepEqual(leads.map(l=>l.key).sort(),['event:5','manual:L1']);
 assert(!customers.some(c=>c.email==='supportonly@example.test'));
 assert.equal(data.supportRequests.length,1);
 assert.equal(data.contactRequests.length,1);
});
test('CRM customer detail does not leak the customer service inbox',()=>{
 const data=db();data.supportRequests[0].customer.email='sales@example.test';
 const detail=crm.customerDetail(data,'sales@example.test');
 assert.equal(detail.support.length,0);
 assert(!detail.timeline.some(x=>x.type==='support'||x.type==='contact'));
});
test('archiving a sales lead hides only CRM views and preserves source transactions',()=>{
 const data=db();data.crmHiddenLeads=[{key:'event:5',hiddenAt:'2026-11-12T13:00:00Z'},{key:'manual:L1',hiddenAt:'2026-11-12T13:01:00Z'}];
 assert.equal(crm.buildLeads(data).length,0);
 assert.equal(crm.crmSummary(data).leads,0);
 assert.equal(data.eventRequests.length,1);
 assert.equal(data.crmLeads.length,1);
 assert.equal(data.supportRequests.length,1);
 data.crmHiddenLeads=[];
 assert.equal(crm.buildLeads(data).length,2);
});
