(function(){
'use strict';

var MOBILE_MAX=820;
var scheduled=false;
var observer=null;

function isMobile(){return window.matchMedia('(max-width:'+MOBILE_MAX+'px)').matches}
function locale(){try{return String(I18n.locale()||'fr').toLowerCase()}catch(e){return 'fr'}}
function copy(fr,en){return locale().indexOf('en')===0?en:fr}
function getCart(){
  try{if(typeof cart!=='undefined'&&Array.isArray(cart))return cart}catch(e){}
  try{return JSON.parse(localStorage.getItem('arty_cart')||'[]')}catch(e){return []}
}
function totalText(){
  var finalTotal=document.querySelector('#checkoutCommerceTotals .checkout-commerce-total strong');
  if(finalTotal&&finalTotal.textContent.trim())return finalTotal.textContent.trim();
  var subtotal=document.querySelector('.checkout-summary-card .checkout-total-row strong');
  if(subtotal&&subtotal.textContent.trim())return subtotal.textContent.trim();
  try{if(typeof getSubtotal==='function'&&typeof I18n!=='undefined')return I18n.currency(Number(getSubtotal()||0).toFixed(2))}catch(e){}
  return '';
}
function removeDock(selector){var node=document.querySelector(selector);if(node)node.remove()}
function hiddenByOverlay(){
  return document.body.classList.contains('mobile-menu-open')||
    !!document.querySelector('.cart-sidebar.open')||
    !!document.querySelector('.modal-overlay.open');
}
function ensureProductDock(){
  var hash=location.hash||'';
  var page=document.getElementById('page-product');
  var onProduct=isMobile()&&hash.indexOf('#/product/')===0&&page&&page.classList.contains('active');
  if(!onProduct){removeDock('.arty-mobile-product-dock');document.body.classList.remove('arty-mobile-product-ready');return}
  var original=document.querySelector('#page-product .product-buy-now');
  var price=document.getElementById('productConfiguredPrice');
  if(!original||!price){document.body.classList.remove('arty-mobile-product-ready');return;}
  var dock=document.querySelector('.arty-mobile-product-dock');
  if(!dock){
    dock=document.createElement('div');dock.className='arty-mobile-product-dock';
    dock.innerHTML='<div class="dock-price"><small></small><strong></strong></div><button type="button" class="btn btn-orange"></button>';
    document.body.appendChild(dock);
    dock.querySelector('button').addEventListener('click',function(){
      var target=document.querySelector('#page-product .product-buy-now');
      if(target&&!target.disabled)target.click();
    });
  }
  dock.querySelector('small').textContent=copy('Votre sélection','Your selection');
  dock.querySelector('strong').textContent=price.textContent||'';
  var button=dock.querySelector('button');
  button.textContent=original.disabled?copy('Épuisé','Sold out'):copy('Acheter maintenant','Buy now');
  button.disabled=!!original.disabled;
  document.body.classList.add('arty-mobile-product-ready');\n  dock.hidden=hiddenByOverlay();
}
function enhanceCart(){
  if(!isMobile())return;
  var footer=document.getElementById('cartFooter');if(!footer)return;
  var checkout=footer.querySelector('.btn-orange');
  if(checkout)checkout.textContent=copy('Passer à la caisse →','Checkout →');
  if(!footer.querySelector('.arty-mobile-cart-trust')){
    var trust=document.createElement('div');trust.className='arty-mobile-cart-trust';
    trust.textContent=copy('Paiement sécurisé • Achat rapide','Secure payment • Fast checkout');
    var total=footer.querySelector('.cart-total');
    if(total)total.insertAdjacentElement('afterend',trust);else footer.prepend(trust);
  }
}
function setCheckoutAutofill(){
  var attrs={
    coName:{autocomplete:'name'},coEmail:{autocomplete:'email',inputmode:'email'},coPhone:{autocomplete:'tel',inputmode:'tel'},
    coAddress:{autocomplete:'street-address'},coCity:{autocomplete:'address-level2'},coProvince:{autocomplete:'address-level1'},
    coPostal:{autocomplete:'postal-code'},coCountry:{autocomplete:'country-name'}
  };
  Object.keys(attrs).forEach(function(id){
    var field=document.getElementById(id);if(!field)return;
    Object.keys(attrs[id]).forEach(function(key){field.setAttribute(key,attrs[id][key])});
  });
}
function visible(el){return !!(el&&getComputedStyle(el).display!=='none')}
function ensureCheckoutDock(){
  var hash=location.hash||'';
  var page=document.getElementById('page-checkout');
  var onCheckout=isMobile()&&hash.indexOf('#/checkout')===0&&page&&page.classList.contains('active');
  if(!onCheckout){removeDock('.arty-mobile-checkout-dock');document.body.classList.remove('arty-mobile-checkout-ready');return}
  var place=document.getElementById('placeOrderBtn');
  var stripe=document.getElementById('stripePayBtn');
  if(!place&&!stripe){document.body.classList.remove('arty-mobile-checkout-ready');return;}
  var dock=document.querySelector('.arty-mobile-checkout-dock');
  if(!dock){
    dock=document.createElement('div');dock.className='arty-mobile-checkout-dock';
    dock.innerHTML='<div class="checkout-dock-copy"><small></small><strong></strong></div><button type="button" class="btn btn-orange"></button>';
    document.body.appendChild(dock);
    dock.querySelector('button').addEventListener('click',function(){
      var stripeBtn=document.getElementById('stripePayBtn');
      var placeBtn=document.getElementById('placeOrderBtn');
      var target=visible(stripeBtn)?stripeBtn:placeBtn;
      if(target&&!target.disabled)target.click();
    });
  }
  dock.querySelector('small').textContent=copy('Total • paiement sécurisé','Total • secure payment');
  dock.querySelector('strong').textContent=totalText();
  var action=dock.querySelector('button');
  if(visible(stripe)){
    action.textContent=copy('Payer maintenant →','Pay now →');
    action.disabled=!!stripe.disabled;
  }else{
    action.textContent=place&&place.disabled?copy('Paiement indisponible','Payment unavailable'):copy('Continuer au paiement →','Continue to payment →');
    action.disabled=!place||!!place.disabled;
  }
  dock.hidden=hiddenByOverlay();
}
function enhanceCheckout(){
  var onCheckout=isMobile()&&(location.hash||'').indexOf('#/checkout')===0;
  if(!onCheckout){removeDock('.arty-mobile-checkout-dock');return}
  setCheckoutAutofill();
  ensureCheckoutDock();
}
function cleanupLegacy(){
  document.querySelectorAll('.arty-mobile-bottom-nav,.arty-mobile-checkout-overview').forEach(function(node){node.remove()});
  document.querySelectorAll('.checkout-summary-card.arty-mobile-summary-collapsed').forEach(function(node){node.classList.remove('arty-mobile-summary-collapsed')});
  document.body.style.paddingBottom='';
}
function sync(){
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(function(){
    scheduled=false;cleanupLegacy();
    if(!isMobile()){
      removeDock('.arty-mobile-product-dock');removeDock('.arty-mobile-checkout-dock');document.body.classList.remove('arty-mobile-product-ready','arty-mobile-checkout-ready');return;
    }
    ensureProductDock();enhanceCart();enhanceCheckout();
  });
}
function setInputFocus(active){document.body.classList.toggle('arty-mobile-input-focus',!!active);sync()}

document.addEventListener('focusin',function(e){if(e.target&&e.target.matches('input,textarea,select'))setInputFocus(true)});
document.addEventListener('focusout',function(){setTimeout(function(){setInputFocus(!!document.activeElement&&document.activeElement.matches&&document.activeElement.matches('input,textarea,select'))},0)});
window.addEventListener('hashchange',sync);
window.addEventListener('resize',sync,{passive:true});
window.addEventListener('load',sync);
document.addEventListener('click',function(){setTimeout(sync,0)},true);

observer=new MutationObserver(function(mutations){
  for(var i=0;i<mutations.length;i++){
    if(mutations[i].addedNodes&&mutations[i].addedNodes.length){sync();break}
  }
});
observer.observe(document.body,{subtree:true,childList:true});

cleanupLegacy();sync();
})();