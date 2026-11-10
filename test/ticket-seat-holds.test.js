'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HOLD_DURATION_MS, holdExpiresAt, isExpiredEventSeatHold } = require('../ticket-seat-holds');
const origin = '2026-11-09T18:00:00.000Z';
const start = Date.parse(origin);
const active = { eventSeatsReserved:true, eventSeatsReleased:false, paymentStatus:'pending', createdAt:origin };

test('ticket checkout holds seats for exactly 10 minutes', () => {
  assert.equal(HOLD_DURATION_MS, 600000);
  assert.equal(holdExpiresAt(active), start + 600000);
  assert.equal(isExpiredEventSeatHold(active, start + 599999), false);
  assert.equal(isExpiredEventSeatHold(active, start + 600000), true);
});
test('legacy orders with no expiry use their original creation timestamp', () => {
  assert.equal(isExpiredEventSeatHold({...active,createdAt:'2026-11-08T19:00:00Z'}, start), true);
});
test('explicit expiry is respected, and missing timestamps never expire blindly', () => {
  assert.equal(holdExpiresAt({...active, eventHoldExpiresAt:'2026-11-09T18:15:00Z'}), start + 900000);
  assert.equal(isExpiredEventSeatHold({...active, createdAt:'',eventHoldExpiresAt:''}, start + 900000), false);
});
test('successful or released seats can never be cleared by the expiry sweep', () => {
  for (const paymentStatus of ['paid','refund_pending','refunded','refund_needed']) {
    assert.equal(isExpiredEventSeatHold({...active,paymentStatus}, start + 3600000), false);
  }
  assert.equal(isExpiredEventSeatHold({...active,eventSeatsReleased:true}, start + 3600000), false);
  assert.equal(isExpiredEventSeatHold({...active,eventSeatsReserved:false}, start + 3600000), false);
});
test('processing payment requires reconciliation after timeout, not automatic release', () => {
  assert.equal(isExpiredEventSeatHold({...active,paymentStatus:'processing'}, start + 600000), true);
});
