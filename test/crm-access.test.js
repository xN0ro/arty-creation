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
    {id:3,name:'Customer',email:'customer@example.test',password:hash,provider:'local',role:'user',emailVerifiedAt:'2026-01-01T00:00:00Z'}
  ],
  adminAccessGrants:[{id:'STAFF-SALES',email:'sales@example.test',name:'Sales',permissions:['crm_dashboard','customers','leads'],active:true,emailVerifiedAt:'2026-01-01T00:00:00Z',acceptedAt:'2026-01-01T00:00:00Z'}],
  sessions:[],passwordResetTokens:[],orders:[],eventRequests:[],bookings:[],contactRequests:[],crmLeads:[],crmCustomers:{},kits:[]
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
  for(const permission of ['crm_dashboard','customers','leads','account_management'])assert.ok(owner.data.user.permissions.includes(permission));
});
