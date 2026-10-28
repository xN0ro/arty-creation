'use strict';
// Reuse core ticket generation, check-in and transactional email templates.
const crypto=require('crypto');
function install({app,adminOnly,readDB,writeDB,ensureBookingTickets,deliverBookingTickets}){
  app.post('/api/admin/bookings/manual',adminOnly,async(req,res)=>{
    const raw=req.body||{},eventId=Number(raw.eventId),guests=Number(raw.guests);
    const name=String(raw.name||'').replace(/\s+/g,' ').trim().slice(0,120);
    const email=String(raw.email||'').trim().toLowerCase();
    const phone=String(raw.phone||'').trim().slice(0,60);
    const reference=String(raw.paymentReference||'').trim().slice(0,100);
    const amount=Number(raw.amount);
    if(raw.paymentConfirmed!==true)return res.status(400).json({error:'Confirmez avoir reçu le virement bancaire avant de créer les billets.'});
    if(!Number.isSafeInteger(eventId)||!Number.isSafeInteger(guests)||guests<1||guests>50)return res.status(400).json({error:'Événement ou quantité invalide (1 à 50 places).'});
    if(!name||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!reference||!Number.isFinite(amount)||amount<0||amount>100000)return res.status(400).json({error:'Nom, courriel, référence et montant reçu valides requis.'});
    const db=readDB();
    const event=(db.events||[]).find(e=>Number(e.id)===eventId);
    if(!event||event.status==='cancelled')return res.status(404).json({error:'Événement introuvable ou annulé.'});
    const already=(db.bookings||[]).some(b=>b.paymentMethod==='e_transfer'&&String(b.paymentReference||'').toLowerCase()===reference.toLowerCase());
    if(already)return res.status(409).json({error:'Cette référence de virement a déjà été utilisée.'});
    const capacity=Math.max(0,Number(event.maxSpots)||0);
    const taken=Math.max(0,Number(event.bookedSpots)||0);
    if(capacity&&taken+guests>capacity)return res.status(409).json({error:'Places insuffisantes pour cet événement.'});
    const now=new Date().toISOString(),booking={
      id:'BKG-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(3).toString('hex').toUpperCase(),
      locale:raw.locale==='en'?'en':'fr',userId:(db.users||[]).find(u=>String(u.email||'').toLowerCase()===email)?.id||null,
      eventId,eventUid:event.uid||'',name,email,phone,guests,ticketMode:'group',guestNames:[name],
      notes:String(raw.notes||'').trim().slice(0,400),total:Math.round(amount*100)/100,
      bookedAt:now,status:'confirmée',paymentStatus:'paid',paymentMethod:'e_transfer',
      paymentReference:reference,manualPayment:{amount:Math.round(amount*100)/100,reference,confirmedAt:now,confirmedBy:req.session?.email||'admin'},
      emailDelivery:{status:'pending',attempts:0,sentAt:'',lastAttemptAt:''},tickets:[]
    };
    db.bookings=db.bookings||[];db.bookings.push(booking);ensureBookingTickets(db,booking);
    event.bookedSpots=taken+guests;writeDB(db);
    // Never delete an issued ticket if email delivery fails; staff can resend it.
    let result={status:'failed',error:'Courriel non envoyé'};
    try{result=await deliverBookingTickets(booking,event,'manual')}catch(error){result={status:'failed',error:error.message}}
    const fresh=readDB(),saved=(fresh.bookings||[]).find(b=>b.id===booking.id);
    if(saved){
      saved.emailDelivery=booking.emailDelivery;
      if(result.status!=='sent')saved.emailDelivery={...saved.emailDelivery,status:result.status,error:result.error||''};
      writeDB(fresh);
    }
    res.status(201).json({success:true,bookingId:booking.id,tickets:booking.tickets.map(t=>({code:t.code,admissions:t.admissions})),emailStatus:result.status,emailError:result.status==='sent'?'':result.error||'Courriel non envoyé'});
  });
}
module.exports={install};
