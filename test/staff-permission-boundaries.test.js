'use strict';
const {test,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const bcrypt=require('bcryptjs');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-staff-permissions-'));
process.env.ARTY_DATA_DIR=temp;
process.env.RESEND_API_KEY='';
const server=require('../server');
const password='test-password';
const hash=bcrypt.hashSync(password,10);
const listener=server.app.listen(0,'127.0.0.1');
const ready=new Promise(resolve=>listener.once('listening',resolve));

const staff=[
  ['products@example.test',['products']],
  ['inventory@example.test',['inventory']],
  ['settings@example.test',['settings']],
  ['marketing@example.test',['marketing']],
  ['support@example.test',['support']]
];

function fixture(){
  const users=[
    {id:1,name:'Owner',email:'owner@example.test',password:hash,provider:'local',role:'admin',emailVerifiedAt:'2026-01-01T00:00:00Z'}
  ];
  const grants=[];
  staff.forEach(([email,permissions],index)=>{
    users.push({id:index+2,name:email.split('@')[0],email,password:hash,provider:'local',role:'staff',emailVerifiedAt:'2026-01-01T00:00:00Z'});
    grants.push({id:'STAFF-'+(index+1),email,name:email.split('@')[0],permissions,active:true,emailVerifiedAt:'2026-01-01T00:00:00Z',acceptedAt:'2026-01-01T00:00:00Z'});
  });
  return {
    adminEmails:['owner@example.test'],users,adminAccessGrants:grants,sessions:[],passwordResetTokens:[],
    kits:[{id:1,name:'Kit One',price:29.99,categoryId:null,inStock:true,stockQty:7,lowStockThreshold:2,trackInventory:true,images:[],includes:[],sizeOptions:[],addOns:[]}],
    categories:[],events:[],eventOptions:[],bundles:[],bundleDealRules:[],orders:[],refunds:[],bookings:[],eventRequests:[],
    contactRequests:[],crmLeads:[],crmCustomers:{},supportRequests:[],productTemplates:[],
    commerceConfig:{version:1,shipping:{enabled:true,defaultPrice:9.99,freeShippingEnabled:true,freeShippingThreshold:75,canadaOnly:true,productOverrides:[]},taxes:{enabled:true,defaultProvince:'QC',collectGSTHST:true,collectQST:true,collectBCPST:false,collectMBRST:false,collectSKPST:false}},
    marketingConfig:{version:1},studioConfig:{version:1,products:[]}
  };
}

beforeEach(()=>server.writeDB(fixture()));
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
async function login(email){
  const result=await request('/users/login',{method:'POST',body:{email,password}});
  assert.equal(result.status,200);
  return result.data.token;
}

test('product staff can manage products and Studio but cannot access settings or marketing',async()=>{
  const token=await login('products@example.test');
  assert.equal((await request('/admin/studio-config',{token})).status,200);
  assert.equal((await request('/admin/commerce-config',{token})).status,403);
  assert.equal((await request('/admin/marketing-config',{token})).status,403);

  const kits=await request('/admin/kits',{token});
  assert.equal(kits.status,200);
  assert.equal(Object.prototype.hasOwnProperty.call(kits.data[0],'stockQty'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(kits.data[0],'lowStockThreshold'),false);

  const edit=await request('/admin/kits/1',{method:'PUT',token,body:{name:'Renamed Kit',price:31.99,stockQty:999,lowStockThreshold:999,inStock:false}});
  assert.equal(edit.status,200);
  const stored=server.readDB().kits[0];
  assert.equal(stored.name,'Renamed Kit');
  assert.equal(stored.stockQty,7);
  assert.equal(stored.lowStockThreshold,2);
  assert.equal(stored.inStock,true);
});

test('inventory staff see and adjust stock but cannot use product Studio or site settings',async()=>{
  const token=await login('inventory@example.test');
  const kits=await request('/admin/kits',{token});
  assert.equal(kits.status,200);
  assert.equal(kits.data[0].stockQty,7);
  assert.equal((await request('/admin/studio-config',{token})).status,403);
  assert.equal((await request('/admin/commerce-config',{token})).status,403);

  const adjusted=await request('/admin/kits/1/inventory',{method:'POST',token,body:{mode:'set',quantity:4,reason:'test'}});
  assert.equal(adjusted.status,200);
  assert.equal(server.readDB().kits[0].stockQty,4);
});

test('settings permission is required for shipping and taxes',async()=>{
  const token=await login('settings@example.test');
  assert.equal((await request('/admin/commerce-config',{token})).status,200);
  assert.equal((await request('/admin/studio-config',{token})).status,403);
  assert.equal((await request('/admin/marketing-config',{token})).status,403);
});

test('marketing permission is isolated from Studio and site settings',async()=>{
  const token=await login('marketing@example.test');
  assert.equal((await request('/admin/marketing-config',{token})).status,200);
  assert.equal((await request('/admin/commerce-config',{token})).status,403);
  assert.equal((await request('/admin/studio-config',{token})).status,403);
});

test('unrelated staff permission cannot access Studio, taxes or marketing settings',async()=>{
  const token=await login('support@example.test');
  assert.equal((await request('/admin/studio-config',{token})).status,403);
  assert.equal((await request('/admin/commerce-config',{token})).status,403);
  assert.equal((await request('/admin/marketing-config',{token})).status,403);
  assert.equal((await request('/admin/kits',{token})).status,403);
});

test('admin permission UI recognizes dynamically-created tabs and invitation copy stays simple',()=>{
  const access=fs.readFileSync(path.join(__dirname,'..','public','admin-access-control.js'),'utf8');
  const studio=fs.readFileSync(path.join(__dirname,'..','public','studio-admin.js'),'utf8');
  const commerce=fs.readFileSync(path.join(__dirname,'..','public','commerce-client.js'),'utf8');
  const marketing=fs.readFileSync(path.join(__dirname,'..','public','marketing-client.js'),'utf8');
  const core=fs.readFileSync(path.join(__dirname,'..','core-server.js'),'utf8');

  assert.match(access,/studio:'products'/);
  assert.match(access,/commerce:'settings'/);
  assert.match(access,/marketing:'marketing'/);
  assert.match(access,/crm:\['crm_dashboard','customers','leads'\]/);
  assert.match(access,/MutationObserver/);
  assert.match(studio,/adminTabKey='studio'/);
  assert.match(commerce,/adminTabKey='commerce'/);
  assert.match(marketing,/adminTabKey='marketing'/);
  assert.doesNotMatch(core,/restricted staff access/i);
  assert.doesNotMatch(core,/You will only see the sections you were authorized to use/i);
});
