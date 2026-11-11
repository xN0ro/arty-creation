'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const reporting=require('../sales-reporting');
const core=fs.readFileSync(path.join(__dirname,'..','core-server.js'),'utf8');
const marketing=fs.readFileSync(path.join(__dirname,'..','marketing-insights.js'),'utf8');
const dashboardStart=core.indexOf('function computeAdminAnalytics(db) {');
const dashboardEnd=core.indexOf('// ========== CLIENT-CREATED BUNDLE DEAL RULES ==========',dashboardStart);
assert.ok(dashboardStart>=0&&dashboardEnd>dashboardStart);
const calc=new Function('salesReporting','money','I18n','enrichPublicKit','isDiscountActive',core.slice(dashboardStart,dashboardEnd)+'\nreturn computeAdminAnalytics;')(
 reporting,reporting.money,{t:x=>x},x=>x,()=>false
);
const mstart=marketing.indexOf('function summary(db,days){'),mend=marketing.indexOf('function install(app,',mstart);
assert.ok(mstart>=0&&mend>mstart);
const marketingCalc=new Function('salesReporting','read','dayNow','since',marketing.slice(mstart,mend)+'\nreturn summary;')(
 reporting,()=>({}),()=>new Date().toISOString().slice(0,10),(iso,cutoff)=>{const n=Date.parse(iso||'');return Number.isFinite(n)&&n>=cutoff}
);
function data(){
 const now=new Date().toISOString();
 return {
   events:[{id:4,title:'Art Brunch'}],kits:[],discounts:[],refunds:[],eventRequests:[],
   orders:[
     {id:'ARTY-ONLINE',paymentStatus:'paid',status:'payée',total:120,paidAt:now,createdAt:now,items:[{name:'Kit Arty',qty:1,price:120}]},
     {id:'ARTY-PENDING',paymentStatus:'pending',status:'en attente de paiement',total:30,createdAt:now},
     {id:'ARTY-TEST',paymentStatus:'paid',status:'payée',isTest:true,total:999,paidAt:now,items:[]},
     {id:'ARTY-CANCEL',paymentStatus:'paid',status:'annulée',total:40,paidAt:now,items:[]}
   ],
   bookings:[
     {id:'BKG-INTERAC',eventId:4,guests:2,total:55,status:'confirmée',paymentStatus:'paid',paymentMethod:'e_transfer',bookedAt:now,manualPayment:{amount:55,confirmedAt:now}},
     {id:'BKG-ONLINE',eventId:4,sourceOrderId:'ARTY-ONLINE',guests:2,total:120,status:'confirmée',paymentStatus:'paid',paymentMethod:'stripe',bookedAt:now},
     {id:'BKG-CANCEL',eventId:4,guests:1,total:99,status:'annulée',paymentStatus:'paid',paymentMethod:'e_transfer',bookedAt:now}
   ]
 };
}
test('main sales dashboard includes paid manual receipts but does not duplicate website bookings',()=>{
 const a=calc(data());
 assert.equal(a.onlineRevenue,120);
 assert.equal(a.manualRevenue,55);
 assert.equal(a.revenue,175);
 assert.equal(a.salesCount,2);
 assert.equal(a.manualTransactions,1);
 assert.equal(a.manualAdmissions,2);
 assert.equal(a.paidOrdersCount,1);
 assert.equal(a.averageOrder,87.5);
 assert.equal(a.todayRevenue,175);
 assert.equal(a.monthRevenue,175);
 assert.equal(a.todaySalesCount,2);
 assert.equal(a.dailySales.at(-1).revenue,175);
 assert.ok(a.topProducts.some(x=>x.name==='Art Brunch (Interac)'&&x.qty===2&&x.revenue===55));
});
test('marketing breakdown matches main sales totals and keeps Stripe online totals distinct',()=>{
 const a=calc(data()),m=marketingCalc(data(),30);
 assert.equal(m.onlineRevenue,a.onlineRevenue);
 assert.equal(m.manualRevenue,a.manualRevenue);
 assert.equal(m.totalRevenue,a.revenue);
 assert.equal(m.salesCount,2);
 assert.equal(m.orders,1);
 assert.equal(m.manualBookings,1);
 assert.equal(m.manualAdmissions,2);
});
test('zero or absent manual sales do not change online-only accounting',()=>{
 const db=data();db.bookings=db.bookings.filter(x=>x.paymentMethod!=='e_transfer');
 const a=calc(db),m=marketingCalc(db,30);
 assert.equal(a.revenue,120);assert.equal(a.manualRevenue,0);assert.equal(a.salesCount,1);
 assert.equal(m.totalRevenue,120);assert.equal(m.manualRevenue,0);
});
