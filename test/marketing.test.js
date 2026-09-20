'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const marketing=require('../marketing-core');
const fs=require('node:fs');
const path=require('node:path');

test('creates stable accent-safe product URLs and IDs',()=>{
  const config=marketing.normalizeMarketingConfig({siteUrl:'https://creationarty.com'});
  const product={id:12,name:'Été Méditerranéen'};
  assert.equal(marketing.entitySlug(config,'product',product),'ete-mediterraneen-12');
  assert.equal(marketing.publicUrl(config,'product',product),'https://creationarty.com/products/ete-mediterraneen-12');
  assert.equal(marketing.contentId('product',12),'ARTY-PRODUCT-12');
});

test('supports event and collection marketing paths',()=>{
  const config=marketing.normalizeMarketingConfig({siteUrl:'https://creationarty.com/'});
  const event={id:5,title:'Mediterranean Colors'};
  const category={id:8,name:'Kids Events'};
  assert.equal(marketing.publicUrl(config,'event',event),'https://creationarty.com/events/mediterranean-colors-5');
  assert.equal(marketing.publicUrl(config,'collection',category),'https://creationarty.com/collections/kids-events-8');
  assert.equal(marketing.contentId('event',5),'ARTY-EVENT-5');
});

test('page overrides control canonical slug and social metadata',()=>{
  const config=marketing.normalizeMarketingConfig({
    siteUrl:'https://creationarty.com',
    pages:{events:{'5':{slug:'october-art-night',title:'October Art Night | ARTY',description:'Reserve your ARTY experience.',image:'/event.jpg'}}}
  });
  const event={id:5,title:'Old title',description:'Old description',image:'/old.jpg',price:55};
  const meta=marketing.buildPageMeta(config,'event',event,'en');
  assert.equal(meta.slug,'october-art-night');
  assert.equal(meta.url,'https://creationarty.com/events/october-art-night');
  assert.equal(meta.title,'October Art Night | ARTY');
  assert.equal(meta.description,'Reserve your ARTY experience.');
  assert.equal(meta.image,'https://creationarty.com/event.jpg');
});

test('old generated links can still resolve by trailing numeric ID',()=>{
  const config=marketing.normalizeMarketingConfig({siteUrl:'https://creationarty.com'});
  const products=[{id:44,name:'New Product Name'}];
  const resolved=marketing.resolveEntity(config,'product',products,'old-product-name-44');
  assert.equal(resolved.entity.id,44);
  assert.equal(resolved.slug,'new-product-name-44');
});

test('order attribution is sanitized and bounded',()=>{
  const attribution=marketing.normalizeAttribution({
    sessionId:'session-123',
    firstTouch:{source:'facebook',medium:'paid_social',campaign:'launch',landingPage:'https://creationarty.com/events/test',capturedAt:'2026-09-17T12:00:00Z',unexpected:'remove-me'},
    lastTouch:{source:'google',medium:'cpc',gclid:'abc123'}
  });
  assert.equal(attribution.sessionId,'session-123');
  assert.equal(attribution.firstTouch.source,'facebook');
  assert.equal(attribution.lastTouch.source,'google');
  assert.equal(attribution.firstTouch.unexpected,undefined);
});


test('campaign parameters keep the selected destination path',()=>{
  const config=marketing.normalizeMarketingConfig({siteUrl:'https://creationarty.com'});
  const product={id:12,name:'Été Méditerranéen'};
  const url=new URL(marketing.publicUrl(config,'product',product));
  url.searchParams.set('utm_source','facebook');
  url.searchParams.set('utm_medium','paid_social');
  url.searchParams.set('utm_campaign','october_art_brunch');
  assert.equal(url.pathname,'/products/ete-mediterraneen-12');
  assert.equal(url.searchParams.get('utm_campaign'),'october_art_brunch');
});

test('clean marketing landing waits until the destination page is routed before removing the hash',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','public','marketing-client.js'),'utf8');
  assert.match(source,/classList\.contains\('active'\)/);
  assert.match(source,/if\(routed\).*history\.replaceState/);
  assert.match(source,/attempts<40/);
});
