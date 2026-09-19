'use strict';
const {test,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const bcrypt=require('bcryptjs');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-home-favorites-'));
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
  sessions:[],passwordResetTokens:[],
  kits:Array.from({length:6},(_,i)=>({id:i+1,name:'Kit '+(i+1),price:20+i,inStock:true,homeFavorite:false,images:[]})),
  categories:[],events:[],eventOptions:[],bundles:[],orders:[],refunds:[],bookings:[],contactRequests:[],crmLeads:[],crmCustomers:{},supportRequests:[]
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
async function login(){
  return request('/users/login',{method:'POST',body:{email:'owner@example.test',password}});
}

test('admin can choose up to five homepage favorite kits and public catalog receives the flags',async()=>{
  const admin=await login();
  const saved=await request('/admin/home-favorite-kits',{method:'PUT',token:admin.data.token,body:{kitIds:[1,3,5]}});
  assert.equal(saved.status,200);
  assert.deepEqual(saved.data.kitIds,[1,3,5]);
  const db=server.readDB();
  assert.deepEqual(db.kits.filter(k=>k.homeFavorite).map(k=>k.id),[1,3,5]);

  const publicKits=await request('/kits');
  assert.equal(publicKits.status,200);
  assert.deepEqual(publicKits.data.filter(k=>k.homeFavorite).map(k=>k.id),[1,3,5]);
});

test('homepage favorite selection enforces a maximum of five and supports clearing the selection',async()=>{
  const admin=await login();
  const tooMany=await request('/admin/home-favorite-kits',{method:'PUT',token:admin.data.token,body:{kitIds:[1,2,3,4,5,6]}});
  assert.equal(tooMany.status,400);
  assert.equal(server.readDB().kits.some(k=>k.homeFavorite),false);

  const five=await request('/admin/home-favorite-kits',{method:'PUT',token:admin.data.token,body:{kitIds:[1,2,3,4,5]}});
  assert.equal(five.status,200);
  assert.equal(server.readDB().kits.filter(k=>k.homeFavorite).length,5);

  const cleared=await request('/admin/home-favorite-kits',{method:'PUT',token:admin.data.token,body:{kitIds:[]}});
  assert.equal(cleared.status,200);
  assert.equal(server.readDB().kits.filter(k=>k.homeFavorite).length,0);
});

test('homepage UI uses explicit favorites first and random fallback only when none are selected',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(app,/allKits\.filter\(k=>k\.homeFavorite===true\)\.slice\(0,5\)/);
  assert.match(app,/if\(selected\.length\)return selected/);
  assert.match(app,/shuffled\.slice\(0,5\)/);
  assert.match(app,/arty_home_random_favorite_ids_v1/);
});
