'use strict';

// Confirmed manual Interac bookings are real sales even though no Stripe
// order was created. Keep them separate from online payments to prevent
// double counting. This module only reads persisted records.
function money(value) {
  const amount=Number(value);
  return Number.isFinite(amount) ? Math.round((amount+Number.EPSILON)*100)/100 : 0;
}
function confirmedManualSales(db) {
  const events=new Map((db?.events||[]).map(event=>[String(event.id),event]));
  return (db?.bookings||[]).filter(booking=>
    booking?.paymentMethod==='e_transfer' &&
    booking.paymentStatus==='paid' &&
    !booking.isTest &&
    !booking.sourceOrderId &&
    !['annulée','annulee','cancelled','canceled','remboursée','remboursee','refunded'].includes(String(booking.status||'').toLowerCase()) &&
    !(Array.isArray(booking.tickets)&&booking.tickets.length>0&&booking.tickets.every(ticket=>ticket.status==='cancelled'))
  ).map(booking=>{
    const event=events.get(String(booking.eventId));
    const amount=money(Math.max(0,Number(booking.manualPayment?.amount??booking.total) || 0));
    const paidAt=String(booking.manualPayment?.confirmedAt||booking.bookedAt||'');
    return {
      id:String(booking.id||''),
      eventId:booking.eventId,
      eventTitle:String(event?.title||'Billets événement'),
      amount,
      admissions:Math.max(1,Number(booking.guests)||1),
      paidAt,
      paymentMethod:'e_transfer'
    };
  });
}
function manualSalesSummary(db) {
  const sales=confirmedManualSales(db);
  return {
    sales,
    revenue:money(sales.reduce((sum,sale)=>sum+sale.amount,0)),
    transactions:sales.length,
    admissions:sales.reduce((sum,sale)=>sum+sale.admissions,0)
  };
}
module.exports={money,confirmedManualSales,manualSalesSummary};
