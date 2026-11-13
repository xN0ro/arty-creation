'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const policy=require('../ticket-seat-holds');
const cancellation=require('../order-cancellation');
const server=fs.readFileSync(path.join(__dirname,'..','core-server.js'),'utf8');
const start=server.indexOf('let eventHoldSweepPromise = null;');
const end=server.indexOf('// Run continuously even without visitors;',start);
assert.ok(start>=0&&end>start,'seat hold sweep is present');
const maker=new Function('seatHolds','orderCancellation','readDB','writeDB','retrieveStripePaymentIntent','stripeRequest','syncOrderFromStripePaymentIntent','releaseEventSeatsForOrder','cancelOrderTicketBookings','ensurePaidOrderBookings','deliverPaidOrderCommunications','releaseInventoryForItems','console',server.slice(start,end)+'\nreturn reconcileExpiredEventSeatHolds;');
const clone=value=>JSON.parse(JSON.stringify(value));
async function simulate(scenario) {
 let db={orders:[{id:'order1',items:[{type:'event-ticket',eventId:1,qty:2}],createdAt:scenario==='active'?new Date().toISOString():'2026-10-09T10:00:00Z',paymentProvider:'stripe',paymentReference:scenario==='no-intent'?'':'pi_1',eventSeatsReserved:true,eventSeatsReleased:false,paymentStatus:'pending'}],events:[{id:1,bookedSpots:25,maxSpots:25}],bookings:[]};
 let cancelled=0,emails=0;
 const retrieve=async()=>{if(scenario==='stripe-error')throw new Error('temporarily unavailable');return {id:'pi_1',status:scenario==='paid'?'succeeded':scenario==='processing'?'processing':'requires_payment_method',metadata:{orderId:'order1'}}};
 const cancel=async()=>{cancelled++;return {id:'pi_1',status:'canceled',metadata:{orderId:'order1'}}};
 const sync=(data,intent)=>{const order=data.orders[0];order.paymentStatus=intent.status==='succeeded'?'paid':'cancelled';return order};
 const release=(data,order)=>{if(!order.eventSeatsReleased){data.events[0].bookedSpots-=2;order.eventSeatsReleased=true}};
 const tickets=(data,order)=>{data.bookings=[{sourceOrderId:order.id,eventId:1,guests:2}]};
 const sweep=maker(policy,cancellation,()=>clone(db),data=>{db=clone(data)},retrieve,cancel,sync,release,()=>{},tickets,async()=>{emails++},()=>{}, {warn:()=>{},info:()=>{},error:()=>{}});
 await sweep({force:true});
 return {db,cancelled,emails};
}
test('expired abandoned Stripe holds are cancelled before seats are freed',async()=>{const r=await simulate('unpaid');assert.equal(r.cancelled,1);assert.equal(r.db.events[0].bookedSpots,23);assert.equal(r.db.orders[0].eventSeatsReleased,true);assert.equal(r.db.orders[0].cancellation.reason,'reservation_expired')});
test('already successful Stripe payments retain seats and receive bookings',async()=>{const r=await simulate('paid');assert.equal(r.cancelled,0);assert.equal(r.db.events[0].bookedSpots,25);assert.equal(r.db.orders[0].paymentStatus,'paid');assert.equal(r.db.bookings.length,1);assert.equal(r.emails,1)});
test('processing payments are not cancelled or released',async()=>{const r=await simulate('processing');assert.equal(r.cancelled,0);assert.equal(r.db.events[0].bookedSpots,25)});
test('Stripe errors never free seats without verified cancellation',async()=>{const r=await simulate('stripe-error');assert.equal(r.db.events[0].bookedSpots,25)});
test('interrupted orders without delivered client secret expire safely',async()=>{const r=await simulate('no-intent');assert.equal(r.db.events[0].bookedSpots,23);assert.equal(r.db.orders[0].paymentStatus,'cancelled');assert.equal(r.db.orders[0].cancellation.reason,'reservation_expired')});
test('newly reserved seats remain on hold',async()=>{const r=await simulate('active');assert.equal(r.db.events[0].bookedSpots,25);assert.equal(r.cancelled,0)});
test('checkout persists reservation before waiting on Stripe',()=>{const start=server.indexOf("app.post('/api/orders'");const end=server.indexOf("function customerOrderView",start);const checkout=server.slice(start,end);assert.ok(checkout.indexOf('db.orders.push(order);')>=0);assert.ok(checkout.indexOf('writeDB(db);')<checkout.indexOf('await createStripePaymentIntentForOrder(order)'))});
