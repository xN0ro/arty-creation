(function(){
'use strict';

var MOBILE_MAX=820;
var scheduled=false;
var checkoutObserver=null;

function isMobile(){return window.matchMedia('(max-width:'+MOBILE_MAX+'px)').matches}
function locale(){try{return String(I18n.locale()||'fr').toLowerCase()}catch(e){return 'fr'}}
function copy(fr,en){return locale().indexOf('en')===0?en:fr}
function icon(name){
  var map={
    home:'<path d="M3 11.5 12 4l9 7.5"></path><path d="M5.5 10.5V20h13v-9.5"></path>',
    shop:'<path d="M5 8h14l-1 12H6L5 8Z"></path><path d="M8 9V6a4 4 0 0 1 8 0v3"></path>',
    events:'<rect x="3.5" y="5" width="17" height="15" rx="3"></rect><path d="M8 3v4M16 3v4M3.5 10h17"></path>',
    cart:'<path d="M3 4h2l2.1 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 8H6"></path><circle cx="10" cy="19" r="1.2"></circle><circle cx="17" cy="19" r="1.2"></circle>',
    user:'<circle cx="12" cy="8" r="4"></circle><path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>',
    chevron:'<path d="m6 9 6 6 6-6"></path>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(map[name]||'')+'</svg>';
}
function getCart(){
  try{if(typeof cart!=='undefined'&&Array.isArray(cart))return cart}catch(e){}
  try{return JSON.parse(localStorage.getItem('arty_cart')||'[]')}catch(e){return []}
}
function cartCount(){return getCart().reduce(function(sum,item){return sum+(parseInt(item.qty,10)||0)},0)}
function moneyFromSummary(){
  var commercial=document.querySelector('#checkoutCommerceTotals .checkout-commerce-total strong');
  if(commercial&&commercial.textContent.trim())return commercial.textContent.trim();
  var subtotal=document.querySelector('.checkout-summary-card .checkout-total-row strong');
  if(subtotal&&subtotal.textContent.trim())return subtotal.textContent.trim();
  try{if(typeof getSubtotal==='function'&&typeof I18n!=='undefined')return I18n.currency(Number(getSubtotal()||0).toFixed(2))}catch(e){}
  return '';
}
function navButton(id,label,ico,action){
  return '<button type="button" data-mobile-nav="'+id+'" aria-label="'+label+'">'+icon(ico)+'<span>'+label+'</span>'+(id==='cart'?'<b class="arty-mobile-nav-count" hidden>0</b>':'')+'</button>';
}
function ensureBottomNav(){
  var nav=document.querySelector('.arty-mobile-bottom-nav');
  if(!nav){
    nav=document.createElement('nav');
    nav.className='arty-mobile-bottom-nav';
    nav.setAttribute('aria-label',copy('Navigation mobile','Mobile navigation'));
    nav.innerHTML=
      navButton('home',copy('Accueil','Home'),'home')+
      navButton('shop',copy('Boutique','Shop'),'shop')+
      navButton('events',copy('Événements','Events'),'events')+
      navButton('cart',copy('Panier','Cart'),'cart')+
      navButton('account',copy('Compte','Account'),'user');
    document.body.appendChild(nav);
    nav.addEventListener('click',function(e){
      var btn=e.target.closest('button[data-mobile-nav]');
      if(!btn)return;
      var id=btn.getAttribute('data-mobile-nav');
      if(id==='home'&&typeof navigate==='function')navigate('#/');
      if(id==='shop'&&typeof navigate==='function')navigate('#/paintings');
      if(id==='events'&&typeof navigate==='function')navigate('#/party');
      if(id==='cart'&&typeof openCart==='function')openCart();
      if(id==='account'){
        var signedIn=false;
        try{signedIn=!!currentUser}catch(err){}
        if(signedIn&&typeof navigate==='function')navigate('#/profile');
        else if(typeof openModal==='function')openModal('auth','login');
      }
    });
  }
  return nav;
}
function syncBottomNav(){
  var nav=ensureBottomNav();
  var hash=location.hash||'#/';
  var focus=hash.indexOf('#/checkout')===0||hash.indexOf('#/product/')===0||hash.indexOf('#/admin')===0||hash.indexOf('#/studio')===0||hash.indexOf('#/event-quote/')===0;
  var cartOpen=document.getElementById('cartSidebar')&&document.getElementById('cartSidebar').classList.contains('open');
  nav.classList.toggle('is-hidden',!isMobile()||focus||cartOpen);
  nav.querySelectorAll('button').forEach(function(btn){btn.classList.remove('is-active')});
  var active='home';
  if(hash.indexOf('#/paintings')===0)active='shop';
  else if(hash.indexOf('#/party')===0||hash.indexOf('#/event/')===0||hash.indexOf('#/event-builder')===0)active='events';
  else if(hash.indexOf('#/profile')===0)active='account';
  var activeBtn=nav.querySelector('[data-mobile-nav="'+active+'"]');
  if(activeBtn)activeBtn.classList.add('is-active');
  var badge=nav.querySelector('.arty-mobile-nav-count');
  var count=cartCount();
  if(badge){badge.textContent=String(Math.min(count,99));badge.hidden=count<1}
}
function removeDock(selector){
  var node=document.querySelector(selector);
  if(node)node.remove();
}
function ensureProductDock(){
  var onProduct=isMobile()&&(location.hash||'').indexOf('#/product/')===0&&document.getElementById('page-product')&&document.getElementById('page-product').classList.contains('active');
  if(!onProduct){removeDock('.arty-mobile-product-dock');return}
  var add=document.querySelector('#page-product .product-add-button');
  var buy=document.querySelector('#page-product .product-buy-now');
  var price=document.getElementById('productConfiguredPrice');
  if(!buy||!price)return;
  var dock=document.querySelector('.arty-mobile-product-dock');
  if(!dock){
    dock=document.createElement('div');
    dock.className='arty-mobile-product-dock';
    dock.innerHTML='<div class="dock-price"><small>'+copy('Votre sélection','Your selection')+'</small><strong></strong></div><button type="button" class="btn btn-orange"></button>';
    document.body.appendChild(dock);
    dock.querySelector('button').addEventListener('click',function(){
      var target=document.querySelector('#page-product .product-buy-now');
      if(target&&!target.disabled)target.click();
    });
  }
  dock.querySelector('strong').textContent=price.textContent||'';
  var button=dock.querySelector('button');
  button.textContent=buy.disabled?copy('Épuisé','Sold out'):copy('Acheter maintenant','Buy now');
  button.disabled=!!buy.disabled;
  if(add&&add.disabled)button.disabled=true;
}
function enhanceCart(){
  if(!isMobile())return;
  var footer=document.getElementById('cartFooter');
  if(!footer)return;
  var checkout=footer.querySelector('.btn-orange');
  if(checkout)checkout.textContent=copy('Passer à la caisse →','Checkout →');
  if(!footer.querySelector('.arty-mobile-cart-trust')){
    var trust=document.createElement('div');
    trust.className='arty-mobile-cart-trust';
    trust.textContent=copy('Paiement sécurisé • Achat rapide','Secure payment • Fast checkout');
    var total=footer.querySelector('.cart-total');
    if(total)total.insertAdjacentElement('afterend',trust);
    else footer.prepend(trust);
  }
}
function setCheckoutAutofill(){
  var attrs={
    coName:{autocomplete:'name',inputmode:'text'},
    coEmail:{autocomplete:'email',inputmode:'email'},
    coPhone:{autocomplete:'tel',inputmode:'tel'},
    coAddress:{autocomplete:'street-address',inputmode:'text'},
    coCity:{autocomplete:'address-level2',inputmode:'text'},
    coProvince:{autocomplete:'address-level1'},
    coPostal:{autocomplete:'postal-code',inputmode:'text'},
    coCountry:{autocomplete:'country-name'}
  };
  Object.keys(attrs).forEach(function(id){
    var field=document.getElementById(id);
    if(!field)return;
    Object.keys(attrs[id]).forEach(function(key){field.setAttribute(key,attrs[id][key])});
  });
}
function checkoutItemCount(){
  return getCart().reduce(function(sum,item){return sum+(parseInt(item.qty,10)||0)},0);
}
function ensureCheckoutOverview(){
  var layout=document.querySelector('#page-checkout .checkout-layout');
  var summary=document.querySelector('#page-checkout .checkout-summary-card');
  if(!layout||!summary)return;
  var button=document.querySelector('.arty-mobile-checkout-overview');
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.className='arty-mobile-checkout-overview';
    button.innerHTML='<span class="overview-copy"><small></small><strong></strong></span><span class="overview-total"></span>'+icon('chevron');
    layout.insertAdjacentElement('beforebegin',button);
    summary.classList.add('arty-mobile-summary-collapsed');
    button.addEventListener('click',function(){
      var hidden=summary.classList.toggle('arty-mobile-summary-collapsed');
      button.classList.toggle('is-open',!hidden);
      button.querySelector('strong').textContent=hidden?copy('Voir le résumé','View order summary'):copy('Masquer le résumé','Hide order summary');
    });
  }
  button.querySelector('small').textContent=checkoutItemCount()+' '+copy(checkoutItemCount()>1?'articles':'article',checkoutItemCount()>1?'items':'item');
  if(!button.classList.contains('is-open'))button.querySelector('strong').textContent=copy('Voir le résumé','View order summary');
  button.querySelector('.overview-total').textContent=moneyFromSummary();
}
function visible(el){return !!(el&&getComputedStyle(el).display!=='none'&&!el.disabled)}
function ensureCheckoutDock(){
  var onCheckout=isMobile()&&(location.hash||'').indexOf('#/checkout')===0&&document.getElementById('page-checkout')&&document.getElementById('page-checkout').classList.contains('active');
  if(!onCheckout){removeDock('.arty-mobile-checkout-dock');return}
  var place=document.getElementById('placeOrderBtn');
  var stripe=document.getElementById('stripePayBtn');
  if(!place&&!stripe)return;
  var dock=document.querySelector('.arty-mobile-checkout-dock');
  if(!dock){
    dock=document.createElement('div');
    dock.className='arty-mobile-checkout-dock';
    dock.innerHTML='<div class="checkout-dock-copy"><small>'+copy('Total • paiement sécurisé','Total • secure payment')+'</small><strong></strong></div><button type="button" class="btn btn-orange"></button>';
    document.body.appendChild(dock);
    dock.querySelector('button').addEventListener('click',function(){
      var stripeBtn=document.getElementById('stripePayBtn');
      var placeBtn=document.getElementById('placeOrderBtn');
      var target=visible(stripeBtn)?stripeBtn:placeBtn;
      if(target&&!target.disabled)target.click();
    });
  }
  dock.querySelector('strong').textContent=moneyFromSummary();
  var action=dock.querySelector('button');
  if(visible(stripe)){
    action.textContent=copy('Payer maintenant →','Pay now →');
    action.disabled=!!stripe.disabled;
  }else if(place){
    action.textContent=place.disabled?copy('Paiement indisponible','Payment unavailable'):copy('Continuer au paiement →','Continue to payment →');
    action.disabled=!!place.disabled;
  }
}
function enhanceCheckout(){
  var onCheckout=isMobile()&&(location.hash||'').indexOf('#/checkout')===0;
  document.body.classList.toggle('arty-mobile-focus',onCheckout||(location.hash||'').indexOf('#/product/')===0);
  if(!onCheckout)return;
  setCheckoutAutofill();
  ensureCheckoutOverview();
  ensureCheckoutDock();
}
function sync(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(function(){
    scheduled=false;
    if(!isMobile()){
      removeDock('.arty-mobile-product-dock');
      removeDock('.arty-mobile-checkout-dock');
      document.body.classList.remove('arty-mobile-focus');
    }
    syncBottomNav();
    ensureProductDock();
    enhanceCart();
    enhanceCheckout();
  });
}

window.addEventListener('hashchange',sync);
window.addEventListener('resize',sync,{passive:true});
window.addEventListener('load',sync);
document.addEventListener('click',function(){setTimeout(sync,0)},true);

var observer=new MutationObserver(function(){sync()});
observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','disabled']});

sync();
})();