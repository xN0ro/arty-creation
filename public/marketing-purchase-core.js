/* Convert server-confirmed, live Stripe orders to privacy-safe conversion data. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ARTYPurchase=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  function safeId(value){return String(value??'').trim().replace(/[^A-Za-z0-9_-]/g,'').slice(0,100)}
  function amount(value){const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null}
  // Cart item IDs include configuration options; prefer stable underlying catalog IDs.
  function cartQuantityForKit(cart,kitId){
    const id=String(kitId);
    return (Array.isArray(cart)?cart:[]).reduce((sum,item)=>{
      if(!item||item.type==='event-ticket')return sum;
      const itemId=String(item.id??'');
      const catalogId=String(item.customData?.kitId??item.kitId??itemId);
      const matches=catalogId===id||(item.type==='kit'&&itemId.startsWith(`kit-${id}-`));
      return sum+(matches?Math.max(0,Number(item.qty)||0):0);
    },0);
  }
  function cartQuantityForEvent(cart,eventId){
    const id=String(eventId);
    return (Array.isArray(cart)?cart:[]).reduce((sum,item)=>{
      if(item?.type!=='event-ticket')return sum;
      const itemId=String(item.customData?.eventId??item.eventId??String(item.id||'').replace(/^event-ticket-/,''));
      return sum+(itemId===id?Math.max(0,Number(item.qty)||0):0);
    },0);
  }
  function buildPurchasePayload(order){
    if(!order||order.paymentStatus!=='paid'||order.paymentProvider!=='stripe'||
       order.isTest===true||order.paymentEnvironment==='test'||order.refundStatus==='refunded'||
       order.refundStatus==='refund_pending')return null;
    const orderId=safeId(order.id);
    const total=amount(order.total);
    if(!orderId||orderId!==String(order.id)||total===null||total<=0||!Array.isArray(order.items))return null;
    const entries=[];
    for(const item of order.items){
      if(!item||typeof item!=='object')continue;
      const event=item.type==='event-ticket';
      const raw=event?(item.eventId??item.customData?.eventId??String(item.id||'').replace(/^event-ticket-/,'')):(item.type==='kit'?(item.kitId??item.customData?.kitId??item.id):(item.id??item.kitId));
      const id=safeId(raw);
      if(!id)continue;
      const quantity=Math.floor(Number(item.qty)||0);
      if(!Number.isFinite(quantity)||quantity<1||quantity>10000)continue;
      const price=amount(item.lineTotal!==undefined?Number(item.lineTotal)/quantity:item.price);
      if(price===null)continue;
      entries.push({id:`ARTY-${event?'EVENT':'PRODUCT'}-${id}`,quantity,price,event});
    }
    if(!entries.length)return null;
    const hasEvent=entries.some(item=>item.event),hasKit=entries.some(item=>!item.event);
    return {
      transaction_id:orderId,order_id:orderId,arty_event_id:`arty-purchase-${orderId}`,
      value:total,currency:'CAD',arty_purchase_category:hasEvent&&hasKit?'mixed':hasEvent?'event':'kit',content_category:hasEvent&&hasKit?'mixed':hasEvent?'event':'kit',
      arty_has_event:hasEvent?'yes':'no',arty_has_kit:hasKit?'yes':'no',
      content_ids:[...new Set(entries.map(item=>item.id))],
      contents:entries.map(item=>({id:item.id,quantity:item.quantity,item_price:item.price})),
      num_items:entries.reduce((sum,item)=>sum+item.quantity,0),
      items:entries.map(item=>({item_id:item.id,item_name:item.event?'Event ticket':'Painting kit',item_category:item.event?'event':'kit',price:item.price,quantity:item.quantity}))
    };
  }
  return Object.freeze({buildPurchasePayload,cartQuantityForKit,cartQuantityForEvent});
});
