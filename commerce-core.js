'use strict';

const PROVINCES = {
  AB:{name:'Alberta',gstHst:5,pst:0,pstKey:''},
  BC:{name:'British Columbia',gstHst:5,pst:7,pstKey:'collectBCPST'},
  MB:{name:'Manitoba',gstHst:5,pst:7,pstKey:'collectMBRST'},
  NB:{name:'New Brunswick',gstHst:15,pst:0,pstKey:''},
  NL:{name:'Newfoundland and Labrador',gstHst:15,pst:0,pstKey:''},
  NS:{name:'Nova Scotia',gstHst:14,pst:0,pstKey:''},
  NT:{name:'Northwest Territories',gstHst:5,pst:0,pstKey:''},
  NU:{name:'Nunavut',gstHst:5,pst:0,pstKey:''},
  ON:{name:'Ontario',gstHst:13,pst:0,pstKey:''},
  PE:{name:'Prince Edward Island',gstHst:15,pst:0,pstKey:''},
  QC:{name:'Quebec',gstHst:5,pst:9.975,pstKey:'collectQST'},
  SK:{name:'Saskatchewan',gstHst:5,pst:6,pstKey:'collectSKPST'},
  YT:{name:'Yukon',gstHst:5,pst:0,pstKey:''}
};

const PROVINCE_ALIASES = {
  ALBERTA:'AB',AB:'AB',
  'BRITISH COLUMBIA':'BC',BC:'BC',
  MANITOBA:'MB',MB:'MB',
  'NEW BRUNSWICK':'NB',NB:'NB',
  'NEWFOUNDLAND AND LABRADOR':'NL','NEWFOUNDLAND & LABRADOR':'NL',NEWFOUNDLAND:'NL',NL:'NL',
  'NOVA SCOTIA':'NS',NS:'NS',
  'NORTHWEST TERRITORIES':'NT','NORTHWEST TERRITORY':'NT',NT:'NT',NWT:'NT',
  NUNAVUT:'NU',NU:'NU',
  ONTARIO:'ON',ON:'ON',
  'PRINCE EDWARD ISLAND':'PE',PEI:'PE',PE:'PE',
  QUEBEC:'QC',QUÉBEC:'QC',QC:'QC',PQ:'QC',
  SASKATCHEWAN:'SK',SK:'SK',
  YUKON:'YT',YT:'YT'
};

const DEFAULT_COMMERCE_CONFIG = {
  version:1,
  shipping:{
    enabled:true,
    defaultPrice:9.99,
    freeShippingEnabled:true,
    freeShippingThreshold:75,
    canadaOnly:true,
    productOverrides:[]
  },
  taxes:{
    enabled:true,
    defaultProvince:'QC',
    collectGSTHST:true,
    collectQST:true,
    collectBCPST:false,
    collectMBRST:false,
    collectSKPST:false
  }
};

function money(value){return Math.round((Number(value)||0)*100)/100}
function bool(value,fallback=false){return value===undefined?fallback:(value===true||value==='true'||value===1||value==='1')}
function number(value,fallback,min=0,max=100000){const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function normalizeProvince(value){
  const key=String(value||'').trim().toUpperCase().replace(/\./g,'').replace(/\s+/g,' ');
  return PROVINCE_ALIASES[key] || (PROVINCES[key]?key:'');
}
function isCanada(country){
  const value=String(country||'Canada').trim().toLowerCase();
  return !value || ['canada','ca','can'].includes(value);
}
function normalizeCommerceConfig(raw={}){
  const source=raw&&typeof raw==='object'?raw:{};
  const shippingRaw=source.shipping&&typeof source.shipping==='object'?source.shipping:{};
  const taxRaw=source.taxes&&typeof source.taxes==='object'?source.taxes:{};
  const overrides=(Array.isArray(shippingRaw.productOverrides)?shippingRaw.productOverrides:[]).slice(0,200).map(item=>({
    kitId:Number(item.kitId),
    price:money(number(item.price,0,0,10000))
  })).filter(item=>Number.isFinite(item.kitId)&&item.kitId>0);
  return {
    version:1,
    shipping:{
      enabled:bool(shippingRaw.enabled,DEFAULT_COMMERCE_CONFIG.shipping.enabled),
      defaultPrice:money(number(shippingRaw.defaultPrice,DEFAULT_COMMERCE_CONFIG.shipping.defaultPrice,0,10000)),
      freeShippingEnabled:bool(shippingRaw.freeShippingEnabled,DEFAULT_COMMERCE_CONFIG.shipping.freeShippingEnabled),
      freeShippingThreshold:money(number(shippingRaw.freeShippingThreshold,DEFAULT_COMMERCE_CONFIG.shipping.freeShippingThreshold,0,100000)),
      canadaOnly:bool(shippingRaw.canadaOnly,DEFAULT_COMMERCE_CONFIG.shipping.canadaOnly),
      productOverrides:overrides
    },
    taxes:{
      enabled:bool(taxRaw.enabled,DEFAULT_COMMERCE_CONFIG.taxes.enabled),
      defaultProvince:normalizeProvince(taxRaw.defaultProvince)||DEFAULT_COMMERCE_CONFIG.taxes.defaultProvince,
      collectGSTHST:bool(taxRaw.collectGSTHST,DEFAULT_COMMERCE_CONFIG.taxes.collectGSTHST),
      collectQST:bool(taxRaw.collectQST,DEFAULT_COMMERCE_CONFIG.taxes.collectQST),
      collectBCPST:bool(taxRaw.collectBCPST,DEFAULT_COMMERCE_CONFIG.taxes.collectBCPST),
      collectMBRST:bool(taxRaw.collectMBRST,DEFAULT_COMMERCE_CONFIG.taxes.collectMBRST),
      collectSKPST:bool(taxRaw.collectSKPST,DEFAULT_COMMERCE_CONFIG.taxes.collectSKPST)
    }
  };
}
function isPhysicalItem(item){return String(item?.type||'')!=='event-ticket'}
function itemKitId(item){
  const candidate=item?.customData?.kitId ?? item?.kitId ?? item?.id;
  const n=Number(candidate);
  return Number.isFinite(n)?n:null;
}
function calculateShipping(configInput,pricedItems=[]){
  const config=normalizeCommerceConfig(configInput);
  const physical=pricedItems.filter(isPhysicalItem);
  const qualifyingSubtotal=money(physical.reduce((sum,item)=>sum+Number(item.lineTotal??((Number(item.price)||Number(item.unitPrice)||0)*(Number(item.qty)||1))),0));
  if(!physical.length||!config.shipping.enabled)return {shippingTotal:0,shippingBasePrice:0,shippingQualifyingSubtotal:qualifyingSubtotal,freeShippingApplied:false,needsShipping:physical.length>0};
  const overrideMap=new Map(config.shipping.productOverrides.map(item=>[Number(item.kitId),Number(item.price)]));
  const rates=physical.map(item=>{
    const kitId=itemKitId(item);
    return kitId!==null&&overrideMap.has(kitId)?overrideMap.get(kitId):config.shipping.defaultPrice;
  });
  const shippingBasePrice=money(Math.max(0,...rates));
  const freeShippingApplied=config.shipping.freeShippingEnabled&&config.shipping.freeShippingThreshold>0&&qualifyingSubtotal>=config.shipping.freeShippingThreshold;
  return {shippingTotal:freeShippingApplied?0:shippingBasePrice,shippingBasePrice,shippingQualifyingSubtotal:qualifyingSubtotal,freeShippingApplied,needsShipping:true};
}
function calculateTaxes(configInput,taxableBase,address={}){
  const config=normalizeCommerceConfig(configInput);
  if(!config.taxes.enabled||taxableBase<=0)return {taxTotal:0,taxLines:[],taxProvince:'',taxRate:0};
  const country=String(address.country||'Canada').trim();
  if(!isCanada(country))return {taxTotal:0,taxLines:[],taxProvince:'',taxRate:0};
  const province=normalizeProvince(address.province)||config.taxes.defaultProvince;
  const info=PROVINCES[province];
  if(!info)return {taxTotal:0,taxLines:[],taxProvince:'',taxRate:0};
  const lines=[];
  if(config.taxes.collectGSTHST){
    const hst=info.gstHst>5;
    const rate=info.gstHst;
    lines.push({code:hst?'HST':'GST',label:hst?'HST':'GST',rate,amount:money(taxableBase*rate/100)});
  }
  if(info.pst>0&&info.pstKey&&config.taxes[info.pstKey]){
    const code=province==='QC'?'QST':province==='MB'?'RST':'PST';
    lines.push({code,label:code,rate:info.pst,amount:money(taxableBase*info.pst/100)});
  }
  const taxTotal=money(lines.reduce((sum,line)=>sum+line.amount,0));
  return {taxTotal,taxLines:lines,taxProvince:province,taxRate:lines.reduce((sum,line)=>sum+line.rate,0)};
}
function calculateCommerceTotals(configInput,pricedItems=[],subtotal=0,discountTotal=0,address={}){
  const config=normalizeCommerceConfig(configInput);
  const merchandiseTotal=money(Number(subtotal)-Number(discountTotal));
  const shipping=calculateShipping(config,pricedItems);
  const taxableBase=money(merchandiseTotal+shipping.shippingTotal);
  const taxes=calculateTaxes(config,taxableBase,address);
  return {...shipping,...taxes,merchandiseTotal,taxableBase,total:money(taxableBase+taxes.taxTotal)};
}
function validateShippingAddress(configInput,address={},needsShipping=false){
  if(!needsShipping)return '';
  const config=normalizeCommerceConfig(configInput);
  const line1=String(address.line1||'').trim(),city=String(address.city||'').trim(),province=normalizeProvince(address.province),postal=String(address.postal||'').trim(),country=String(address.country||'Canada').trim();
  if(!line1)return 'Adresse de livraison requise';
  if(!city)return 'Ville de livraison requise';
  if(!country)return 'Pays de livraison requis';
  if(config.shipping.canadaOnly&&!isCanada(country))return 'La livraison est actuellement disponible au Canada seulement';
  if(isCanada(country)){
    if(!province)return 'Province canadienne valide requise';
    if(!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(postal))return 'Code postal canadien valide requis';
  }
  return '';
}

module.exports={PROVINCES,DEFAULT_COMMERCE_CONFIG,normalizeProvince,normalizeCommerceConfig,calculateShipping,calculateTaxes,calculateCommerceTotals,validateShippingAddress,isCanada,money};
