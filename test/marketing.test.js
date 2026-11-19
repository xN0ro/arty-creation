'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const marketing=require('../marketing-core');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const { spawn }=require('node:child_process');
const { setTimeout:delay }=require('node:timers/promises');

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

test('the public storefront serves localized content, links, and accurate structured data before JavaScript runs', async t => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arty-storefront-'));
  t.after(() => fs.rmSync(temp, { recursive:true, force:true }));
  const listener = net.createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const base = 'http://127.0.0.1:' + port;

  const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0,10);
  const kit = {
    id:1, name:'Tournesol à la fenêtre', categoryId:1, homeFavorite:true, image:'/sunflower.webp', price:19.98,
    description:'Kit de peinture créative à tracer et à peindre', includes:['Toile','Pinceaux'],
    sizeOptions:[{ id:'9x12', label:'9 × 12 po', priceDelta:3 }],
    translations:{ en:{ name:'Sunflower by the window', description:'Creative paintng kit-Trace and Paint' } }
  };
  const event = {
    id:7, status:'published', title:'Brunch créatif', description:'Peinture guidée.', date:future, time:'10:30', duration:'2:30',
    location:'30 Metcalfe St, Ottawa, ON K1P 5B6', price:49, maxSpots:12, bookedSpots:12,
    ticketOptions:[{ id:'regular', labelFr:'Adulte', labelEn:'Adult', price:49 }, { id:'child', labelFr:'Enfant', labelEn:'Child', price:25 }],
    translations:{ en:{ title:'Art Brunch', description:'Guided painting.' } }
  };
  const dbPath = path.join(temp, 'db.json');
  const db = JSON.parse(fs.readFileSync(path.join(root, 'data', 'db.json'), 'utf8'));
  fs.writeFileSync(dbPath, JSON.stringify({
    ...db,
    marketingConfig:{siteUrl:'https://creationarty.com', defaultTitle:'ARTY Creation'},
    kits:[kit, { ...kit, id:2, name:'Pivoine blanche', description:'Notre description.', translations:{en:{description:'Our own description.'}} }],
    categories:[{id:1,name:'Fleurs',translations:{en:{name:'Flowers'}}}],
    events:[event, {...event,id:8,bookedSpots:3,location:'Galeries de Hull, Gatineau',description:'Chez Âmes Créatives.'},
      {...event,id:9,status:'draft'}, {...event,id:10,date:'2020-01-01'}],
    bookings:[], orders:[]
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd:root, windowsHide:true, stdio:['ignore','ignore','pipe'],
    env:{ ...process.env, PORT:String(port), ARTY_DATA_DIR:temp, ARTY_DB_PATH:dbPath, ARTY_EMAIL_MODE:'log' }
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exit;
  });
  let ready = false;
  for (let attempt = 0; attempt < 80 && child.exitCode === null; attempt++) {
    const response = await fetch(base + '/api/config').catch(() => null);
    if (response?.ok) { ready = true; break; }
    await delay(50);
  }
  assert.ok(ready, errors || 'The test server did not start');
  async function get(route, options) {
    const response = await fetch(base + route, options);
    return { response, html:await response.text() };
  }
  const schema = html => {
    const source = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
    return source ? JSON.parse(source[1]) : null;
  };

  const { html:fr } = await get('/');
  const { response:enResponse, html:en } = await get('/en/', { headers:{ 'Accept-Language':'fr-CA' } });
  assert.match(fr, /<h1>Kits de peinture/);
  assert.match(fr, /<title>Kits de peinture et ateliers à Ottawa–Gatineau/);
  assert.equal(enResponse.headers.get('content-language'), 'en-CA');
  assert.match(en, /<html lang="en"/);
  assert.match(en, /<title>DIY Painting Kits &amp; Art Workshops in Ottawa–Gatineau/);
  assert.match(en, /DIY painting kits.*and art workshops/);
  assert.match(en, /hreflang="fr-CA" href="https:\/\/creationarty\.com\/"/);
  assert.match(fr, /hreflang="en-CA" href="https:\/\/creationarty\.com\/en\/"/);
  assert.match(en, /rel="canonical" href="https:\/\/creationarty\.com\/en\/"/);
  assert.match(en, /href="\/en\/products\/tournesol-a-la-fenetre-1"/);
  const legacy = await fetch(base + '/?lang=en&utm_source=facebook', {redirect:'manual'});
  assert.equal(legacy.headers.get('location'), '/en/?utm_source=facebook');
  const renamed = await fetch(base + '/en/products/old-slug-1?utm_source=facebook', {redirect:'manual'});
  assert.equal(renamed.headers.get('location'), '/en/products/tournesol-a-la-fenetre-1?utm_source=facebook');

  const { html:product } = await get('/en/products/tournesol-a-la-fenetre-1');
  assert.match(product, /class="page active" id="page-product"/);
  assert.match(product, /<h1>Sunflower by the window<\/h1>/);
  assert.match(product, /Paint a potted sunflower/);
  assert.match(product, /alt="Yellow sunflower in a pot beside a blue window"/);
  assert.equal(schema(product).offers.price, 22.98);
  assert.equal(schema(product).url, 'https://creationarty.com/en/products/tournesol-a-la-fenetre-1');
  assert.match((await get('/en/products/pivoine-blanche-2')).html, /Our own description\./);
  assert.match((await get('/en/collections/fleurs-1')).html, /href="\/en\/products\/tournesol-a-la-fenetre-1"/);

  const { html:events } = await get('/en/events');
  assert.match(events, /class="page active" id="page-party"/);
  assert.match(events, /href="\/en\/events\/brunch-creatif-7"/);
  const { html:soldOut } = await get('/en/events/brunch-creatif-7');
  assert.match(soldOut, /<h1>Art Brunch<\/h1>/);
  assert.match(soldOut, /K1P 5L4/);
  const eventSchema = schema(soldOut);
  assert.equal(eventSchema.location.address['@type'], 'PostalAddress');
  assert.equal(eventSchema.location.address.postalCode, 'K1P 5L4');
  assert.equal(Date.parse(eventSchema.endDate) - Date.parse(eventSchema.startDate), 150 * 60_000);
  assert.deepEqual(eventSchema.offers.map(offer => [offer.name,offer.price,offer.availability]), [
    ['Adult',49,'https://schema.org/SoldOut'], ['Child',25,'https://schema.org/SoldOut']
  ]);
  const inStock = schema((await get('/events/brunch-creatif-8')).html);
  assert.equal(inStock.location.address.addressLocality, 'Gatineau');
  assert.equal(inStock.offers[0].availability, 'https://schema.org/InStock');
  assert.equal((await get('/events/brunch-creatif-9')).response.status, 404);
  assert.equal(schema((await get('/events/brunch-creatif-10')).html), null);

  const { html:sitemap } = await get('/sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/creationarty\.com\/en\/events\/brunch-creatif-7<\/loc>/);
  assert.doesNotMatch(sitemap, /brunch-creatif-(9|10)/);
  assert.match((await get('/robots.txt')).html, /Allow: \/api\/events\$/);
  assert.equal((await fetch(base + '/api/kits')).headers.get('x-robots-tag'), 'noindex');
});
