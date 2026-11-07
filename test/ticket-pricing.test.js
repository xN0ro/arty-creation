'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const pricing=require('../public/ticket-pricing-core');

const event={
  id:11,
  price:49,
  ticketOptions:[
    {id:'adult',labelFr:'Adulte',labelEn:'Adult',price:49},
    {id:'child',labelFr:'Enfant',labelEn:'Child',price:25}
  ]
};

test('bilingual adult and child prices remain distinct and validated',()=>{
  const types=pricing.eventOptions(event);
  assert.equal(types.length,2);
  assert.deepEqual(types.map(item=>item.price),[49,25]);
  assert.equal(pricing.optionById(event,'child').labelEn,'Child');
  assert.equal(pricing.optionLabel(types[1],'fr'),'Enfant');
  assert.equal(2*types[0].price+3*types[1].price,173);
});

test('legacy events without tier options keep a single regular-price ticket',()=>{
  assert.deepEqual(pricing.eventOptions({id:7,price:49}),[]);
  assert.equal(pricing.itemId(7,''),'event-ticket-7');
  assert.deepEqual(pricing.parseItemId('event-ticket-7'),{eventId:7,optionId:''});
});

test('ticket type IDs encode distinct cart lines for same event',()=>{
  const adult=pricing.itemId(11,'adult'),child=pricing.itemId(11,'child');
  assert.notEqual(adult,child);
  assert.deepEqual(pricing.parseItemId(adult),{eventId:11,optionId:'adult'});
  assert.deepEqual(pricing.parseItemId(child),{eventId:11,optionId:'child'});
  assert.equal(pricing.parseItemId('event-ticket-11-child-bogus!'),null);
});

test('rejects missing labels, invalid and manipulated prices, duplicate ids',()=>{
  assert.throws(()=>pricing.normalizeOptions([{id:'adult',labelFr:'Adulte',labelEn:'',price:49}]),/labels/);
  assert.throws(()=>pricing.normalizeOptions([{id:'adult',labelFr:'Adulte',labelEn:'Adult',price:-1}]),/price/);
  assert.throws(()=>pricing.normalizeOptions([{id:'adult',labelFr:'Adulte',labelEn:'Adult',price:'25.999'}]),/price/);
  assert.throws(()=>pricing.normalizeOptions([{id:'adult',labelFr:'Adulte',labelEn:'Adult',price:''}]),/price/);
  assert.throws(()=>pricing.normalizeOptions([{id:'adult',labelFr:'Adulte',labelEn:'Adult',price:49},{id:'adult',labelFr:'Autre',labelEn:'Another',price:25}]),/unique/);
});

test('limits event tier count to eight and allows valid decimal prices',()=>{
  assert.equal(pricing.normalizeOptions([{id:'child',labelFr:'Enfant',labelEn:'Child',price:'25.50'}])[0].price,25.5);
  assert.throws(()=>pricing.normalizeOptions(Array.from({length:9},(_,i)=>({id:'tier'+i,labelFr:'T'+i,labelEn:'T'+i,price:10}))),/Maximum 8/);
});


test('event detail and event listing use built-in ticket option price display',()=>{
  const fs=require('node:fs');
  const app=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
  assert.match(app,/function eventTicketTierPricesHTML\(/);
  assert.match(app,/eventTicketTierPricesHTML\(ev\)/);
  assert.match(app,/eventTicketTierPricesHTML\(ev,'card'\)/);
  assert.match(app,/ARTYTicketPricingUI\?\.showBookingOptions\?\.\(ev\)/);
});

test('updated page invalidates cached app.js after ticket-admin price save changes',()=>{
  const fs=require('node:fs');
  const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');
  assert.match(html,/app\.js\?v=20261106-ticket-pricing-fix-2/);
  assert.match(html,/ticket-pricing-ui\.js\?v=20261106-types-2/);
  const app=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
  assert.match(app,/p\.ticketOptions=types/);
});
