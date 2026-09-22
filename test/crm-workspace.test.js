'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crm=require('../crm-core');
const flow=require('../crm-workflow');
const fixture=()=>({users:[],orders:[],eventRequests:[],contactRequests:[],crmLeads:[{id:'L1',name:'Client',email:'client@example.test',title:'Group event',createdAt:'2026-09-01T10:00:00Z',crm:{status:'new',owner:'sales@example.test',statusHistory:[]}}],crmCustomers:{}});

test('legacy follow-ups retain their calendar ID and become editable tasks',()=>{
  const db=fixture();db.crmLeads[0].crm.nextFollowUp='2026-09-28T10:00';db.crmLeads[0].crm.calendar={eventId:'existing'};
  const before=crm.buildLeads(db)[0];assert.equal(before.tasks[0].calendar.eventId,'existing');
  const after=crm.updateLead(db,'manual','L1',{nextFollowUp:'2026-09-29T11:00'},'staff');
  assert.equal(after.tasks.length,1);assert.equal(after.tasks[0].calendar.eventId,'existing');assert.equal(after.activities[0].type,'task_rescheduled');
});
test('multiple tasks complete independently and an unchanged legacy form cannot duplicate them',()=>{
  const db=fixture(),meta=db.crmLeads[0].crm;
  const first=flow.createTask(meta,{dueAt:'2026-09-24T09:00',type:'call'},'staff');
  flow.createTask(meta,{dueAt:'2026-09-26T11:00',type:'email'},'staff');
  flow.updateTask(meta,first.id,{action:'complete',outcome:'no_answer',note:'Try again Friday'},'staff');
  const l=crm.updateLead(db,'manual','L1',{nextFollowUp:meta.nextFollowUp},'staff');
  assert.equal(l.tasks.length,2);assert.equal(l.tasks[0].status,'completed');assert.equal(l.nextFollowUp,'2026-09-26T11:00');assert.equal(l.activities.at(-1).outcome,'no_answer');
});
test('retry keys keep task creation and logged interactions idempotent',()=>{
  const meta={};const a=flow.createTask(meta,{dueAt:'2026-09-24T09:00',requestKey:'retry'},'staff');
  const b=flow.createTask(meta,{dueAt:'2026-09-24T09:00',requestKey:'retry'},'staff');assert.equal(a.id,b.id);assert.equal(meta.tasks.length,1);
  flow.logActivity(meta,{type:'email',outcome:'email_sent',requestKey:'message'},'staff');flow.logActivity(meta,{type:'email',outcome:'email_sent',requestKey:'message'},'staff');assert.equal(meta.activities.filter(a=>a.type==='interaction').length,1);
});
test('task results are immutable on repeated completion and rescheduling preserves history',()=>{
  const meta={};const t=flow.createTask(meta,{dueAt:'2026-09-24T09:00'},'staff');
  flow.updateTask(meta,t.id,{dueAt:'2026-09-25T09:00',note:'Moved by customer',type:'meeting',priority:'high'},'staff');
  flow.updateTask(meta,t.id,{action:'complete',outcome:'meeting_done'},'staff');
  flow.updateTask(meta,t.id,{action:'complete',outcome:'no_answer'},'staff');
  const saved=meta.tasks.find(x=>x.id===t.id);assert.equal(saved.outcome,'meeting_done');assert.equal(saved.priority,'high');assert.equal(saved.type,'meeting');assert.equal(meta.activities.length,3);
});
test('invalid dates and outcomes never mutate task history',()=>{
  const meta={};assert.throws(()=>flow.createTask(meta,{dueAt:'2026-02-30T10:00'},'staff'));
  const t=flow.createTask(meta,{dueAt:'2026-09-24T09:00'},'staff'),before=JSON.stringify(meta);
  assert.throws(()=>flow.updateTask(meta,t.id,{action:'complete',outcome:'not-real'},'staff'));assert.equal(JSON.stringify(meta),before);
});
test('closing a sale cancels old reminders, while a later customer check-in can be scheduled',()=>{
  const db=fixture();flow.createTask(db.crmLeads[0].crm,{dueAt:'2026-09-24T09:00'},'staff');
  const closed=crm.updateLead(db,'manual','L1',{status:'won',finalValue:1200},'staff');assert.equal(closed.tasks[0].status,'cancelled');assert.equal(closed.nextFollowUp,'');
  flow.createTask(db.crmLeads[0].crm,{dueAt:'2026-10-02T09:00'},'staff');assert.equal(crm.crmActionCenter(db).tasks.length,1);
});
test('stale lead edits are rejected instead of overwriting a newer change',()=>{
  const db=fixture();crm.updateLead(db,'manual','L1',{adminNote:'Keep this note',expectedRevision:0},'staff');
  assert.throws(()=>crm.updateLead(db,'manual','L1',{adminNote:'Old edit',expectedRevision:0},'staff'),e=>e.status===409);assert.equal(db.crmLeads[0].crm.adminNote,'Keep this note');
});
test('private event receipts and partial refunds contribute to net client spending',()=>{
  const db=fixture();db.orders=[{id:'O1',guestEmail:'client@example.test',paymentStatus:'paid',status:'payée',total:100,refundedTotal:40}];
  db.eventRequests=[{id:1,email:'client@example.test',quoteAmount:1200,paymentAmountReceived:1200,quoteRefundedTotal:200,quotePaymentStatus:'paid',crm:{status:'won'}}];
  const c=crm.buildCustomerIndex(db)[0];assert.equal(c.orderSpend,60);assert.equal(c.eventSpend,1000);assert.equal(c.lifetimeSpend,1060);assert.equal(c.averageOrder,60);
});
test('a lost lead without quote evidence never counts as a quote',()=>{
  const db=fixture();crm.updateLead(db,'manual','L1',{status:'lost',lostReason:'price'},'staff');assert.equal(crm.crmReporting(db).rates.leadToQuote,0);
  db.crmLeads[0].crm.statusHistory.unshift({status:'quote_sent',at:'2026-09-01T10:00:00Z'});assert.equal(crm.crmReporting(db).rates.leadToQuote,100);
});
test('calendar day boundaries follow Toronto rather than UTC',()=>{
  assert.equal(flow.clock(new Date('2026-09-23T01:30:00Z')),'2026-09-22T21:30');
  assert.equal(flow.clock(new Date('2026-12-23T01:30:00Z')),'2026-12-22T20:30');
});
test('daily queues include all tasks, unassigned opportunities and missing next actions',()=>{
  const db=fixture(),day=flow.clock().slice(0,10);db.crmLeads[0].crm.owner='';
  assert.equal(crm.crmActionCenter(db).queues.no_next,1);assert.equal(crm.crmActionCenter(db).queues.unassigned,1);
  for(let i=0;i<25;i++)flow.createTask(db.crmLeads[0].crm,{dueAt:day+'T10:00'},'staff');
  assert.equal(crm.crmActionCenter(db).queues.today,25);assert.equal(crm.crmActionCenter(db).queues.no_next,0);assert.equal(crm.crmSummary(db).followUpsToday,25);
});
test('customer timeline joins task outcomes and support conversations without granting support access',()=>{
  const db=fixture();flow.logActivity(db.crmLeads[0].crm,{type:'call',outcome:'reached',note:'Friday works'},'staff');db.supportRequests=[{id:'S1',customer:{email:'client@example.test'},subject:'Question',messages:[{at:'2026-09-20T10:00:00Z',body:'Support message'}]}];
  const full=crm.customerDetail(db,'client@example.test');assert(full.timeline.some(x=>x.type==='support'));assert(full.timeline.some(x=>x.type==='activity'));
  const limited=crm.customerDetail(db,'client@example.test',{includeSupport:false});assert.equal(limited.support.length,0);assert(!limited.timeline.some(x=>x.type==='support'));
});
