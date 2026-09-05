'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const https=require('node:https');
const {EventEmitter}=require('node:events');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-i18n-'));
process.env.ARTY_DATA_DIR=temp;
process.env.RESEND_API_KEY='';
process.env.STRIPE_SECRET_KEY='';
process.env.STRIPE_WEBHOOK_SECRET='';
process.env.ARTY_PUBLIC_URL='https://arty.example.test';
process.env.EMAIL_FROM='ARTY <test@example.test>';
const {I18n,withLocale,catalog,translations}=require('../localization');
const server=require('../server');
const fixture=server.readDB();
for(const field of ['users','sessions','passwordResetTokens','orders','bookings','eventRequests','supportRequests','discounts','refunds','inventoryMovements'])fixture[field]=[];
fixture.adminEmails=['admin@example.test'];
fixture.kits=[{id:1,name:'Bouquet de Roses',description:'Description française personnalisée',price:24.99,inStock:true,stockQty:50,includes:['3 pinceaux'],translations:{en:{name:'Rose Bouquet',description:'Custom English description',includes:['3 brushes']}},sizeOptions:[{id:'large',label:'Grand',priceDelta:5,translations:{en:{label:'Large'}}}]}];
fixture.events=[{id:1,title:'Atelier peinture',description:'Un atelier',date:'2027-01-15',time:'18:00',price:0,maxSpots:10,bookedSpots:0,status:'published',translations:{en:{title:'Painting workshop',description:'A workshop'}}}];
fixture.categories=[{id:1,name:'Fleurs',translations:{en:{name:'Flowers'}}}];
fixture.announcement={enabled:true,message:'Bonjour en français',translations:{en:{message:'Hello in English'}}};
server.writeDB(fixture);
const listener=server.app.listen(0,'127.0.0.1');
const ready=new Promise(resolve=>listener.once('listening',resolve));
async function api(route,lang='en',options={}){await ready;const response=await fetch(`http://127.0.0.1:${listener.address().port}/api${route}`,{...options,headers:{'Content-Type':'application/json','X-Arty-Language':lang,...options.headers}});return {response,data:await response.json()};}
let token;
after(async()=>{await new Promise(resolve=>listener.close(resolve));fs.rmSync(temp,{recursive:true,force:true});});

test('template translation preserves values, markup, IDs, handlers, and French defaults',()=>{
 const render=()=>I18n.html`<button id="button" onclick="send('fr')" aria-label="Panier">${2} place${'s'} restante${'s'}</button><p>${'<strong>Nom</strong>'}</p>`;
 assert.match(withLocale('fr',render),/>2 places restantes</);
 const en=withLocale('en',render);
 assert.match(en,/>2 spots left</);
 assert.match(en,/id="button" onclick="send\('fr'\)" aria-label="Cart"/);
 assert.match(en,/<strong>Nom<\/strong>/); // Values are not globally translated.
 assert.equal(withLocale('en',()=>I18n.t('constructor')),'constructor');
});
test('request locales are isolated across concurrent asynchronous work',async()=>{
 const results=await Promise.all(['fr','en','fr','en'].map(lang=>withLocale(lang,async()=>{await Promise.resolve();return I18n.t('Panier');})));
 assert.deepEqual(results,['Panier','Cart','Panier','Cart']);
});
test('Canadian dates, numbers, and currency follow the selected language',()=>{
 assert.equal(withLocale('en',()=>I18n.currency(24.99)),'$24.99');
 assert.match(withLocale('fr',()=>I18n.currency(24.99)),/24,99\s*\$/);
 assert.equal(withLocale('en',()=>I18n.locale()),'en-CA');
});
test('content translation preserves French records, stable IDs, prices, and English overrides',()=>{
 const source=fixture.kits[0],before=JSON.stringify(source);
 const en=catalog(source,'en');
 assert.equal(en.name,'Rose Bouquet');assert.equal(en.price,24.99);assert.equal(en.sizeOptions[0].id,'large');assert.equal(en.sizeOptions[0].label,'Large');
 assert.equal(JSON.stringify(source),before);assert.equal(catalog(source,'fr').name,'Bouquet de Roses');
 assert.deepEqual(translations({en:{name:'Name',price:0,status:'paid'}}),{en:{name:'Name'}});
});
test('public API localizes content and returns locale and cache headers',async()=>{
 const [fr,en]=await Promise.all([api('/kits','fr'),api('/kits','en')]);
 assert.equal(fr.data[0].name,'Bouquet de Roses');assert.equal(en.data[0].description,'Custom English description');
 assert.equal(en.response.headers.get('content-language'),'en');assert.match(en.response.headers.get('vary'),/X-Arty-Language/);
 assert.equal((await api('/config','en')).data.announcement.message,'Hello in English');
 assert.equal((await api('/kits?lang=fr','en')).data[0].name,'Bouquet de Roses');
});
test('validation messages follow the request language',async()=>{
 assert.equal((await api('/users/login','en',{method:'POST',body:'{}'})).data.error,'Invalid email or password');
 assert.equal((await api('/users/login','fr',{method:'POST',body:'{}'})).data.error,'Courriel ou mot de passe invalide');
});
test('account language is stored and can be changed without altering the profile',async()=>{
 const created=await api('/users/register','en',{method:'POST',body:JSON.stringify({name:'Test Admin',email:'admin@example.test',password:'test-password',confirmPassword:'test-password'})});
 assert.equal(created.response.status,200);token=created.data.token;assert.equal(created.data.user.locale,'en');
 await api('/users/locale','fr',{method:'PUT',headers:{Authorization:`Bearer ${token}`},body:'{}'});
 const me=await api('/users/me','en',{headers:{Authorization:`Bearer ${token}`}});assert.equal(me.data.locale,'fr');assert.equal(me.data.name,'Test Admin');
});
test('admin French source and English product, option, event and announcement content round-trip',async()=>{
 const headers={Authorization:`Bearer ${token}`};
 const record=(await api('/admin/kits','en',{headers})).data[0];assert.equal(record.name,'Bouquet de Roses');
 const saved=await api('/admin/kits/1','en',{method:'PUT',headers,body:JSON.stringify({...record,translations:{en:{name:'English Roses',description:'English copy'}},sizeOptions:[{id:'large',label:'Grand',priceDelta:5,translations:{en:{label:'Large format'}}}]})});
 assert.equal(saved.response.status,200);assert.equal(saved.data.kit.name,'Bouquet de Roses');
 const publicKit=(await api('/kits/1','en')).data;assert.equal(publicKit.name,'English Roses');assert.equal(publicKit.sizeOptions[0].label,'Large format');
 await api('/admin/announcement','en',{method:'PUT',headers,body:JSON.stringify({enabled:true,message:'Annonce française',translations:{en:{message:'English announcement'}}})});
 assert.equal((await api('/announcement','en')).data.message,'English announcement');assert.equal(server.readDB().announcement.message,'Annonce française');
 const category=await api('/admin/categories','en',{method:'POST',headers,body:JSON.stringify({name:'Nouveauté',translations:{en:{name:'New'}}})});assert.equal(category.data.category.translations.en.name,'New');
});
test('orders and free bookings retain customer locale and canonical workflow states',async()=>{
 const order=await api('/orders','en',{method:'POST',body:JSON.stringify({items:[{id:1,qty:1,customData:{kitId:1,sizeId:'large'}}],customer:{name:'Guest',email:'guest@example.test'},address:{line1:'123 Test Street'}})});
 assert.equal(order.response.status,200,JSON.stringify(order.data));assert.equal(order.data.order.total,29.99);assert.equal(order.data.order.locale,'en');assert.equal(order.data.order.status,'en attente de paiement');
 const booking=await api('/bookings','en',{method:'POST',body:JSON.stringify({eventId:1,name:'Guest',email:'guest@example.test',guests:2})});
 assert.equal(booking.response.status,200);assert.equal(booking.data.booking.locale,'en');assert.equal(booking.data.booking.status,'confirmée');
});
test('ticket and order email builders use the stored locale even in a French webhook context',()=>{
 const booking={id:'B1',locale:'en',name:'Customer',guests:2,tickets:[{code:'ARTY-TICKET',admissions:2,holderName:'Customer'}]};
 const ticket=withLocale('fr',()=>server.buildTicketEmailHTML(booking,fixture.events[0]));
 assert.match(ticket,/<html lang="en">/);assert.match(ticket,/Painting workshop/);assert.ok(ticket.includes('?lang=en#'));assert.doesNotMatch(ticket,/Bonjour|Présentez/);
 const order=withLocale('fr',()=>server.buildOrderConfirmationEmailHTML({id:'O1',locale:'en',total:24.99,customer:{name:'Customer'},items:[{name:'Bouquet de Roses',price:24.99,qty:1}],address:{line1:'Address'}}));
 assert.match(order,/Order confirmed/);assert.match(order,/Bouquet of Roses/);assert.match(order,/<html lang="en">/);
});
test('account, quote, support and contact emails use record locale without sending real email',async()=>{
 const captured=[],request=https.request;
 process.env.RESEND_API_KEY='test-key-not-real';
 https.request=(options,callback)=>{const req=new EventEmitter();let body='';req.setTimeout=()=>req;req.write=chunk=>{body+=chunk};req.end=()=>{captured.push(JSON.parse(body));const res=new EventEmitter();res.statusCode=200;callback(res);queueMicrotask(()=>{res.emit('data','{"id":"test"}');res.emit('end');});};return req;};
 try{
  const user={id:'U1',locale:'en',name:'Customer',email:'customer@example.test'};
  for(const name of ['sendAccountWelcomeEmail','sendLoginAlertEmail','sendPasswordResetEmail','sendPasswordChangedEmail'])await withLocale('fr',()=>server[name](user,'test-token'));
  const request={id:'R1',locale:'en',reference:'EVT-1',name:'Customer',email:user.email,customer:user,eventName:'Customer event',servicePath:'expert',guests:2,quoteAmount:50,quoteDescription:'Agreed details',paymentToken:'test-token',paymentTokenExpiresAt:'2027-01-01',subject:'Question',message:'Customer’s own message',adminReply:'Team’s own reply'};
  for(const name of ['sendEventRequestReceiptEmail','sendEventQuotePaymentLinkEmail','sendEventQuotePaidEmail','sendSupportRequestReceiptEmail','sendSupportReplyEmail'])await withLocale('fr',()=>server[name](request));
  await withLocale('fr',()=>server.sendContactReceiptEmail({...request,channel:'contact'}));
  assert.equal(captured.length,10);
  for(const email of captured){assert.match(email.html,/<html lang="en">/);assert.doesNotMatch(email.html,/Bonjour|Vous recevez ce courriel|Créez\. Partagez/);assert.doesNotMatch(email.html,/\uE000\d+\uE001/);}
  assert.equal(captured[0].subject,'Welcome to ARTY — your account is ready');
 }finally{https.request=request;process.env.RESEND_API_KEY='';}
});
