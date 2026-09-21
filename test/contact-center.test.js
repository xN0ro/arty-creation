'use strict';
const {test, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const {EventEmitter} = require('node:events');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arty-contact-'));
process.env.ARTY_DATA_DIR = temp;
process.env.ARTY_PUBLIC_URL = 'https://arty.example.test';
process.env.EMAIL_FROM = 'test@example.test';
process.env.RESEND_API_KEY = 'test-only-never-sent';
process.env.ARTY_EMAIL_MODE = '';
for (const channel of ['CONTACT','SUPPORT','ORDERS','EVENTS']) process.env['EMAIL_'+channel] = channel.toLowerCase()+'@example.test';
const deliveries = [];
let emailStatus = 200;
const originalRequest = https.request;
// Capture the actual generated emails. No external network or real email delivery.
https.request = (options, callback) => {
  assert.equal(options.hostname, 'api.resend.com');
  const req = new EventEmitter();let body = '';
  req.write = value => { body += value; };
  req.setTimeout = () => req;
  req.end = () => { deliveries.push(JSON.parse(body));setImmediate(() => { const res = new EventEmitter();res.statusCode = emailStatus;callback(res);res.emit('data', JSON.stringify(emailStatus===200?{id:'test-mail'}:{message:'Test delivery failure'}));res.emit('end'); }); };
  return req;
};
const server = require('../core-server');
const listener = server.app.listen(0, '127.0.0.1');
const ready = new Promise(resolve => listener.once('listening', resolve));
const user = (id,email,role='user') => ({id,email,name:'Test Customer',role,emailVerifiedAt:'2026-01-01T00:00:00Z'});
const session = (token,userId,email) => ({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),userId,email,expiresAt:'2099-01-01T00:00:00Z'});
beforeEach(() => {
  deliveries.length=0;emailStatus=200;
  server.writeDB({users:[user(1,'owner@example.test','admin'),user(2,'buyer@example.test'),user(3,'other@example.test'),user(4,'agent@example.test','staff'),user(5,'catalog@example.test','staff')],adminEmails:['owner@example.test'],adminAccessGrants:[{email:'agent@example.test',permissions:['support'],active:true},{email:'catalog@example.test',permissions:['products'],active:true}],sessions:[session('buyer',2,'buyer@example.test'),session('other',3,'other@example.test'),session('agent',4,'agent@example.test'),session('catalog',5,'catalog@example.test')],orders:[{id:'ORD-OWN',userId:2,customer:{email:'buyer@example.test'},total:50,paymentStatus:'paid',items:[]},{id:'ORD-OTHER',userId:3,customer:{email:'other@example.test'},total:90,paymentStatus:'paid',items:[]},{id:'ORD-GUEST',userId:null,customer:{email:'unrelated@example.test'},total:900,paymentStatus:'paid',items:[]}],contactRequests:[],supportRequests:[],eventRequests:[],crmLeads:[],crmCustomers:{},kits:[],bookings:[]});
});
after(async () => { await new Promise(resolve => listener.close(resolve));https.request=originalRequest;fs.rmSync(temp,{recursive:true,force:true}); });
const valid = extra => ({name:'Sample Customer',email:'guest@example.test',message:'Please help with this question about my order.',topic:'commande',requestKey:crypto.randomUUID(),...extra});
async function call(route, {body,token,method=body?'POST':'GET',language='fr'}={}) {
  await ready;
  const response = await fetch(`http://127.0.0.1:${listener.address().port}/api${route}`,{method,headers:{'Content-Type':'application/json','X-Arty-Language':language,...(token?{Authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
}

test('all six topics create a support conversation and CRM record with the correct email routing', async () => {
  for (const [topic,channel] of [['commande','orders'],['livraison','orders'],['produit','support'],['paiement','orders'],['événement','events'],['autre','contact']]) {
    const result=await call('/contact',{body:valid({topic})});
    assert.equal(result.status,200);assert.equal(result.data.success,true);assert.match(result.data.reference,/^SUP-/);assert.equal(result.data.emailStatus,'sent');
    const db=server.readDB(),ticket=db.supportRequests.at(-1),contact=db.contactRequests.at(-1);
    assert.equal(ticket.id,result.data.reference);assert.equal(contact.supportRequestId,ticket.id);assert.equal(ticket.topic,topic);assert.equal(ticket.channel,channel);
    assert.equal(ticket.messages[0].role,'customer');assert.equal(ticket.userId,null);assert.equal(contact.emailDelivery.admin,'sent');
    assert.equal(deliveries.at(-1).to[0],channel+'@example.test');assert.equal(deliveries.at(-1).reply_to,'guest@example.test');
    assert.equal(deliveries.at(-2).reply_to,channel+'@example.test');assert(!deliveries.at(-2).html.includes('#/profile'));
    assert.deepEqual(Object.keys(result.data).sort(),['emailStatus','message','reference','success']);
  }
});
test('invalid fields, unsupported topics, honeypot and impossible event details never save or send', async () => {
  for (const extra of [{name:''},{email:'bad-address'},{message:'short'},{message:'a'.repeat(3001)},{topic:'invalid'},{website:'spam.test'},{requestKey:'bad'},{topic:'événement',eventDate:'2026-02-30'},{topic:'événement',guests:'1.5'},{topic:'événement',guests:10001},{orderReference:'x'.repeat(81)}]) assert.equal((await call('/contact',{body:valid(extra)})).status,400);
  assert.equal(server.readDB().contactRequests.length,0);assert.equal(server.readDB().supportRequests.length,0);assert.equal(deliveries.length,0);
});
test('simultaneous retries create one ticket, one receipt and one team notification', async () => {
  const body=valid();const results=await Promise.all(Array.from({length:5},()=>call('/contact',{body})));
  assert(results.every(r=>r.status===200));assert.equal(new Set(results.map(r=>r.data.reference)).size,1);
  assert.equal(server.readDB().supportRequests.length,1);assert.equal(server.readDB().contactRequests.length,1);assert.equal(deliveries.length,2);
  assert.equal((await call('/contact',{body,language:'en'})).data.reference,results[0].data.reference);
  assert.equal((await call('/contact',{body:{...body,message:'Changed request should not overwrite the old one.'}})).status,409);
  assert.equal(server.readDB().supportRequests.length,1);
});
test('failed email notifications do not lose the saved request or encourage duplicate submissions', async () => {
  emailStatus=503;const body=valid();const result=await call('/contact',{body});
  assert.equal(result.status,200);assert.equal(result.data.success,true);assert.equal(result.data.emailStatus,'failed');
  assert.equal(server.readDB().supportRequests[0].emailDelivery.admin,'failed');
  const retry=await call('/contact',{body});assert.equal(retry.data.reference,result.data.reference);assert.equal(deliveries.length,2);
});
test('guest claims never bind an account or expose an order, and unrelated guest orders stay out of context', async () => {
  const result=await call('/contact',{body:valid({email:'buyer@example.test',orderReference:'ORD-OTHER'})});
  const ticket=server.readDB().supportRequests[0];assert.equal(ticket.userId,null);assert.equal(ticket.orderId,'');assert.equal(ticket.orderReference,'ORD-OTHER');
  assert.equal((await call('/support-requests/mine',{token:'buyer'})).data.length,0);
  assert.equal((await call('/support-requests/'+result.data.reference+'/reply',{token:'buyer',body:{message:'Trying to access an unlinked ticket'}})).status,404);
  const queue=await call('/admin/support-requests',{token:'agent'});assert.equal(queue.status,200);assert.equal(queue.data[0].orderContext,null);assert.equal(queue.data[0].customerContext.orderCount,1);assert.equal(queue.data[0].customerContext.lifetimeSpend,50);
});
test('authenticated ownership is required for linking orders or showing requests in a customer account', async () => {
  await call('/contact',{body:valid({email:'buyer@example.test',orderReference:'ORD-OWN'}),token:'buyer'});
  const ticket=server.readDB().supportRequests[0];assert.equal(ticket.userId,2);assert.equal(ticket.orderId,'ORD-OWN');
  assert.equal((await call('/support-requests/mine',{token:'buyer'})).data.length,1);assert.equal((await call('/support-requests/mine',{token:'other'})).data.length,0);
  await call('/contact',{body:valid({email:'other@example.test',orderReference:'ORD-OTHER'}),token:'buyer'});
  assert.equal(server.readDB().supportRequests[1].userId,null);assert.equal(server.readDB().supportRequests[1].orderId,'');
});
test('support staff can assign, add private notes and reply to a guest through the appropriate mailbox', async () => {
  const created=await call('/contact',{body:valid({topic:'événement',eventDate:'2027-06-12',guests:24,message:'An event with <script> markup safely rendered.'}),language:'en'});
  const id=created.data.reference;
  assert(deliveries.at(-1).html.includes('2027-06-12'));assert(deliveries.at(-1).html.includes('24'));assert(deliveries.at(-1).html.includes('&lt;script&gt;'));assert(!deliveries.at(-1).html.includes('<script>'));
  assert.equal((await call('/admin/support-requests/'+id,{method:'PATCH',token:'agent',body:{assignedTo:'agent@example.test',priority:'high',status:'en cours'}})).status,200);
  assert.equal((await call('/admin/support-requests/'+id+'/note',{token:'agent',body:{note:'Internal follow-up detail'}})).status,200);
  const reply=await call('/admin/support-requests/'+id+'/reply',{token:'agent',body:{message:'We can help you plan this event.'}});
  assert.equal(reply.status,200);assert.equal(reply.data.emailStatus,'sent');assert.equal(reply.data.request.messages.length,2);
  assert.equal(deliveries.at(-1).to[0],'guest@example.test');assert.equal(deliveries.at(-1).reply_to,'events@example.test');assert(!deliveries.at(-1).html.includes('#/profile'));assert(!deliveries.at(-1).html.includes('Internal follow-up detail'));
});
test('guests, customers and staff without support permission cannot read the inbox', async () => {
  await call('/contact',{body:valid()});
  assert.equal((await call('/admin/support-requests')).status,401);
  for(const token of ['buyer','catalog']) assert.equal((await call('/admin/support-requests',{token})).status,403);
});
test('legacy channel submissions still work and long messages remain complete in the inbox', async () => {
  const body=valid({channel:'events',message:'a'.repeat(2900)});delete body.topic;delete body.requestKey;
  assert.equal((await call('/contact',{body})).status,200);
  const queue=await call('/admin/support-requests',{token:'agent'});assert.equal(queue.data[0].topic,'événement');assert.equal(queue.data[0].messages[0].body.length,2900);
});
