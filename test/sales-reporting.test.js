'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {confirmedManualSales,manualSalesSummary}=require('../sales-reporting');
const sample=(changes={})=>({id:'BKG-1',eventId:1,guests:2,total:50,bookedAt:'2026-11-10T19:00:00Z',status:'confirmée',paymentStatus:'paid',paymentMethod:'e_transfer',manualPayment:{amount:50,confirmedAt:'2026-11-10T19:01:00Z'},...changes});
test('two manual admissions count as one transaction and full Interac revenue',()=>{
 const result=manualSalesSummary({bookings:[sample()],events:[{id:1,title:'Christmas Art Brunch'}]});
 assert.equal(result.revenue,50);assert.equal(result.transactions,1);assert.equal(result.admissions,2);
 assert.equal(result.sales[0].eventTitle,'Christmas Art Brunch');
});
test('manual entries are not counted again when attached to a website order',()=>{
 const sales=confirmedManualSales({bookings:[sample({sourceOrderId:'ARTY-1'}),sample({id:'BKG-2'})]});
 assert.equal(sales.length,1);assert.equal(sales[0].id,'BKG-2');
});
test('only paid and non-cancelled genuine manual bookings enter revenue',()=>{
 const input=[sample(),sample({id:'B2',paymentStatus:'pending'}),sample({id:'B3',status:'annulée'}),sample({id:'B4',isTest:true}),sample({id:'B5',paymentMethod:'stripe'}),sample({id:'B6',tickets:[{status:'cancelled'}]}),sample({id:'B7',status:'remboursée'})];
 assert.equal(confirmedManualSales({bookings:input}).length,1);
});
test('manual revenue uses received amount, not multiplied by ticket count',()=>{
 const result=manualSalesSummary({bookings:[sample({total:60,guests:2,manualPayment:{amount:55,confirmedAt:'2026-11-10T19:01:00Z'}}),sample({id:'BKG-3',guests:1,total:25,manualPayment:null})]});
 assert.equal(result.revenue,80);assert.equal(result.transactions,2);assert.equal(result.admissions,3);
});
