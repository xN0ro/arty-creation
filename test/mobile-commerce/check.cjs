/* Isolated DOM integration checks. Geometry and Stripe state are simulated; no live orders or payments. */
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs');const vm=require('vm');const assert=require('node:assert/strict');const path=require('path');
const repo=path.resolve(__dirname,'../..');
const commerce=require(repo+'/commerce-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const kits=[
 {id:1,name:'Tournesol',price:19.98,inStock:true,image:'/test.png',homeFavorite:true,categoryId:1,sizeOptions:[{id:'standard',label:'11 × 14',priceDelta:5},{id:'small',label:'9 × 12',priceDelta:0}],addOns:[{id:'easel',label:'Chevalet',priceDelta:7}]},
 {id:2,name:'Maisons',price:24.99,inStock:true,image:'/test.png',homeFavorite:true,categoryId:1},
 {id:3,name:'Fleurs',price:19.99,inStock:true,image:'/test.png',homeFavorite:true,categoryId:1}
];
const seed={categories:[{id:1,name:'Nature'}]};
const results=[];
function ok(name){results.push(name);console.log('PASS',name)}
async function create(width=390,{script=true,language='fr'}={}){
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('Could not parse CSS stylesheet'))errors.push(e.message)});vc.on('error',(...e)=>errors.push(e.join(' ')));
 const html=fs.readFileSync(repo+'/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 const dom=new JSDOM(html,{url:'https://arty.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window,d=w.document;const ctx=dom.getInternalVMContext();let raf=0;const realRAF=w.requestAnimationFrame.bind(w);w.requestAnimationFrame=fn=>{raf++;return realRAF(fn)};
 w.innerWidth=width;w.innerHeight=844;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 const queries=[];w.matchMedia=query=>{const match=()=>{const max=query.match(/max-width:\s*(\d+)/),min=query.match(/min-width:\s*(\d+)/);return (!max||w.innerWidth<=+max[1])&&(!min||w.innerWidth>=+min[1])};const q={media:query,get matches(){return match()},listeners:[],addEventListener(type,fn){this.listeners.push(fn)},removeEventListener(){}};queries.push(q);return q};
 w.ResizeObserver=class{observe(){}disconnect(){}};
 function visible(el){return !el.hidden&&!el.closest('[hidden]')&&![el,...parents(el)].some(n=>n.style?.display==='none'||(n.classList?.contains('page')&&!n.classList.contains('active')))}
 function parents(el){const a=[];while(el.parentElement){el=el.parentElement;a.push(el)}return a}
 w.HTMLElement.prototype.getClientRects=function(){return visible(this)?[{top:1000,bottom:1050,left:0,right:300,width:300,height:50}]:[]};
 w.HTMLElement.prototype.getBoundingClientRect=function(){const nav=this.id==='navbar',announce=this.id==='siteAnnouncement';return {top:nav?0:announce?64:1000,bottom:nav?64:announce?104:1050,left:0,right:w.innerWidth,width:w.innerWidth,height:nav?64:announce?40:50}};
 w.localStorage.setItem('arty_language',language);w.sessionStorage.setItem('arty_home_random_favorite_ids_v1',JSON.stringify([1,2,3,4,5]));
 w.fetch=async(url,options={})=>{const u=new URL(url,w.location.href),route=u.pathname;let value;
  if(route==='/api/config')value={stripeConfigured:true,ticketPaymentsConfigured:true,stripePublishableKey:'pk_test_fixture',stripeMode:'test',announcement:{enabled:true,message:'Livraison gratuite dès 75 $'}};
  else if(route==='/api/kits')value=kits;
  else if(route==='/api/categories')value=seed.categories;
  else if(route==='/api/commerce-config')value=commerce.DEFAULT_COMMERCE_CONFIG;
  else if(route==='/api/checkout-quote'){const data=JSON.parse(options.body),items=data.items.map(i=>({...i,lineTotal:i.price*i.qty})),subtotal=items.reduce((s,i)=>s+i.lineTotal,0);value=commerce.calculateCommerceTotals(commerce.DEFAULT_COMMERCE_CONFIG,items,subtotal,0,data.address)}
  else if(route==='/api/orders')throw Error('Order writes are forbidden in UI tests');
  else if(route==='/api/marketing-config')value={consent:{enabled:false}};
  else value=[];
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 };
 const files=['i18n-en.js','i18n-core.js','i18n-client.js','mobile-gestures.js','mobile.js','app.js','event-options.js','commerce-client.js'];if(script)files.push('mobile-commerce.js');
 for(const f of files)vm.runInContext(fs.readFileSync(repo+'/public/'+f,'utf8'),ctx,{filename:f});
 await sleep(120);
 return {w,d,errors,dom,run:code=>vm.runInContext(code,ctx),getRaf:()=>raf,async resize(value){w.innerWidth=value;queries.forEach(q=>q.listeners.forEach(fn=>fn({matches:q.matches})));w.dispatchEvent(new w.Event('resize'));await sleep(90)},async route(hash){w.location.hash=hash;await sleep(100)}};
}
(async()=>{
 const a=await create();const {w,d}=a;
 assert.equal(d.querySelectorAll('#navDrawer').length,1);assert.equal(d.querySelectorAll('.arty-mobile-bottom-nav').length,0);ok('One mobile navigation, no legacy duplicate bar');
 assert.deepEqual([...d.querySelector('#page-home').children].slice(0,4).map(e=>e.classList[0]),['hero','popular-section','categories-section','why-section']);ok('Products and categories follow the mobile hero');
 await a.route('#/paintings');assert.equal(d.querySelector('#kitSearchInput').closest('.catalog-toolbar')!=null,true);
 const search=d.querySelector('#kitSearchInput');search.value='Tournesol';search.dispatchEvent(new w.Event('input',{bubbles:true}));await sleep(80);assert(d.querySelectorAll('#kitsGrid .kit-card').length>0);assert(d.querySelectorAll('#kitsGrid .kit-card').length<kits.length);ok('Visible search uses the existing catalog filter');
 w.resetCatalogFilters();await sleep(80);assert.equal(search.value,'');assert.equal(d.querySelectorAll('#kitSearchInput').length,1);ok('Reset keeps the single search input in sync');
 await a.route('#/product/1');let dock=d.querySelector('.arty-mobile-product-dock');assert(dock);assert.equal(dock.querySelector('strong').textContent,d.querySelector('#productConfiguredPrice').textContent);
 const addon=d.querySelector('.product-addon-input');assert(addon);addon.checked=true;addon.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(90);assert.equal(dock.querySelector('strong').textContent,d.querySelector('#productConfiguredPrice').textContent);ok('Product dock follows the actual size and add-on price');
 w.toggleMobile();await sleep(80);assert(dock.hidden);w.closeMobileNavigation();await sleep(80);assert(!dock.hidden);ok('Product action hides behind the menu');
 w.addToCart(1);w.openCart();await sleep(100);assert(dock.hidden);assert.equal(d.querySelector('#cartSidebar').inert,false);assert.equal(d.querySelector('#cartSidebar').getAttribute('aria-modal'),'true');
 const plus=d.querySelector('.cart-qty-control button[aria-label="Augmenter la quantité"]');plus.click();await sleep(80);assert.equal(d.querySelector('.cart-qty-control span').textContent,'2');ok('Cart quantity controls use the existing cart and update correctly');
 d.querySelector('#cartSidebar').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(80);assert.equal(d.querySelector('#cartSidebar').inert,true);ok('Cart closes with Escape and removes hidden controls from focus');
 await a.route('#/checkout');await sleep(250);const summary=d.querySelector('.arty-mobile-order-summary');assert(summary);assert.equal(summary.open,false);assert(summary.querySelector('.checkout-summary-card'));assert(d.querySelector('.checkout-layout').firstElementChild===summary);
 assert.equal(d.querySelector('.arty-mobile-checkout-dock strong').textContent,d.querySelector('#checkoutCommerceTotals .checkout-commerce-total strong').textContent);ok('Collapsed order summary and dock share server-calculated totals');
 const province=d.querySelector('#coProvince');province.value='ON';province.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(350);assert.equal(d.querySelector('.arty-mobile-checkout-dock strong').textContent,d.querySelector('#checkoutCommerceTotals .checkout-commerce-total strong').textContent);assert(d.querySelector('#checkoutCommerceTotals').textContent.includes('HST'));ok('Destination tax changes reach the summary and dock');
 d.querySelector('.arty-mobile-checkout-dock button').click();await sleep(60);assert.equal(d.querySelectorAll('.arty-mobile-field-error').length,4);assert.equal(d.activeElement.id,'coName');ok('Missing checkout details show inline errors and focus the first field without creating an order');
 const name=d.querySelector('#coName');name.value='Mobile Test';name.dispatchEvent(new w.Event('input',{bubbles:true}));assert(!name.hasAttribute('aria-invalid'));ok('Corrected fields clear their error state');
 let calls=0;const stripe=d.querySelector('#stripePayBtn');stripe.onclick=()=>calls++;d.querySelector('#stripePaymentPanel').style.display='block';await sleep(80);const pay=d.querySelector('.arty-mobile-checkout-dock button');assert(pay.textContent.includes('Payer'));pay.click();assert.equal(calls,1);
 stripe.disabled=true;stripe.textContent='Paiement en cours…';await sleep(80);assert.equal(pay.disabled,true);assert.equal(pay.textContent,'Paiement en cours…');ok('Payment dock follows the Stripe panel, busy label and disabled state');
 stripe.disabled=false;d.querySelector('#stripePaymentPanel').style.display='none';d.querySelector('#placeOrderBtn').disabled=true;d.querySelector('#placeOrderBtn').textContent='Préparation du paiement…';await sleep(80);assert.equal(pay.textContent,'Préparation du paiement…');assert(pay.disabled);ok('Preparing payment cannot be submitted twice');
 let before=a.getRaf();await sleep(220);assert(a.getRaf()-before<=1,`idle RAF ${a.getRaf()-before}`);ok('Mobile script settles when idle instead of looping each frame');
 await a.resize(1440);assert.equal(d.querySelectorAll('[data-mobile-commerce]').length,0);assert(d.querySelector('#kitSearchInput').closest('#catalogSidebar'));assert(d.querySelector('.checkout-summary-card').parentElement.classList.contains('checkout-layout'));
 assert.deepEqual([...d.querySelector('#page-home').children].slice(0,4).map(e=>e.classList[0]),['hero','why-section','popular-section','categories-section']);ok('Resizing to desktop restores original sections, search, summary and controls');
 await a.resize(390);assert(d.querySelector('.arty-mobile-order-summary'));assert(d.querySelector('#kitSearchInput').closest('.catalog-toolbar'));ok('Returning to mobile rebuilds enhancements once');
 await a.route('#/paintings');assert.equal(d.querySelectorAll('.arty-mobile-checkout-dock').length,0);ok('Docks clean up when leaving checkout');
 assert.equal(a.errors.length,0,a.errors.join('\n'));
 const desktop=await create(1440);assert.equal(desktop.d.querySelectorAll('[data-mobile-commerce]').length,0);const untouched=await create(1440,{script:false});
 const normalize=el=>el.outerHTML.replace(/\sdata-mobile[^\s=>]*(?:="[^"]*")?/g,'');
 for(const selector of ['#navbar','#page-home','#page-paintings','#cartSidebar'])assert.equal(normalize(desktop.d.querySelector(selector)),normalize(untouched.d.querySelector(selector)),selector);
 ok('Fresh desktop DOM matches the baseline without mobile additions');
 const en=await create(390,{language:'en'});assert.equal(en.d.querySelector('.arty-mobile-events-link').textContent,'Explore our events →');await en.route('#/product/1');assert.equal(en.d.querySelector('.arty-mobile-product-dock button').textContent,'Buy now');ok('New mobile controls render in English and French');assert.equal(en.errors.length,0,en.errors.join('\n'));

 const edge=await create(320);await edge.route('#/product/1');edge.run("allKits.find(k=>k.id===1).inStock=false;renderProductPage(1)");await sleep(80);assert(edge.d.querySelector('.arty-mobile-product-dock button').disabled);ok('Sold-out product cannot be purchased from the mobile dock');
 edge.run("cart=[{id:'ticket-test',type:'event-ticket',name:'Test event',price:55,qty:2,image:'',customData:{eventDate:'2027-01-01'}}]");await edge.route('#/checkout');await sleep(250);assert(!edge.d.querySelector('#coAddress'));edge.d.querySelector('.arty-mobile-checkout-dock button').click();await sleep(40);assert.equal(edge.d.querySelectorAll('.arty-mobile-field-error').length,3);ok('Ticket-only checkout does not require a shipping address');
 edge.run('cart=[];renderCheckoutPage()');await sleep(100);assert(!edge.d.querySelector('.arty-mobile-checkout-dock'));assert(!edge.d.querySelector('.arty-mobile-order-summary'));ok('Empty checkout removes purchase controls and summary');
 await edge.route('#/paintings');for(const width of [320,360,390,430,768,820,821,1080,1440]){await edge.resize(width);assert.equal(!!edge.d.querySelector('.arty-mobile-search'),width<=820);assert.equal(edge.d.querySelectorAll('#kitSearchInput').length,1);assert.equal(edge.d.querySelectorAll('#navDrawer').length,1)}ok('Mobile additions follow the 820px boundary across nine viewport widths');
 assert.equal(edge.errors.length,0,edge.errors.join('\n'));
 console.log(JSON.stringify({passed:results.length,checks:results},null,2));process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
