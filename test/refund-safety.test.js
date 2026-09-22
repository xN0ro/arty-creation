'use strict';
const {test,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const bcrypt=require('bcryptjs');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-refund-safety-'));
process.env.ARTY_DATA_DIR=temp;
process.env.RESEND_API_KEY='';
const server=require('../server');
const password='test-password';
const hash=bcrypt.hashSync(password,10);
const listener=server.app.listen(0,'127.0.0.1');
const ready=new Promise(resolve=>listener.once('listening',resolve));

beforeEach(()=>server.writeDB({
  adminEmails:['owner@example.test'],
  users:[{id:1,name:'Owner',email:'owner@example.test',password:hash,provider:'local',role:'admin',emailVerifiedAt:'2026-01-01T00:00:00Z'}],
  adminAccessGrants:[],sessions:[],passwordResetTokens:[],
  orders:[
    {id:'ORD-NONSTRIPE',status:'payée',paymentStatus:'paid',paymentProvider:'not_connected',paymentReference:'',total:25,refundedTotal:0,refundStatus:'none',createdAt:'2026-09-19T12:00:00Z',items:[]},
    {id:'ORD-UNPAID',status:'en attente de paiement',paymentStatus:'pending',paymentProvider:'stripe',paymentReference:'pi_unpaid_test',total:57.49,refundedTotal:0,refundStatus:'none',createdAt:'2026-09-21T12:00:00Z',items:[]}
  ],
  refunds:[],eventRequests:[],bookings:[],contactRequests:[],crmLeads:[],crmCustomers:{},supportRequests:[],kits:[]
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
async function login(){return request('/users/login',{method:'POST',body:{email:'owner@example.test',password}})}

test('refund action never marks a non-Stripe order refunded',async()=>{
  const admin=await login();
  const result=await request('/admin/orders/ORD-NONSTRIPE/refund',{method:'POST',token:admin.data.token,body:{amount:25,reason:'Customer request',restock:true}});
  assert.equal(result.status,409);
  const db=server.readDB();
  assert.equal(db.orders[0].refundedTotal,0);
  assert.equal(db.orders[0].refundStatus,'none');
  assert.equal(db.refunds.length,0);
});

test('refund action rejects an unpaid Stripe PaymentIntent before contacting Stripe',async()=>{
  const admin=await login();
  const result=await request('/admin/orders/ORD-UNPAID/refund',{method:'POST',token:admin.data.token,body:{amount:57.49,reason:'Should not refund',restock:false}});
  assert.equal(result.status,409);
  assert.match(String(result.data.error||''),/Aucun paiement Stripe confirmé/i);
  const db=server.readDB();
  const order=db.orders.find(item=>item.id==='ORD-UNPAID');
  assert.equal(order.paymentStatus,'pending');
  assert.equal(order.refundedTotal,0);
  assert.equal(db.refunds.length,0);
});

test('server refund integration uses the Stripe Refunds API',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','core-server.js'),'utf8');
  assert.match(source,/\/v1\/refunds/);
  assert.match(source,/payment_intent:paymentIntentId/);
  assert.match(source,/Idempotency-Key/);
});
