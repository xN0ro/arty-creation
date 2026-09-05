/* Mobile navigation and the touch Studio. Desktop markup and styling stay in place. */
const artyMobileNavigation=window.matchMedia('(max-width:1080px)');
const artyMobileStudio=window.matchMedia('(max-width:980px)');
const studioMobileState={sheet:'',pan:{x:0,y:0},controller:null,frame:0};
let artyMobileReturnFocus=null;
function isMobileDesignStudio(){return artyMobileStudio.matches;}

function setMobileNavigation(open,restoreFocus=true){
  const drawer=document.getElementById('navDrawer'),backdrop=document.getElementById('mobileMenuBackdrop'),button=document.getElementById('hamburger');
  if(!drawer)return;
  open=Boolean(open&&artyMobileNavigation.matches);
  if(open)artyMobileReturnFocus=document.activeElement;
  drawer.classList.toggle('open',open);
  document.body.classList.toggle('mobile-menu-open',open);
  button?.setAttribute('aria-expanded',String(open));
  if(backdrop)backdrop.hidden=!open;
  for(const id of ['navLinks','navAuth'])document.getElementById(id)?.classList.remove('open');
  if(artyMobileNavigation.matches){
    drawer.inert=!open;
    drawer.setAttribute('role','dialog');drawer.setAttribute('aria-label',I18n.t('Menu de navigation'));
    if(open)drawer.setAttribute('aria-modal','true');else drawer.removeAttribute('aria-modal');
  }else{drawer.inert=false;drawer.removeAttribute('role');drawer.removeAttribute('aria-modal');drawer.removeAttribute('aria-label');}
  if(open)drawer.querySelector('button,a[href]')?.focus();
  else if(restoreFocus&&artyMobileReturnFocus){artyMobileReturnFocus.focus?.();artyMobileReturnFocus=null;}
}
function closeMobileNavigation(restoreFocus=false){setMobileNavigation(false,restoreFocus);}
function updateMobileHeaderOffset(){
  const bar=document.getElementById('siteAnnouncement');
  document.documentElement.style.setProperty('--arty-announcement-height',`${bar&&!bar.hidden?Math.ceil(bar.getBoundingClientRect().height):0}px`);
}
function syncMobileCart(){
  const button=document.getElementById('mobileCartButton'),count=document.getElementById('mobileCartCount');
  const quantity=cart.reduce((sum,item)=>sum+(parseInt(item.qty)||0),0);
  if(button){button.hidden=!quantity;button.setAttribute('aria-label',I18n.msg`Panier, ${quantity} article${quantity===1?'':'s'}`);}
  if(count)count.textContent=quantity;
}
function syncMobileFilters(){
  const sidebar=document.getElementById('catalogSidebar'),open=Boolean(sidebar?.classList.contains('open')&&window.innerWidth<=980);
  const backdrop=document.getElementById('mobileFilterBackdrop');if(backdrop)backdrop.hidden=!open;
  document.body.classList.toggle('mobile-filters-open',open);
  document.querySelectorAll('.catalog-filter-toggle').forEach(button=>button.setAttribute('aria-expanded',String(open)));
  if(sidebar){sidebar.inert=window.innerWidth<=980&&!open;if(open){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');sidebar.setAttribute('aria-label',I18n.t('Filtres'));}else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');}}
}
function closeMobileFilters(){document.getElementById('catalogSidebar')?.classList.remove('open');syncMobileFilters();}
function mobileFocusTrap(event,root){
  const items=Array.from(root.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]')).filter(element=>element.getClientRects().length&&!element.closest('[hidden]'));
  if(!items.length)return;
  if(event.shiftKey&&(document.activeElement===items[0]||!root.contains(document.activeElement))){event.preventDefault();items.at(-1).focus();}
  else if(!event.shiftKey&&(document.activeElement===items.at(-1)||!root.contains(document.activeElement))){event.preventDefault();items[0].focus();}
}

function mobileStudioChrome(){
  return I18n.html`<header class="studio-mobile-header">
    <div class="studio-mobile-toprow"><button type="button" class="studio-mobile-back" onclick="exitDesignStudio()" aria-label="Quitter le studio">${designStudioIcon('back')}</button><div class="studio-mobile-brand"><strong>ARTY</strong><span>Studio</span></div>${languageSwitchHTML()}<button type="button" class="studio-mobile-next" onclick="setMobileStudioSheet('order')">Suivant ${designStudioIcon('forward')}</button></div>
    <div class="studio-mobile-viewrow"><div class="studio-mobile-views" role="group" aria-label="Type d’aperçu">${[['edit','Créer'],['trace','Tracé'],['painted','Aperçu']].map(([value,label])=>`<button type="button" data-studio-view="${value}" class="${designStudioState.view===value?'active':''}" aria-pressed="${designStudioState.view===value}" onclick="setDesignStudioView('${value}')">${safeText(I18n.t(label))}</button>`).join('')}</div><div class="studio-mobile-history"><button type="button" onclick="designStudioUndo()" data-studio-action="undo" aria-label="Annuler">${designStudioIcon('undo')}</button><button type="button" onclick="designStudioRedo()" data-studio-action="redo" aria-label="Rétablir">${designStudioIcon('redo')}</button></div></div>
  </header>`;
}
function mobileStudioWorkspaceControls(){
  return I18n.html`<div class="studio-mobile-canvas-actions"><button type="button" onclick="fitDesignStudioCanvas(true)" aria-label="Ajuster la création à l’écran">${designStudioIcon('zoom')}Ajuster</button><span>Pincez pour zoomer</span></div><div class="studio-mobile-context" id="studioMobileContext"></div>`;
}
function setMobileStudioSheet(sheet){
  if(!isMobileDesignStudio())return;
  if(sheet==='inspector'&&designStudioState.view!=='edit')setDesignStudioView('edit');
  studioMobileState.sheet=studioMobileState.sheet===sheet?'':sheet;
  if(['templates','images','text','shapes','layers'].includes(studioMobileState.sheet)){
    designStudioState.activePanel=studioMobileState.sheet;renderDesignStudioLibrary();
  }
  renderDesignStudioInspector();syncMobileStudioUI();
  requestAnimationFrame(()=>fitDesignStudioCanvas(true));
}
function closeMobileStudioSheet(){
  studioMobileState.sheet='';
  document.activeElement?.blur?.();syncMobileStudioUI();
  requestAnimationFrame(()=>fitDesignStudioCanvas(true));
}
function mobileStudioSheetHeading(title){
  return I18n.html`<div class="studio-mobile-sheet-head"><strong>${safeText(title)}</strong><button type="button" onclick="closeMobileStudioSheet()">Terminé ${designStudioIcon('check')}</button></div>`;
}
function syncMobileStudioUI(){
  const app=document.querySelector('.design-studio-app');if(!app)return;
  const mobile=isMobileDesignStudio(),sheet=mobile?studioMobileState.sheet:'',item=designStudioSelected();
  app.dataset.mobileSheet=sheet;
  const library=document.getElementById('designStudioLibrary'),inspector=document.getElementById('designStudioInspector');
  for(const panel of [library,inspector]){
    if(!panel)continue;
    const isInspector=panel===inspector,visible=isInspector?['inspector','order'].includes(sheet):Boolean(sheet&&!['inspector','order'].includes(sheet));
    panel.classList.toggle('mobile-sheet-open',visible);
    panel.inert=mobile&&!visible;
    panel.querySelector('.studio-mobile-sheet-head')?.remove();
    if(mobile){
      const label=isInspector?(sheet==='order'?I18n.t('Votre produit'):I18n.t('Modifier l’élément')):I18n.t({templates:'Modèles',images:'Images',text:'Texte',shapes:'Formes',layers:'Calques'}[designStudioState.activePanel]||'Outils');
      panel.insertAdjacentHTML('afterbegin',mobileStudioSheetHeading(label));
      panel.setAttribute('aria-label',label);
    }
  }
  document.querySelectorAll('[data-studio-panel]').forEach(button=>{
    const active=mobile?sheet===button.dataset.studioPanel:designStudioState.activePanel===button.dataset.studioPanel;
    button.classList.toggle('active',active);button.setAttribute('aria-expanded',String(active));
  });
  document.querySelectorAll('[data-studio-view]').forEach(button=>button.setAttribute('aria-pressed',String(designStudioState.view===button.dataset.studioView)));
  const context=document.getElementById('studioMobileContext');
  if(context){
    context.hidden=!item;
    context.innerHTML=item?I18n.html`<span>${safeText(designStudioElementName(item))}</span><button type="button" class="studio-mobile-edit" onclick="setMobileStudioSheet('inspector')">Modifier</button><button type="button" onclick="duplicateDesignStudioElement()" aria-label="Dupliquer">${designStudioIcon('copy')}</button><button type="button" onclick="removeDesignStudioElement()" aria-label="Supprimer">${designStudioIcon('trash')}</button>`:'';
  }
  syncDesignStudioHistoryButtons();
}
function setMobileStudioViewport(view){
  studioMobileState.pan=ArtyStudioTouch.constrainPan(view.pan,view.zoom,mobileStudioViewportSize(),designStudioGeometry().product);
  setDesignStudioZoom(view.zoom*100);
}
function mobileStudioViewportSize(){const element=document.getElementById('designStudioCanvasScroll');return {width:element?.clientWidth||1,height:element?.clientHeight||1};}
function applyMobileStudioPan(){
  const canvas=designStudioRuntime.canvas;if(!canvas)return;
  canvas.style.transform=isMobileDesignStudio()?`translate(${studioMobileState.pan.x}px,${studioMobileState.pan.y}px)`:'';
}
function fitMobileStudioCanvas(force){
  if(!isMobileDesignStudio())return false;
  if(!force&&!designStudioState.zoomAuto)return true;
  const viewport=mobileStudioViewportSize();
  studioMobileState.pan={x:0,y:0};
  setDesignStudioZoom(ArtyStudioTouch.fitZoom(viewport.width,viewport.height,designStudioGeometry().product,designStudioState.product==='bag')*100,true);
  designStudioState.zoomAuto=true;applyMobileStudioPan();return true;
}
function initMobileStudioCanvas(canvas){
  let edit=null;
  const cancelEdit=()=>{
    if(!edit)return;
    const item=designStudioSelected(),original=designStudioRuntime.startElement;
    if(item&&original)Object.assign(item,original);
    designStudioState.history=edit.history;designStudioState.future=edit.future;
    edit=null;designStudioPointerUp();syncDesignStudioHistoryButtons();
  };
  const controller=ArtyStudioTouch.controller({
    viewport:()=>({zoom:designStudioState.zoom,pan:{...studioMobileState.pan}}),
    center:()=>{const rect=document.getElementById('designStudioCanvasScroll').getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};},
    setViewport:setMobileStudioViewport,
    beginEdit:event=>{
      edit={history:designStudioState.history.slice(),future:designStudioState.future.slice()};
      designStudioPointerDown(event);
      if(!designStudioRuntime.dragMode){edit=null;return false;}return true;
    },
    moveEdit:designStudioPointerMove,
    endEdit:()=>{
      const current=designStudioSelected(),original=designStudioRuntime.startElement;
      if(current&&original&&['x','y','w','h'].every(key=>current[key]===original[key]))cancelEdit();
      else {edit=null;designStudioPointerUp();}
    },
    cancelEdit
  });
  studioMobileState.controller=controller;
  const touch=event=>isMobileDesignStudio()&&event.pointerType==='touch';
  canvas.onpointerdown=event=>{if(!touch(event)){designStudioPointerDown(event);return;}event.preventDefault();controller.down(event);try{canvas.setPointerCapture(event.pointerId);}catch{}};
  canvas.onpointermove=event=>{if(!touch(event)){designStudioPointerMove(event);return;}event.preventDefault();controller.move(event);};
  canvas.onpointerup=event=>{if(touch(event))controller.up(event);else designStudioPointerUp();};
  canvas.onpointercancel=event=>{if(touch(event))controller.up(event,true);else designStudioPointerUp();};
  canvas.onlostpointercapture=event=>{if(touch(event))controller.up(event,true);else designStudioPointerUp();};
  applyMobileStudioPan();
}
function updateMobileViewport(){
  if(!isMobileDesignStudio())return;
  const viewport=window.visualViewport;
  // Browser controls and the software keyboard resize this working area.
  const height=viewport?.height||window.innerHeight;
  document.documentElement.style.setProperty('--arty-visual-height',`${Math.round(height)}px`);
  document.documentElement.style.setProperty('--arty-visual-top',`${Math.round(viewport?.offsetTop||0)}px`);
  if(location.hash.startsWith('#/studio')){
    cancelAnimationFrame(studioMobileState.frame);
    studioMobileState.frame=requestAnimationFrame(()=>fitDesignStudioCanvas());
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('mobileCartButton')?.insertAdjacentHTML('afterbegin',designStudioIcon('cart'));
  closeMobileNavigation();syncMobileFilters();syncMobileCart();updateMobileViewport();
  updateMobileHeaderOffset();
  if(typeof ResizeObserver==='function')new ResizeObserver(updateMobileHeaderOffset).observe(document.getElementById('siteAnnouncement'));
  document.addEventListener('click',event=>{
    if(event.target.closest('#navDrawer a,#navDrawer .logout-btn'))closeMobileNavigation();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if(document.body.classList.contains('mobile-menu-open')){event.preventDefault();closeMobileNavigation(true);}
      else if(document.body.classList.contains('mobile-filters-open')){event.preventDefault();closeMobileFilters();document.querySelector('.catalog-filter-toggle')?.focus();}
      else if(isMobileDesignStudio()&&studioMobileState.sheet){event.preventDefault();event.stopImmediatePropagation();closeMobileStudioSheet();}
    }
    if(event.key==='Tab'){
      if(document.body.classList.contains('mobile-menu-open'))mobileFocusTrap(event,document.getElementById('navDrawer'));
      else if(document.body.classList.contains('mobile-filters-open'))mobileFocusTrap(event,document.getElementById('catalogSidebar'));
    }
  },true);
  artyMobileNavigation.addEventListener('change',()=>closeMobileNavigation());
  artyMobileStudio.addEventListener('change',()=>{studioMobileState.controller?.cancel();syncMobileStudioUI();applyMobileStudioPan();if(location.hash.startsWith('#/studio'))requestAnimationFrame(()=>fitDesignStudioCanvas(true));});
  window.addEventListener('resize',()=>{syncMobileFilters();updateMobileHeaderOffset();updateMobileViewport();});
  window.visualViewport?.addEventListener('resize',updateMobileViewport);
  window.visualViewport?.addEventListener('scroll',updateMobileViewport);
});
