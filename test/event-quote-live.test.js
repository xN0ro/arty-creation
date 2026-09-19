'use strict';
const {test,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const bcrypt=require('bcryptjs');
const commerceCore=require('../commerce-core');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-event-quote-live-'));
process.env.ARTY_DATA_DIR=temp;
process.env.RESEND_API_KEY='';
process.env.PAYMENT_PROVIDER='stripe';
process.env.STRIPE_SECRET_KEY='sk_test_placeholder';
process.env.STRIPE_PUBLISHABLE_KEY='pk_test_placeholder';
const server=require('../server');
const password='test-password';
const hash=bcrypt.hashSync(password,10);
const listener=server.app.listen(0,'127.0.0.1');
const ready=new Promise(resolve=>listener.once('listening',resolve));

beforeEach(()=>server.writeDB({
  adminEmails:['owner@example.test'],
  users:[
    {id:1,name:'Owner',email:'owner@example.test',password:hash,provider:'local',role:'admin',emailVerifiedAt:'2026-01-01T00:00:00Z'},
    {id:2,name:'Customer',email:'customer@example.test',password:hash,provider:'local',role:'user',emailVerifiedAt:'2026-01-01T00:00:00Z'}
  ],
  adminAccessGrants:[],sessions:[],passwordResetTokens:[],
  commerceConfig:commerceCore.DEFAULT_COMMERCE_CONFIG,
  orders:[],bookings:[],contactRequests:[],crmLeads:[],crmCustomers:{},supportRequests:[],kits:[],
  eventRequests:[
    {
      id:101,reference:'EVT-PAID-1',userId:null,locale:'en',
      name:'Customer',email:'customer@example.test',phone:'555-0100',
      eventType:'Private ARTY Event',preferredDate:'2026-10-15',eventTime:'18:00',guests:12,
      address:{line1:'123 Main St',city:'Gatineau',province:'QC',postal:'J8X 1A1',country:'Canada'},
      location:'123 Main St, Gatineau, QC, J8X 1A1',
      servicePath:'inventory',
      inventoryItems:[{kitId:1,name:'Sunflower Kit',quantity:12,image:'/sunflower.jpg'}],
      customKit:null,expertBrief:'',message:'',
      status:'contactée',
      quoteSubtotal:200,quoteShipping:25,quoteTaxTotal:33.69,
      quoteTaxLines:[{code:'GST',label:'GST',rate:5,amount:11.25},{code:'QST',label:'QST',rate:9.975,amount:22.44}],
      quoteTaxProvince:'QC',quoteAmount:258.69,quoteDescription:'Private painting event for 12 guests.',
      quotePaymentStatus:'paid',quotePaidAt:'2026-09-19T12:00:00Z',
      paymentAmountReceived:258.69,createdAt:'2026-09-18T12:00:00Z',updatedAt:'2026-09-19T12:00:00Z',
      crm:{status:'won',owner:'owner@example.test',finalValue:258.69,statusHistory:[]}
    }
  ]
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

test('private event quote preview calculates Quebec tax on subtotal plus shipping',async()=>{
  const admin=await login('owner@example.test');
  const preview=await request('/admin/event-requests/101/quote-preview',{
    method:'POST',token:admin.data.token,
    body:{
      quoteSubtotal:2,
      quoteShipping:1,
      quoteAddress:{line1:'123 Main St',city:'Gatineau',province:'QC',postal:'J8X 1A1',country:'Canada'}
    }
  });
  assert.equal(preview.status,200);
  assert.equal(preview.data.quoteSubtotal,2);
  assert.equal(preview.data.quoteShipping,1);
  assert.equal(preview.data.quoteTaxTotal,0.45);
  assert.equal(preview.data.quoteAmount,3.45);
  assert.deepEqual(preview.data.quoteTaxLines.map(line=>[line.code,line.amount]),[['GST',0.15],['QST',0.3]]);
});

test('paid private event appears in customer history even for older email-linked requests',async()=>{
  const customer=await login('customer@example.test');
  const history=await request('/event-requests/mine',{token:customer.data.token});
  assert.equal(history.status,200);
  assert.equal(history.data.length,1);
  assert.equal(history.data[0].reference,'EVT-PAID-1');
  assert.equal(history.data[0].paymentStatus,'paid');
  assert.equal(history.data[0].status,'payée');
  assert.equal(history.data[0].quoteAmount,258.69);
  assert.equal(history.data[0].inventoryItems[0].name,'Sunflower Kit');
});

test('private events admin treats successful payment as authoritative paid status',async()=>{
  const admin=await login('owner@example.test');
  const list=await request('/admin/event-requests',{token:admin.data.token});
  assert.equal(list.status,200);
  assert.equal(list.data[0].quotePaymentStatus,'paid');
  assert.equal(list.data[0].status,'payée');

  const attemptedDowngrade=await request('/admin/event-requests/101',{
    method:'PATCH',token:admin.data.token,
    body:{status:'contactée',quoteSubtotal:200,quoteShipping:25,quoteAddress:{line1:'123 Main St',city:'Gatineau',province:'QC',postal:'J8X 1A1',country:'Canada'}}
  });
  assert.equal(attemptedDowngrade.status,200);
  assert.equal(attemptedDowngrade.data.request.status,'payée');
});

test('Stripe PaymentIntents do not explicitly request duplicate Stripe receipt emails',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','core-server.js'),'utf8');
  assert.equal(source.includes('receipt_email'),false);
});
