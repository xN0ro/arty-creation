'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {recordCancellation,clearCancellation,cancellationDetails}=require('../order-cancellation');
test('expired tickets receive a durable reason and actor',()=>{
  const order={status:'annulée'};
  const r=recordCancellation(order,'reservation_expired',{by:'system:ticket-hold',at:'2026-11-12T20:00:00Z'});
  assert.equal(r.reason,'reservation_expired');
  assert.equal(cancellationDetails(order).reason,'reservation_expired');
  assert.equal(cancellationDetails(order).at,'2026-11-12T20:00:00.000Z');
});
test('late webhook or repeated sweep cannot mislabel a recorded cancellation',()=>{
  const o={status:'annulée'};
  recordCancellation(o,'reservation_expired',{by:'system:ticket-hold'});
  recordCancellation(o,'stripe_cancelled',{by:'stripe:webhook'});
  assert.equal(o.cancellation.reason,'reservation_expired');
});
test('recovered paid order clears obsolete cancellation metadata',()=>{
  const o={status:'annulée'};
  recordCancellation(o,'payment_setup_failed');
  o.status='payée';clearCancellation(o);
  assert.equal(o.cancellation,undefined);
  assert.equal(cancellationDetails(o),null);
});
test('historical orders show unknown rather than invent abandoned checkout',()=>{
  const o={status:'annulée',paymentStatus:'cancelled',eventSeatsReleased:true};
  assert.equal(cancellationDetails(o).reason,'unknown');
  assert.equal(cancellationDetails(o).legacy,true);
});
test('historical Stripe or admin cancellation may be identified from existing audit',()=>{
  assert.equal(cancellationDetails({status:'annulée',stripe:{status:'canceled'}}).reason,'stripe_cancelled');
  const a={status:'annulée',statusHistory:[{to:'annulée',by:'admin@example.test',at:'2026-11-11'}]};
  assert.equal(cancellationDetails(a).reason,'admin_cancelled');
});
test('invalid reasons cannot overwrite an order, long notes are bounded',()=>{
  const o={status:'annulée'};
  assert.equal(recordCancellation(o,'customer_refunded'),null);
  assert.equal(o.cancellation,undefined);
  assert.equal(recordCancellation(o,'admin_cancelled',{note:'n'.repeat(700)}).note.length,500);
});
