/* Shared validation for public-event ticket price options.
   The server is always authoritative for ticket types and prices. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ARTYTicketPricingCore=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const MAX_OPTIONS=8;
  const ID_PATTERN=/^[a-z0-9][a-z0-9_-]{0,39}$/;
  function normalizeOptions(value){
    if(value==null)return [];
    if(!Array.isArray(value))throw new Error('Invalid event ticket options');
    if(value.length>MAX_OPTIONS)throw new Error('Maximum 8 ticket price options per event');
    const seen=new Set();
    return value.map(function(raw){
      if(!raw||typeof raw!=='object')throw new Error('Invalid ticket option');
      const id=String(raw.id||'').trim().toLowerCase();
      const labelFr=String(raw.labelFr||'').trim();
      const labelEn=String(raw.labelEn||'').trim();
      if(!ID_PATTERN.test(id)||seen.has(id))throw new Error('Ticket option identifiers must be unique');
      if(!labelFr||!labelEn||labelFr.length>80||labelEn.length>80)throw new Error('Enter French and English ticket labels (80 characters max)');
      if(raw.price==null||String(raw.price).trim()==='')throw new Error('Enter a price for each ticket type');
      const number=Number(raw.price);
      if(!Number.isFinite(number)||number<0||number>10000||Math.round(number*100)!==number*100)throw new Error('Invalid ticket price (0 to 10,000 CAD, 2 decimals max)');
      seen.add(id);
      return {id,labelFr,labelEn,price:Math.round(number*100)/100};
    });
  }
  function eventOptions(event){
    try{return normalizeOptions(event&&event.ticketOptions)}catch{return []}
  }
  function optionById(event,id){
    return eventOptions(event).find(function(option){return option.id===String(id||'')})||null;
  }
  function itemId(eventId,optionId){
    const base='event-ticket-'+String(eventId);
    return optionId?base+'-'+String(optionId):base;
  }
  function parseItemId(id){
    const found=/^event-ticket-(\d+)(?:-([a-z0-9][a-z0-9_-]{0,39}))?$/.exec(String(id||''));
    return found?{eventId:Number(found[1]),optionId:found[2]||''}:null;
  }
  function optionLabel(option,language){
    return String(language)==='en'?option.labelEn:option.labelFr;
  }
  return Object.freeze({normalizeOptions,eventOptions,optionById,itemId,parseItemId,optionLabel,MAX_OPTIONS});
});