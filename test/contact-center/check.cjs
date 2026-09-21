/* DOM integration only: no real orders, emails, browser layout or payment activity. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM,VirtualConsole} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'../..');
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn) { for(let i=0;i<100;i++){if(fn())return;await wait(10);}throw Error('UI did not settle'); }
async function setup(t,{url='https://arty.test/contact',language='fr',width=1440,user=null}={}) {
  const errors=[],calls=[];let send=async()=>({success:true,reference:'SUP-TEST-123',emailStatus:'sent'});
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...a)=>errors.push(a.join(' ')));
  const html=fs.readFileSync(root+'/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window,d=w.document,ctx=dom.getInternalVMContext();
  const observers=[];const NativeObserver=w.MutationObserver;
  w.MutationObserver=class extends NativeObserver{constructor(fn){super(fn);observers.push(this);}};
  t.after(async()=>{observers.forEach(observer=>observer.disconnect());await wait(30);w.close();assert.deepEqual(errors,[]);});
  w.innerWidth=width;w.innerHeight=844;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.Headers=Headers;w.AbortController=AbortController;w.ResizeObserver=class{observe(){}disconnect(){}};
  w.matchMedia=q=>({matches:q.includes('max-width')?width<=parseInt(q.match(/\d+/)[0]):false,addEventListener(){},removeEventListener(){}});
  w.localStorage.setItem('arty_language',language);
  if(user){w.localStorage.setItem('arty_user',JSON.stringify(user));w.localStorage.setItem('arty_token','test-token');}
  w.fetch=async(url,options={})=>{
    const endpoint=new URL(url,w.location.href).pathname;let data=[];
    if(endpoint==='/api/config')data={announcement:{enabled:false,message:''}};
    else if(endpoint==='/api/users/me')data=user;
    else if(endpoint==='/api/announcement')data={enabled:false,message:''};
    else if(endpoint==='/api/contact'){calls.push(JSON.parse(options.body));data=await send(calls.at(-1));}
    return new Response(JSON.stringify(data),{status:data?.error?400:200,headers:{'Content-Type':'application/json'}});
  };
  for(const file of ['i18n-en.js','i18n-core.js','i18n-client.js','mobile-gestures.js','mobile.js','app.js','contact-center.js','event-options.js','mobile-commerce.js'])vm.runInContext(fs.readFileSync(root+'/public/'+file,'utf8'),ctx,{filename:file});
  await until(()=>d.querySelector('#contactCenterForm'));
  return {w,d,calls,run:code=>vm.runInContext(code,ctx),send:fn=>send=fn,set(key,value){const el=d.getElementById('contact-'+key);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));},topic(key){const el=d.querySelector(`[name="topic"][value="${key}"]`);el.checked=true;el.dispatchEvent(new w.Event('change',{bubbles:true}));},submit(){d.querySelector('#contactCenterForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}};
}
function fill(a){a.set('name','Test Customer');a.set('email','test@example.test');a.set('message','Can you help me with this order, please?');}

test('the clean URL opens a dedicated, labelled page with no public mailbox list',async t=>{
  const {d}=await setup(t);
  assert(d.getElementById('page-contact').classList.contains('active'));assert(!d.getElementById('page-home').classList.contains('active'));
  assert.equal(d.querySelector('[data-contact-link]').getAttribute('href'),'/contact');assert.equal(d.querySelector('[data-contact-link]').getAttribute('aria-current'),'page');
  assert.equal(d.querySelectorAll('#page-contact a[href^="mailto:"]').length,0);assert.equal(d.querySelectorAll('#page-home a[href^="mailto:"]').length,0);
  assert.equal(d.querySelectorAll('#contactCenterForm [name="topic"]').length,6);
  for(const el of d.querySelectorAll('#contactCenterForm input:not([type="radio"]),#contactCenterForm textarea'))assert(d.querySelector(`label[for="${el.id}"]`));
  const ids=[...d.querySelectorAll('[id]')].map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
  assert.equal(d.title,'Contact & assistance | ARTY');
});
test('topics show useful conditional fields without erasing the draft',async t=>{
  const a=await setup(t);fill(a);a.set('orderReference','ORD-123');
  a.topic('événement');assert(a.d.getElementById('contact-eventDate'));assert(!a.d.getElementById('contact-orderReference'));
  a.set('eventDate','2027-07-22');a.set('guests','25');a.topic('livraison');assert.equal(a.d.getElementById('contact-orderReference').value,'ORD-123');
  a.topic('événement');assert.equal(a.d.getElementById('contact-eventDate').value,'2027-07-22');assert.equal(a.d.getElementById('contact-guests').value,'25');
  assert.equal(a.d.getElementById('contact-message').value,'Can you help me with this order, please?');
});
test('invalid fields are announced inline, focused and corrected without submitting',async t=>{
  const a=await setup(t);a.submit();assert.equal(a.calls.length,0);assert.equal(a.d.activeElement.id,'contact-name');
  assert.equal(a.d.querySelectorAll('[aria-invalid="true"]').length,3);
  fill(a);assert.equal(a.d.querySelectorAll('[aria-invalid="true"]').length,0);
  a.topic('événement');a.set('guests','0');a.submit();assert.equal(a.calls.length,0);assert.equal(a.d.activeElement.id,'contact-guests');
});
test('a double submission sends once and gives an accessible reference and confirmation',async t=>{
  const a=await setup(t);fill(a);let finish;a.send(()=>new Promise(resolve=>finish=resolve));
  a.submit();a.submit();assert.equal(a.calls.length,1);assert(a.d.querySelector('.contact-form-fields').disabled);assert.equal(a.d.querySelector('form').getAttribute('aria-busy'),'true');
  finish({success:true,reference:'SUP-TEST-123',emailStatus:'sent'});await until(()=>a.d.querySelector('#contactSuccess'));
  assert.equal(a.d.activeElement.id,'contactSuccess');assert(a.d.querySelector('#contactSuccess').textContent.includes('SUP-TEST-123'));assert(a.d.querySelector('#contactSuccess').textContent.includes('test@example.test'));assert(!a.d.querySelector('#contactCenterForm'));
  a.d.getElementById('contactNewRequest').click();assert.equal(a.d.getElementById('contact-message').value,'');assert.equal(a.d.getElementById('contact-email').value,'');
});
test('a connection failure preserves the draft and reuses the submission key on retry',async t=>{
  const a=await setup(t);fill(a);a.send(async()=>{throw new a.w.TypeError('Failed to fetch');});a.submit();
  await until(()=>!a.d.getElementById('contactFormError').hidden);assert.equal(a.d.activeElement.id,'contactFormError');
  assert.equal(a.d.getElementById('contact-email').value,'test@example.test');assert(!a.d.querySelector('.contact-form-fields').disabled);
  const key=a.calls[0].requestKey;await a.w.setArtyLanguage('en');assert.equal(a.d.getElementById('contact-message').value,'Can you help me with this order, please?');
  a.send(async()=>({success:true,reference:'SUP-RETRY',emailStatus:'pending'}));a.submit();await until(()=>a.d.getElementById('contactSuccess'));
  assert.equal(a.calls[1].requestKey,key);assert(a.d.getElementById('contactSuccess').textContent.includes('Your request is saved even if'));
});
test('editing a failed submission creates a new key and server errors keep the entered details',async t=>{
  const a=await setup(t);fill(a);a.send(async()=>({error:'Please review your details.'}));a.submit();await until(()=>!a.d.getElementById('contactFormError').hidden);
  assert(a.d.getElementById('contactFormError').textContent.includes('Please review'));const key=a.calls[0].requestKey;
  a.set('message','Here are the corrected details about my kit.');a.submit();await until(()=>a.calls.length===2&&!a.d.getElementById('contactFormError').hidden);
  assert.notEqual(a.calls[1].requestKey,key);assert.equal(a.d.getElementById('contact-message').value,'Here are the corrected details about my kit.');
});
test('language changes preserve the selected topic, optional details and visible labels',async t=>{
  const a=await setup(t,{width:390});fill(a);a.topic('événement');a.set('guests','12');
  await a.w.setArtyLanguage('en');assert.equal(a.d.querySelector('[name="topic"]:checked').value,'événement');assert.equal(a.d.getElementById('contact-guests').value,'12');
  assert(a.d.querySelector('label[for="contact-guests"]').textContent.includes('Group size'));assert(a.d.getElementById('contactTopicHint').textContent.includes('occasion'));assert.equal(a.d.title,'Contact & support | ARTY');
  assert.equal(a.d.querySelectorAll('#navDrawer').length,1);assert(!a.d.querySelector('.arty-mobile-product-dock'));assert(!a.d.querySelector('.arty-mobile-checkout-dock'));
});
test('a pending send can finish after navigation without moving focus or reopening the page',async t=>{
  const a=await setup(t);fill(a);let finish;a.send(()=>new Promise(resolve=>finish=resolve));a.submit();
  a.w.location.hash='#/privacy';await until(()=>a.d.getElementById('page-privacy').classList.contains('active'));
  finish({success:true,reference:'SUP-NAV',emailStatus:'sent'});await until(()=>a.d.getElementById('contactSuccess'));
  assert(a.d.getElementById('page-privacy').classList.contains('active'));assert.notEqual(a.d.activeElement.id,'contactSuccess');
  a.w.location.hash='#/contact';await until(()=>a.d.getElementById('page-contact').classList.contains('active'));assert(a.d.getElementById('contactSuccess').textContent.includes('SUP-NAV'));
});
test('direct topic links and signed-in defaults work, with no stored contact draft',async t=>{
  const a=await setup(t,{url:'https://arty.test/#/contact?topic=produit',user:{id:2,name:'Signed In',email:'buyer@example.test',role:'user'}});
  assert.equal(a.d.querySelector('[name="topic"]:checked').value,'produit');assert.equal(a.d.getElementById('contact-name').value,'Signed In');
  assert.equal(a.d.getElementById('contact-email').value,'buyer@example.test');a.set('message','A private message for the team.');
  assert(!JSON.stringify({...a.w.localStorage,...a.w.sessionStorage}).includes('A private message'));
  a.w.scrollToSection('contact');await until(()=>a.w.location.hash==='#/contact');assert(a.d.getElementById('page-contact').classList.contains('active'));
});
test('contact CSS is isolated and includes small-screen, keyboard and reduced-motion treatments',async t=>{
  const {d}=await setup(t,{width:320});const style=d.createElement('style');style.textContent=fs.readFileSync(root+'/public/contact-center.css','utf8');d.head.appendChild(style);
  let count=0;function inspect(rules){for(const rule of rules){if(rule.selectorText){count++;for(const selector of rule.selectorText.split(','))assert(/^(#page-contact|\.home-contact-invite)/.test(selector.trim()),selector);}if(rule.cssRules)inspect(rule.cssRules);}}inspect(style.sheet.cssRules);
  assert(count>100);assert(style.textContent.includes('@media(max-width:540px)'));assert(style.textContent.includes(':focus-visible'));assert(style.textContent.includes('prefers-reduced-motion'));
});
