'use strict';
const {test,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const https=require('node:https');
const {EventEmitter}=require('node:events');
const bcrypt=require('bcryptjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-admin-'));
process.env.ARTY_DATA_DIR=temp;
process.env.RESEND_API_KEY='';
process.env.GOOGLE_CLIENT_ID='arty-test-client';
const server=require('../server');
const password='test-password';
const passwordHash=bcrypt.hashSync(password,10);
const listener=server.app.listen(0,'127.0.0.1');
const ready=new Promise(resolve=>listener.once('listening',resolve));
beforeEach(()=>server.writeDB({adminEmails:[' Legacy@Example.test '],users:[
  {id:1,name:'ARTY',email:'info@creationarty.com',password:passwordHash,provider:'local',role:'user'},
  {id:2,name:'Legacy admin',email:'legacy@example.test',password:passwordHash,provider:'local',role:'admin'},
  {id:3,name:'Customer',email:'customer@example.test',password:passwordHash,provider:'local',role:'user'}
],sessions:[],passwordResetTokens:[]}));
after(async()=>{await new Promise(resolve=>listener.close(resolve));fs.rmSync(temp,{recursive:true,force:true});});
async function api(route,body,token){
  await ready;
  const response=await fetch(`http://127.0.0.1:${listener.address().port}/api${route}`,{
    method:body===undefined?'GET':'POST',
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return {status:response.status,data:await response.json()};
}
async function google(claims){
  const get=https.get;
  https.get=(url,callback)=>{
    assert.equal(new URL(url).hostname,'oauth2.googleapis.com');
    const request=new EventEmitter();
    queueMicrotask(()=>{const response=new EventEmitter();callback(response);response.emit('data',JSON.stringify(claims));response.emit('end');});
    return request;
  };
  try{return await api('/users/google',{credential:'mock-google-token'});}finally{https.get=get;}
}
const verified={aud:'arty-test-client',email_verified:'true',email:'info@creationarty.com',name:'ARTY'};
test('persistent admin additions preserve existing admins and do not grant customers access',async()=>{
  let db=server.readDB();
  assert.deepEqual(db.adminEmails,['legacy@example.test','info@creationarty.com']);
  server.writeDB(db);assert.deepEqual(server.readDB().adminEmails,db.adminEmails);
  for(const [email,role,status] of [['legacy@example.test','admin',200],['customer@example.test','user',403]]){
    const result=await api('/users/login',{email,password});
    assert.equal(result.data.user.role,role);
    assert.equal((await api('/admin/categories',undefined,result.data.token)).status,status);
  }
  assert.equal((await api('/admin/categories')).status,401);
});
test('verified Google sign-in upgrades the existing business account and its new session',async()=>{
  const unverified=await api('/users/login',{email:verified.email,password});
  const result=await google({...verified,email:'INFO@CREATIONARTY.COM'});
  assert.equal(result.status,200);assert.equal(result.data.user.id,1);assert.equal(result.data.user.role,'admin');
  assert.equal((await api('/admin/categories',undefined,result.data.token)).status,200);
  assert.equal(server.readDB().users.find(user=>user.id===1).role,'admin');
  assert.ok(server.readDB().users.find(user=>user.id===1).emailVerifiedAt);
  assert.equal((await api('/admin/categories',undefined,unverified.data.token)).status,401);
  assert.equal((await api('/users/login',{email:verified.email,password})).status,401);
});
test('new Google accounts receive admin only for the exact verified address and correct audience',async()=>{
  const db=server.readDB();db.users=db.users.filter(user=>user.id!==1);server.writeDB(db);
  for(const claims of [{...verified,email_verified:'false'},{...verified,aud:'another-client'}]){
    assert.equal((await google(claims)).status,401);
    assert.equal(server.readDB().users.some(user=>user.email===verified.email),false);
  }
  const other=await google({...verified,email:'info@creationarty.com.example.test'});
  assert.equal(other.data.user.role,'user');
  assert.equal((await api('/admin/categories',undefined,other.data.token)).status,403);
  const result=await google(verified);
  assert.equal(result.data.user.role,'admin');
  assert.equal((await api('/admin/categories',undefined,result.data.token)).status,200);
});
test('public registration and an ordinary password login cannot impersonate the business mailbox',async()=>{
  const db=server.readDB();db.users=db.users.filter(user=>user.id!==1);server.writeDB(db);
  const created=await api('/users/register',{name:'Unverified',email:verified.email,password,role:'admin',emailVerifiedAt:'2026-01-01',googleLinkedAt:'2026-01-01'});
  assert.equal(created.status,200);assert.equal(created.data.user.role,'user');
  assert.equal((await api('/admin/categories',undefined,created.data.token)).status,403);
  const login=await api('/users/login',{email:verified.email,password});
  assert.equal(login.data.user.role,'user');
  assert.equal((await api('/admin/categories',undefined,login.data.token)).status,403);
  assert.equal((await api('/users/login',{email:verified.email,password:'wrong-password'})).status,401);
});
test('redeeming a valid emailed reset verifies local ownership and enables admin on the next login',async()=>{
  const rawToken='test-reset-token',db=server.readDB();
  db.passwordResetTokens=[{userId:1,tokenHash:crypto.createHash('sha256').update(rawToken).digest('hex'),expiresAt:new Date(Date.now()+60000).toISOString(),usedAt:''}];
  server.writeDB(db);
  assert.equal((await api('/users/reset-password',{token:'wrong',password:'new-password',confirmPassword:'new-password'})).status,400);
  assert.equal(server.readDB().users[0].role,'user');
  const reset=await api('/users/reset-password',{token:rawToken,password:'new-password',confirmPassword:'new-password'});
  assert.equal(reset.status,200);
  const login=await api('/users/login',{email:' INFO@CREATIONARTY.COM ',password:'new-password'});
  assert.equal(login.data.user.role,'admin');
  assert.equal((await api('/admin/categories',undefined,login.data.token)).status,200);
  assert.equal((await api('/users/reset-password',{token:rawToken,password:'other-password',confirmPassword:'other-password'})).status,400);
});
test('already verified password accounts are promoted when they next authenticate',async()=>{
  const db=server.readDB();db.users[0].emailVerifiedAt='2026-01-01T00:00:00Z';server.writeDB(db);
  const result=await api('/users/login',{email:verified.email,password});
  assert.equal(result.data.user.role,'admin');
  assert.equal((await api('/admin/categories',undefined,result.data.token)).status,200);
});
