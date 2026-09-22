'use strict';
// Uses the existing isolated UI test dependency; never connects to production.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.ARTY_JSDOM_PATH||'./mobile-commerce/node_modules/jsdom');
const crm=require('../crm-core'),flow=require('../crm-workflow');
const today=flow.clock().slice(0,10);
function setup(){
  const db={users:[],orders:[],eventRequests:[],bookings:[],contactRequests:[],crmCustomers:{},supportRequests:[],crmLeads:[{id:'L1',name:"Alex O'Neil",email:'alex@example.test',title:'Team painting',createdAt:today+'T08:00:00Z',crm:{status:'new',owner:'owner@example.test'}},{id:'L2',name:'Bea',email:'bea@example.test',title:'Birthday',createdAt:today+'T08:00:00Z',crm:{status:'new',owner:''}}]};
  flow.createTask(db.crmLeads[0].crm,{dueAt:today+'T10:00',type:'call'},'owner@example.test');
  const dom=new JSDOM('<div id="page-admin"><div class="admin-tabs"></div><div class="admin-pro-container"><div id="adminDashboardPanel"></div></div></div>',{runScripts:'dangerously',url:'https://arty.example.test'}),w=dom.window;
  let lang='en',fail='';const requests=[],toasts=[];
  w.currentUser={role:'admin',email:'owner@example.test'};w.I18n={language:()=>lang};w.authH=()=>({});w.showToast=(message,type)=>toasts.push({message,type});w.confirm=()=>true;w.switchAdminTab=()=>{};w.open=()=>{throw Error('Unexpected external action')};
  w.artyFetch=async(url,options={})=>{
    requests.push({url,options});if(fail&&url.includes(fail))return {ok:false,json:async()=>({error:'Offline for this test'})};
    let result;const suffix=url.replace('/api/admin/crm',''),body=JSON.parse(options.body||'{}');
    if(suffix==='/summary')result=crm.crmSummary(db);
    else if(suffix==='/reporting')result=crm.crmReporting(db);
    else if(suffix==='/action-center')result=crm.crmActionCenter(db);
    else if(suffix==='/google-calendar/status')result={oauthConfigured:true,connected:false};
    else if(suffix==='/leads')result=crm.buildLeads(db);
    else if(suffix==='/team')result=[{email:'owner@example.test',name:'Owner'}];
    else if(suffix==='/customers')result=crm.buildCustomerIndex(db);
    else if(suffix.startsWith('/customers/'))result=crm.customerDetail(db,decodeURIComponent(suffix.split('/')[2]));
    else if(suffix.startsWith('/leads/manual/')){
      const parts=suffix.split('/'),item=db.crmLeads.find(l=>l.id===decodeURIComponent(parts[3])),meta=crm.crmMeta(item.crm);
      if(parts[4]==='activities')result=flow.logActivity(meta,body,'owner@example.test');
      else if(parts[4]==='tasks'&&parts[5])result=flow.updateTask(meta,decodeURIComponent(parts[5]),body,'owner@example.test');
      else result=flow.createTask(meta,body,'owner@example.test');
      if(body.nextTask)flow.createTask(meta,body.nextTask,'owner@example.test');meta.revision++;item.crm=meta;
      result={success:true,result,lead:crm.buildLeads(db).find(l=>l.id===item.id),calendarSync:{action:'not_configured'}};
    }else throw Error('Unexpected route '+url);
    return {ok:true,json:async()=>JSON.parse(JSON.stringify(result))};
  };
  const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'../public/crm-admin.css'),'utf8');w.document.head.appendChild(style);
  w.eval(fs.readFileSync(path.join(__dirname,'../public/crm-admin.js'),'utf8'));w.ARTYCRM.install();
  return {dom,w,db,requests,toasts,lang:v=>lang=v,fail:v=>fail=v,close:()=>dom.window.close()};
}
test('My day displays actionable tasks and switches to unassigned and missing-action queues',async()=>{
  const h=setup();try{await h.w.ARTYCRM.loadAll();await h.w.ARTYCRM.section('overview');assert(h.w.document.body.textContent.includes('Every client matters.'));assert.equal(h.w.document.querySelectorAll('.crm-day-row').length,1);h.w.ARTYCRM.dayQueue('unassigned');assert(h.w.document.querySelector('.crm-day-rows').textContent.includes('Bea'));h.w.ARTYCRM.dayQueue('no_next');h.w.ARTYCRM.dayOwner('team');assert.equal(h.w.document.querySelectorAll('.crm-day-row').length,1)}finally{h.close()}
});
test('both searches retain keyboard focus and multiple typed characters',async()=>{
  const h=setup();try{await h.w.ARTYCRM.loadAll();for(const section of ['leads','customers']){await h.w.ARTYCRM.section(section);for(const q of ['a','al','alex']){const input=h.w.document.querySelector('#adminCrm'+(section==='leads'?'Leads':'Customers')+'Panel input[type=search]');input.focus();input.value=q;input.dispatchEvent(new h.w.Event('input',{bubbles:true}));assert.equal(h.w.document.activeElement.value,q);assert.equal(h.w.document.activeElement.type,'search')}}}finally{h.close()}
});
test('list and board views preserve quick-filter preferences without persisting client data',async()=>{
  const h=setup();try{await h.w.ARTYCRM.loadAll();await h.w.ARTYCRM.section('leads');assert.equal(h.w.document.querySelectorAll('.crm-opportunity').length,2);h.w.ARTYCRM.leadView('board');assert(h.w.document.querySelector('.crm-kanban'));h.w.ARTYCRM.leadPreset('mine');assert.equal(h.w.document.querySelectorAll('.crm-kanban-card').length,1);assert.equal(h.w.localStorage.getItem('arty-crm-view-preset'),'mine');assert(!JSON.stringify(h.w.localStorage).includes('alex@example'))}finally{h.close()}
});
test('task composer saves another reminder and honestly reports disconnected Calendar',async()=>{
  const h=setup();try{await h.w.ARTYCRM.loadAll();await h.w.ARTYCRM.openTask('manual','L1');h.w.document.getElementById('taskDue').value='2026-10-01T09:00';h.w.document.getElementById('taskNote').value='Discuss guest count';await h.w.ARTYCRM.saveFollowUpAction();assert.equal(h.db.crmLeads[0].crm.tasks.length,2);assert(h.toasts.at(-1).message.includes('not connected'));assert(!h.toasts.at(-1).message.includes('synced'));assert(h.w.document.querySelector('.crm-task-section').textContent.includes('Discuss guest count'))}finally{h.close()}
});
test('completing a task records its outcome and schedules the next conversation',async()=>{
  const h=setup();try{await h.w.ARTYCRM.loadAll();const id=h.db.crmLeads[0].crm.tasks[0].id;await h.w.ARTYCRM.openTask('manual','L1',id);h.w.document.getElementById('taskOutcome').value='no_answer';h.w.document.getElementById('taskNote').value='Try Thursday';h.w.document.getElementById('taskNextDue').value='2026-10-01T09:00';await h.w.ARTYCRM.saveFollowUpAction();assert.equal(h.db.crmLeads[0].crm.tasks[0].status,'completed');assert.equal(h.db.crmLeads[0].crm.tasks[1].status,'open');assert(h.w.document.querySelector('.crm-history').textContent.includes('No answer'))}finally{h.close()}
});
test('logging an interaction sends only the activity API request, not an email',async()=>{
  const h=setup();try{await h.w.ARTYCRM.loadAll();h.w.ARTYCRM.openLeadActions('manual','L1');h.w.ARTYCRM.renderActivityForm();h.w.document.getElementById('activityType').value='email';h.w.document.getElementById('activityOutcome').value='email_sent';h.w.document.getElementById('activityNote').value='Sent availability yesterday';await h.w.ARTYCRM.saveActivity();assert(h.db.crmLeads[0].crm.activities.some(a=>a.note==='Sent availability yesterday'));assert.equal(h.requests.filter(r=>r.options.method==='POST').length,1);assert(h.requests.some(r=>r.url.endsWith('/activities')))}finally{h.close()}
});
test('customer profile renders safe text, net spending and permission-controlled support links',async()=>{
  const h=setup();try{h.db.crmLeads[0].name='<img src=x onerror=alert(1)>';h.db.supportRequests=[{id:'S1',subject:'Delivery question',customer:{email:'alex@example.test'},messages:[{at:'2026-09-20T10:00:00Z',body:'Please help'}]}];await h.w.ARTYCRM.loadAll();await h.w.ARTYCRM.section('customers');await h.w.ARTYCRM.openCustomer('alex%40example.test');const panel=h.w.document.getElementById('crmCustomerDetail');assert.equal(panel.querySelectorAll('img').length,0);assert(panel.textContent.includes('Net paid'));assert(panel.textContent.includes('Delivery question'));assert(panel.textContent.includes('Support conversation'))}finally{h.close()}
});
test('French and English render complete workspace and task controls',async()=>{
  const h=setup();try{h.lang('fr');await h.w.ARTYCRM.loadAll();await h.w.ARTYCRM.section('overview');assert(h.w.document.body.textContent.includes('Chaque client compte.'));await h.w.ARTYCRM.openTask('manual','L1');assert(h.w.document.getElementById('crmLeadEditorBody').textContent.includes('Planifier le prochain échange'));h.w.ARTYCRM.closeLeadEditor();h.lang('en');await h.w.ARTYCRM.section('overview');assert(h.w.document.body.textContent.includes('Every client matters.'))}finally{h.close()}
});
test('Escape closes the accessible dialog and returns focus',async()=>{
  const h=setup();try{await h.w.ARTYCRM.loadAll();await h.w.ARTYCRM.section('leads');const trigger=h.w.document.querySelector('.crm-opportunity');trigger.focus();h.w.ARTYCRM.openLeadActions('manual','L1');const modal=h.w.document.getElementById('crmLeadModal');assert.equal(modal.getAttribute('role'),'dialog');assert.equal(modal.hidden,false);h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(modal.hidden,true);assert.equal(h.w.document.activeElement,trigger)}finally{h.close()}
});
test('failed loads show a retry state instead of misleading empty business data',async()=>{
  const h=setup();try{h.fail('/leads');await h.w.ARTYCRM.section('leads');assert(h.w.document.querySelector('[role=alert]').textContent.includes('Offline for this test'));assert.equal(h.w.document.querySelectorAll('.crm-opportunity').length,0)}finally{h.close()}
});
