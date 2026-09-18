'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const Module=require('module');
const realExpress=require('express');
const commerceCore=require('./commerce-core');
const marketingCore=require('./marketing-core');
const crmCore=require('./crm-core');

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
function extensionPermission(req){const path=String(req.originalUrl||req.url||'').split('?')[0];if(path.includes('/admin/crm'))return'dashboard';if(path.includes('/marketing-config'))return'marketing';if(path.includes('/commerce-config'))return'settings';if(path.includes('/studio-config'))return'products';return''}
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
  app.get('/api/admin/crm/summary',adminOnly,(req,res)=>res.json(crmCore.crmSummary(readDb())));
  app.get('/api/admin/crm/customers',adminOnly,(req,res)=>res.json(crmCore.buildCustomerIndex(readDb())));
  app.get('/api/admin/crm/customers/:email',adminOnly,(req,res)=>{const detail=crmCore.customerDetail(readDb(),req.params.email);if(!detail)return res.status(404).json({error:'Customer not found'});res.json(detail)});
  app.put('/api/admin/crm/customers/:email/tags',adminOnly,(req,res)=>{const db=readDb(),meta=crmCore.updateCustomerTags(db,req.params.email,req.body?.tags);if(!meta)return res.status(400).json({error:'Invalid customer'});writeDb(db);res.json({success:true,tags:meta.tags||[]})});
  app.post('/api/admin/crm/customers/:email/notes',adminOnly,(req,res)=>{const db=readDb(),note=crmCore.addCustomerNote(db,req.params.email,req.body?.note,req.extensionSession?.email||'admin');if(!note)return res.status(400).json({error:'Note required'});writeDb(db);res.json({success:true,note})});
  app.get('/api/admin/crm/leads',adminOnly,(req,res)=>res.json(crmCore.buildLeads(readDb())));
  app.patch('/api/admin/crm/leads/:kind/:id',adminOnly,(req,res)=>{const db=readDb(),lead=crmCore.updateLead(db,req.params.kind,req.params.id,req.body||{},req.extensionSession?.email||'admin');if(!lead)return res.status(404).json({error:'Lead not found'});writeDb(db);res.json({success:true,lead})});
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
