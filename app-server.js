'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const Module=require('module');
const realExpress=require('express');
const commerceCore=require('./commerce-core');

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
function adminOnly(req,res,next){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return res.status(401).json({error:'Non authentifié'});
  const db=readDb(),hash=hashToken(token),session=(db.sessions||[]).find(item=>item.tokenHash===hash&&(!item.expiresAt||new Date(item.expiresAt).getTime()>Date.now()));
  if(!session)return res.status(401).json({error:'Non authentifié'});
  if(session.role!=='admin')return res.status(403).json({error:'Accès admin requis'});
  req.extensionSession=session;next();
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

function installExtensionRoutes(app){
  if(app.__artyExtensionsInstalled)return;app.__artyExtensionsInstalled=true;
  app.get('/api/studio-config',(req,res)=>res.json(getStudioConfig()));
  app.get('/api/admin/studio-config',adminOnly,(req,res)=>res.json(getStudioConfig()));
  app.put('/api/admin/studio-config',adminOnly,(req,res)=>{const db=readDb(),config=normalizeStudioConfig(req.body||{});db.studioConfig=config;writeDb(db);res.json({success:true,config})});
  app.get('/api/commerce-config',(req,res)=>res.json(getCommerceConfig()));
  app.get('/api/admin/commerce-config',adminOnly,(req,res)=>res.json(getCommerceConfig()));
  app.put('/api/admin/commerce-config',adminOnly,(req,res)=>{const db=readDb(),config=commerceCore.normalizeCommerceConfig(req.body||{});db.commerceConfig=config;writeDb(db);res.json({success:true,config})});
}

function wrappedExpress(...args){
  const app=realExpress(...args),originalUse=app.use.bind(app);let useCount=0;
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
  source=replaceRequired(source,"const { I18n, middleware: localeMiddleware, catalog: localizeCatalog, orderView: localizeOrder, translations: normalizeTranslations, withLocale } = require('./localization');","const { I18n, middleware: localeMiddleware, catalog: localizeCatalog, orderView: localizeOrder, translations: normalizeTranslations, withLocale } = require('./localization');\nconst commerceCore = require('./commerce-core');",'commerce import');
  source=replaceRequired(source,'function priceOrder(db, items = []) {','function priceOrder(db, items = [], address = {}) {','priceOrder signature');
  source=replaceRequired(source,'return { items: pricedItems, subtotal, discountTotal, discountsApplied, total: money(subtotal - discountTotal) };',"const commerce = commerceCore.calculateCommerceTotals(db.commerceConfig, pricedItems, subtotal, discountTotal, address);\n  return { items: pricedItems, subtotal, discountTotal, discountsApplied, ...commerce, total: commerce.total };",'priceOrder commerce totals');
  source=replaceRequired(source,"  if (needsShipping && (!address || !String(address.line1 || '').trim())) return res.status(400).json({ error: I18n.t('Adresse de livraison requise') });","  const shippingAddressError = commerceCore.validateShippingAddress(db.commerceConfig, address, needsShipping);\n  if (shippingAddressError) return res.status(400).json({ error: I18n.t(shippingAddressError) });",'shipping address validation');
  source=replaceRequired(source,'  const pricing = priceOrder(db, built.items);','  const pricing = priceOrder(db, built.items, address);','order pricing address');
  source=replaceRequired(source,"    subtotal: pricing.subtotal,\n    discountTotal: pricing.discountTotal,\n    discountsApplied: pricing.discountsApplied,\n    total: pricing.total,","    subtotal: pricing.subtotal,\n    discountTotal: pricing.discountTotal,\n    discountsApplied: pricing.discountsApplied,\n    merchandiseTotal: pricing.merchandiseTotal,\n    shippingTotal: pricing.shippingTotal,\n    shippingBasePrice: pricing.shippingBasePrice,\n    shippingQualifyingSubtotal: pricing.shippingQualifyingSubtotal,\n    freeShippingApplied: pricing.freeShippingApplied,\n    taxTotal: pricing.taxTotal,\n    taxLines: pricing.taxLines,\n    taxProvince: pricing.taxProvince,\n    taxRate: pricing.taxRate,\n    total: pricing.total,",'order commerce fields');
  const marker='// ========== ORDERS & BOOKINGS ==========';
  const quoteRoute=`// Server-authoritative checkout quote: discounts, shipping and Canadian destination taxes.\napp.post('/api/checkout-quote', optionalAuth, (req, res) => {\n  const db = readDB();\n  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];\n  const address = req.body?.address && typeof req.body.address === 'object' ? req.body.address : {};\n  if (!rawItems.length) return res.status(400).json({ error: I18n.t('Aucun article') });\n  const built = buildOrderItems(db, rawItems);\n  if (built.error) return res.status(400).json({ error: built.error });\n  const needsShipping = built.items.some(item => item.type !== 'event-ticket');\n  if (needsShipping && String(address.country || 'Canada').trim() && !commerceCore.isCanada(address.country) && commerceCore.normalizeCommerceConfig(db.commerceConfig).shipping.canadaOnly) return res.status(400).json({ error: I18n.t('La livraison est actuellement disponible au Canada seulement') });\n  const pricing = priceOrder(db, built.items, address);\n  res.json({ success:true, subtotal:pricing.subtotal, discountTotal:pricing.discountTotal, merchandiseTotal:pricing.merchandiseTotal, shippingTotal:pricing.shippingTotal, shippingBasePrice:pricing.shippingBasePrice, shippingQualifyingSubtotal:pricing.shippingQualifyingSubtotal, freeShippingApplied:pricing.freeShippingApplied, needsShipping:pricing.needsShipping, taxTotal:pricing.taxTotal, taxLines:pricing.taxLines, taxProvince:pricing.taxProvince, taxRate:pricing.taxRate, total:pricing.total });\n});\n\n${marker}`;
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
