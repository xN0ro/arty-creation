'use strict';

const fs = require('node:fs');
const path = require('node:path');
const marketing = require('./marketing-core');
const { I18n, catalog, withLocale } = require('./localization');
const lifecycle = require('./event-lifecycle');
const ticketPricing = require('./public/ticket-pricing-core');

const PAGE_INFO = {
  home: {
    fr: ['Kits de peinture et ateliers à Ottawa–Gatineau | Arty!', 'Peignez chez vous avec les kits de peinture étape par étape d’Arty ou réservez un atelier guidé à Ottawa ou à Gatineau.'],
    en: ['DIY Painting Kits & Art Workshops in Ottawa–Gatineau | Arty!', 'Paint at home with a step-by-step Arty kit or join a guided workshop in Ottawa or Gatineau.'],
    pageId: 'page-home'
  },
  catalog: {
    fr: ['Kits de peinture à faire soi-même | Arty!', 'Choisissez un motif et un format. Les kits Arty vous guident du premier trait jusqu’à la dernière touche de peinture.'],
    en: ['Shop DIY Painting Kits | Arty!', 'Pick a design and a canvas size. Arty kits guide you from the first outline to the finishing touches.'],
    pageId: 'page-paintings'
  },
  events: {
    fr: ['Ateliers de peinture à Ottawa et à Gatineau | Arty!', 'Découvrez les prochains ateliers de peinture, Art Brunch et Paint & Sip d’Arty à Ottawa et à Gatineau.'],
    en: ['Painting Workshops in Ottawa and Gatineau | Arty!', 'Find upcoming Art Brunch and Paint & Sip workshops in Ottawa and Gatineau, or plan a private painting event with Arty.'],
    pageId: 'page-party'
  },
  contact: {
    fr: ['Contact & assistance | ARTY', 'Une question sur une commande, une livraison, un kit ou un événement ? Contactez l’équipe ARTY.'],
    en: ['Contact & support | ARTY', 'A question about an order, delivery, painting kit or event? Contact the ARTY team.'],
    pageId: 'page-contact'
  },
  product: { pageId: 'page-product' },
  collection: { pageId: 'page-paintings' },
  event: { pageId: 'page-event' }
};
const INDEX_PATH = path.join(__dirname, 'public', 'index.html');
const HUBS = { '/':'home', '/products':'catalog', '/events':'events', '/contact':'contact' };
const DETAILS = { '/products':'product', '/events':'event', '/collections':'collection' };
const LOCALES = { fr:'fr-CA', en:'en-CA' };
const LEGACY_HOME_TITLES = new Set([
  'ARTY Creation',
  'ARTY — Kits de peinture & événements créatifs',
  'Arty! — Kits de Peinture & Événements Créatifs'
]);
const LEGACY_HOME_DESCRIPTION = 'Kits de peinture créatifs, tutoriels et événements ARTY. Découvrez nos activités et créez à votre rythme.';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const jsonScript = value => JSON.stringify(value).replace(/</g, '\\u003c');
const localizedPath = (urlPath, language) => language === 'en' ? '/en' + urlPath : urlPath;
const published = event => (event.status || 'published') === 'published';

function postalAddress(streetAddress, addressLocality, addressRegion, postalCode) {
  return { '@type':'PostalAddress', streetAddress, addressLocality, addressRegion, postalCode, addressCountry:'CA' };
}

function eventPlace(event) {
  const location = String(event.location || '').trim();
  if (/^30 (?:rue )?metcalfe(?: st(?:reet)?\.?)?,\s*ottawa,\s*on\s+k1p\s*5(?:l4|b6)$/i.test(location)) {
    return { '@type':'Place', name:'Le Moulin de Provence KD', address:postalAddress('30 Metcalfe St', 'Ottawa', 'ON', 'K1P 5L4') };
  }
  if (/^galeries de hull,\s*gatineau$/i.test(location)) {
    const name = /Âmes Créatives/i.test(event.description || '') ? 'Âmes Créatives, Galeries de Hull' : 'Galeries de Hull';
    return { '@type':'Place', name, address:postalAddress('320 boulevard Saint-Joseph', 'Gatineau', 'QC', 'J8Y 3Y8') };
  }

  const match = location.match(/^(?:(.+?),\s*)?(\d[^,]+),\s*([^,]+),\s*([a-z]{2})[, ]+\s*([a-z]\d[a-z])\s*(\d[a-z]\d)(?:,\s*Canada)?$/i);
  if (!match) return undefined;
  const [, name, street, city, region, prefix, suffix] = match;
  return { '@type':'Place', name: name || event.venue || street, address:postalAddress(street, city, region.toUpperCase(), (prefix + ' ' + suffix).toUpperCase()) };
}

function pageMeta(config, kind, entity, urlPath, language) {
  const localized = catalog(entity, language);
  const url = marketing.absoluteUrl(config, localizedPath(urlPath, language));
  if (entity) {
    const meta = marketing.buildPageMeta(config, kind, localized, language);
    return { ...meta, url, canonicalUrl:url };
  }

  let [title, description] = PAGE_INFO[kind][language];
  if (kind === 'home' && language === 'fr') {
    if (!LEGACY_HOME_TITLES.has(config.defaultTitle)) title = config.defaultTitle;
    if (config.defaultDescription !== LEGACY_HOME_DESCRIPTION) description = config.defaultDescription;
  }
  return { title, description, url, image:marketing.absoluteUrl(config, config.defaultSocialImage) };
}

function offer(price, url, availability, name) {
  return { '@type':'Offer', url, priceCurrency:'CAD', price, availability:'https://schema.org/' + availability, ...(name ? { name } : {}) };
}

function productSizes(product) {
  if (!Array.isArray(product.sizeOptions)) return [];
  return product.sizeOptions.filter(option => typeof option === 'string' ? option : option?.label || option?.name);
}

function productPrice(product) {
  const [firstSize] = productSizes(product);
  const price = Number(product.effectivePrice ?? product.price) || 0;
  return Number((price + (Number(firstSize?.priceDelta || firstSize?.price) || 0)).toFixed(2));
}

function eventLabel(event, language) {
  const date = new Date((event.date || '') + 'T00:00:00Z');
  const label = Number.isFinite(date.getTime()) ? date.toLocaleDateString(LOCALES[language], { dateStyle:'long', timeZone:'UTC' }) : '';
  return [label, event.time, event.location].filter(Boolean).join(' · ');
}

function schemaFor(config, kind, entity, rawEntity, meta, language) {
  const { description, image, url } = meta;
  if (kind === 'product') {
    return {
      '@context':'https://schema.org', '@type':'Product', name:entity.name, description, image:[image], sku:meta.contentId, url,
      offers:offer(productPrice(entity), url, entity.inStock === false ? 'OutOfStock' : 'InStock')
    };
  }
  if (kind === 'event') {
    const location = eventPlace(entity);
    if (!location || !lifecycle.eventCanAcceptBookings(rawEntity)) return undefined;
    const end = lifecycle.eventEndMs(rawEntity);
    const start = end - lifecycle.eventDurationMinutes(rawEntity.duration) * 60_000;
    const availability = entity.soldOut ? 'SoldOut' : 'InStock';
    const tiers = ticketPricing.eventOptions(entity);
    return {
      '@context':'https://schema.org', '@type':'Event', name:entity.title, description, image:[image], url,
      startDate:new Date(start).toISOString(), endDate:new Date(end).toISOString(), location,
      eventStatus:'https://schema.org/EventScheduled', eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',
      organizer:{ '@type':'Organization', name:config.brandName, url:config.siteUrl },
      offers:tiers.length
        ? tiers.map(tier => offer(tier.price, url, availability, language === 'en' ? tier.labelEn || tier.labelFr : tier.labelFr))
        : offer(Number(entity.price) || 0, url, availability)
    };
  }
  const types = { home:'WebSite', catalog:'CollectionPage', collection:'CollectionPage', events:'CollectionPage', contact:'ContactPage' };
  return { '@context':'https://schema.org', '@type':types[kind], name:entity?.name || (kind === 'home' ? config.brandName : meta.title), url, description };
}

function fillContainer(html, id, content) {
  return html.replace(new RegExp('(<(?:div|main)\\b[^>]*\\bid="' + id + '">)(</(?:div|main)>)'), (_, open, close) => open + content + close);
}

function kitCard(product, language) {
  const name = escapeHtml(product.name);
  const alt = escapeHtml(product.imageAlt || product.name);
  const href = escapeHtml(localizedPath(product.publicPath, language));
  const currency = I18n.currency(product.effectivePrice ?? product.price);
  return '<a class="kit-card" href="' + href + '"><div class="kit-card-img"><img src="' + escapeHtml(product.image || '/logoarty.png') + '" alt="' + alt + '" loading="lazy"></div>' +
    '<div class="kit-card-body"><h3 class="kit-card-title">' + name + '</h3><p class="kit-card-desc">' + escapeHtml(product.shortDesc || product.description) +
    '</p><div class="kit-card-footer"><span class="kit-card-price">' + currency + '</span></div></div></a>';
}

function eventCard(event, language) {
  const title = escapeHtml(event.title);
  return '<article class="event-card event-card-modern"><div class="event-card-img"><img src="' + escapeHtml(event.image || '/photoacceuil.jpg') + '" alt="' + title + '" loading="lazy"></div>' +
    '<div class="event-card-body"><div class="event-card-date">' + escapeHtml(eventLabel(event, language)) + '</div><h3 class="event-card-title"><a class="event-card-link" href="' +
    escapeHtml(localizedPath(event.publicPath, language)) + '">' + title + '</a></h3><p class="event-card-desc">' + escapeHtml(event.description) + '</p></div></article>';
}

function detailPreview(kind, entity, meta, language) {
  const isEvent = kind === 'event';
  const href = localizedPath(isEvent ? '/events' : '/products', language);
  const back = isEvent ? I18n.t('Retour aux événements') : I18n.t('Retour à la boutique');
  const name = escapeHtml(isEvent ? entity.title : entity.name);
  const image = escapeHtml((isEvent ? entity.image : entity.images?.[0] || entity.image) || (isEvent ? '/photoacceuil.jpg' : '/logoarty.png'));
  const alt = escapeHtml(entity.imageAlt || (isEvent ? entity.title : entity.name));
  const description = escapeHtml(entity.description || entity.shortDesc || meta.description);
  const tiers = isEvent ? ticketPricing.eventOptions(entity) : [];
  const price = tiers.length
    ? tiers.map(tier => (language === 'en' ? tier.labelEn || tier.labelFr : tier.labelFr) + ' ' + I18n.currency(tier.price)).join(' · ')
    : I18n.currency(isEvent ? entity.price : productPrice(entity));
  const details = isEvent ? '<p class="event-detail-date">' + escapeHtml(eventLabel(entity, language)) + '</p>' : '';
  const status = isEvent && lifecycle.eventIsFinished(entity) ? I18n.t('Événement terminé') : (isEvent ? entity.soldOut : entity.inStock === false) ? I18n.t('Épuisé') : '';
  const sizes = isEvent ? [] : productSizes(entity).map(size => typeof size === 'string' ? size : size.label || size.name);
  const includes = Array.isArray(entity.includes) ? entity.includes.filter(value => typeof value === 'string') : [];
  const contents = includes.length ? '<div class="product-detail-card"><h2>' + I18n.t('Ce qui est inclus') + '</h2><ul>' + includes.map(value => '<li>' + escapeHtml(value) + '</li>').join('') + '</ul></div>' : '';
  return '<div data-storefront-preview><a class="product-back" href="' + href + '">← ' + escapeHtml(back) + '</a>' +
    '<div class="product-layout product-layout-pro"><div class="product-gallery product-gallery-pro">' +
    '<img class="product-main-img" src="' + image + '" alt="' + alt + '"></div><div class="product-info product-info-pro">' +
    details + '<div class="product-title-row"><h1>' + name + '</h1></div><p class="product-desc">' + description + '</p>' +
    '<p class="product-price">' + escapeHtml(price) + '</p>' + (status ? '<p>' + escapeHtml(status) + '</p>' : '') +
    (sizes.length ? '<p>' + escapeHtml(sizes.join(' · ')) + '</p>' : '') + '</div></div>' + contents + '</div>';
}

function pageBody(html, kind, entity, meta, language, products, events) {
  if (kind !== 'home') {
    html = html.replace('class="page active" id="page-home"', 'class="page" id="page-home"');
    html = html.replace('class="page" id="' + PAGE_INFO[kind].pageId + '"', 'class="page active" id="' + PAGE_INFO[kind].pageId + '"');
  }
  if (kind === 'home') {
    const favorites = products.filter(product => product.homeFavorite === true);
    const inStock = products.filter(product => product.inStock !== false);
    const featured = favorites.length ? favorites : inStock.length ? inStock : products;
    return fillContainer(html, 'homePopularKits', catalog(featured.slice(0, 5), language).map(kit => kitCard(kit, language)).join(''));
  }
  if (kind === 'catalog' || kind === 'collection') {
    const kits = kind === 'collection' ? products.filter(kit => String(kit.categoryId) === String(entity.id)) : products;
    return fillContainer(html, 'kitsGrid', catalog(kits, language).map(kit => kitCard(kit, language)).join(''));
  }
  if (kind === 'events') return fillContainer(html, 'partyEventsGrid', catalog(events, language).map(event => eventCard(event, language)).join(''));
  if (kind === 'contact') {
    const heading = language === 'en' ? 'We’re here for you' : 'On est là pour vous';
    const loading = language === 'en' ? 'Loading the contact form…' : 'Chargement du formulaire…';
    return fillContainer(html, 'contactPageContent', '<div class="contact-shell" aria-busy="true"><header class="contact-hero"><h1>' + heading +
      '</h1><p role="status">' + loading + '</p></header></div>');
  }
  const id = kind === 'product' ? 'productPageContent' : 'eventPageContent';
  return fillContainer(html, id, detailPreview(kind, entity, meta, language));
}

function pageHtml(config, kind, rawEntity, urlPath, language, products, events) {
  const pages = Object.fromEntries(Object.keys(LOCALES).map(locale => [locale, pageMeta(config, kind, rawEntity, urlPath, locale)]));
  const meta = pages[language];
  const entity = catalog(rawEntity, language);
  const schema = schemaFor(config, kind, entity, rawEntity, meta, language);
  const landing = { kind, id:entity?.id, path:urlPath, pages };
  if (kind === 'event' && lifecycle.eventIsFinished(entity)) landing.pastEvent = rawEntity;
  let html = I18n.pageHTML(fs.readFileSync(INDEX_PATH, 'utf8'), language);
  html = pageBody(html, kind, entity, meta, language, products, events);
  const languageLinks = Object.keys(LOCALES).map(locale => '<a href="' + escapeHtml(localizedPath(urlPath, locale)) + '" lang="' + locale +
    '" hreflang="' + LOCALES[locale] + '" data-language="' + locale + '"' + (locale === language ? ' aria-current="page"' : '') +
    ' onclick="return switchStorefrontLanguage(event,this)">' + locale.toUpperCase() + '</a>');
  html = fillContainer(html, 'languageControl', '<div class="language-switch" role="group" aria-label="Language / Langue">' + languageLinks.join('') + '</div>');
  html = html.replace('<html lang="fr">', '<html lang="' + language + '" data-storefront-language="' + language + '">')
    .replace('<head>', '<head>\n  <base href="/">')
    .replace(/<title>[^<]*<\/title>/, () => '<title>' + escapeHtml(meta.title) + '</title>')
    .replace(/<meta name="description" content="[^"]*">/, () => '<meta name="description" content="' + escapeHtml(meta.description) + '">')
    .replace(/href="[^"]*" data-public-path="([^"]*)"/g, (_, href) => 'href="' + localizedPath(href, language) + '" data-public-path="' + href + '"');

  const social = {
    'og:site_name':config.brandName, 'og:type':kind === 'product' ? 'product' : 'website',
    'og:title':meta.title, 'og:description':meta.description, 'og:image':meta.image, 'og:url':meta.url,
    'og:locale':LOCALES[language].replace('-', '_')
  };
  const twitter = { 'twitter:card':'summary_large_image', 'twitter:title':meta.title, 'twitter:description':meta.description, 'twitter:image':meta.image };
  const verification = { 'google-site-verification':config.verification.google, 'facebook-domain-verification':config.verification.facebook };
  const head = [
    '<link rel="canonical" href="' + escapeHtml(meta.url) + '">',
    ...Object.entries(LOCALES).map(([locale, code]) => '<link rel="alternate" hreflang="' + code + '" href="' + escapeHtml(pages[locale].url) + '">'),
    '<link rel="alternate" hreflang="x-default" href="' + escapeHtml(pages.fr.url) + '">',
    ...Object.entries(social).map(([key, value]) => '<meta property="' + key + '" content="' + escapeHtml(value) + '">'),
    ...Object.entries({ ...twitter, ...verification }).filter(([, value]) => value).map(([key, value]) => '<meta name="' + key + '" content="' + escapeHtml(value) + '">'),
    ...(schema ? ['<script type="application/ld+json">' + jsonScript(schema) + '</script>'] : []),
    '<script>window.__ARTY_MARKETING_LANDING__=' + jsonScript(landing) + ';</script>'
  ];
  return html.replace('</head>', () => head.join('\n  ') + '\n</head>');
}

function sitemap(config, db, events) {
  const paths = Object.keys(HUBS).map(urlPath => [urlPath, '']);
  for (const [kind, entities] of [['product', db.kits || []], ['event', events], ['collection', db.categories || []]]) {
    for (const entity of entities) {
      const urlPath = marketing.pathFor(kind, marketing.entitySlug(config, kind, entity));
      paths.push([urlPath, /^\d{4}-\d{2}-\d{2}/.test(entity.updatedAt || '') ? entity.updatedAt.slice(0, 10) : '']);
    }
  }
  const urls = paths.flatMap(([urlPath, lastmod]) => Object.keys(LOCALES).map(language => {
    const url = marketing.absoluteUrl(config, localizedPath(urlPath, language));
    return '  <url><loc>' + escapeHtml(url) + '</loc>' + (lastmod ? '<lastmod>' + lastmod + '</lastmod>' : '') + '</url>';
  }));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>';
}

function installStorefrontPages(app, { readDB, getPublicKits, getPublicEvents, publicEventView }) {
  function serve(kind, req, res) {
    const db = readDB();
    const config = marketing.normalizeMarketingConfig(db.marketingConfig);
    const prefix = req.path.match(/^\/(en|fr)(?:\/|$)/i)?.[1].toLowerCase();
    const language = prefix || I18n.normalize(req.query.lang);
    let urlPath = Object.keys(HUBS).find(key => HUBS[key] === kind);
    let entity;
    if (req.params.slug) {
      const entities = kind === 'product' ? db.kits : kind === 'event' ? (db.events || []).filter(published) : db.categories;
      const match = marketing.resolveEntity(config, kind, entities, req.params.slug);
      if (!match) return res.status(404).type('text').send(language === 'en' ? 'Page not found' : 'Page introuvable');
      entity = match.entity;
      urlPath = marketing.pathFor(kind, match.slug);
    }
    const canonicalPath = localizedPath(urlPath, language);
    const query = new URL(req.originalUrl, 'https://creationarty.com').searchParams;
    if (req.path !== canonicalPath || query.has('lang')) {
      query.delete('lang');
      return res.redirect(301, canonicalPath + (query.size ? '?' + query : ''));
    }

    return withLocale(language, () => {
      const products = ['home','catalog','collection','product'].includes(kind) ? getPublicKits(db) : [];
      if (kind === 'product') entity = products.find(kit => kit.id === entity.id);
      if (kind === 'event') entity = publicEventView(entity, config);
      const events = kind === 'events' ? getPublicEvents(db) : [];
      res.set('Content-Language', LOCALES[language]).type('html').send(pageHtml(config, kind, entity, urlPath, language, products, events));
    });
  }

  function register(urlPath, kind) {
    const paths = urlPath === '/' ? ['/', '/en', '/fr'] : [urlPath, '/en' + urlPath, '/fr' + urlPath];
    app.get(paths, (req, res) => serve(kind, req, res));
  }
  for (const [urlPath, kind] of Object.entries(HUBS)) register(urlPath, kind);
  for (const [urlPath, kind] of Object.entries(DETAILS)) register(urlPath + '/:slug', kind);
  app.get('/sitemap.xml', (_req, res) => {
    const db = readDB();
    const config = marketing.normalizeMarketingConfig(db.marketingConfig);
    res.type('application/xml').send(sitemap(config, db, getPublicEvents(db)));
  });
  app.get('/robots.txt', (_req, res) => {
    const config = marketing.normalizeMarketingConfig(readDB().marketingConfig);
    res.type('text/plain').send([
      'User-agent: *', 'Disallow: /admin', 'Disallow: /api/',
      'Allow: /api/kits$', 'Allow: /api/kits/', 'Allow: /api/categories$', 'Allow: /api/events$',
      'Sitemap: ' + config.siteUrl + '/sitemap.xml', ''
    ].join('\n'));
  });
}

module.exports = { installStorefrontPages, eventPlace };
