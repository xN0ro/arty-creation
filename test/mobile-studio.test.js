'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fitZoom,pinch,constrainPan,controller}=require('../public/mobile-gestures');
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);

test('phone canvas fit uses product bounds and can fit below the old 30% minimum',()=>{
  const portrait={w:560,h:700};
  const zoom=fitZoom(320,420,portrait);
  assert.ok(portrait.w*zoom<320);assert.ok(portrait.h*zoom<420);
  // The artwork uses the available screen, without fitting all the empty canvas margins.
  assert.ok(portrait.w*zoom>200);
  const keyboard=fitZoom(320,170,portrait);
  assert.ok(keyboard<.3);assert.ok(portrait.h*keyboard<170);
  const bag={w:630,h:625};
  const landscape=fitZoom(440,220,bag,true);
  assert.ok((bag.h+140)*landscape<220);
});

test('pinch keeps the point between the fingers fixed while zooming and panning',()=>{
  const start={zoom:.5,pan:{x:20,y:-10},midpoint:{x:130,y:170},distance:100};
  const center={x:180,y:260},points=[{x:50,y:190},{x:250,y:190}];
  const result=pinch(start,points,center);
  near(result.zoom,1);
  near((130-center.x-start.pan.x)/start.zoom,(150-center.x-result.pan.x)/result.zoom);
  near((170-center.y-start.pan.y)/start.zoom,(190-center.y-result.pan.y)/result.zoom);
  assert.equal(pinch({...start,distance:1},points,center).zoom,2.5);
  assert.equal(pinch({...start,distance:100000},points,center).zoom,.08);
});

test('panning cannot lose the artwork entirely outside the viewport',()=>{
  const viewport={width:390,height:500},product={w:560,h:700};
  const pan=constrainPan({x:10000,y:-10000},1,viewport,product);
  assert.ok(pan.x<product.w/2+viewport.width/2);
  assert.ok(Math.abs(pan.y)<product.h/2+viewport.height/2);
  assert.deepEqual(constrainPan({x:0,y:0},.5,viewport,product),{x:0,y:0});
});

function gestureFixture(hit=true){
  const calls=[],artwork={x:0},saved={x:0};let view={zoom:.5,pan:{x:0,y:0}};
  const input=controller({
    viewport:()=>structuredClone(view),center:()=>({x:0,y:0}),
    setViewport:next=>{view=next;calls.push('viewport');},
    beginEdit:()=>{saved.x=artwork.x;calls.push('begin');return hit;},
    moveEdit:event=>{artwork.x=event.clientX;calls.push('move');},
    endEdit:()=>calls.push('commit'),
    cancelEdit:()=>{artwork.x=saved.x;calls.push('rollback');}
  });
  const event=(id,x,y=0)=>({pointerId:id,clientX:x,clientY:y});
  return {input,event,calls,artwork,view:()=>view};
}

test('one finger edits once; an unrelated pointer cannot move the selection',()=>{
  const f=gestureFixture();
  f.input.down(f.event(1,20));f.input.move(f.event(9,900));assert.equal(f.artwork.x,0);
  f.input.move(f.event(1,40));f.input.up(f.event(1,40));
  assert.equal(f.artwork.x,40);assert.deepEqual(f.calls,['begin','move','commit']);
});

test('adding a second finger rolls back the provisional edit and only changes the view',()=>{
  const f=gestureFixture();
  f.input.down(f.event(1,20));f.input.move(f.event(1,25));
  f.input.down(f.event(2,125));assert.equal(f.artwork.x,0);
  f.input.move(f.event(2,225));near(f.view().zoom,1);
  f.input.up(f.event(1,25));const before=structuredClone(f.view());
  f.input.move(f.event(2,300));assert.deepEqual(f.view(),before);assert.equal(f.artwork.x,0);
  f.input.up(f.event(2,300));assert.ok(!f.calls.includes('commit'));
  // A new gesture can edit normally after both fingers are lifted.
  f.input.down(f.event(3,10));f.input.move(f.event(3,50));f.input.up(f.event(3,50));assert.equal(f.artwork.x,50);
});

test('touching empty canvas pans; cancelled edits restore their starting position',()=>{
  const blank=gestureFixture(false);
  blank.input.down(blank.event(1,30,40));blank.input.move(blank.event(1,70,25));blank.input.up(blank.event(1,70,25));
  assert.deepEqual(blank.view(),{zoom:.5,pan:{x:40,y:-15}});assert.equal(blank.artwork.x,0);
  const f=gestureFixture();f.input.down(f.event(1,10));f.input.move(f.event(1,90));f.input.up(f.event(1,90),true);
  assert.equal(f.artwork.x,0);assert.equal(f.calls.at(-1),'rollback');
  f.input.down(f.event(2,20));f.input.move(f.event(2,80));f.input.cancel();assert.equal(f.artwork.x,0);
});

test('the Studio adapter preserves artwork and undo history, and opens the cart on mobile',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const canvas={width:1200,height:900,style:{},getBoundingClientRect:()=>({left:0,top:0,width:600,height:450}),setPointerCapture(){}};
  const viewport={clientWidth:390,clientHeight:500,getBoundingClientRect:()=>({left:0,top:0,width:390,height:500})};
  const environment={I18n:require('../public/i18n-core'),ArtyStudioTouch:require('../public/mobile-gestures'),console,URLSearchParams,URL,setTimeout,clearTimeout,Map,Image:class{},requestAnimationFrame:()=>0,cancelAnimationFrame(){},location:{hash:'#/studio'},matchMedia:()=>({matches:true,addEventListener(){}}),addEventListener(){},localStorage:{getItem(){return null},setItem(){}},document:{addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,getElementById:id=>id==='designStudioCanvas'?canvas:id==='designStudioCanvasScroll'?viewport:null,documentElement:{style:{setProperty(){}}}}};
  environment.window=environment;const context=vm.createContext(environment);
  for(const file of ['mobile.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run("drawDesignStudio=()=>{};renderDesignStudioLibrary=()=>{};renderDesignStudioInspector=()=>{};designStudioState=designStudioInitialState();designStudioState.zoom=.5;designStudioState.elements=[{id:'small',type:'shape',shape:'circle',x:.5,y:.5,w:.1,h:.1}];designStudioState.selectedId='small';designStudioState.future=[{marker:'keep'}];designStudioRuntime.canvas=document.getElementById('designStudioCanvas');initMobileStudioCanvas(designStudioRuntime.canvas)");
  const event=(id,x,y=225)=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch',preventDefault(){}});
  // The centre of a small shape remains a move target, even near its large touch handles.
  canvas.onpointerdown(event(1,300));assert.equal(run('designStudioRuntime.dragMode'),'move');
  canvas.onpointermove(event(1,320));assert.ok(run('designStudioState.elements[0].x')>.5);
  canvas.onpointerdown(event(2,400));
  near(run('designStudioState.elements[0].x'),.5);
  assert.equal(run('designStudioState.history.length'),0);assert.equal(run("designStudioState.future[0].marker"),'keep');
  canvas.onpointermove(event(2,480));canvas.onpointerup(event(1,320));canvas.onpointerup(event(2,480));
  assert.equal(run('designStudioState.history.length'),0);near(run('designStudioState.elements[0].w'),.1);
  // A tap selects without consuming undo or deleting redo.
  run('designStudioState.zoom=.5');canvas.onpointerdown(event(3,300));canvas.onpointerup(event(3,300));
  assert.equal(run('designStudioState.history.length'),0);assert.equal(run('designStudioState.future.length'),1);
  run("exportDesignStudioView=async()=> 'data:image/png;base64,test';saveCart=()=>{};updateCartUI=()=>{};showToast=()=>{};openCart=()=>window.openedMobileCart=true;setDesignStudioBusy=busy=>designStudioRuntime.busy=busy;designStudioState.quantity=2");
  await run('addDesignStudioToCart()');
  assert.equal(environment.openedMobileCart,true);assert.equal(run('cart.length'),1);assert.equal(run('cart[0].qty'),2);assert.equal(run('cart[0].price'),69.99);
  near(run('cart[0].customData.elements[0].x'),.5);
});
