'use strict';

const DEFAULT_MARKETING_CONFIG = Object.freeze({
  version: 1,
  siteUrl: 'https://creationarty.com',
  brandName: 'ARTY',
  defaultTitle: 'ARTY — Kits de peinture & événements créatifs',
  defaultDescription: 'Kits de peinture créatifs, tutoriels et événements ARTY. Découvrez nos activités et créez à votre rythme.',
  defaultSocialImage: '/logoarty.png',
  verification: {
    google: '',
    facebook: ''
  },
  analytics: {
    ga4: { enabled: false, measurementId: '' },
    meta: { enabled: false, pixelId: '' }
  },
  consent: {
    enabled: true,
    analyticsDefault: false,
    marketingDefault: false
  },
  pages: {
    products: {},
    events: {},
    collections: {}
  }
});

function cleanText(value, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function slugify(value, fallback = 'page') {
  const slug = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function safeUrl(value, fallback) {
  const raw = cleanText(value, 500);
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

function normalizePageMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).slice(0, 1000).forEach(([id, raw]) => {
    if (!raw || typeof raw !== 'object') return;
    const key = cleanText(id, 80);
    if (!key) return;
    result[key] = {
      slug: slugify(raw.slug || '', ''),
      title: cleanText(raw.title, 120),
      description: cleanText(raw.description, 260),
      image: cleanText(raw.image, 600)
    };
  });
  return result;
}

function normalizeMarketingConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const siteUrl = safeUrl(source.siteUrl, DEFAULT_MARKETING_CONFIG.siteUrl);
  return {
    version: 1,
    siteUrl,
    brandName: cleanText(source.brandName || DEFAULT_MARKETING_CONFIG.brandName, 60),
    defaultTitle: cleanText(source.defaultTitle || DEFAULT_MARKETING_CONFIG.defaultTitle, 120),
    defaultDescription: cleanText(source.defaultDescription || DEFAULT_MARKETING_CONFIG.defaultDescription, 260),
    defaultSocialImage: cleanText(source.defaultSocialImage || DEFAULT_MARKETING_CONFIG.defaultSocialImage, 600),
    verification: {
      google: cleanText(source.verification?.google, 220),
      facebook: cleanText(source.verification?.facebook, 220)
    },
    analytics: {
      ga4: {
        enabled: source.analytics?.ga4?.enabled === true,
        measurementId: cleanText(source.analytics?.ga4?.measurementId, 40).toUpperCase()
      },
      meta: {
        enabled: source.analytics?.meta?.enabled === true,
        pixelId: cleanText(source.analytics?.meta?.pixelId, 40)
      }
    },
    consent: {
      enabled: source.consent?.enabled !== false,
      analyticsDefault: source.consent?.analyticsDefault === true,
      marketingDefault: source.consent?.marketingDefault === true
    },
    pages: {
      products: normalizePageMap(source.pages?.products),
      events: normalizePageMap(source.pages?.events),
      collections: normalizePageMap(source.pages?.collections)
    }
  };
}

function kindConfigKey(kind) {
  if (kind === 'product') return 'products';
  if (kind === 'event') return 'events';
  if (kind === 'collection' || kind === 'category') return 'collections';
  return '';
}

function contentId(kind, id) {
  const prefix = kind === 'event' ? 'EVENT' : (kind === 'collection' || kind === 'category') ? 'CATEGORY' : 'PRODUCT';
  return `ARTY-${prefix}-${cleanText(id, 80)}`;
}

function entityName(kind, entity) {
  if (!entity) return '';
  if (kind === 'event') return cleanText(entity.title || entity.name, 120);
  return cleanText(entity.name || entity.title, 120);
}

function pageOverride(config, kind, id) {
  const key = kindConfigKey(kind);
  if (!key) return {};
  return config.pages?.[key]?.[String(id)] || {};
}

function defaultSlug(kind, entity) {
  const name = entityName(kind, entity) || kind;
  return `${slugify(name, kind)}-${entity?.id}`;
}

function entitySlug(config, kind, entity) {
  const override = pageOverride(config, kind, entity?.id);
  return override.slug || defaultSlug(kind, entity);
}

function pathFor(kind, slug) {
  if (kind === 'event') return `/events/${slug}`;
  if (kind === 'collection' || kind === 'category') return `/collections/${slug}`;
  return `/products/${slug}`;
}

function absoluteUrl(config, value) {
  const raw = cleanText(value, 700);
  if (!raw) return config.siteUrl;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${config.siteUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function publicUrl(config, kind, entity) {
  return absoluteUrl(config, pathFor(kind, entitySlug(config, kind, entity)));
}

function resolveEntity(config, kind, list, requestedSlug) {
  const items = Array.isArray(list) ? list : [];
  const wanted = slugify(requestedSlug, '');
  let entity = items.find(item => entitySlug(config, kind, item) === wanted);
  if (!entity) {
    const idMatch = wanted.match(/-([0-9]+)$/);
    if (idMatch) entity = items.find(item => String(item.id) === idMatch[1]);
  }
  if (!entity) return null;
  return {
    entity,
    slug: entitySlug(config, kind, entity),
    canonicalUrl: publicUrl(config, kind, entity)
  };
}

function localizedValue(entity, field, lang = 'fr') {
  const translated = entity?.translations?.[lang]?.[field];
  if (translated !== undefined && translated !== null && String(translated).trim()) return translated;
  return entity?.[field];
}

function buildPageMeta(configInput, kind, entity, lang = 'fr') {
  const config = normalizeMarketingConfig(configInput);
  const override = pageOverride(config, kind, entity?.id);
  const name = cleanText(localizedValue(entity, kind === 'event' ? 'title' : 'name', lang) || entityName(kind, entity), 120);
  const rawDescription = localizedValue(entity, 'shortDesc', lang) || localizedValue(entity, 'description', lang) || config.defaultDescription;
  const title = override.title || (name ? `${name} | ${config.brandName}` : config.defaultTitle);
  const description = override.description || cleanText(rawDescription, 260) || config.defaultDescription;
  const image = absoluteUrl(config, override.image || entity?.image || config.defaultSocialImage);
  const url = publicUrl(config, kind, entity);
  return {
    title,
    description,
    image,
    url,
    canonicalUrl: url,
    contentId: contentId(kind, entity?.id),
    slug: entitySlug(config, kind, entity)
  };
}

function sanitizeAttributionTouch(raw = {}) {
  const out = {};
  const fields = {
    source: 80,
    medium: 80,
    campaign: 140,
    content: 140,
    term: 140,
    fbclid: 300,
    gclid: 300,
    msclkid: 300,
    landingPage: 700,
    referrer: 700,
    capturedAt: 60
  };
  Object.entries(fields).forEach(([key, max]) => {
    const value = cleanText(raw?.[key], max);
    if (value) out[key] = value;
  });
  return out;
}

function normalizeAttribution(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const firstTouch = sanitizeAttributionTouch(raw.firstTouch || raw.first || {});
  const lastTouch = sanitizeAttributionTouch(raw.lastTouch || raw.last || {});
  const sessionId = cleanText(raw.sessionId, 100);
  const result = {};
  if (Object.keys(firstTouch).length) result.firstTouch = firstTouch;
  if (Object.keys(lastTouch).length) result.lastTouch = lastTouch;
  if (sessionId) result.sessionId = sessionId;
  return result;
}

module.exports = {
  DEFAULT_MARKETING_CONFIG,
  normalizeMarketingConfig,
  normalizeAttribution,
  slugify,
  contentId,
  entitySlug,
  publicUrl,
  resolveEntity,
  buildPageMeta,
  absoluteUrl,
  pathFor,
  cleanText
};
