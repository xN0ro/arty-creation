/* Ticket type editor and mixed adult/child booking selector. Existing single-price
   events continue to use their original form and checkout. */
(function(){
  'use strict';
  const core=window.ARTYTicketPricingCore;
  if(!core)return;
  let counter=0;
  const el=id=>document.getElementById(id);
  const english=()=>window.I18n?.language?.()==='en';
  const money=value=>typeof I18n!=='undefined'?I18n.currency(Number(value).toFixed(2)):'$'+Number(value).toFixed(2);
  const eventById=id=>(typeof allEvents!=='undefined'?allEvents:[]).find(item=>String(item.id)===String(id));
  const priceOptions=event=>core.eventOptions(event);
  function copy(fr,en){return english()?en:fr}
  function optionName(option){return core.optionLabel(option,english()?'en':'fr')}
  function notify(message){if(typeof showToast==='function')showToast(message,'error')}
  function makeEditorRow(option){
    const row=document.createElement('div');
    row.className='arty-ticket-option-row';
    row.dataset.ticketId=option.id||('type-'+Date.now().toString(36)+'-'+(++counter));
    row.innerHTML='<label>Nom (FR)<input class="ticket-label-fr" maxlength="80" placeholder="Adulte" type="text"></label>'+
      '<label>Name (EN)<input class="ticket-label-en" maxlength="80" placeholder="Adult" type="text"></label>'+
      '<label>Prix CAD<input class="ticket-option-price" type="number" min="0" max="10000" step="0.01" placeholder="49.00"></label>'+
      '<button type="button" class="btn btn-ghost btn-sm ticket-remove" aria-label="Remove ticket type">×</button>';
    row.querySelector('.ticket-label-fr').value=option.labelFr||'';
    row.querySelector('.ticket-label-en').value=option.labelEn||'';
    row.querySelector('.ticket-option-price').value=option.price??'';
    row.querySelector('.ticket-remove').addEventListener('click',()=>row.remove());
    return row;
  }
  function editorList(){return el('artyTicketPriceRows')}
  function populateEditor(options){
    const list=editorList();if(!list)return;
    list.replaceChildren();
    (options||[]).forEach(option=>list.appendChild(makeEditorRow(option)));
  }
  function injectEditor(){
    if(el('artyTicketPriceRows'))return;
    const price=el('aEvPrice');if(!price)return;
    const anchor=price.closest('.form-row')||price.closest('.form-group');
    if(!anchor)return;
    const wrapper=document.createElement('section');
    wrapper.id='artyTicketPricingEditor';
    wrapper.className='arty-ticket-pricing-editor';
    wrapper.innerHTML='<div class="arty-ticket-header"><div><strong>'+copy('Tarifs des billets','Ticket price options')+'</strong>'+
      '<p>'+copy('Ajoutez des types de billets (adulte, enfant, etc.). Si aucune option est créée, le prix standard ci-dessus reste utilisé.','Add ticket types (adult, child, etc.). Without options, the standard price above is used.')+'</p></div>'+
      '<button type="button" id="artyAddTicketPrice" class="btn btn-teal btn-sm">'+copy('+ Ajouter un tarif','+ Add ticket type')+'</button></div>'+
      '<div id="artyTicketPriceRows" class="arty-ticket-price-rows"></div>';
    anchor.insertAdjacentElement('afterend',wrapper);
    el('artyAddTicketPrice').addEventListener('click',()=>{
      const list=editorList();if(!list)return;
      if(list.children.length>=core.MAX_OPTIONS)return notify(copy('Maximum 8 tarifs.','Maximum 8 ticket types.'));
      list.appendChild(makeEditorRow({}));
    });
  }
  function collectAdminOptions(){
    const list=editorList();if(!list)return [];
    const raw=Array.from(list.children).map(row=>({
      id:row.dataset.ticketId,
      labelFr:row.querySelector('.ticket-label-fr')?.value||'',
      labelEn:row.querySelector('.ticket-label-en')?.value||'',
      price:row.querySelector('.ticket-option-price')?.value||''
    }));
    try{return core.normalizeOptions(raw)}
    catch(error){notify(error.message);return null}
  }
  const oldRenderAdmin=window.renderAdminEvents;
  if(typeof oldRenderAdmin==='function')window.renderAdminEvents=function(){
    const result=oldRenderAdmin.apply(this,arguments);
    injectEditor();return result;
  };
  const oldEdit=window.editEv;
  if(typeof oldEdit==='function')window.editEv=function(id){
    const result=oldEdit.apply(this,arguments);
    injectEditor();
    const record=(typeof adminEvents!=='undefined'?adminEvents:[]).find(item=>String(item.id)===String(id));
    populateEditor(record?.ticketOptions||[]);
    return result;
  };
  const oldReset=window.resetEvForm;
  if(typeof oldReset==='function')window.resetEvForm=function(){
    const result=oldReset.apply(this,arguments);
    populateEditor([]);return result;
  };

  function ensureBookingPanel(){
    let panel=el('artyBookingTicketTypes');if(panel)return panel;
    const guest=el('bookingGuests');
    if(!guest)return null;
    const field=guest.closest('.form-group');
    panel=document.createElement('div');panel.id='artyBookingTicketTypes';panel.className='arty-ticket-booking';
    field?.insertAdjacentElement('afterend',panel);
    panel.addEventListener('input',event=>{
      if(event.target.matches('.arty-ticket-qty'))updateTotals();
    });
    return panel;
  }
  function bookingOptions(){
    const event=eventById(el('bookingModal')?.dataset.eid);
    return priceOptions(event);
  }
  function selection(){
    const options=bookingOptions(),panel=el('artyBookingTicketTypes');
    return options.map(option=>{
      const input=Array.from(panel?.querySelectorAll('.arty-ticket-qty')||[]).find(node=>node.dataset.id===option.id);
      const qty=Number(input?.value);
      return {option,qty:Number.isInteger(qty)?qty:-1};
    });
  }
  function updateTotals(){
    const panel=el('artyBookingTicketTypes');
    if(!panel||panel.hidden)return;
    const selected=selection(),event=eventById(el('bookingModal')?.dataset.eid);
    const count=selected.reduce((sum,row)=>sum+Math.max(0,row.qty),0);
    const total=selected.reduce((sum,row)=>sum+Math.max(0,row.qty)*row.option.price,0);
    const invalid=selected.some(row=>row.qty<0||row.qty>10);
    const existing=(typeof cart!=='undefined'?cart:[]).filter(item=>item.type==='event-ticket'&&String(item.customData?.eventId)===String(event?.id))
      .reduce((sum,item)=>sum+(Number(item.qty)||0),0);
    const max=Math.max(0,Math.min(10,Number(spotsLeft(event)))-existing);
    const summary=el('artyTicketTypeTotal');
    if(summary)summary.textContent=copy('Total : ','Total: ')+money(total)+' · '+count+' '+copy('place(s)','seat(s)');
    const warning=el('artyTicketTypeWarning');
    if(warning)warning.textContent=count>max?copy('Quantité supérieure aux places disponibles ('+max+').','Only '+max+' additional seats available.'):count===0?copy('Choisissez au moins un billet.','Select at least one ticket.'):'';
    const button=el('bookingSubmitButton');if(button)button.disabled=invalid||count===0||count>max;
  }
  function showOptions(event){
    const panel=ensureBookingPanel();if(!panel)return;
    const options=priceOptions(event),hasTypes=options.length>0;
    const guest=el('bookingGuests')?.closest('.form-group');
    const standardPrice=el('bookingPrice')?.closest('.booking-ticket-price');
    if(guest)guest.hidden=hasTypes;
    if(standardPrice)standardPrice.hidden=hasTypes;
    panel.hidden=!hasTypes;
    if(!hasTypes){panel.replaceChildren();const button=el('bookingSubmitButton');if(button)button.disabled=false;return;}
    panel.innerHTML='<strong>'+copy('Choisissez vos billets','Choose your tickets')+'</strong>'+
      '<div class="arty-ticket-booking-rows"></div><div class="arty-ticket-booking-footer"><strong id="artyTicketTypeTotal"></strong><small id="artyTicketTypeWarning"></small></div>';
    const rows=panel.querySelector('.arty-ticket-booking-rows');
    options.forEach((option,index)=>{
      const row=document.createElement('label');row.className='arty-ticket-booking-row';
      const title=document.createElement('span');title.textContent=optionName(option);
      const price=document.createElement('strong');price.textContent=money(option.price);
      const qty=document.createElement('input');qty.className='arty-ticket-qty';qty.type='number';qty.min='0';qty.max=String(Math.max(0,Math.min(10,spotsLeft(event))));qty.step='1';qty.inputMode='numeric';qty.value=index===0?'1':'0';qty.dataset.id=option.id;
      row.append(title,price,qty);rows.appendChild(row);
    });
    updateTotals();
  }
  const oldOpenBooking=window.openBooking;
  if(typeof oldOpenBooking==='function')window.openBooking=function(id){
    const result=oldOpenBooking.apply(this,arguments);
    const event=eventById(id);if(event)showOptions(event);
    return result;
  };
  const oldUpdateTotal=window.updateBookingTotal;
  if(typeof oldUpdateTotal==='function')window.updateBookingTotal=function(){
    if(bookingOptions().length&&el('artyBookingTicketTypes')?.hidden===false)return updateTotals();
    return oldUpdateTotal.apply(this,arguments);
  };
  const oldConfirmBooking=window.confirmBooking;
  if(typeof oldConfirmBooking==='function')window.confirmBooking=function(){
    const modal=el('bookingModal'),event=eventById(modal?.dataset.eid);
    if(!event||!priceOptions(event).length)return oldConfirmBooking.apply(this,arguments);
    const selected=selection().filter(row=>row.qty>0),count=selected.reduce((sum,row)=>sum+row.qty,0);
    if(!count||selected.some(row=>!Number.isInteger(row.qty)||row.qty<0||row.qty>10))return notify(copy('Choisissez un nombre valide de billets.','Choose valid ticket quantities.'));
    const existing=cart.filter(item=>item.type==='event-ticket'&&String(item.customData?.eventId)===String(event.id));
    if(existing.some(item=>!item.customData?.ticketOptionId))return notify(copy('Retirez les anciens billets de cet événement du panier avant de choisir de nouveaux tarifs.','Remove old tickets for this event from your cart before selecting ticket types.'));
    const previous=existing.reduce((sum,item)=>sum+(Number(item.qty)||0),0);
    if(count+previous>Math.min(10,spotsLeft(event)))return notify(copy('Plus assez de places disponibles.','Not enough seats remaining.'));
    selected.forEach(row=>{
      const option=row.option,id=core.itemId(event.id,option.id);
      const prior=cart.find(item=>String(item.id)===id);
      if(prior){prior.qty+=row.qty;return;}
      const name=(english()?'Ticket — ':'Billet — ')+optionName(option)+' — '+String(event.title||'');
      cart.push({id,name,price:option.price,image:event.image||'logoarty.png',qty:row.qty,type:'event-ticket',
        customData:{kind:'event-ticket',eventId:event.id,ticketOptionId:option.id,eventDate:event.date||'',eventTime:event.time||'',eventLocation:event.location||''}});
    });
    saveCart();updateCartUI();closeModal('booking');
    showToast(copy('Billets ajoutés au panier!','Tickets added to cart!'),'success');
    setTimeout(openCart,120);
  };
  function renderTierPrices(event,target){
    const options=priceOptions(event);
    if(!options.length||!target)return;
    target.textContent=options.map(option=>optionName(option)+' '+money(option.price)).join(' · ');
    target.classList.add('arty-tier-price');
  }
  const oldRenderEvent=window.renderEventPage;
  if(typeof oldRenderEvent==='function')window.renderEventPage=function(id){
    const result=oldRenderEvent.apply(this,arguments);
    renderTierPrices(eventById(id),document.querySelector('#eventPageContent .product-price'));
    return result;
  };
  const oldRenderParty=window.renderPartyEvents;
  if(typeof oldRenderParty==='function')window.renderPartyEvents=function(){
    const result=oldRenderParty.apply(this,arguments);
    const sorted=[...(typeof allEvents!=='undefined'?allEvents:[])].sort((a,b)=>new Date((a.date||'')+'T'+(a.time||'00:00'))-new Date((b.date||'')+'T'+(b.time||'00:00')));
    document.querySelectorAll('#partyEventsGrid .event-card').forEach((card,index)=>renderTierPrices(sorted[index],card.querySelector('.event-card-price')));
    return result;
  };
  const style=document.createElement('style');
  style.textContent='.arty-ticket-pricing-editor{border:1px solid rgba(0,120,130,.22);border-radius:14px;padding:16px;margin:16px 0;background:rgba(0,150,160,.04)}'+
    '.arty-ticket-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.arty-ticket-header p{margin:5px 0;color:var(--text-light,#777);font-size:.85rem}'+
    '.arty-ticket-price-rows{display:grid;gap:10px;margin-top:14px}.arty-ticket-option-row{display:grid;grid-template-columns:1fr 1fr minmax(100px,.65fr) auto;gap:9px;align-items:end}'+
    '.arty-ticket-option-row label{font-size:.8rem;display:grid;gap:4px}.arty-ticket-option-row input{width:100%;min-width:0;border:1px solid #ddd;border-radius:8px;padding:10px;background:var(--surface,#fff);color:inherit}'+
    '.arty-ticket-booking{padding:12px 0}.arty-ticket-booking-rows{display:grid;gap:10px;margin:12px 0}.arty-ticket-booking-row{display:grid;grid-template-columns:1fr auto 66px;gap:12px;align-items:center;padding:12px;border:1px solid #e8e0d4;border-radius:12px}'+
    '.arty-ticket-booking-row input{width:66px;padding:8px;border:1px solid #ddd;border-radius:8px}.arty-ticket-booking-footer{display:grid;gap:4px;padding:8px 0}.arty-ticket-booking-footer small{color:#b74b2d}'+
    '.arty-tier-price{font-size:.94em;line-height:1.45}@media(max-width:650px){.arty-ticket-option-row{grid-template-columns:1fr 1fr}.arty-ticket-option-row .ticket-remove{justify-self:start}}';
  document.head.appendChild(style);
  window.ARTYTicketPricingUI={collectAdminOptions};
})();