'use strict';
const {test,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const bcrypt=require('bcryptjs');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-support-access-'));
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
    {id:2,name:'Support Agent',email:'support@example.test',password:hash,provider:'local',role:'staff',emailVerifiedAt:'2026-01-01T00:00:00Z'},
    {id:3,name:'Customer',email:'customer@example.test',password:hash,provider:'local',role:'user',emailVerifiedAt:'2026-01-01T00:00:00Z'}
  ],
  adminAccessGrants:[
    {id:'STAFF-SUPPORT',email:'support@example.test',name:'Support Agent',permissions:['support'],active:true,emailVerifiedAt:'2026-01-01T00:00:00Z',acceptedAt:'2026-01-01T00:00:00Z'}
  ],
  sessions:[],passwordResetTokens:[],
  orders:[{id:'ORD-1',userId:3,status:'livrée',paymentStatus:'paid',total:125,createdAt:'2026-09-01T12:00:00Z',items:[]}],
  eventRequests:[],bookings:[],contactRequests:[],crmLeads:[],crmCustomers:{},supportRequests:[],kits:[]
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

test('customer creates a support conversation linked to an order',async()=>{
  const customer=await login('customer@example.test');
  const created=await request('/support-requests',{method:'POST',token:customer.data.token,body:{topic:'livraison',orderId:'ORD-1',subject:'Where is my package?',message:'I need help understanding the delivery status.'}});
  assert.equal(created.status,200);
  assert.equal(created.data.request.status,'nouvelle');
  assert.equal(created.data.request.messages.length,1);
  assert.equal(created.data.request.messages[0].role,'customer');
  const mine=await request('/support-requests/mine',{token:customer.data.token});
  assert.equal(mine.status,200);
  assert.equal(mine.data.length,1);
  assert.equal(mine.data[0].orderId,'ORD-1');
});

test('support agent can prioritize assign and reply with customer context',async()=>{
  const customer=await login('customer@example.test');
  const created=await request('/support-requests',{method:'POST',token:customer.data.token,body:{topic:'commande',orderId:'ORD-1',subject:'Order question',message:'Can you confirm my order details please?'}});
  const id=created.data.request.id;
  const agent=await login('support@example.test');
  const queue=await request('/admin/support-requests',{token:agent.data.token});
  assert.equal(queue.status,200);
  assert.equal(queue.data.length,1);
  assert.equal(queue.data[0].customerContext.orderCount,1);
  assert.equal(queue.data[0].orderContext.id,'ORD-1');

  const meta=await request('/admin/support-requests/'+encodeURIComponent(id),{method:'PATCH',token:agent.data.token,body:{status:'en cours',priority:'high',assignedTo:'support@example.test'}});
  assert.equal(meta.status,200);
  assert.equal(meta.data.request.priority,'high');
  assert.equal(meta.data.request.assignedTo,'support@example.test');

  const reply=await request('/admin/support-requests/'+encodeURIComponent(id)+'/reply',{method:'POST',token:agent.data.token,body:{message:'Yes. Your order is confirmed and delivered.',status:'répondue'}});
  assert.equal(reply.status,200);
  assert.equal(reply.data.request.status,'répondue');
  assert.equal(reply.data.request.messages.at(-1).role,'staff');

  const mine=await request('/support-requests/mine',{token:customer.data.token});
  assert.equal(mine.data[0].messages.length,2);
  assert.equal(mine.data[0].messages[1].body,'Yes. Your order is confirmed and delivered.');
});

test('customer reply reopens an answered support ticket for the team',async()=>{
  const customer=await login('customer@example.test');
  const created=await request('/support-requests',{method:'POST',token:customer.data.token,body:{topic:'produit',subject:'Product help',message:'I have a question about my painting kit.'}});
  const id=created.data.request.id;
  const agent=await login('support@example.test');
  await request('/admin/support-requests/'+encodeURIComponent(id)+'/reply',{method:'POST',token:agent.data.token,body:{message:'We can help with that.',status:'répondue'}});
  const customerReply=await request('/support-requests/'+encodeURIComponent(id)+'/reply',{method:'POST',token:customer.data.token,body:{message:'Thank you, I have one more question.'}});
  assert.equal(customerReply.status,200);
  assert.equal(customerReply.data.request.status,'nouvelle');
  assert.equal(customerReply.data.request.messages.at(-1).role,'customer');
  const queue=await request('/admin/support-requests',{token:agent.data.token});
  assert.equal(queue.data[0].status,'nouvelle');
});

test('support preset cannot access CRM pages without CRM permissions',async()=>{
  const agent=await login('support@example.test');
  assert.equal((await request('/admin/support-requests',{token:agent.data.token})).status,200);
  assert.equal((await request('/admin/support/team',{token:agent.data.token})).status,200);
  assert.equal((await request('/admin/crm/leads',{token:agent.data.token})).status,403);
});
