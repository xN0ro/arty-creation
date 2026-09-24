'use strict';

const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-studio-commerce-'));
const dbPath=path.join(temp,'db.json');
let child;
let base;

function fixture(){return {
  kits:[],
  studioConfig:{products:[
    {id:'canvas',active:true,nameFr:'Toile rectangulaire',nameEn:'Rectangular canvas',basePrice:69.99,extraImagePrice:0,sizes:[{id:'petit',labelFr:'11 x 14',labelEn:'11 x 14',price:49.99},{id:'moyen',labelFr:'16 x 20',labelEn:'16 x 20',price:69.99}],options:[{id:'gift',labelFr:'Emballage cadeau',labelEn:'Gift wrap',active:true,priceDelta:4}]},
    {id:'bag',active:true,nameFr:'Sac en toile',nameEn:'Canvas tote bag',basePrice:34.99,extraImagePrice:6,sizes:[{id:'standard',labelFr:'Format standard',labelEn:'Standard size',price:34.99}],options:[]}
  ]},
  commerceConfig:{},orders:[],discounts:[]
}}

async function freePort(){
  const probe=net.createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  return port;
}

async function quote(item){
  const response=await fetch(base+'/api/checkout-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[item],address:{line1:'123 Main Street',city:'Montreal',province:'QC',postal:'H2A 1A1',country:'Canada'}})});
  return {status:response.status,data:await response.json()};
}

before(async()=>{
  const port=await freePort();
  base=`http://127.0.0.1:${port}`;
  fs.writeFileSync(dbPath,JSON.stringify(fixture()));
  child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),ARTY_DB_PATH:dbPath,ARTY_DATA_DIR:temp,RESEND_API_KEY:'',ARTY_EMAIL_MODE:'log'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error(`Studio commerce server did not start: ${output}`)),10000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Arty! server')){clearTimeout(timer);resolve()}});
    child.stderr.on('data',chunk=>{output+=chunk});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Studio commerce server exited (${code}): ${output}`))});
  });
});

beforeEach(()=>fs.writeFileSync(dbPath,JSON.stringify(fixture())));

after(async()=>{
  if(child&&child.exitCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await closed}
  fs.rmSync(temp,{recursive:true,force:true});
});

test('Studio checkout recognizes custom items and prices them from the saved catalog',async()=>{
  const result=await quote({id:'custom-studio-1',type:'custom-studio',price:0.01,qty:1,customData:{productType:'canvas',size:'moyen',imageCount:1,options:[{id:'gift',priceDelta:999}]}});
  assert.equal(result.status,200);
  assert.equal(result.data.subtotal,73.99);
  assert.equal(result.data.merchandiseTotal,73.99);
});

test('Studio checkout applies quantity and extra-image pricing from the catalog',async()=>{
  const result=await quote({id:'custom-studio-2',type:'custom-studio',price:999,qty:2,customData:{productType:'bag',size:'standard',imageCount:3}});
  assert.equal(result.status,200);
  assert.equal(result.data.subtotal,93.98);
});

test('Studio checkout rejects products and options that are no longer available',async()=>{
  const missingProduct=await quote({id:'custom-studio-3',type:'custom-studio',qty:1,customData:{productType:'deleted-template',size:'standard'}});
  assert.equal(missingProduct.status,400);
  const missingOption=await quote({id:'custom-studio-4',type:'custom-studio',qty:1,customData:{productType:'canvas',size:'moyen',options:[{id:'deleted-option'}]}});
  assert.equal(missingOption.status,400);
});
