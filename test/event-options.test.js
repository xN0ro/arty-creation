'use strict';
const {test,after,beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'arty-event-options-'));
process.env.ARTY_DATA_DIR = temp;
process.env.RESEND_API_KEY = '';
const server = require('../server');
const listener = server.app.listen(0,'127.0.0.1');
const ready = new Promise(resolve => listener.once('listening',resolve));
const token = role => 'test-event-option-'+role;
beforeEach(() => server.writeDB({
  teamActivities:[{id:99,title:'Legacy activity'}],
  events:[{id:81,title:'Unrelated public event',status:'published'}],
  sessions:['admin','user'].map(role => ({role,tokenHash:crypto.createHash('sha256').update(token(role)).digest('hex'),expiresAt:new Date(Date.now()+60000).toISOString()}))
}));
after(async() => {await new Promise(resolve => listener.close(resolve));fs.rmSync(temp,{recursive:true,force:true});});
async function api(route,method='GET',body,role='admin',lang='fr') {
  await ready;
  const response = await fetch(`http://127.0.0.1:${listener.address().port}/api${route}`,{method,headers:{'Content-Type':'application/json','X-Arty-Language':lang,...(role ? {Authorization:'Bearer '+token(role)} : {})},...(body === undefined ? {} : {body:JSON.stringify(body)})});
  return {status:response.status,headers:response.headers,data:await response.json()};
}
const offer = (overrides={}) => ({title:'Atelier en groupe',description:'Une activité créative.',includes:['Toile','Pinceaux'],price:30,priceUnit:'person',sortOrder:10,published:true,translations:{en:{title:'Group workshop',description:'A creative activity.',includes:['Canvas','Brushes']}},...overrides});

test('legacy offers are not seeded, and every admin route enforces the admin role',async() => {
  assert.deepEqual((await api('/event-options','GET',undefined,null)).data,[]);
  for (const role of [null,'user']) {
    for (const [method,route,body] of [['GET','/admin/event-options'],['POST','/admin/event-options',offer()],['PUT','/admin/event-options/missing',offer()],['DELETE','/admin/event-options/missing']]) {
      assert.equal((await api(route,method,body,role)).status,role ? 403 : 401);
    }
  }
  assert.deepEqual(server.readDB().eventOptions,[]);
  assert.equal(server.readDB().teamActivities[0].id,99);
  assert.equal(server.readDB().events[0].id,81);
});

test('create, edit, translate, hide and delete persist without changing other records',async() => {
  const created = await api('/admin/event-options','POST',offer({id:'injected',extra:'ignored'}));
  assert.equal(created.status,201);
  const id = created.data.option.id;assert.notEqual(id,'injected');assert.equal(created.data.option.extra,undefined);
  assert.equal(server.readDB().eventOptions[0].id,id);
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'db.json'),'utf8')).eventOptions[0].price,30);
  const english = await api('/event-options','GET',undefined,null,'en');
  assert.equal(english.headers.get('Content-Language'),'en');assert.equal(english.data[0].title,'Group workshop');assert.deepEqual(english.data[0].includes,['Canvas','Brushes']);
  const french = await api('/event-options','GET',undefined,null,'fr');assert.equal(french.data[0].title,'Atelier en groupe');
  const raw = await api('/admin/event-options','GET',undefined,'admin','en');assert.equal(raw.data[0].title,'Atelier en groupe');
  const updated = await api('/admin/event-options/'+id,'PUT',offer({title:'Toile commune',price:120,priceUnit:'group',translations:{en:{title:'Shared canvas',description:'A creative activity.',includes:['Canvas','Brushes']}}}));
  assert.equal(updated.data.option.id,id);assert.equal(updated.data.option.price,120);
  assert.equal((await api('/event-options','GET',undefined,null,'en')).data[0].title,'Shared canvas');
  assert.equal((await api('/admin/event-options/'+id,'PUT',{published:false})).status,200);
  assert.deepEqual((await api('/event-options')).data,[]);assert.equal((await api('/admin/event-options')).data.length,1);
  assert.equal((await api('/admin/event-options/'+id,'DELETE')).status,200);
  assert.deepEqual(server.readDB().eventOptions,[]);assert.equal(server.readDB().events[0].id,81);
  assert.equal((await api('/admin/event-options/'+id,'PUT',offer())).status,404);
  assert.equal((await api('/admin/event-options/'+id,'DELETE')).status,404);
});

test('drafts, custom quotes, free options and ordering work; incomplete translations cannot be published',async() => {
  const draft = await api('/admin/event-options','POST',{title:'Brouillon',published:false});assert.equal(draft.status,201);assert.equal(draft.data.option.price,null);
  const missingEnglish = await api('/admin/event-options/'+draft.data.option.id,'PUT',{published:true},'admin','en');assert.equal(missingEnglish.status,400);assert.match(missingEnglish.data.error,/English version/);
  assert.equal((await api('/admin/event-options','POST',offer({translations:{en:{title:'Workshop',description:'Activity',includes:['Canvas']}}}))).status,400);
  await api('/admin/event-options','POST',offer({title:'Sur mesure',price:null,sortOrder:20}));
  await api('/admin/event-options','POST',offer({title:'Offert',price:0,sortOrder:1}));
  const visible = (await api('/event-options')).data;
  assert.deepEqual(visible.map(item=>item.title),['Offert','Sur mesure']);assert.equal(visible[0].price,0);assert.equal(visible[1].price,null);
  assert.equal((await api('/admin/event-options')).data.length,3);
});

test('malformed prices, fields and visibility are rejected before writing',async() => {
  for (const invalid of [{title:''},{title:'x'.repeat(161)},{price:-1},{price:30.123},{price:'abc'},{price:100001},{priceUnit:'invalid'},{sortOrder:-1},{sortOrder:1.5},{published:'false'},{includes:'Canvas'},{includes:Array(25).fill('Canvas')},{includes:['x'.repeat(241)]}]) {
    assert.equal((await api('/admin/event-options','POST',offer(invalid))).status,400,JSON.stringify(invalid));
  }
  assert.deepEqual(server.readDB().eventOptions,[]);
});

function clientFixture() {
  const grid = {innerHTML:''},calls=[];
  const I18n = require('../public/i18n-core');
  const context = {I18n,document:{getElementById:()=>grid},safeText:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),safeAttr:value=>String(value),prefillPrivateEventType:value=>calls.push(value)};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/event-options.js'),'utf8'),context);
  return {grid,calls,run:script=>vm.runInContext(script,context)};
}
test('public card templates escape admin text, preserve zero prices and select the matching quote',() => {
  const f = clientFixture();
  f.run(`eventOptions=[{id:'one',title:'<img src=x onerror=alert(1)>',description:'<script>bad</script>',includes:['<svg onload=bad>'],price:0,priceUnit:'person'},{id:'two',title:'Custom event',includes:[],price:null}];renderEventOptions()`);
  assert.ok(!f.grid.innerHTML.includes('<img'));assert.ok(!f.grid.innerHTML.includes('<script>'));assert.ok(!f.grid.innerHTML.includes('<svg'));
  assert.ok(f.grid.innerHTML.includes('0,00'));assert.ok(f.grid.innerHTML.includes('Sur devis'));
  f.run("selectEventOption('two')");assert.deepEqual(f.calls,['Custom event']);
  f.run("eventOptions=[];renderEventOptions()");assert.ok(f.grid.innerHTML.includes('Parlez-nous'));
  f.run("eventOptionsError=true;renderEventOptions()");assert.ok(f.grid.innerHTML.includes('Réessayer'));
});

test('admin form submits the selected record in both languages and preserves input after a failed save',async() => {
  const nodes = {},requests = [],messages = [];
  const values = {eventOptionEditId:'saved-id',eventOptionTitleFr:'Mon atelier',eventOptionDescriptionFr:'Description FR',eventOptionIncludesFr:'Toile\nPinceaux',eventOptionTitleEn:'My workshop',eventOptionDescriptionEn:'Description EN',eventOptionIncludesEn:'Canvas\nBrushes',eventOptionPrice:'39.50',eventOptionPriceUnit:'group',eventOptionSortOrder:'3'};
  for (const [id,value] of Object.entries(values)) nodes[id] = {value,disabled:false};
  nodes.eventOptionPublished = {checked:true,disabled:false};nodes.eventOptionSave = {disabled:false};
  const controls = Object.values(nodes);let resets=0,fail=true;
  nodes.eventOptionForm = {reportValidity:()=>true,querySelectorAll:()=>controls};
  const context = {I18n:require('../public/i18n-core'),document:{getElementById:id=>nodes[id]},authH:()=>({Authorization:'Bearer test-admin'}),showToast:(message,type)=>messages.push({message,type}),artyFetch:async(url,options)=>{requests.push({url,options});return {ok:!fail,json:async()=>fail ? {error:'Save failed'} : {option:{id:'saved-id',...JSON.parse(options.body)}}};}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/event-options.js'),'utf8'),context);
  context.resetFixture=()=>resets++;
  vm.runInContext('renderAdminEventOptionsList=()=>{};resetAdminEventOption=resetFixture;loadEventOptions=async()=>{}',context);
  await vm.runInContext('saveAdminEventOption({preventDefault(){}})',context);
  assert.equal(resets,0);assert.equal(nodes.eventOptionTitleFr.value,'Mon atelier');assert.ok(controls.every(control=>!control.disabled));assert.equal(messages[0].type,'error');
  fail=false;await vm.runInContext('saveAdminEventOption({preventDefault(){}})',context);
  assert.equal(requests[1].url,'/api/admin/event-options/saved-id');assert.equal(requests[1].options.method,'PUT');
  const body=JSON.parse(requests[1].options.body);assert.equal(body.price,39.5);assert.equal(body.priceUnit,'group');assert.deepEqual(body.translations.en.includes,['Canvas','Brushes']);assert.equal(body.published,true);
  assert.equal(resets,1);assert.equal(messages[1].type,'success');assert.ok(controls.every(control=>!control.disabled));
});
