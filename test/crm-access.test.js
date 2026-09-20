'use strict';
const {test,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const bcrypt=require('bcryptjs');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-crm-access-'));
process.env.ARTY_DATA_DIR=temp;
process.env.RESEND_API_KEY='';
const server=require('../server');
const password='test-password';
const hash=bcrypt.hashSync(password,10);
const listener=server.app.listen(0,'127.0.0.1');
const ready=new Promise(resolve=>listener.once('listening',resolve));

beforeEach(()=>server.writeDB({
  adminEmails:['owner@example.test'],
  users:[
    {id:1,name:'Owner',email:'owner@example.test',password:hash,provider:'local',role:'admin',emailVerifiedAt:'2026-01-01T00:00:00Z'},
    {id:2,name:'Sales',email:'sales@example.test',password:hash,provider:'local',role:'staff',emailVerifiedAt:'2026-01-01T00:00:00Z'},
    {id:3,name:'Customer',email:'customer@example.test',password:hash,provider:'local',role:'user',emailVerifiedAt:'2026-01-01T00:00:00Z'},
    {id:4,name:'Manager',email:'manager@example.test',password:hash,provider:'local',role:'staff',emailVerifiedAt:'2026-01-01T00:00:00Z'},
    {id:5,name:'Other Customer',email:'other@example.test',password:hash,provider:'local',role:'user',emailVerifiedAt:'2026-01-01T00:00:00Z'}
  ],
  adminAccessGrants:[
    {id:'STAFF-SALES',email:'sales@example.test',name:'Sales',permissions:['crm_dashboard','customers','leads'],active:true,emailVerifiedAt:'2026-01-01T00:00:00Z',acceptedAt:'2026-01-01T00:00:00Z'},
    {id:'STAFF-MANAGER',email:'manager@example.test',name:'Manager',permissions:['crm_dashboard','customers','leads','crm_manager'],active:true,emailVerifiedAt:'2026-01-01T00:00:00Z',acceptedAt:'2026-01-01T00:00:00Z'}
  ],
  sessions:[],passwordResetTokens:[],orders:[],eventRequests:[
    {id:101,reference:'EVT-OWN',name:'Customer',email:'customer@example.test',phone:'555-0101',eventType:'Corporate',status:'nouvelle',quoteAmount:0,createdAt:'2026-09-18T12:00:00Z',crm:{status:'new',owner:'sales@example.test',tags:[],statusHistory:[]}},
    {id:102,reference:'EVT-OTHER',name:'Other Customer',email:'other@example.test',phone:'555-0102',eventType:'Birthday',status:'nouvelle',quoteAmount:0,createdAt:'2026-09-18T13:00:00Z',crm:{status:'new',owner:'manager@example.test',tags:[],statusHistory:[]}}
  ],bookings:[],contactRequests:[],crmLeads:[],crmCustomers:{},kits:[]
}));
after(async()=>{await new Promise(resolve=>listener.close(resolve));fs.rmSync(temp,{recursive:true,force:true});});

async function request(route,{method='GET',body,token}={}){
  await ready;
  const response=await fetch(`http://127.0.0.1:${listener.address().port}/api${route}`,{
    method,
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return {status:response.status,data:await response.json().catch(()=>({}))};
}
async function login(email){return request('/users/login',{method:'POST',body:{email,password}})}

test('sales preset can use CRM pages but cannot perform account security actions',async()=>{
  const sales=await login('sales@example.test');
  assert.equal(sales.status,200);
  assert.equal(sales.data.user.role,'staff');
  assert.deepEqual(new Set(sales.data.user.permissions),new Set(['crm_dashboard','customers','leads']));
  assert.equal((await request('/admin/crm/summary',{token:sales.data.token})).status,200);
  assert.equal((await request('/admin/crm/customers',{token:sales.data.token})).status,200);
  assert.equal((await request('/admin/crm/leads',{token:sales.data.token})).status,200);
  assert.equal((await request('/admin/crm/customers/customer%40example.test/disable',{method:'POST',body:{disabled:true},token:sales.data.token})).status,403);
});

test('sales staff only receive assigned CRM leads and customers',async()=>{
  const sales=await login('sales@example.test');
  const leads=await request('/admin/crm/leads',{token:sales.data.token});
  const customers=await request('/admin/crm/customers',{token:sales.data.token});
  assert.equal(leads.status,200);
  assert.equal(leads.data.length,1);
  assert.equal(leads.data[0].email,'customer@example.test');
  assert.equal(customers.status,200);
  assert.equal(customers.data.length,1);
  assert.equal(customers.data[0].email,'customer@example.test');
  assert.equal((await request('/admin/crm/customers/other%40example.test',{token:sales.data.token})).status,403);
});

test('sales staff can convert their manual lead to a quote-ready event without a duplicate pipeline card',async()=>{
  const db=server.readDB();
  db.crmLeads.push({
    id:'LEAD-PHONE-1',reference:'LEAD-PHONE-1',name:'Phone Lead',email:'phone@example.test',phone:'555-0199',title:'Private event',
    eventType:'Private event',preferredDate:'2026-10-10',value:600,source:'phone',campaign:'',medium:'',message:'Interested in a private ARTY event.',
    createdAt:'2026-09-18T14:00:00Z',updatedAt:'2026-09-18T14:00:00Z',
    crm:{status:'contacted',owner:'sales@example.test',nextFollowUp:'',tags:[],adminNote:'',statusHistory:[]}
  });
  server.writeDB(db);
  const sales=await login('sales@example.test');
  const converted=await request('/admin/crm/leads/manual/LEAD-PHONE-1/convert-event',{method:'POST',body:{eventType:'Private event',guests:12,preferredDate:'2026-10-10'},token:sales.data.token});
  assert.equal(converted.status,200);
  assert.equal(converted.data.lead.kind,'event');
  assert.equal(converted.data.lead.email,'phone@example.test');
  const leads=await request('/admin/crm/leads',{token:sales.data.token});
  assert.equal(leads.status,200);
  assert.equal(leads.data.filter(item=>item.email==='phone@example.test').length,1);
  assert.equal(leads.data.find(item=>item.email==='phone@example.test').kind,'event');
});

test('assigned sales staff can reach secure quote creation but cannot quote another rep lead',async()=>{
  const sales=await login('sales@example.test');
  const own=await request('/admin/event-requests/101/payment-link',{method:'POST',body:{quoteAmount:250,quoteDescription:'Corporate ARTY event'},token:sales.data.token});
  assert.equal(own.status,503);
  const other=await request('/admin/event-requests/102/payment-link',{method:'POST',body:{quoteAmount:250},token:sales.data.token});
  assert.equal(other.status,403);
});

test('staff can permanently delete only manual leads they created',async()=>{
  const sales=await login('sales@example.test');
  const created=await request('/admin/crm/leads',{method:'POST',body:{name:'Manual Lead',email:'manual@example.test',title:'Instagram inquiry',source:'instagram',value:150},token:sales.data.token});
  assert.equal(created.status,200);
  assert.equal(created.data.lead.kind,'manual');
  assert.equal(created.data.lead.createdBy,'sales@example.test');

  const deleted=await request('/admin/crm/leads/manual/'+encodeURIComponent(created.data.lead.id),{method:'DELETE',token:sales.data.token});
  assert.equal(deleted.status,200);
  assert.equal((server.readDB().crmLeads||[]).some(item=>String(item.id)===String(created.data.lead.id)),false);
});

test('system-generated leads stay locked from permanent deletion',async()=>{
  const sales=await login('sales@example.test');
  const deleted=await request('/admin/crm/leads/event/101',{method:'DELETE',token:sales.data.token});
  assert.equal(deleted.status,409);
  assert.ok(server.readDB().eventRequests.some(item=>String(item.id)==='101'));
});

test('CRM manager cannot permanently delete another staff member manual lead',async()=>{
  const sales=await login('sales@example.test');
  const created=await request('/admin/crm/leads',{method:'POST',body:{name:'Sales Lead',email:'saleslead@example.test',title:'Phone lead',source:'phone'},token:sales.data.token});
  assert.equal(created.status,200);
  const manager=await login('manager@example.test');
  const deleted=await request('/admin/crm/leads/manual/'+encodeURIComponent(created.data.lead.id),{method:'DELETE',token:manager.data.token});
  assert.equal(deleted.status,403);
  assert.ok(server.readDB().crmLeads.some(item=>String(item.id)===String(created.data.lead.id)));
});

test('sales manager permission can see the full CRM team',async()=>{
  const manager=await login('manager@example.test');
  assert.equal(manager.status,200);
  assert.ok(manager.data.user.permissions.includes('crm_manager'));
  const leads=await request('/admin/crm/leads',{token:manager.data.token});
  const customers=await request('/admin/crm/customers',{token:manager.data.token});
  assert.equal(leads.status,200);
  assert.equal(leads.data.length,2);
  assert.equal(customers.status,200);
  assert.equal(customers.data.length,2);
});

test('explicit account security permission revokes active customer sessions when disabling an account',async()=>{
  const db=server.readDB();
  db.adminAccessGrants[0].permissions.push('account_management');
  server.writeDB(db);
  const sales=await login('sales@example.test');
  const customer=await login('customer@example.test');
  assert.equal(customer.status,200);
  const disabled=await request('/admin/crm/customers/customer%40example.test/disable',{method:'POST',body:{disabled:true},token:sales.data.token});
  assert.equal(disabled.status,200);
  assert.equal(disabled.data.disabled,true);
  assert.equal((await request('/users/me',{token:customer.data.token})).status,401);
  assert.equal((await login('customer@example.test')).status,403);
});

test('owner always has all CRM permissions including account security',async()=>{
  const owner=await login('owner@example.test');
  assert.equal(owner.status,200);
  for(const permission of ['crm_dashboard','customers','leads','crm_manager','account_management'])assert.ok(owner.data.user.permissions.includes(permission));
});
