/* Phone-only enhancements. Existing cart, pricing and payment actions remain authoritative. */
(function(){
'use strict';

var mobile=window.matchMedia('(max-width:820px)');
var scheduled=false;
var moves=[];
var stripeObserver=null;
var stripeObservedPanel=null;
var cartWasOpen=false;
var cartReturnFocus=null;
var activeOnMobile=false;

function isMobile(){return mobile.matches}
function copy(fr,en){try{return I18n.locale().indexOf('en')===0?en:fr}catch(e){return fr}}
function setText(node,value){if(node&&node.textContent!==String(value))node.textContent=String(value)}
function setAttr(node,name,value){if(node&&node.getAttribute(name)!==String(value))node.setAttribute(name,String(value))}
function setBodyClass(name,enabled){if(document.body.classList.contains(name)!==enabled)document.body.classList.toggle(name,enabled)}
function removeNode(selector){var node=document.querySelector(selector);if(node)node.remove()}
function owned(tag,className){var node=document.createElement(tag);node.className=className;node.dataset.mobileCommerce='true';return node}
function moveNode(node,parent,before){
  if(!node||!parent||node.parentNode===parent)return;
  var marker=document.createComment('ARTY original position');
  node.parentNode.insertBefore(marker,node);
  moves.push({node:node,marker:marker});
  parent.insertBefore(node,before||null);
}
function restoreDesktop(){
  if(!activeOnMobile)return;
  moves.forEach(function(move){if(move.marker.isConnected){move.marker.replaceWith(move.node)}});
  moves=[];
  document.querySelectorAll('[data-mobile-commerce]').forEach(function(node){node.remove()});
  document.querySelectorAll('.arty-mobile-search').forEach(function(node){node.classList.remove('arty-mobile-search')});
  document.querySelectorAll('[data-mobile-label]').forEach(function(node){
    var original=node.dataset.mobileLabel;
    if(original)node.setAttribute('for',original);else node.removeAttribute('for');
    delete node.dataset.mobileLabel;
  });
  document.querySelectorAll('[data-mobile-invalid]').forEach(clearFieldError);
  var cart=document.getElementById('cartSidebar');
  if(cart){cart.inert=false;cart.removeAttribute('role');cart.removeAttribute('aria-modal');cart.removeAttribute('aria-label')}
  var checkout=document.querySelector('#cartFooter .btn-orange');
  if(checkout&&checkout.dataset.mobileOriginalText){setText(checkout,I18n.t('Continuer →'));delete checkout.dataset.mobileOriginalText}
  if(stripeObserver)stripeObserver.disconnect();
  stripeObservedPanel=null;
  document.body.classList.remove('arty-mobile-product-ready','arty-mobile-checkout-ready','arty-mobile-input-focus');
  cartWasOpen=false;cartReturnFocus=null;activeOnMobile=false;
}
function enhanceHome(){
  var home=document.getElementById('page-home');
  if(!home)return;
  // Move existing sections, then restore their exact positions on desktop.
  var why=home.querySelector('.why-section');
  ['.popular-section','.categories-section'].forEach(function(selector){
    var section=home.querySelector(selector);
    if(section&&!section.dataset.mobileHomeOrder){
      var marker=document.createComment('ARTY original section position');
      section.before(marker);moves.push({node:section,marker:marker});
      home.insertBefore(section,why);section.dataset.mobileHomeOrder='true';
    }
  });
  var actions=home.querySelector('.hero-actions');
  if(actions){
    var link=actions.querySelector('.arty-mobile-events-link');
    if(!link){link=owned('a','arty-mobile-events-link');link.href='#/party';actions.appendChild(link)}
    setText(link,copy('Découvrir nos événements →','Explore our events →'));
  }
}
function enhanceCatalog(){
  var toolbar=document.querySelector('#page-paintings .catalog-toolbar');
  var input=document.getElementById('kitSearchInput');
  if(toolbar&&input){
    var group=input.closest('.catalog-filter-group');
    if(group){
      group.classList.add('arty-mobile-search');
      var label=group.querySelector('label');
      if(label&&!label.hasAttribute('data-mobile-label')){label.dataset.mobileLabel=label.getAttribute('for')||'';label.htmlFor=input.id}
      moveNode(group,toolbar,toolbar.querySelector('.catalog-toolbar-actions'));
    }
  }
  var promise=document.querySelector('#page-paintings .catalog-promise');
  if(promise&&!promise.closest('.arty-mobile-kit-info')){
    var details=owned('details','arty-mobile-kit-info');
    details.appendChild(document.createElement('summary'));
    promise.before(details);moveNode(promise,details);
  }
  setText(document.querySelector('.arty-mobile-kit-info>summary'),copy('Comment fonctionne votre kit','How your kit works'));
  document.querySelectorAll('#homePopularKits .kit-card,#kitsGrid .kit-card').forEach(function(card){
    var body=card.querySelector('.kit-card-body');
    var route=(card.getAttribute('onclick')||'').match(/#\/product\/[a-zA-Z0-9_-]+/);
    if(!body||!route)return;
    var link=body.querySelector('.arty-mobile-card-link');
    if(!link){
      link=owned('a','arty-mobile-card-link');link.href=route[0];
      link.addEventListener('click',function(event){event.stopPropagation()});body.appendChild(link);
    }
    setText(link,copy('Voir le kit','View kit'));
    var title=card.querySelector('.kit-card-title');
    setAttr(link,'aria-label',copy('Voir le kit : ','View kit: ')+(title?title.textContent:''));
  });
}
function hiddenByOverlay(){
  return document.body.classList.contains('mobile-menu-open')||document.body.classList.contains('mobile-filters-open')||
    !!document.querySelector('.cart-sidebar.open,.modal-overlay.open,.arty-consent-banner.show,.arty-consent-modal.show');
}
function actionInView(button){
  if(!button||!button.getClientRects().length)return false;
  var rect=button.getBoundingClientRect();
  var announcement=document.getElementById('siteAnnouncement');
  var header=document.getElementById('navbar');
  var top=announcement&&!announcement.hidden?announcement.getBoundingClientRect().bottom:header?header.getBoundingClientRect().bottom:64;
  return rect.top>=Math.max(0,top)&&rect.bottom<=window.innerHeight-16;
}
function ensureProductDock(){
  var page=document.getElementById('page-product');
  var original=page&&page.querySelector('.product-buy-now');
  var price=document.getElementById('productConfiguredPrice');
  if(!(location.hash||'').startsWith('#/product/')||!page||!page.classList.contains('active')||!original||!price){
    removeNode('.arty-mobile-product-dock');setBodyClass('arty-mobile-product-ready',false);return;
  }
  var dock=document.querySelector('.arty-mobile-product-dock');
  if(!dock){
    dock=owned('div','arty-mobile-product-dock');
    dock.innerHTML='<div class="dock-price"><small></small><strong></strong></div><button type="button" class="btn btn-orange"></button>';
    document.body.appendChild(dock);
    dock.querySelector('button').addEventListener('click',function(){
      var target=document.querySelector('#page-product .product-buy-now');if(target&&!target.disabled)target.click();
    });
  }
  setText(dock.querySelector('small'),copy('Prix par kit','Price per kit'));
  setText(dock.querySelector('strong'),price.textContent||'');
  var button=dock.querySelector('button');
  setText(button,original.disabled?copy('Épuisé','Sold out'):copy('Acheter maintenant','Buy now'));
  button.disabled=!!original.disabled;
  setBodyClass('arty-mobile-product-ready',true);
  dock.hidden=hiddenByOverlay()||actionInView(original);
}
function enhanceCart(){
  var footer=document.getElementById('cartFooter'),sidebar=document.getElementById('cartSidebar');
  if(!footer||!sidebar)return;
  var checkout=footer.querySelector('.btn-orange');
  if(checkout){
    if(!checkout.dataset.mobileOriginalText)checkout.dataset.mobileOriginalText=checkout.textContent;
    setText(checkout,copy('Passer à la caisse →','Checkout →'));
  }
  var trust=footer.querySelector('.arty-mobile-cart-trust');
  if(!trust){trust=owned('div','arty-mobile-cart-trust');footer.querySelector('.cart-total').after(trust)}
  setText(trust,copy('Taxes et livraison calculées à la caisse','Taxes and shipping calculated at checkout'));
  var open=sidebar.classList.contains('open');
  sidebar.inert=!open;
  setAttr(sidebar,'role','dialog');setAttr(sidebar,'aria-label',copy('Votre panier','Your cart'));
  if(open)sidebar.setAttribute('aria-modal','true');else sidebar.removeAttribute('aria-modal');
  if(open&&!cartWasOpen){cartReturnFocus=document.activeElement;sidebar.querySelector('.modal-close')?.focus({preventScroll:true})}
  if(!open&&cartWasOpen&&cartReturnFocus?.isConnected)cartReturnFocus.focus({preventScroll:true});
  cartWasOpen=open;
  sidebar.querySelectorAll('.cart-qty-control').forEach(function(control){
    var buttons=control.querySelectorAll('button');
    setAttr(buttons[0],'aria-label',copy('Diminuer la quantité','Decrease quantity'));
    setAttr(buttons[1],'aria-label',copy('Augmenter la quantité','Increase quantity'));
  });
}
function setCheckoutAutofill(){
  var attrs={coName:{autocomplete:'name'},coEmail:{autocomplete:'email',inputmode:'email'},coPhone:{autocomplete:'tel',inputmode:'tel'},coAddress:{autocomplete:'street-address'},coCity:{autocomplete:'address-level2'},coProvince:{autocomplete:'address-level1'},coPostal:{autocomplete:'postal-code'},coCountry:{autocomplete:'country-name'}};
  Object.keys(attrs).forEach(function(id){
    var field=document.getElementById(id);if(!field)return;
    Object.keys(attrs[id]).forEach(function(key){setAttr(field,key,attrs[id][key])});
    var label=field.closest('.form-group')?.querySelector('label');
    if(label&&!label.hasAttribute('data-mobile-label')){label.dataset.mobileLabel=label.getAttribute('for')||'';label.htmlFor=id}
  });
}
function stripeStageActive(){
  var panel=document.getElementById('stripePaymentPanel');
  return !!(panel&&panel.getClientRects().length);
}
function bindStripeObserver(){
  var panel=document.getElementById('stripePaymentPanel');
  if(!panel||panel===stripeObservedPanel)return;
  if(stripeObserver)stripeObserver.disconnect();stripeObservedPanel=panel;
  stripeObserver=new MutationObserver(sync);
  stripeObserver.observe(panel.parentNode,{attributes:true,subtree:true,attributeFilter:['style','class','disabled']});
}
function checkoutTotal(){
  var final=document.querySelector('#checkoutCommerceTotals .checkout-commerce-total strong');
  var subtotal=document.querySelector('.checkout-summary-card .checkout-total-row strong');
  return {text:(final||subtotal)?.textContent.trim()||'—',complete:!!final};
}
function enhanceOrderSummary(){
  var card=document.querySelector('#page-checkout .checkout-summary-card');
  var layout=document.querySelector('#page-checkout .checkout-layout');
  if(!card||!layout)return;
  var details=card.closest('.arty-mobile-order-summary');
  if(!details){
    details=owned('details','arty-mobile-order-summary');
    details.innerHTML='<summary><span><b></b><small></small></span><strong></strong></summary>';
    layout.prepend(details);moveNode(card,details);
  }
  var total=checkoutTotal();
  setText(details.querySelector('summary b'),copy('Votre commande','Your order'));
  setText(details.querySelector('summary small'),total.complete?copy('Voir les articles, taxes et livraison','View items, taxes and shipping'):copy('Sous-total · frais à calculer','Subtotal · fees to be calculated'));
  setText(details.querySelector('summary>strong'),total.text);
}
function clearFieldError(field){
  if(!field||!field.hasAttribute('data-mobile-invalid'))return;
  field.removeAttribute('aria-invalid');field.removeAttribute('data-mobile-invalid');
  var id=field.id+'MobileError';
  var described=(field.getAttribute('aria-describedby')||'').split(' ').filter(function(value){return value&&value!==id}).join(' ');
  if(described)field.setAttribute('aria-describedby',described);else field.removeAttribute('aria-describedby');
  document.getElementById(id)?.remove();
}
function showFieldError(field,message){
  if(!field)return;
  setAttr(field,'aria-invalid','true');setAttr(field,'data-mobile-invalid','true');
  var id=field.id+'MobileError',error=document.getElementById(id);
  if(!error){
    error=owned('p','arty-mobile-field-error');error.id=id;
    (field.type==='checkbox'?field.closest('label'):field).after(error);
    setAttr(field,'aria-describedby',((field.getAttribute('aria-describedby')||'')+' '+id).trim());
  }
  setText(error,message);
}
function validateCheckout(){
  var checks=[
    ['coName',function(field){return !!field.value.trim()},copy('Entrez votre nom complet.','Enter your full name.')],
    ['coEmail',function(field){return typeof validateEmail==='function'?validateEmail(field.value.trim()):/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim())},copy('Entrez un courriel valide.','Enter a valid email address.')],
    ['coAddress',function(field){return !!field.value.trim()},copy('Entrez votre adresse de livraison.','Enter your shipping address.')],
    ['coPolicyAccept',function(field){return field.checked},copy('Acceptez les politiques pour continuer.','Accept the policies to continue.')]
  ];
  var first=null;
  checks.forEach(function(check){var field=document.getElementById(check[0]);if(!field)return;clearFieldError(field);if(!check[1](field)){showFieldError(field,check[2]);if(!first)first=field}});
  if(first){first.focus({preventScroll:true});first.scrollIntoView({block:'center',behavior:'auto'});return false}
  return true;
}
function ensureCheckoutDock(){
  var page=document.getElementById('page-checkout');
  var place=document.getElementById('placeOrderBtn');
  var stripe=document.getElementById('stripePayBtn');
  if((location.hash||'')!=='#/checkout'||!page?.classList.contains('active')||(!place&&!stripe)){
    removeNode('.arty-mobile-checkout-dock');setBodyClass('arty-mobile-checkout-ready',false);return;
  }
  setCheckoutAutofill();bindStripeObserver();enhanceOrderSummary();
  var dock=document.querySelector('.arty-mobile-checkout-dock');
  if(!dock){
    dock=owned('div','arty-mobile-checkout-dock');
    dock.innerHTML='<div class="checkout-dock-copy"><small></small><strong></strong></div><button type="button" class="btn btn-orange"></button>';
    document.body.appendChild(dock);
    dock.querySelector('button').addEventListener('click',function(){
      var target=document.getElementById(stripeStageActive()?'stripePayBtn':'placeOrderBtn');
      if(target&&!target.disabled)target.click();
    });
  }
  var paying=stripeStageActive(),target=paying?stripe:place,total=checkoutTotal();
  setText(dock.querySelector('small'),total.complete?copy('Total, taxes incluses','Total, including tax'):copy('Sous-total · hors frais','Subtotal · before fees'));
  setText(dock.querySelector('strong'),total.text);
  var action=dock.querySelector('button');
  // Reflect the real action (including processing/unavailable), never an invented payment state.
  setText(action,target?.disabled?target.textContent.trim():paying?copy('Payer maintenant →','Pay now →'):typeof stripeConfigured!=='undefined'&&!stripeConfigured?copy('Créer la commande →','Place order →'):copy('Continuer →','Continue →'));
  action.disabled=!target||target.disabled;
  setBodyClass('arty-mobile-checkout-ready',true);
  dock.hidden=hiddenByOverlay()||actionInView(target);
}
function sync(){
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(function(){
    scheduled=false;
    if(!isMobile()){
      restoreDesktop();
      document.querySelectorAll('[data-mobile-home-order]').forEach(function(node){delete node.dataset.mobileHomeOrder});
      return;
    }
    activeOnMobile=true;
    moves=moves.filter(function(move){return move.marker.isConnected});
    enhanceHome();enhanceCatalog();enhanceCart();ensureProductDock();ensureCheckoutDock();
  });
}
function updateFocus(){
  if(!isMobile())return;
  var active=document.activeElement;
  setBodyClass('arty-mobile-input-focus',!!active?.matches('input:not([type=checkbox]):not([type=radio]),textarea,select'));
  sync();
}
document.addEventListener('focusin',updateFocus);
document.addEventListener('focusout',function(){setTimeout(updateFocus,0)});
document.addEventListener('input',function(event){if(isMobile()){clearFieldError(event.target);sync()}});
document.addEventListener('change',function(event){if(isMobile()){clearFieldError(event.target);sync()}});
document.addEventListener('click',function(event){
  if(!isMobile())return;
  if(event.target.closest('#placeOrderBtn')&&!event.target.closest('#placeOrderBtn').disabled&&!stripeStageActive()&&!validateCheckout()){
    event.preventDefault();event.stopImmediatePropagation();return;
  }
  setTimeout(sync,0);
},true);
document.addEventListener('keydown',function(event){
  if(!isMobile())return;
  var sidebar=document.querySelector('.cart-sidebar.open');if(!sidebar)return;
  if(event.key==='Escape'&&typeof closeCart==='function'){event.preventDefault();closeCart();sync()}
  if(event.key==='Tab'&&typeof mobileFocusTrap==='function')mobileFocusTrap(event,sidebar);
},true);
window.addEventListener('hashchange',sync);
window.addEventListener('resize',sync,{passive:true});
window.addEventListener('scroll',function(){
  if(!isMobile())return;
  // Scrolling only changes dock visibility. It does not rebuild the storefront.
  var product=document.querySelector('.arty-mobile-product-dock');
  if(product)product.hidden=hiddenByOverlay()||actionInView(document.querySelector('#page-product .product-buy-now'));
  var checkout=document.querySelector('.arty-mobile-checkout-dock');
  if(checkout)checkout.hidden=hiddenByOverlay()||actionInView(document.getElementById(stripeStageActive()?'stripePayBtn':'placeOrderBtn'));
},{passive:true});
window.addEventListener('load',sync);
new MutationObserver(function(mutations){
  // Ignore our own price/label updates to avoid a perpetual render loop.
  var ownUI='.arty-mobile-product-dock,.arty-mobile-checkout-dock,.arty-mobile-card-link,.arty-mobile-events-link,.arty-mobile-field-error,.arty-mobile-cart-trust,.arty-mobile-order-summary>summary,.arty-mobile-kit-info>summary';
  if(mutations.some(function(mutation){var target=mutation.target.nodeType===1?mutation.target:mutation.target.parentElement;return !target?.closest(ownUI)}))sync();
}).observe(document.body,{subtree:true,childList:true});
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
sync();
})();
