'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const I18n = require('./public/i18n-core');
const context = new AsyncLocalStorage();
I18n.setLanguageProvider(() => context.getStore() || 'fr');
const fields = ['name','title','subtitle','shortDesc','description','includes','duration','hostNote','note','label','message','discountLabel','productLabel','sizeLabel','eventType','videoTitle','videoUrl','customerLabel'];

function translations(raw, existing = {}) {
  const input = { ...(existing.en || {}), ...(raw?.en && typeof raw.en === 'object' ? raw.en : {}) };
  const en = {};
  for (const field of fields) {
    if (field === 'includes' && Array.isArray(input[field])) en[field] = input[field].slice(0,24).map(value => String(value).trim().slice(0,240));
    else if (typeof input[field] === 'string') en[field] = input[field].trim().slice(0,field === 'description' ? 12000 : 2000);
  }
  return { en };
}
function catalog(record, language = I18n.language()) {
  if (!record || typeof record !== 'object') return record;
  if (Array.isArray(record)) return record.map(item => catalog(item, language));
  const result = { ...record };
  if (I18n.normalize(language) === 'en') {
    for (const field of fields) {
      const translated = record.translations?.en?.[field];
      if (typeof translated === 'string' && translated.trim()) result[field] = translated;
      else if (Array.isArray(translated) && translated.length) result[field] = translated;
      else if (typeof record[field] === 'string') result[field] = I18n.t(record[field], [], 'en');
      else if (Array.isArray(record[field])) result[field] = record[field].map(value => typeof value === 'string' ? I18n.t(value, [], 'en') : value);
    }
  }
  for (const field of ['sizeOptions','addOns']) if (Array.isArray(record[field])) result[field] = catalog(record[field], language);
  return result;
}
function orderView(order, language = I18n.language()) {
  if (!order) return order;
  return { ...order, items:(order.items || []).map(item => ({ ...catalog(item,language), ...(item.customData ? {customData:catalog(item.customData,language)} : {}) })) };
}
function response(req, payload) {
  const route = req.path.replace(/^\/api(?=\/)/,'');
  if (req.method !== 'GET' || route.startsWith('/admin/')) return payload;
  if (/^\/(kits|categories|events|team-activities|bundles|bundle-deals)(\/[^/]+)?$/.test(route)) return catalog(payload, req.locale);
  if (route === '/announcement') return catalog(payload, req.locale);
  if (route === '/config') return { ...payload, announcement:catalog(payload.announcement,req.locale) };
  if (route === '/orders/mine' && Array.isArray(payload)) return payload.map(item => orderView(item,req.locale));
  if (route === '/bookings/mine' && Array.isArray(payload)) return payload.map(item => ({...item,event:catalog(item.event,req.locale)}));
  if (route.startsWith('/tickets/')) return {...payload,event:catalog(payload.event,req.locale)};
  if (route.startsWith('/event-quotes/')) return {...payload,inventoryItems:catalog(payload.inventoryItems,req.locale),customKit:catalog(payload.customKit,req.locale)};
  return payload;
}
function middleware(req, res, next) {
  req.locale = I18n.normalize(req.query.lang || req.get('X-Arty-Language') || 'fr');
  res.set('Content-Language', req.locale);
  res.vary('X-Arty-Language');
  const json = res.json.bind(res);
  res.json = payload => json(response(req,payload));
  if (req.body?.translations) req.body.translations = translations(req.body.translations);
  context.run(req.locale, next);
}
module.exports = { I18n, middleware, catalog, orderView, translations, withLocale:(locale,action) => context.run(I18n.normalize(locale),action) };
