/* Geometry and pointer state shared by the touch Studio and its regression tests. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.ArtyStudioTouch=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const midpoint=points=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
  const distance=points=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
  function fitZoom(width,height,product,isBag=false){
    return clamp(Math.min(Math.max(1,width-28)/(product.w+90),Math.max(1,height-28)/(product.h+(isBag?180:90))),.08,1.1);
  }
  function pinch(start,points,center){
    const middle=midpoint(points),zoom=clamp(start.zoom*distance(points)/Math.max(1,start.distance),.08,2.5);
    return {zoom,pan:{
      x:middle.x-center.x-(start.midpoint.x-center.x-start.pan.x)*zoom/start.zoom,
      y:middle.y-center.y-(start.midpoint.y-center.y-start.pan.y)*zoom/start.zoom
    }};
  }
  function constrainPan(pan,zoom,viewport,product){
    const x=Math.max(0,(product.w*zoom-viewport.width)/2+viewport.width*.3);
    const y=Math.max(0,(product.h*zoom-viewport.height)/2+viewport.height*.3);
    return {x:clamp(pan.x,-x,x),y:clamp(pan.y,-y,y)};
  }
  function controller(adapter){
    const pointers=new Map();let mode='',start=null;
    const points=()=>Array.from(pointers.values()).slice(0,2);
    const point=event=>({x:event.clientX,y:event.clientY});
    return {
      down(event){
        pointers.set(event.pointerId,point(event));
        if(pointers.size===1){
          start={point:point(event),...adapter.viewport()};
          mode=adapter.beginEdit(event)?'edit':'pan';
        }else if(pointers.size===2){
          // A second finger controls the view, never the artwork under the first.
          if(mode==='edit')adapter.cancelEdit();
          const current=points();start={...adapter.viewport(),midpoint:midpoint(current),distance:distance(current)};mode='pinch';
        }
      },
      move(event){
        if(!pointers.has(event.pointerId))return;
        pointers.set(event.pointerId,point(event));
        if(mode==='pinch'&&pointers.size>=2)adapter.setViewport(pinch(start,points(),adapter.center()));
        else if(mode==='edit')adapter.moveEdit(event);
        else if(mode==='pan')adapter.setViewport({zoom:start.zoom,pan:{x:start.pan.x+event.clientX-start.point.x,y:start.pan.y+event.clientY-start.point.y}});
      },
      up(event,cancelled=false){
        if(!pointers.has(event.pointerId))return;
        if(mode==='edit')cancelled?adapter.cancelEdit():adapter.endEdit(event);
        pointers.delete(event.pointerId);
        // Lifting one finger must not suddenly drag an element or jump the view.
        mode=pointers.size?'release':'';
        if(!pointers.size)start=null;
      },
      cancel(){if(mode==='edit')adapter.cancelEdit();pointers.clear();mode='';start=null;}
    };
  }
  return {fitZoom,pinch,constrainPan,controller};
});

/* Admin product copier: copy a complete existing product into a new-product form. */
if(typeof window!=='undefined'){
  window.addEventListener('load',()=>{
    if(typeof renderAdminKits!=='function')return;

    const originalRenderAdminKits=renderAdminKits;

    function existingProductOptionsHTML(selected=''){
      const products=Array.isArray(allKits)?allKits:[];
      return I18n.html`<option value="">Choisir un produit à copier</option>${products.map(kit=>`<option value="${safeAttr(kit.id)}" ${String(kit.id)===String(selected)?'selected':''}>${safeText(I18n.field(kit,'name'))}</option>`).join('')}`;
    }

    function enhanceAdminProductCopyUI(){
      const panel=document.querySelector('#adminKitsPanel .admin-template-panel');
      if(!panel)return;
      const title=panel.querySelector('.admin-template-copy strong');
      const description=panel.querySelector('.admin-template-copy span');
      const select=document.getElementById('aKitTemplateSelect');
      const apply=panel.querySelector('.admin-template-apply');
      const remove=panel.querySelector('.admin-template-delete');
      const save=panel.querySelector('.admin-template-save');

      if(title)title.textContent=I18n.t('Copier un produit existant');
      if(description)description.textContent=I18n.t('Sélectionnez un produit puis copiez toute sa configuration dans cette nouvelle fiche.');
      if(select){
        const selected=select.value;
        select.innerHTML=existingProductOptionsHTML(selected);
      }
      if(apply)apply.textContent=I18n.t('Copier le produit');
      if(remove)remove.style.display='none';
      if(save)save.style.display='none';
    }

    productTemplateOptionsHTML=existingProductOptionsHTML;
    refreshProductTemplateSelect=function(selected=''){
      const select=document.getElementById('aKitTemplateSelect');
      if(select)select.innerHTML=existingProductOptionsHTML(selected);
    };

    applyProductTemplate=function(){
      const id=document.getElementById('aKitTemplateSelect')?.value;
      const kit=(Array.isArray(allKits)?allKits:[]).find(item=>String(item.id)===String(id));
      if(!kit)return showToast(I18n.t('Choisissez un produit à copier'),'error');

      const setValue=(elementId,value)=>{
        const element=document.getElementById(elementId);
        if(element)element.value=value??'';
      };

      setValue('editKitId','');
      setValue('aKitName',kit.name||'');
      setValue('aKitPrice',kit.originalPrice??kit.price??'');
      setValue('aKitCompare',kit.compareAtPrice??'');
      setValue('aKitDesc',kit.description||'');
      setValue('aKitShortDesc',kit.shortDesc||'');
      setValue('aKitCat',kit.categoryId??'');
      setValue('aKitStockQty',kit.stockQty??'');
      setValue('aKitLowStock',kit.lowStockThreshold??3);

      const stock=document.getElementById('aKitStock');
      const featured=document.getElementById('aKitFeatured');
      if(stock)stock.checked=kit.inStock!==false;
      if(featured)featured.checked=!!kit.featured;

      setAdminProductRows('images',productImageList(kit));
      setAdminProductRows('includes',Array.isArray(kit.includes)?kit.includes:[]);
      setAdminProductRows('sizes',Array.isArray(kit.sizeOptions)?kit.sizeOptions.map(option=>({...option})):[]);
      setAdminProductRows('addons',Array.isArray(kit.addOns)?kit.addOns.map(option=>({...option})):[]);

      const formTitle=document.getElementById('kitFormTitle');
      const cancel=document.getElementById('cancelKit');
      if(formTitle)formTitle.textContent=I18n.t('Ajouter un produit');
      if(cancel)cancel.style.display='none';

      document.querySelector('#adminKitsPanel .admin-form-card')?.scrollIntoView({behavior:'smooth',block:'start'});
      showToast(I18n.t('Produit copié. Modifiez les champs nécessaires puis sauvegardez.'),'success');
    };

    renderAdminKits=function(){
      originalRenderAdminKits();
      enhanceAdminProductCopyUI();
    };

    enhanceAdminProductCopyUI();
  });
}
