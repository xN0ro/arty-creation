'use strict';
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-alerts-'));
process.env.ARTY_DATA_DIR=temp;
const app=require('../core-server'),server=app.app.listen(0,'127.0.0.1');
const ready=new Promise(resolve=>server.once('listening',resolve));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const session=(token,id,email)=>({userId:id,email,tokenHash:hash(token),expiresAt:'2099-01-01T00:00:00Z'});
const later='2026-11-13T03:45:00.000Z';
beforeEach(()=>app.writeDB({
 users:[{id:1,name:'Owner',email:'owner@example.test',role:'admin'},{id:2,name:'Support',email:'support@example.test',role:'staff'},{id:3,name:'Sales',email:'sales@example.test',role:'staff'},{id:4,name:'Client',email:'client@example.test',role:'user'}],
 adminEmails:['owner@example.test'],adminAccessGrants:[{email:'support@example.test',active:true,permissions:['support']},{email:'sales@example.test',active:true,permissions:['leads']}],
 sessions:[session('owner',1,'owner@example.test'),session('support',2,'support@example.test'),session('sales',3,'sales@example.test'),session('client',4,'client@example.test')],
 adminNotificationsBaselineAt:'2026-11-13T02:29:00Z',
 supportRequests:[{id:'SUP-1',subject:'Help please',customer:{name:'Client',email:'client@example.test'},createdAt:later,messages:[{role:'customer',at:later,body:'Help'}]}],
 orders:[{id:'O1',paymentStatus:'paid',status:'payée',paidAt:later,total:20}],
 eventRequests:[{id:5,name:'Event',email:'a@example.test',eventType:'Corporate',createdAt:later,crm:{owner:'sales@example.test'}}],
 bookings:[],crmLeads:[],crmCustomers:{},contactRequests:[],kits:[]
}));
after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true})});
async function call(route,token,method='GET',body){
 await ready;const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/notifications'+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,data:await response.json()};
}
test('notifications endpoint enforces section-specific staff access',async()=>{
 const owner=await call('','owner'),support=await call('','support'),sales=await call('','sales'),client=await call('','client');
 assert.equal(owner.status,200);
 assert.equal(support.status,200);assert.deepEqual(support.data.counts,{support:1,orders:0,crm:0});
 assert.equal(sales.status,200);assert.deepEqual(sales.data.counts,{support:0,orders:0,crm:1});
 assert.equal(client.status,403);
});
test('marking support viewed leaves sales and CRM unread, another account unaffected',async()=>{
 const before=await call('','owner');
 assert.deepEqual(before.data.counts,{support:1,orders:1,crm:1});
 const marked=await call('/seen','owner','POST',{kind:'support',through:before.data.through.support});
 assert.equal(marked.status,200);assert.deepEqual(marked.data.notification.counts,{support:0,orders:1,crm:1});
 assert.equal((await call('','support')).data.counts.support,1);
});
test('sales staff may not clear support badges',async()=>{
 assert.equal((await call('/seen','sales','POST',{kind:'support',through:later})).status,400);
});
