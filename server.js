'use strict';

// Render is configured to start `node server.js`.
// Keep the original application untouched in core-server.js while loading
// the Studio + commerce + marketing extensions around it.
const Module = require('module');
const fs = require('fs');
const path = require('path');
const commerceCore = require('./commerce-core');
const marketingCore = require('./marketing-core');
const originalResolveFilename = Module._resolveFilename;
const originalReadFileSync = fs.readFileSync;
const corePath = path.join(__dirname, 'core-server.js');

// Fail a deployment early if the commerce core ever stops producing the
// expected destination-tax and free-shipping results.
(() => {
  const cfg = commerceCore.DEFAULT_COMMERCE_CONFIG;
  const item = {id:'1',kitId:1,type:'kit',qty:1,price:50,lineTotal:50};
  const qc = commerceCore.calculateCommerceTotals(cfg,[item],50,0,{province:'QC',country:'Canada'});
  const on = commerceCore.calculateCommerceTotals(cfg,[item],50,0,{province:'ON',country:'Canada'});
  const freeItem = {id:'1',kitId:1,type:'kit',qty:1,price:75,lineTotal:75};
  const free = commerceCore.calculateCommerceTotals(cfg,[freeItem],75,0,{province:'QC',country:'Canada'});
  if (qc.total !== 68.97 || qc.shippingTotal !== 9.99 || qc.taxTotal !== 8.98) throw new Error('ARTY commerce sanity check failed for Quebec');
  if (on.total !== 67.79 || on.taxTotal !== 7.8) throw new Error('ARTY commerce sanity check failed for Ontario');
  if (free.shippingTotal !== 0 || free.freeShippingApplied !== true) throw new Error('ARTY commerce sanity check failed for free shipping');
})();

// Marketing URLs and identifiers are deliberately deterministic because ad,
// analytics and catalog platforms must all refer to the same content IDs.
(() => {
  const cfg = marketingCore.normalizeMarketingConfig({siteUrl:'https://creationarty.com'});
  const product = {id:42,name:'Été Méditerranéen'};
  if (marketingCore.entitySlug(cfg,'product',product) !== 'ete-mediterraneen-42') throw new Error('ARTY marketing slug sanity check failed');
  if (marketingCore.contentId('product',42) !== 'ARTY-PRODUCT-42') throw new Error('ARTY marketing content ID sanity check failed');
  if (marketingCore.publicUrl(cfg,'product',product) !== 'https://creationarty.com/products/ete-mediterraneen-42') throw new Error('ARTY marketing URL sanity check failed');
})();

Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === './server' && parent && path.basename(parent.filename || '') === 'app-server.js') {
    return corePath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// app-server compiles the preserved core as an extension module. The original
// server only listens when it is the process main module, so make that one
// startup guard unconditional in the source string passed to the compiler.
fs.readFileSync = function(file, ...args) {
  const value = originalReadFileSync.call(this, file, ...args);
  if (path.resolve(String(file)) !== path.resolve(corePath) || typeof value !== 'string') return value;
  return value.replace(
    "if (require.main === module) app.listen(PORT, () => console.log(`Arty! server → http://localhost:${PORT}`));",
    "app.listen(PORT, () => console.log(`Arty! server → http://localhost:${PORT}`));"
  );
};

require('./app-server');
