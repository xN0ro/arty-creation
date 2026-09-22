'use strict';
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-crm-production-')),dbPath=path.join(temp,'db.json'),marker=path.join(temp,'sync-waiting');
const stripeControl=path.join(temp,'stripe.json'),stripeMarker=path.join(temp,'stripe-waiting');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
let child,base;
function fixture(){return {
  adminEmails:['owner@example.test'],users:[{id:1,role:'admin',email:'owner@example.test'},{id:2,email:'sales@example.test'},{id:3,email:'other@example.test'}],
  sessions:[{userId:1,email:'owner@example.test',tokenHash:hash('owner')},{userId:2,email:'sales@example.test',tokenHash:hash('sales')},{userId:3,email:'other@example.test',tokenHash:hash('other')}],
  adminAccessGrants:[{email:'sales@example.test',active:true,acceptedAt:'2026-09-01',permissions:['crm_dashboard','leads','customers']},{email:'other@example.test',active:true,acceptedAt:'2026-09-01',permissions:['support']}],
  crmLeads:[{id:'L1',name:'Client One',email:'one@example.test',title:'Event one',createdAt:'2026-09-01T12:00:00Z',crm:{status:'new',owner:'sales@example.test'}},{id:'L2',name:'Client Two',email:'two@example.test',title:'Event two',createdAt:'2026-09-01T12:00:00Z',crm:{status:'new',owner:'owner@example.test'}}],
  orders:[{id:'O1',guestEmail:'one@example.test',total:100,paymentStatus:'paid',status:'payée'},{id:'O2',guestEmail:'two@example.test',total:900,paymentStatus:'paid',status:'payée'}],
  supportRequests:[{id:'S1',customer:{email:'one@example.test'},subject:'Private support',messages:[{body:'Support details',at:'2026-09-20T10:00:00Z'}]}],
  crmCustomers:{},contactRequests:[],eventRequests:[],bookings:[],kits:[]
}}
const read=()=>JSON.parse(fs.readFileSync(dbPath,'utf8'));
async function request(route,{method='GET',body,token='owner'}={}){
  const r=await fetch(base+'/api/admin/crm'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};
}
before(async()=>{
  fs.writeFileSync(dbPath,JSON.stringify(fixture()));
  const preload=path.join(temp,'calendar-stub.cjs');
  fs.writeFileSync(preload,`const fs=require('fs');const google=require(${JSON.stringify(path.resolve(__dirname,'../google-calendar.js'))});google.syncFollowUp=async(lead,meta)=>{if(lead.title==='Slow sync'){fs.writeFileSync(${JSON.stringify(marker)},'waiting');await new Promise(r=>setTimeout(r,200));}if(lead.title==='Calendar offline')return {action:'not_configured'};if(lead.title==='Calendar failure')throw Error('Temporary calendar problem');return {action:lead.nextFollowUp?'updated':'deleted',eventId:lead.nextFollowUp?(meta.eventId||'test-'+lead.id):'',htmlLink:'https://calendar.google.com/'};};`);
  // Block every external HTTPS request; Stripe responses are synthetic and delayed.
  fs.appendFileSync(preload,`const {EventEmitter}=require('events');require('https').request=(options,callback)=>{if(options.hostname!=='api.stripe.com')throw Error('External HTTPS blocked in CRM test');const req=new EventEmitter();req.write=()=>{};req.end=()=>{const payload=JSON.parse(fs.readFileSync(${JSON.stringify(stripeControl)},'utf8'));fs.writeFileSync(${JSON.stringify(stripeMarker)},'waiting');setTimeout(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',JSON.stringify(payload));res.emit('end');},200)};return req;};`);
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['--require',preload,'server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),ARTY_DB_PATH:dbPath,ARTY_DATA_DIR:temp,ARTY_EMAIL_MODE:'log',RESEND_API_KEY:'',PAYMENT_PROVIDER:'stripe',STRIPE_SECRET_KEY:'sk_test_placeholder',STRIPE_PUBLISHABLE_KEY:'pk_test_placeholder'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error(output)),10000);child.stdout.on('data',d=>{output+=d;if(output.includes('Arty! server →')){clearTimeout(timer);resolve();}});child.stderr.on('data',d=>output+=d);child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exit '+code+' '+output));});});
});
beforeEach(()=>{fs.writeFileSync(dbPath,JSON.stringify(fixture()));for(const file of [marker,stripeMarker,stripeControl])if(fs.existsSync(file))fs.unlinkSync(file)});
after(async()=>{if(child&&child.exitCode===null){const closed=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await closed}fs.rmSync(temp,{recursive:true,force:true})});

test('real entry point protects CRM reads and task mutations with permissions and assignment',async()=>{
  assert.equal((await request('/leads',{token:''})).status,401);
  assert.equal((await request('/leads',{token:'other'})).status,403);
  assert.equal((await request('/leads',{token:'sales'})).data.length,1);
  assert.equal((await request('/leads/manual/L2/tasks',{method:'POST',token:'sales',body:{dueAt:'2026-10-02T10:00'}})).status,403);
  assert.equal((await request('/leads/manual/L1/tasks',{method:'POST',token:'sales',body:{dueAt:'2026-10-02T10:00'}})).status,200);
});
test('a follow-up saves before Calendar waits and a concurrent note survives its response',async()=>{
  const db=read();db.crmLeads[0].title='Slow sync';fs.writeFileSync(dbPath,JSON.stringify(db));
  const pending=request('/leads/manual/L1/tasks',{method:'POST',body:{dueAt:'2026-10-02T10:00',requestKey:'slow'}});
  for(let i=0;i<100&&!fs.existsSync(marker);i++)await new Promise(r=>setTimeout(r,5));assert(fs.existsSync(marker));
  assert.equal(read().crmLeads[0].crm.tasks.length,1);
  assert.equal((await request('/customers/one%40example.test/notes',{method:'POST',body:{note:'Preserve this concurrent note'}})).status,200);
  assert.equal((await pending).status,200);assert.equal(read().crmCustomers['one@example.test'].notes[0].text,'Preserve this concurrent note');
});
test('complete a task and schedule another without losing the result or duplicating a retry',async()=>{
  const created=await request('/leads/manual/L1/tasks',{method:'POST',body:{dueAt:'2026-10-02T10:00',requestKey:'one'}});const task=created.data.result;
  await request('/leads/manual/L1/tasks',{method:'POST',body:{dueAt:'2026-10-02T10:00',requestKey:'one'}});
  const done=await request('/leads/manual/L1/tasks/'+task.id,{method:'PATCH',body:{action:'complete',outcome:'no_answer',note:'Call next week',nextTask:{dueAt:'2026-10-09T10:00',type:'call'}}});
  assert.equal(done.status,200);assert.equal(done.data.lead.tasks.length,2);assert.equal(done.data.lead.tasks[0].outcome,'no_answer');assert.equal(done.data.lead.tasks[0].calendar.eventId,'');assert.equal(done.data.lead.nextFollowUp,'2026-10-09T10:00');
  await request('/leads/manual/L1/tasks/'+task.id,{method:'PATCH',body:{action:'complete',outcome:'reached',nextTask:{dueAt:'2026-10-09T10:00'}}});assert.equal(read().crmLeads[0].crm.tasks.length,2);
});
test('invalid follow-up, stale revision and invalid result cannot overwrite saved data',async()=>{
  assert.equal((await request('/leads/manual/L1/tasks',{method:'POST',body:{dueAt:'2026-02-30T10:00'}})).status,400);
  const task=(await request('/leads/manual/L1/tasks',{method:'POST',body:{dueAt:'2026-10-02T10:00'}})).data.result;
  assert.equal((await request('/leads/manual/L1/tasks/'+task.id,{method:'PATCH',body:{action:'complete',outcome:'fake'}})).status,400);
  assert.equal((await request('/leads/manual/L1',{method:'PATCH',body:{expectedRevision:0,adminNote:'Stale'}})).status,409);
  assert.equal(read().crmLeads[0].crm.tasks[0].status,'open');
});
test('Calendar outages are reported honestly while CRM tasks stay saved',async()=>{
  for(const [title,expected] of [['Calendar offline','not_configured'],['Calendar failure','error']]){
    const db=read();db.crmLeads[0].title=title;fs.writeFileSync(dbPath,JSON.stringify(db));
    const result=await request('/leads/manual/L1/tasks',{method:'POST',body:{dueAt:'2026-10-02T10:00'}});assert.equal(result.status,200);assert.equal(result.data.calendarSync.action,expected);
  }
  assert.equal(read().crmLeads[0].crm.tasks.length,2);
});
test('staff reports exclude unassigned customer purchases and support content respects permission',async()=>{
  const report=await request('/reporting',{token:'sales'});assert.equal(report.status,200);
  const summary=await request('/summary',{token:'sales'});assert.equal(summary.data.customers,1);
  const restricted=await request('/customers/one%40example.test',{token:'sales'});assert.equal(restricted.data.support.length,0);assert.equal(restricted.data.summary.lifetimeSpend,100);assert(!restricted.data.timeline.some(x=>x.type==='support'));
  const owner=await request('/customers/one%40example.test');assert.equal(owner.data.support.length,1);
});
test('manual interactions appear in client history and do not claim to send an email',async()=>{
  const logged=await request('/leads/manual/L1/activities',{method:'POST',token:'sales',body:{type:'email',outcome:'email_sent',note:'Customer asked for October',requestKey:'interaction-1'}});assert.equal(logged.status,200);
  const detail=(await request('/customers/one%40example.test')).data;assert(detail.timeline.some(x=>x.type==='activity'&&x.detail==='Customer asked for October'));assert.equal(logged.data.calendarSync.action,'none');
});
test('new styles and scripts are served by the actual production wrapper',async()=>{
  const page=await (await fetch(base)).text();assert(page.includes('crm-admin.css?v=20260922-workspace-1'));assert(page.includes('crm-admin.js?v=20260922-workspace-1'));
  assert.equal((await fetch(base+'/crm-admin.css')).status,200);
});

function seedEvent(status='requires_payment_method',reference=''){
  const db=read();db.eventRequests.push({id:'E1',reference:'TEST-E1',name:'Client One',email:'one@example.test',eventType:'Test event',locale:'en',quoteAmount:100,quotePaymentStatus:'pending',paymentTokenHash:hash('test-quote'),paymentReference:reference,crm:{status:'quote_sent',owner:'owner@example.test',nextFollowUp:'2026-10-02T10:00',calendar:{eventId:'test-reminder'}}});fs.writeFileSync(dbPath,JSON.stringify(db));
  fs.writeFileSync(stripeControl,JSON.stringify({id:'pi_test',amount:10000,amount_received:status==='succeeded'?10000:0,currency:'cad',status,client_secret:'test-secret',metadata:{eventRequestId:'E1'}}));
}
async function waitForStripe(){for(let i=0;i<100&&!fs.existsSync(stripeMarker);i++)await new Promise(r=>setTimeout(r,5));assert(fs.existsSync(stripeMarker));}
function quoteRequest(action,body={}){return fetch(base+'/api/event-quotes/test-quote/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
test('payment confirmation preserves concurrent CRM notes and cancels the old sales reminder',async()=>{
  seedEvent('succeeded','pi_test');const pending=quoteRequest('confirm',{paymentIntentId:'pi_test'});await waitForStripe();
  assert.equal((await request('/customers/one%40example.test/notes',{method:'POST',body:{note:'Keep during payment'}})).status,200);
  const response=await pending;assert.equal(response.status,200);assert.equal((await response.json()).paid,true);
  const db=read();assert.equal(db.crmCustomers['one@example.test'].notes[0].text,'Keep during payment');assert.equal(db.eventRequests[0].crm.status,'won');assert.equal(db.eventRequests[0].crm.tasks[0].status,'cancelled');assert.equal(db.eventRequests[0].crm.tasks[0].calendar.eventId,'');
});
test('payment preparation cannot downgrade a concurrent successful payment',async()=>{
  seedEvent();const pending=quoteRequest('payment');await waitForStripe();const db=read();db.eventRequests[0].quotePaymentStatus='paid';db.eventRequests[0].paymentReference='pi_already_paid';fs.writeFileSync(dbPath,JSON.stringify(db));
  const response=await pending;assert.equal(response.status,200);assert.equal((await response.json()).paid,true);assert.equal(read().eventRequests[0].paymentReference,'pi_already_paid');
});
test('a quote changed during payment preparation never returns a stale payment secret',async()=>{
  seedEvent();const pending=quoteRequest('payment');await waitForStripe();const db=read();db.eventRequests[0].quoteAmount=200;fs.writeFileSync(dbPath,JSON.stringify(db));
  const response=await pending;assert.equal(response.status,409);assert.equal((await response.json()).clientSecret,undefined);assert.equal(read().eventRequests[0].paymentReference,'');
});
