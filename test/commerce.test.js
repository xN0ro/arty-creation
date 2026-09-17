'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_COMMERCE_CONFIG,
  normalizeCommerceConfig,
  calculateCommerceTotals,
  validateShippingAddress
} = require('../commerce-core');

function config(overrides = {}) {
  return normalizeCommerceConfig({
    ...DEFAULT_COMMERCE_CONFIG,
    ...overrides,
    shipping:{...DEFAULT_COMMERCE_CONFIG.shipping,...(overrides.shipping||{})},
    taxes:{...DEFAULT_COMMERCE_CONFIG.taxes,...(overrides.taxes||{})}
  });
}

function physical(lineTotal, kitId = 1) {
  return {id:String(kitId),type:'kit',qty:1,lineTotal,price:lineTotal,customData:{kitId}};
}

test('Quebec order taxes merchandise plus shipping with GST and QST', () => {
  const result = calculateCommerceTotals(config(), [physical(50)], 50, 0, {province:'QC',country:'Canada'});
  assert.equal(result.shippingTotal, 9.99);
  assert.equal(result.taxableBase, 59.99);
  assert.deepEqual(result.taxLines.map(line => [line.code,line.rate,line.amount]), [
    ['GST',5,3],
    ['QST',9.975,5.98]
  ]);
  assert.equal(result.taxTotal, 8.98);
  assert.equal(result.total, 68.97);
});

test('Ontario destination uses 13% HST', () => {
  const result = calculateCommerceTotals(config(), [physical(50)], 50, 0, {province:'ON',country:'Canada'});
  assert.equal(result.shippingTotal, 9.99);
  assert.deepEqual(result.taxLines.map(line => [line.code,line.rate,line.amount]), [['HST',13,7.8]]);
  assert.equal(result.total, 67.79);
});

test('Nova Scotia destination uses current 14% HST rate', () => {
  const result = calculateCommerceTotals(config(), [physical(50)], 50, 0, {province:'NS',country:'Canada'});
  assert.deepEqual(result.taxLines.map(line => [line.code,line.rate,line.amount]), [['HST',14,8.4]]);
  assert.equal(result.total, 68.39);
});

test('free shipping threshold is based on physical merchandise after discounts', () => {
  const below = calculateCommerceTotals(config(), [physical(70)], 80, 10, {province:'QC',country:'Canada'});
  assert.equal(below.shippingQualifyingSubtotal, 70);
  assert.equal(below.freeShippingApplied, false);
  assert.equal(below.shippingTotal, 9.99);

  const atThreshold = calculateCommerceTotals(config(), [physical(75)], 80, 5, {province:'QC',country:'Canada'});
  assert.equal(atThreshold.shippingQualifyingSubtotal, 75);
  assert.equal(atThreshold.freeShippingApplied, true);
  assert.equal(atThreshold.shippingTotal, 0);
});

test('highest special product shipping rate wins for a mixed physical order', () => {
  const cfg = config({shipping:{productOverrides:[{kitId:2,price:18.5}]}});
  const result = calculateCommerceTotals(cfg, [physical(20,1),physical(20,2)], 40, 0, {province:'ON',country:'Canada'});
  assert.equal(result.shippingBasePrice, 18.5);
  assert.equal(result.shippingTotal, 18.5);
});

test('ticket-only order has no shipping', () => {
  const ticket = {id:'event-ticket-1',type:'event-ticket',qty:2,lineTotal:80,price:40};
  const result = calculateCommerceTotals(config(), [ticket], 80, 0, {province:'QC',country:'Canada'});
  assert.equal(result.needsShipping, false);
  assert.equal(result.shippingTotal, 0);
});

test('BC provincial tax is opt-in while GST remains enabled', () => {
  const gstOnly = calculateCommerceTotals(config(), [physical(75)], 75, 0, {province:'BC',country:'Canada'});
  assert.deepEqual(gstOnly.taxLines.map(line => line.code), ['GST']);
  assert.equal(gstOnly.taxTotal, 3.75);

  const withPst = calculateCommerceTotals(config({taxes:{collectBCPST:true}}), [physical(75)], 75, 0, {province:'BC',country:'Canada'});
  assert.deepEqual(withPst.taxLines.map(line => line.code), ['GST','PST']);
  assert.equal(withPst.taxTotal, 9);
});

test('shipping address validation requires Canadian province and postal code', () => {
  const cfg = config();
  assert.equal(validateShippingAddress(cfg,{line1:'123 Main',city:'Ottawa',province:'ON',postal:'K1A 0B1',country:'Canada'},true),'');
  assert.match(validateShippingAddress(cfg,{line1:'123 Main',city:'Ottawa',province:'ON',postal:'bad',country:'Canada'},true),/Code postal/);
  assert.match(validateShippingAddress(cfg,{line1:'1 Main',city:'Boston',province:'MA',postal:'02108',country:'USA'},true),/Canada seulement/);
});
