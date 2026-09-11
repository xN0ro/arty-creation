'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const I18n=require('../public/i18n-core');
function fixture(){
  const nodes={},requests=[],messages=[];
  for(const id of ['aCatImg','aCatName','aCatParent','editCatId','aCatImageUpload','aCatUploadStatus','saveCatButton','aCatImagePreview','aCatRemoveImage','catFormTitle','cancelCat'])nodes[id]={value:'',disabled:false,style:{},innerHTML:'',textContent:''};
  nodes.aCatImg.value='/old.png';nodes.aCatName.value='Fleurs';nodes.aCatParent.value='individual';
  nodes.aCatImageUpload.files=[{name:'photo.png',type:'image/png',size:100}];
  nodes.categoryFormCard={querySelectorAll:()=>Object.values(nodes).filter(node=>'disabled' in node)};
  let response=async()=>({ok:true,json:async()=>({url:'/uploads/new.png'})});
  const context={I18n,document:{getElementById:id=>nodes[id]},safeAttr:x=>x,authH:()=>({Authorization:'Bearer admin'}),readAdminImageFile:async()=> 'data:image/png;base64,iVBORw0KGgo=',artyFetch:async(url,options)=>{requests.push({url,options});return response();},showToast:(message,type)=>messages.push({message,type}),loadCategories:async()=>{},allCategories:[{id:2,name:'Nature',parent:'individual',image:'/nature.png'}]};
  vm.createContext(context);const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');vm.runInContext(source.slice(source.indexOf('let categoryImageRequest='),source.indexOf('async function deleteCat')),context);
  return {nodes,requests,messages,run:script=>vm.runInContext(script,context),respond:fn=>{response=fn;}};
}
test('category image upload uses protected storage and keeps the URL hidden until the category is saved',async()=>{
  const f=fixture();await f.run("uploadCategoryImage(document.getElementById('aCatImageUpload'))");
  assert.equal(f.requests[0].url,'/api/admin/product-images');assert.equal(f.requests[0].options.headers.Authorization,'Bearer admin');
  assert.equal(f.nodes.aCatImg.value,'/uploads/new.png');assert.ok(f.nodes.aCatImagePreview.innerHTML.includes('/uploads/new.png'));
  assert.equal(f.nodes.saveCatButton.disabled,false);assert.equal(f.requests.length,1);
  f.respond(async()=>({ok:false,json:async()=>({error:'Cannot save'})}));await f.run('saveCat()');
  assert.equal(JSON.parse(f.requests[1].options.body).image,'/uploads/new.png');assert.equal(f.nodes.aCatImg.value,'/uploads/new.png');assert.equal(f.messages.at(-1).type,'error');assert.equal(f.nodes.saveCatButton.disabled,false);
});
test('invalid or oversized uploads preserve the previous image without a request',async()=>{
  const f=fixture();
  for(const file of [{type:'image/svg+xml',size:100},{type:'image/png',size:11*1024*1024}]){
    f.nodes.aCatImageUpload.files=[file];await f.run("uploadCategoryImage(document.getElementById('aCatImageUpload'))");
    assert.equal(f.nodes.aCatImg.value,'/old.png');
  }
  assert.equal(f.requests.length,0);assert.equal(f.messages.length,2);
});
test('switching categories discards an old upload response; removing an image clears only the form',async()=>{
  const f=fixture();let finish;f.respond(()=>new Promise(resolve=>{finish=resolve;}));
  const upload=f.run("uploadCategoryImage(document.getElementById('aCatImageUpload'))");await Promise.resolve();await Promise.resolve();
  assert.equal(f.nodes.saveCatButton.disabled,true);await f.run('saveCat()');assert.equal(f.requests.length,1);
  f.run('editCat(2)');assert.equal(f.nodes.aCatImg.value,'/nature.png');
  finish({ok:true,json:async()=>({url:'/uploads/obsolete.png'})});await upload;
  assert.equal(f.nodes.aCatImg.value,'/nature.png');assert.ok(f.nodes.aCatImagePreview.innerHTML.includes('/nature.png'));
  f.run('removeCategoryImage()');assert.equal(f.nodes.aCatImg.value,'');assert.equal(f.nodes.aCatImagePreview.hidden,true);assert.equal(f.requests.length,1);
});
test('a failed upload leaves the previous image and re-enables saving',async()=>{
  const f=fixture();f.respond(async()=>({ok:false,json:async()=>({error:'Upload failed'})}));
  await f.run("uploadCategoryImage(document.getElementById('aCatImageUpload'))");
  assert.equal(f.nodes.aCatImg.value,'/old.png');assert.equal(f.nodes.saveCatButton.disabled,false);assert.equal(f.nodes.aCatImageUpload.disabled,false);assert.equal(f.messages.at(-1).type,'error');
});
