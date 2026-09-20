'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const Module=require('module');
const realExpress=require('express');
const commerceCore=require('./commerce-core');
const marketingCore=require('./marketing-core');
const crmCore=require('./crm-core');
const googleCalendar=require('./google-calendar');

const DEFAULT_STUDIO_CONFIG={
  version:1,
  products:[
    {id:'canvas',type:'canvas',active:true,nameFr:'Toile rectangulaire',nameEn:'Rectangular canvas',descriptionFr:'Un canevas personnalisé à tracer et à peindre.',descriptionEn:'A custom canvas to trace and paint.',templateImage:'',basePrice:69.99,extraImagePrice:0,sizes:[{id:'petit',labelFr:'11 x 14',labelEn:'11 x 14',price:49.99},{id:'moyen',labelFr:'16 x 20',labelEn:'16 x 20',price:69.99},{id:'grand',labelFr:'18 x 24',labelEn:'18 x 24',price:89.99}],options:[],printArea:{x:3,y:3,w:94,h:94}},
    {id:'bag',type:'bag',active:true,nameFr:'Sac en toile',nameEn:'Canvas tote bag',descriptionFr:'Un sac réutilisable avec votre création à peindre.',descriptionEn:'A reusable tote bag with your custom design to paint.',templateImage:'',basePrice:34.99,extraImagePrice:6,sizes:[{id:'standard',labelFr:'Format standard',labelEn:'Standard size',price:34.99}],options:[],printArea:{x:10,y:13,w:80,h:81}}
  ]
};

function resolveDbPath(){
  if(process.env.ARTY_DB_PATH)return path.resolve(process.env.ARTY_DB_PATH);
  const dataDir=process.env.ARTY_DATA_DIR||process.env.DATA_DIR||process.env.RENDER_DISK_PATH||(process.env.RENDER&&fs.existsSync('/var/data')?'/var/data':path.join(__dirname,'data'));
  return path.resolve(dataDir,'db.json');
}
function readDb(){try{return JSON.parse(fs.readFileSync(resolveDbPath(),'utf8'))}catch{return {}}}
function writeDb(db){const file=resolveDbPath(),dir=path.dirname(file);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const tmp=`${file}.${process.pid}.${Date.now()}.ext.tmp`;fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,file)}
function hashToken(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex')}
function extensionGrant(db,email){const normalized=String(email||'').trim().toLowerCase();return(db.adminAccessGrants||[]).find(grant=>grant.active!==false&&String(grant.email||'').trim().toLowerCase()===normalized&&(grant.emailVerifiedAt||grant.acceptedAt))||null}
function extensionPermission(req){
  const route=String(req.originalUrl||req.url||'').split('?')[0];
  if(route.includes('/admin/crm/customers')||route.includes('/admin/crm/export/customers'))return'customers';
  if(route.includes('/admin/crm/leads')||route.includes('/admin/crm/team')||route.includes('/admin/crm/export/leads'))return'leads';
  if(route.includes('/admin/crm')||route.includes('/admin/crm/export'))return'crm_dashboard';
  if(route.includes('/marketing-config'))return'marketing';
  if(route.includes('/commerce-config'))return'settings';
  if(route.includes('/studio-config'))return'products';
  return'';
}
function adminOnly(req,res,next){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return res.status(401).json({error:'Non authentifié'});
  const db=readDb(),hash=hashToken(token),session=(db.sessions||[]).find(item=>item.tokenHash===hash&&(!item.expiresAt||new Date(item.expiresAt).getTime()>Date.now()));
  if(!session)return res.status(401).json({error:'Non authentifié'});
  const user=(db.users||[]).find(item=>item.id===session.userId)||{},email=String(user.email||session.email||'').trim().toLowerCase();
  const fullAdmin=user.role==='admin'||(db.adminEmails||[]).map(value=>String(value).toLowerCase()).includes(email);
  if(fullAdmin){req.extensionSession={...session,role:'admin',email};return next()}
  const grant=extensionGrant(db,email),permission=extensionPermission(req);
  if(!grant||!permission||!(grant.permissions||[]).includes(permission))return res.status(403).json({error:'Permission insuffisante'});
  req.extensionSession={...session,role:'staff',email,permissions:grant.permissions||[]};next();
}
function text(value,max=160){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}
function crmError(req,fr,en){return requestLanguage(req)==='en'?en:fr}
function csvCell(value){const s=String(value??'');return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function csv(rows,columns){return [columns.map(c=>csvCell(c.label)).join(','),...rows.map(row=>columns.map(c=>csvCell(typeof c.value==='function'?c.value(row):row[c.value])).join(','))].join('\r\n')}
function crmSessionEmail(req){return String(req.extensionSession?.email||'').trim().toLowerCase()}
function crmStaffScoped(req){return req.extensionSession?.role==='staff'&&!(req.extensionSession?.permissions||[]).includes('crm_manager')}
function crmLeadRows(db,req){
  const rows=crmCore.buildLeads(db);
  if(!crmStaffScoped(req))return rows;
  const email=crmSessionEmail(req);
  return rows.filter(lead=>String(lead.owner||'').trim().toLowerCase()===email);
}
function crmCustomerRows(db,req){
  const rows=crmCore.buildCustomerIndex(db);
  if(!crmStaffScoped(req))return rows;
  const email=crmSessionEmail(req);
  return rows.filter(customer=>(customer.owners||[]).map(x=>String(x||'').trim().toLowerCase()).includes(email));
}
function crmScopedDb(db,req){
  if(!crmStaffScoped(req))return db;
  const email=crmSessionEmail(req),owned=item=>String(item?.crm?.owner||'').trim().toLowerCase()===email;
  return{...db,eventRequests:(db.eventRequests||[]).filter(owned),contactRequests:(db.contactRequests||[]).filter(owned),crmLeads:(db.crmLeads||[]).filter(owned)};
}
function crmCanAccessCustomer(db,email,req){
  if(!crmStaffScoped(req))return true;
  const key=String(email||'').trim().toLowerCase();
  return crmCustomerRows(db,req).some(customer=>String(customer.email||'').trim().toLowerCase()===key);
}
function crmCanAccessLead(db,kind,id,req){
  if(!crmStaffScoped(req))return true;
  return crmLeadRows(db,req).some(lead=>String(lead.kind)===String(kind)&&String(lead.id)===String(id));
}
function crmRawLeadItem(db,kind,id){
  const collection=kind==='event'?(db.eventRequests||[]):kind==='contact'?(db.contactRequests||[]):kind==='manual'?(db.crmLeads||[]):[];
  return collection.find(item=>String(item.id)===String(id))||null;
}
function googleCalendarIntegration(db){
  return db.crmIntegrations?.googleCalendar||{};
}
async function syncCrmCalendar(db,lead){
  const item=crmRawLeadItem(db,lead.kind,lead.id);if(!item)return{action:'missing'};
  item.crm=item.crm||{};const prior=item.crm.calendar||{};
  try{
    const result=await googleCalendar.syncFollowUp(lead,prior,googleCalendarIntegration(db));
    item.crm.calendar={eventId:String(result.eventId||''),htmlLink:String(result.htmlLink||prior.htmlLink||''),status:String(result.action||''),syncedAt:new Date().toISOString(),error:''};
    return result;
  }catch(error){
    item.crm.calendar={...prior,status:'error',syncedAt:new Date().toISOString(),error:String(error.message||error).slice(0,1000)};
    return{action:'error',error:String(error.message||error)};
  }
}

function num(value,fallback=0,min=0,max=100000){const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function slug(value,fallback=`product-${Date.now()}`){const cleaned=String(value||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);return cleaned||fallback}
function normalizeSizes(raw,basePrice){const list=Array.isArray(raw)?raw:[];const out=list.slice(0,20).map((size,index)=>({id:slug(size.id||size.labelFr||size.labelEn,`size-${index+1}`),labelFr:text(size.labelFr||size.label||`Format ${index+1}`,80),labelEn:text(size.labelEn||size.labelFr||size.label||`Size ${index+1}`,80),price:num(size.price,basePrice,0,100000)})).filter(size=>size.labelFr||size.labelEn);return out.length?out:[{id:'standard',labelFr:'Format standard',labelEn:'Standard size',price:basePrice}]}
function normalizeOptions(raw){return(Array.isArray(raw)?raw:[]).slice(0,30).map((option,index)=>({id:slug(option.id||option.labelFr||option.labelEn,`option-${index+1}`),labelFr:text(option.labelFr||option.label||`Option ${index+1}`,100),labelEn:text(option.labelEn||option.labelFr||option.label||`Option ${index+1}`,100),priceDelta:num(option.priceDelta,0,0,100000),active:option.active!==false})).filter(option=>option.labelFr||option.labelEn)}
function normalizePrintArea(raw={}){const x=num(raw.x,20,0,95),y=num(raw.y,20,0,95),w=num(raw.w,60,5,100-x),h=num(raw.h,60,5,100-y);return{x,y,w,h}}
function normalizeStudioProduct(raw={},index=0){const type=['canvas','bag','template'].includes(raw.type)?raw.type:'template',id=slug(raw.id||raw.nameFr||raw.nameEn,`product-${index+1}`),basePrice=num(raw.basePrice,type==='bag'?34.99:49.99,0,100000);return{id,type,active:raw.active!==false,nameFr:text(raw.nameFr||raw.name||id,100),nameEn:text(raw.nameEn||raw.nameFr||raw.name||id,100),descriptionFr:text(raw.descriptionFr||raw.description||'',260),descriptionEn:text(raw.descriptionEn||raw.descriptionFr||raw.description||'',260),templateImage:text(raw.templateImage||'',500),basePrice,extraImagePrice:num(raw.extraImagePrice,0,0,10000),sizes:normalizeSizes(raw.sizes,basePrice),options:normalizeOptions(raw.options),printArea:normalizePrintArea(raw.printArea)}}
function normalizeStudioConfig(raw){const source=raw&&typeof raw==='object'?raw:DEFAULT_STUDIO_CONFIG;let products=(Array.isArray(source.products)?source.products:[]).slice(0,40).map(normalizeStudioProduct);if(!products.length)products=DEFAULT_STUDIO_CONFIG.products.map(normalizeStudioProduct);const ids=new Set();products=products.map((product,index)=>{let id=product.id;if(ids.has(id))id=`${id}-${index+1}`;ids.add(id);return{...product,id}});return{version:1,products}}
function getStudioConfig(){const db=readDb();return normalizeStudioConfig(db.studioConfig||DEFAULT_STUDIO_CONFIG)}
function getCommerceConfig(){const db=readDb();return commerceCore.normalizeCommerceConfig(db.commerceConfig||commerceCore.DEFAULT_COMMERCE_CONFIG)}
function getMarketingConfig(){const db=readDb();return marketingCore.normalizeMarketingConfig(db.marketingConfig||marketingCore.DEFAULT_MARKETING_CONFIG)}

function escapeHtml(value){return String(value??'').replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]))}
function escapeAttr(value){return escapeHtml(value).replace(/'/g,'&#39;')}
function jsonScript(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/-->/g,'--\\u003e')}
function loadIndexHtml(){return fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8')}
function requestLanguage(req){return String(req.query?.lang||req.headers['accept-language']||'fr').toLowerCase().startsWith('en')?'en':'fr'}
function entityCollection(db,kind){if(kind==='event')return db.events||[];if(kind==='collection')return db.categories||[];return db.kits||[]}
function schemaFor(config,kind,entity,meta){
  if(kind==='product')return {'@context':'https://schema.org','@type':'Product',name:meta.title.replace(/\s*\|.*$/,''),description:meta.description,image:[meta.image],sku:meta.contentId,url:meta.url,offers:{'@type':'Offer',url:meta.url,priceCurrency:'CAD',price:Number(entity.price)||0,availability:entity.inStock===false?'https://schema.org/OutOfStock':'https://schema.org/InStock'}};
  if(kind==='event'){
    const startDate=entity.date?`${entity.date}${entity.time?`T${String(entity.time).slice(0,5)}:00`:''}`:undefined;
    const locationName=text(entity.location||entity.venue||entity.address||'',180);
    const schema={'@context':'https://schema.org','@type':'Event',name:meta.title.replace(/\s*\|.*$/,''),description:meta.description,image:[meta.image],url:meta.url,eventStatus:'https://schema.org/EventScheduled',eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',offers:{'@type':'Offer',url:meta.url,priceCurrency:'CAD',price:Number(entity.price)||0,availability:'https://schema.org/InStock'}};
    if(startDate)schema.startDate=startDate;if(locationName)schema.location={'@type':'Place',name:locationName};return schema;
  }
  if(kind==='collection')return {'@context':'https://schema.org','@type':'CollectionPage',name:meta.title.replace(/\s*\|.*$/,''),description:meta.description,url:meta.url,image:meta.image};
  return {'@context':'https://schema.org','@type':'WebSite',name:config.brandName,url:config.siteUrl,description:config.defaultDescription};
}
function injectMarketingHead(html,config,kind,entity,meta,landing){
  let output=html;
  const title=meta?.title||config.defaultTitle,description=meta?.description||config.defaultDescription,image=meta?.image||marketingCore.absoluteUrl(config,config.defaultSocialImage),url=meta?.url||config.siteUrl;
  // The base URL must appear before any relative CSS/JS/image references are parsed.
  // Otherwise /products/... or /events/... would try to load /products/styles.css, etc.
  output=output.replace(/<head>/i,'<head>\n  <base href="/">');
  output=output.replace(/<title>[\s\S]*?<\/title>/i,`<title>${escapeHtml(title)}</title>`);
  output=output.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/i,`<meta name="description" content="${escapeAttr(description)}">`);
  const verification=[config.verification.google?`<meta name="google-site-verification" content="${escapeAttr(config.verification.google)}">`:'',config.verification.facebook?`<meta name="facebook-domain-verification" content="${escapeAttr(config.verification.facebook)}">`:''].join('');
  const schema=schemaFor(config,kind,entity||{},meta||{title,url,image,description});
  const extra=`\n  <link rel="canonical" href="${escapeAttr(url)}">\n  <meta property="og:site_name" content="${escapeAttr(config.brandName)}">\n  <meta property="og:type" content="${kind==='product'?'product':kind==='event'?'event':'website'}">\n  <meta property="og:title" content="${escapeAttr(title)}">\n  <meta property="og:description" content="${escapeAttr(description)}">\n  <meta property="og:image" content="${escapeAttr(image)}">\n  <meta property="og:url" content="${escapeAttr(url)}">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:title" content="${escapeAttr(title)}">\n  <meta name="twitter:description" content="${escapeAttr(description)}">\n  <meta name="twitter:image" content="${escapeAttr(image)}">\n  ${verification}\n  <script type="application/ld+json">${jsonScript(schema)}</script>\n  <script>window.__ARTY_MARKETING_LANDING__=${jsonScript(landing||null)};</script>\n`;
  return output.replace('</head>',`${extra}</head>`);
}
function sendMarketingPage(req,res,kind){
  const db=readDb(),config=getMarketingConfig(),lang=requestLanguage(req);
  if(kind==='home'){
    const meta={title:config.defaultTitle,description:config.defaultDescription,image:marketingCore.absoluteUrl(config,config.defaultSocialImage),url:config.siteUrl};
    return res.type('html').send(injectMarketingHead(loadIndexHtml(),config,'home',{},meta,{kind:'home',url:config.siteUrl}));
  }
  const resolved=marketingCore.resolveEntity(config,kind,entityCollection(db,kind),req.params.slug);
  if(!resolved)return res.status(404).type('html').send('ARTY page not found');
  const canonicalPath=new URL(resolved.canonicalUrl).pathname;
  if(req.path!==canonicalPath)return res.redirect(301,`${canonicalPath}${req.originalUrl.includes('?')?'?'+req.originalUrl.split('?').slice(1).join('?'):''}`);
  const meta=marketingCore.buildPageMeta(config,kind,resolved.entity,lang);
  const landing={kind,id:resolved.entity.id,slug:resolved.slug,url:meta.url,contentId:meta.contentId};
  return res.type('html').send(injectMarketingHead(loadIndexHtml(),config,kind,resolved.entity,meta,landing));
}
function buildSitemap(){
  const db=readDb(),config=getMarketingConfig(),urls=[{loc:config.siteUrl,lastmod:''}];
  [['product',db.kits||[]],['event',db.events||[]],['collection',db.categories||[]]].forEach(([kind,list])=>list.forEach(entity=>urls.push({loc:marketingCore.publicUrl(config,kind,entity),lastmod:text(entity.updatedAt||entity.date||'',30)})));
  const xml=urls.map(item=>`  <url><loc>${escapeHtml(item.loc)}</loc>${item.lastmod?`<lastmod>${escapeHtml(item.lastmod.slice(0,10))}</lastmod>`:''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xml}\n</urlset>`;
}
function installMarketingPublicRoutes(app){
  if(app.__artyMarketingPublicInstalled)return;app.__artyMarketingPublicInstalled=true;
  app.get('/',(req,res)=>sendMarketingPage(req,res,'home'));
  app.get('/products/:slug',(req,res)=>sendMarketingPage(req,res,'product'));
  app.get('/events/:slug',(req,res)=>sendMarketingPage(req,res,'event'));
  app.get('/collections/:slug',(req,res)=>sendMarketingPage(req,res,'collection'));
  app.get('/sitemap.xml',(req,res)=>res.type('application/xml').send(buildSitemap()));
  app.get('/robots.txt',(req,res)=>{const config=getMarketingConfig();res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${config.siteUrl}/sitemap.xml\n`) });
}

function installExtensionRoutes(app){
  if(app.__artyExtensionsInstalled)return;app.__artyExtensionsInstalled=true;
  app.get('/api/studio-config',(req,res)=>res.json(getStudioConfig()));
  app.get('/api/admin/studio-config',adminOnly,(req,res)=>res.json(getStudioConfig()));
  app.put('/api/admin/studio-config',adminOnly,(req,res)=>{const db=readDb(),config=normalizeStudioConfig(req.body||{});db.studioConfig=config;writeDb(db);res.json({success:true,config})});
  app.get('/api/commerce-config',(req,res)=>res.json(getCommerceConfig()));
  app.get('/api/admin/commerce-config',adminOnly,(req,res)=>res.json(getCommerceConfig()));
  app.put('/api/admin/commerce-config',adminOnly,(req,res)=>{const db=readDb(),config=commerceCore.normalizeCommerceConfig(req.body||{});db.commerceConfig=config;writeDb(db);res.json({success:true,config})});
  app.get('/api/marketing-config',(req,res)=>res.json(getMarketingConfig()));
  app.get('/api/admin/marketing-config',adminOnly,(req,res)=>res.json(getMarketingConfig()));
  app.put('/api/admin/marketing-config',adminOnly,(req,res)=>{const db=readDb(),config=marketingCore.normalizeMarketingConfig(req.body||{});db.marketingConfig=config;writeDb(db);res.json({success:true,config})});
  app.get('/api/admin/crm/google-calendar/status',adminOnly,(req,res)=>{
    if(req.extensionSession?.role!=='admin')return res.status(403).json({error:crmError(req,'Accès propriétaire requis','Owner access required')});
    res.json(googleCalendar.status(googleCalendarIntegration(readDb())));
  });
  app.post('/api/admin/crm/google-calendar/connect',adminOnly,(req,res)=>{
    if(req.extensionSession?.role!=='admin')return res.status(403).json({error:crmError(req,'Accès propriétaire requis','Owner access required')});
    if(!googleCalendar.oauthReady())return res.status(503).json({error:crmError(req,'Google Calendar OAuth doit être configuré dans Render','Google Calendar OAuth must be configured in Render')});
    const db=readDb(),rawState=crypto.randomBytes(32).toString('hex'),stateHash=hashToken(rawState),now=Date.now();
    db.googleCalendarOAuthStates=(db.googleCalendarOAuthStates||[]).filter(item=>Number(item.expiresAt||0)>now);
    db.googleCalendarOAuthStates.push({stateHash,email:crmSessionEmail(req),createdAt:now,expiresAt:now+10*60*1000});
    writeDb(db);
    res.json({url:googleCalendar.authorizationUrl(rawState)});
  });
  app.post('/api/admin/crm/google-calendar/disconnect',adminOnly,(req,res)=>{
    if(req.extensionSession?.role!=='admin')return res.status(403).json({error:crmError(req,'Accès propriétaire requis','Owner access required')});
    const db=readDb();db.crmIntegrations=db.crmIntegrations||{};delete db.crmIntegrations.googleCalendar;writeDb(db);res.json({success:true});
  });
  app.get('/api/google-calendar/oauth/callback',async(req,res)=>{
    try{
      const state=String(req.query?.state||''),code=String(req.query?.code||''),db=readDb(),now=Date.now(),stateHash=hashToken(state);
      const found=(db.googleCalendarOAuthStates||[]).find(item=>item.stateHash===stateHash&&Number(item.expiresAt||0)>now);
      if(!found||!code)throw new Error('Google Calendar authorization could not be verified.');
      const integration=await googleCalendar.exchangeCode(code);
      db.crmIntegrations=db.crmIntegrations||{};db.crmIntegrations.googleCalendar={...integration,connectedBy:found.email||'',updatedAt:new Date().toISOString()};
      db.googleCalendarOAuthStates=(db.googleCalendarOAuthStates||[]).filter(item=>item.stateHash!==stateHash&&Number(item.expiresAt||0)>now);
      writeDb(db);
      res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>ARTY Google Calendar</title></head><body style="font-family:Arial,sans-serif;padding:40px;text-align:center"><h2>Google Calendar connected</h2><p>You can close this window and return to ARTY.</p><script>try{window.opener&&window.opener.postMessage({type:'ARTY_GOOGLE_CALENDAR_CONNECTED'},location.origin);setTimeout(()=>window.close(),1200)}catch(e){}</script></body></html>`);
    }catch(error){
      res.status(400).type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>ARTY Google Calendar</title></head><body style="font-family:Arial,sans-serif;padding:40px;text-align:center"><h2>Google Calendar connection failed</h2><p>${escapeHtml(error.message||'Unknown error')}</p></body></html>`);
    }
  });
  app.post('/api/admin/crm/quote-preview',adminOnly,(req,res)=>{
    const db=readDb(),body=req.body||{},subtotal=Math.max(0,Number(body.subtotal)||0),shipping=Math.max(0,Number(body.shipping)||0);
    const address=body.address&&typeof body.address==='object'?body.address:{};
    if(subtotal<0.5)return res.status(400).json({error:crmError(req,'Entrez un montant valide','Enter a valid amount')});
    if(commerceCore.isCanada(address.country||'Canada')&&!commerceCore.normalizeProvince(address.province))return res.status(400).json({error:crmError(req,'Province canadienne valide requise','A valid Canadian province is required')});
    const taxes=commerceCore.calculateTaxes(db.commerceConfig,subtotal+shipping,address);
    res.json({subtotal:commerceCore.money(subtotal),shipping:commerceCore.money(shipping),taxTotal:commerceCore.money(taxes.taxTotal||0),taxLines:taxes.taxLines||[],taxProvince:taxes.taxProvince||'',total:commerceCore.money(subtotal+shipping+Number(taxes.taxTotal||0))});
  });
  app.get('/api/admin/crm/summary',adminOnly,(req,res)=>res.json(crmCore.crmSummary(crmScopedDb(readDb(),req))));
  app.get('/api/admin/crm/action-center',adminOnly,(req,res)=>{
    const db=readDb(),data=crmCore.crmActionCenter(crmScopedDb(db,req)),permissions=new Set(req.extensionSession?.permissions||[]);
    if(req.extensionSession?.role!=='admin'&&!permissions.has('orders')){data.recentOrders=[];data.paymentPending=data.eventPaymentsPending;data.orderPaymentsPending=0}
    if(req.extensionSession?.role!=='admin'&&!permissions.has('inventory'))data.lowInventory=[];
    res.json(data);
  });
  app.get('/api/admin/crm/reporting',adminOnly,(req,res)=>res.json(crmCore.crmReporting(crmScopedDb(readDb(),req))));
  app.get('/api/admin/crm/team',adminOnly,(req,res)=>{
    if(crmStaffScoped(req))return res.json([{email:crmSessionEmail(req),name:crmSessionEmail(req),role:'staff'}]);
    const db=readDb(),seen=new Set(),team=[];
    for(const email of (db.adminEmails||[])){const key=String(email||'').toLowerCase();if(!key||seen.has(key))continue;seen.add(key);const user=(db.users||[]).find(u=>String(u.email||'').toLowerCase()===key);team.push({email:key,name:user?.name||key,role:'admin'})}
    for(const grant of (db.adminAccessGrants||[])){const key=String(grant.email||'').toLowerCase();if(!key||seen.has(key)||grant.active===false||!(grant.permissions||[]).includes('leads'))continue;seen.add(key);team.push({email:key,name:grant.name||key,role:'staff'})}
    res.json(team.sort((a,b)=>a.name.localeCompare(b.name)));
  });
  app.get('/api/admin/crm/customers',adminOnly,(req,res)=>res.json(crmCustomerRows(readDb(),req)));
  app.get('/api/admin/crm/customers/:email',adminOnly,(req,res)=>{
    const db=readDb();if(!crmCanAccessCustomer(db,req.params.email,req))return res.status(403).json({error:crmError(req,'Ce client ne vous est pas assigné','This customer is not assigned to you')});
    const detail=crmCore.customerDetail(db,req.params.email);if(!detail)return res.status(404).json({error:crmError(req,'Client introuvable','Customer not found')});res.json(detail);
  });
  app.put('/api/admin/crm/customers/:email/tags',adminOnly,(req,res)=>{
    const db=readDb();if(!crmCanAccessCustomer(db,req.params.email,req))return res.status(403).json({error:crmError(req,'Ce client ne vous est pas assigné','This customer is not assigned to you')});
    const meta=crmCore.updateCustomerTags(db,req.params.email,req.body?.tags);if(!meta)return res.status(400).json({error:crmError(req,'Client invalide','Invalid customer')});writeDb(db);res.json({success:true,tags:meta.tags||[]});
  });
  app.post('/api/admin/crm/customers/:email/notes',adminOnly,(req,res)=>{
    const db=readDb();if(!crmCanAccessCustomer(db,req.params.email,req))return res.status(403).json({error:crmError(req,'Ce client ne vous est pas assigné','This customer is not assigned to you')});
    const note=crmCore.addCustomerNote(db,req.params.email,req.body?.note,crmSessionEmail(req)||'admin');if(!note)return res.status(400).json({error:crmError(req,'Une note est requise','A note is required')});writeDb(db);res.json({success:true,note});
  });
  app.put('/api/admin/crm/customers/:email/preferences',adminOnly,(req,res)=>{
    const db=readDb();if(!crmCanAccessCustomer(db,req.params.email,req))return res.status(403).json({error:crmError(req,'Ce client ne vous est pas assigné','This customer is not assigned to you')});
    const preferences=crmCore.updateCustomerPreferences(db,req.params.email,req.body||{},crmSessionEmail(req)||'admin');if(!preferences)return res.status(400).json({error:crmError(req,'Client invalide','Invalid customer')});writeDb(db);res.json({success:true,preferences});
  });
  app.get('/api/admin/crm/leads',adminOnly,(req,res)=>res.json(crmLeadRows(readDb(),req)));
  app.post('/api/admin/crm/leads',adminOnly,async(req,res)=>{
    const db=readDb(),body={...(req.body||{})};if(crmStaffScoped(req))body.owner=crmSessionEmail(req);
    const lead=crmCore.createManualLead(db,body,crmSessionEmail(req)||'admin');if(!lead)return res.status(400).json({error:crmError(req,'Nom et courriel requis','Name and email are required')});
    const calendarSync=await syncCrmCalendar(db,lead);writeDb(db);res.json({success:true,lead,calendarSync});
  });
  app.post('/api/admin/crm/leads/:kind/:id/convert-event',adminOnly,(req,res)=>{
    const db=readDb(),kind=String(req.params.kind||''),id=String(req.params.id||'');
    if(!['manual','contact','event'].includes(kind))return res.status(400).json({error:crmError(req,'Type de prospect invalide','Invalid lead type')});
    if(!crmCanAccessLead(db,kind,id,req))return res.status(403).json({error:crmError(req,'Ce prospect ne vous est pas assigné','This lead is not assigned to you')});
    const currentLead=crmCore.buildLeads(db).find(lead=>lead.kind===kind&&String(lead.id)===id);
    if(!currentLead)return res.status(404).json({error:crmError(req,'Prospect introuvable','Lead not found')});
    if(kind==='event')return res.json({success:true,lead:currentLead,converted:false});
    const source=crmRawLeadItem(db,kind,id);if(!source)return res.status(404).json({error:crmError(req,'Prospect introuvable','Lead not found')});
    if(source.convertedEventRequestId){
      const existing=crmCore.buildLeads(db).find(lead=>lead.kind==='event'&&String(lead.id)===String(source.convertedEventRequestId));
      if(existing)return res.json({success:true,lead:existing,converted:false});
    }
    let eventId=Date.now();while((db.eventRequests||[]).some(item=>String(item.id)===String(eventId)))eventId++;
    const body=req.body||{},now=new Date().toISOString(),rawAddress=body.address&&typeof body.address==='object'?body.address:{},location=text(rawAddress.line1||body.location||'',240),crm=crmCore.crmMeta(source.crm||{});
    const eventType=text(body.eventType||currentLead.eventType||currentLead.title||'ARTY event',180)||'ARTY event';
    const address={line1:location,city:text(rawAddress.city||'',120),province:text(rawAddress.province||'',80),postal:text(rawAddress.postal||'',30),country:text(rawAddress.country||'Canada',80)||'Canada'};
    const request={
      id:eventId,reference:`EVT-${eventId.toString(36).toUpperCase()}`,locale:source.locale||requestLanguage(req),
      name:currentLead.name||source.name||'',email:currentLead.email||source.email||'',phone:currentLead.phone||source.phone||'',
      eventType,preferredDate:text(body.preferredDate||currentLead.preferredDate||'',20),eventTime:'',
      guests:Math.max(1,Math.min(1000,parseInt(body.guests)||1)),
      address,location:[address.line1,address.city,address.province,address.postal].filter(Boolean).join(', '),
      servicePath:'expert',inventoryItems:[],customKit:null,
      expertBrief:text(body.brief||currentLead.message||source.message||currentLead.title||'',3000),
      message:text(source.message||currentLead.message||'',3000),contactPreference:'email',
      marketingAttribution:source.marketingAttribution||{},
      status:'contactée',adminNote:crm.adminNote||'',quoteAmount:0,quoteDescription:'',quotePaymentStatus:'not_created',
      createdAt:source.createdAt||now,updatedAt:now,
      convertedFromLead:{kind,id},
      crm:{...crm,status:crm.status==='new'?'contacted':crm.status,updatedBy:crmSessionEmail(req)||'admin',updatedAt:now}
    };
    db.eventRequests=Array.isArray(db.eventRequests)?db.eventRequests:[];
    db.eventRequests.push(request);
    source.convertedEventRequestId=eventId;source.convertedAt=now;source.updatedAt=now;
    writeDb(db);
    const lead=crmCore.buildLeads(db).find(item=>item.kind==='event'&&String(item.id)===String(eventId));
    res.json({success:true,lead,converted:true});
  });
  app.patch('/api/admin/crm/leads/:kind/:id',adminOnly,async(req,res)=>{
    const db=readDb();if(!crmCanAccessLead(db,req.params.kind,req.params.id,req))return res.status(403).json({error:crmError(req,'Ce prospect ne vous est pas assigné','This lead is not assigned to you')});
    const body={...(req.body||{})};if(crmStaffScoped(req))body.owner=crmSessionEmail(req);
    const lead=crmCore.updateLead(db,req.params.kind,req.params.id,body,crmSessionEmail(req)||'admin');if(!lead)return res.status(404).json({error:crmError(req,'Prospect introuvable','Lead not found')});
    const calendarSync=await syncCrmCalendar(db,lead);writeDb(db);res.json({success:true,lead,calendarSync});
  });
  app.delete('/api/admin/crm/leads/:kind/:id',adminOnly,async(req,res)=>{
    const db=readDb(),kind=String(req.params.kind||''),id=String(req.params.id||'');
    if(kind!=='manual')return res.status(409).json({error:crmError(req,'Les prospects créés automatiquement par le système ne peuvent pas être supprimés','System-created leads cannot be deleted')});
    const index=(db.crmLeads||[]).findIndex(item=>String(item.id)===id);
    if(index<0)return res.status(404).json({error:crmError(req,'Prospect introuvable','Lead not found')});
    const raw=db.crmLeads[index],crm=crmCore.crmMeta(raw.crm||{}),actor=crmSessionEmail(req);
    if(raw.convertedEventRequestId)return res.status(409).json({error:crmError(req,'Ce prospect est lié à un événement et ne peut plus être supprimé','This lead is linked to an event and can no longer be deleted')});
    if(req.extensionSession?.role!=='admin'&&String(crm.createdBy||'').toLowerCase()!==actor)return res.status(403).json({error:crmError(req,'Vous pouvez supprimer uniquement les prospects que vous avez créés','You can delete only leads you created')});
    const lead=crmCore.buildLeads(db).find(item=>item.kind==='manual'&&String(item.id)===id);
    if(lead&&crm.calendar?.eventId){
      try{await googleCalendar.syncFollowUp({...lead,nextFollowUp:''},crm.calendar,googleCalendarIntegration(db))}catch{}
    }
    db.crmLeads.splice(index,1);writeDb(db);res.json({success:true,id});
  });
  app.get('/api/admin/crm/export/customers.csv',adminOnly,(req,res)=>{
    const rows=crmCustomerRows(readDb(),req),body=csv(rows,[
      {label:'Name',value:'name'},{label:'Email',value:'email'},{label:'Phone',value:'phone'},{label:'Account',value:r=>r.hasAccount?'yes':'no'},
      {label:'Disabled',value:r=>r.disabled?'yes':'no'},{label:'Orders',value:'orderCount'},{label:'Paid orders',value:'paidOrderCount'},
      {label:'Lifetime spend',value:'lifetimeSpend'},{label:'Events',value:'eventRequestCount'},{label:'Last activity',value:'lastActivity'},
      {label:'Tags',value:r=>(r.tags||[]).join('|')},{label:'Preferred language',value:'preferredLanguage'},{label:'Marketing consent',value:r=>r.marketingConsent?'yes':'no'}
    ]);
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="arty-customers.csv"');res.send('\uFEFF'+body);
  });
  app.get('/api/admin/crm/export/leads.csv',adminOnly,(req,res)=>{
    const rows=crmLeadRows(readDb(),req),body=csv(rows,[
      {label:'Reference',value:'reference'},{label:'Name',value:'name'},{label:'Email',value:'email'},{label:'Phone',value:'phone'},
      {label:'Title',value:'title'},{label:'Status',value:'status'},{label:'Owner',value:'owner'},{label:'Expected value',value:'expectedValue'},
      {label:'Final value',value:'finalValue'},{label:'Source',value:'source'},{label:'Campaign',value:'campaign'},{label:'Next follow-up',value:'nextFollowUp'},
      {label:'Lost reason',value:'lostReason'},{label:'Created',value:'createdAt'},{label:'Won at',value:'wonAt'},{label:'Tags',value:r=>(r.tags||[]).join('|')}
    ]);
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="arty-leads.csv"');res.send('\uFEFF'+body);
  });
  app.get('/api/admin/crm/export/backup.json',adminOnly,(req,res)=>{
    if(req.extensionSession?.role!=='admin')return res.status(403).json({error:crmError(req,'Accès propriétaire requis','Owner access required')});
    const db=readDb(),backup={version:2,exportedAt:new Date().toISOString(),customers:crmCore.buildCustomerIndex(db),leads:crmCore.buildLeads(db),crmCustomers:db.crmCustomers||{},crmLeads:db.crmLeads||[]};
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="arty-crm-backup.json"');res.send(JSON.stringify(backup,null,2));
  });
}

function wrappedExpress(...args){
  const app=realExpress(...args),originalUse=app.use.bind(app);let useCount=0;
  installMarketingPublicRoutes(app);
  app.use=function(...useArgs){const result=originalUse(...useArgs);useCount+=1;if(useCount===4)installExtensionRoutes(app);return result};
  return app;
}
Object.assign(wrappedExpress,{static:realExpress.static,Router:realExpress.Router,json:realExpress.json,urlencoded:realExpress.urlencoded,query:realExpress.query,raw:realExpress.raw,text:realExpress.text});
require.cache[require.resolve('express')].exports=wrappedExpress;

function replaceRequired(source,needle,replacement,label){
  if(!source.includes(needle))throw new Error(`ARTY commerce patch failed: ${label}`);
  return source.replace(needle,replacement);
}
function patchServerSource(source){
  source=replaceRequired(source,"const { I18n, middleware: localeMiddleware, catalog: localizeCatalog, orderView: localizeOrder, translations: normalizeTranslations, withLocale } = require('./localization');","const { I18n, middleware: localeMiddleware, catalog: localizeCatalog, orderView: localizeOrder, translations: normalizeTranslations, withLocale } = require('./localization');\nconst commerceCore = require('./commerce-core');\nconst marketingCore = require('./marketing-core');",'commerce and marketing imports');
  source=replaceRequired(source,"function priceOrder(db, items = [], promoCode = '') {","function priceOrder(db, items = [], promoCode = '', address = {}) {",'priceOrder signature');
  source=replaceRequired(source,'return {\n    items:pricedItems,\n    subtotal,\n    discountTotal,\n    discountsApplied,\n    promoCode:context.code,\n    promoCodeValid:context.promoCodeValid,\n    promoCodeQualified,\n    promoCodeApplied,\n    promoDiscountTotal,\n    total:money(subtotal - discountTotal)\n  };',"const commerce = commerceCore.calculateCommerceTotals(db.commerceConfig, pricedItems, subtotal, discountTotal, address);\n  return { items:pricedItems, subtotal, discountTotal, discountsApplied, promoCode:context.code, promoCodeValid:context.promoCodeValid, promoCodeQualified, promoCodeApplied, promoDiscountTotal, ...commerce, total:commerce.total };",'priceOrder commerce totals');
  source=replaceRequired(source,"  if (needsShipping && (!address || !String(address.line1 || '').trim())) return res.status(400).json({ error: I18n.t('Adresse de livraison requise') });","  const shippingAddressError = commerceCore.validateShippingAddress(db.commerceConfig, address, needsShipping);\n  if (shippingAddressError) return res.status(400).json({ error: I18n.t(shippingAddressError) });",'shipping address validation');
  source=replaceRequired(source,"  const pricing = priceOrder(db, built.items, req.body?.promoCode || '');","  const pricing = priceOrder(db, built.items, req.body?.promoCode || '', address);",'order pricing address');
  source=replaceRequired(source,"    subtotal: pricing.subtotal,\n    discountTotal: pricing.discountTotal,\n    discountsApplied: pricing.discountsApplied,\n    promoCode: pricing.promoCode || '',\n    promoCodeApplied: !!pricing.promoCodeApplied,\n    total: pricing.total,","    subtotal: pricing.subtotal,\n    discountTotal: pricing.discountTotal,\n    discountsApplied: pricing.discountsApplied,\n    promoCode: pricing.promoCode || '',\n    promoCodeApplied: !!pricing.promoCodeApplied,\n    merchandiseTotal: pricing.merchandiseTotal,\n    shippingTotal: pricing.shippingTotal,\n    shippingBasePrice: pricing.shippingBasePrice,\n    shippingQualifyingSubtotal: pricing.shippingQualifyingSubtotal,\n    freeShippingApplied: pricing.freeShippingApplied,\n    taxTotal: pricing.taxTotal,\n    taxLines: pricing.taxLines,\n    taxProvince: pricing.taxProvince,\n    taxRate: pricing.taxRate,\n    marketingAttribution: marketingCore.normalizeAttribution(req.body?.marketingAttribution),\n    total: pricing.total,",'order commerce and marketing fields');
  const marker='// ========== ORDERS & BOOKINGS ==========';
  const quoteRoute=`// Server-authoritative checkout quote: discounts, promo codes, shipping and Canadian destination taxes.\napp.post('/api/checkout-quote', optionalAuth, (req, res) => {\n  const db = readDB();\n  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];\n  const address = req.body?.address && typeof req.body.address === 'object' ? req.body.address : {};\n  const promoCode = String(req.body?.promoCode || '').trim().toUpperCase();\n  if (!rawItems.length) return res.status(400).json({ error: I18n.t('Aucun article') });\n  const built = buildOrderItems(db, rawItems);\n  if (built.error) return res.status(400).json({ error: built.error });\n  const needsShipping = built.items.some(item => item.type !== 'event-ticket');\n  if (needsShipping && String(address.country || 'Canada').trim() && !commerceCore.isCanada(address.country) && commerceCore.normalizeCommerceConfig(db.commerceConfig).shipping.canadaOnly) return res.status(400).json({ error: I18n.t('La livraison est actuellement disponible au Canada seulement') });\n  const pricing = priceOrder(db, built.items, promoCode, address);\n  res.json({ success:true, subtotal:pricing.subtotal, discountTotal:pricing.discountTotal, discountsApplied:pricing.discountsApplied, promoCode:pricing.promoCode, promoCodeValid:pricing.promoCodeValid, promoCodeQualified:pricing.promoCodeQualified, promoCodeApplied:pricing.promoCodeApplied, promoDiscountTotal:pricing.promoDiscountTotal, merchandiseTotal:pricing.merchandiseTotal, shippingTotal:pricing.shippingTotal, shippingBasePrice:pricing.shippingBasePrice, shippingQualifyingSubtotal:pricing.shippingQualifyingSubtotal, freeShippingApplied:pricing.freeShippingApplied, needsShipping:pricing.needsShipping, taxTotal:pricing.taxTotal, taxLines:pricing.taxLines, taxProvince:pricing.taxProvince, taxRate:pricing.taxRate, total:pricing.total });\n});\n\n${marker}`
  source=replaceRequired(source,marker,quoteRoute,'checkout quote route');
  return source;
}

const serverPath=require.resolve('./server');
const source=patchServerSource(fs.readFileSync(serverPath,'utf8'));
const compiled=new Module(serverPath,module);
compiled.filename=serverPath;
compiled.paths=Module._nodeModulePaths(path.dirname(serverPath));
require.cache[serverPath]=compiled;
compiled._compile(source,serverPath);
