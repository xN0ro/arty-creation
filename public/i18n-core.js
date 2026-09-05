/* Shared, dependency-free French/English messages for the website and emails. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n-en.js'));
  else root.I18n = factory(root.ARTY_EN || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (english) {
  'use strict';
  let current = 'fr';
  let languageProvider = () => current;
  const normalize = value => /^en(?:[-_]|$)/i.test(String(value || '')) ? 'en' : 'fr';
  const key = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const language = () => normalize(languageProvider());
  const locale = () => language() === 'en' ? 'en-CA' : 'fr-CA';
  function t(message, values = [], requestedLanguage = language()) {
    const source = String(message ?? '');
    const entry = normalize(requestedLanguage) === 'en' && Object.prototype.hasOwnProperty.call(english,key(source)) ? english[key(source)] : undefined;
    const translated = entry === undefined ? source : source.match(/^\s*/)[0] + entry + source.match(/\s*$/)[0];
    return translated.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index] ?? '') : match);
  }
  function messagePart(source, translate) {
    const indexes = [];
    const normalized = key(source).replace(/\uE000(\d+)\uE001/g, (_, index) => `{${indexes.push(Number(index)) - 1}}`);
    if (!/[A-Za-zÀ-ÿ]/.test(normalized.replace(/\{\d+\}/g, ''))) return source;
    const result = translate(normalized);
    if (result === normalized) return source;
    return source.match(/^\s*/)[0] + result.replace(/\{(\d+)\}/g, (match, index) => index < indexes.length ? `\uE000${indexes[index]}\uE001` : match) + source.match(/\s*$/)[0];
  }
  // Work only on authored text and accessible attributes, before inserting values.
  // Interpolated customer data, URLs, CSS, event handlers, and IDs are never translated.
  function mapHTML(source, translate) {
    let skipped = '';
    return source.replace(/<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g, part => {
      if (part.startsWith('<!--')) return part;
      if (part[0] === '<') {
        if (/^<\/(script|style)\b/i.test(part)) skipped = '';
        else if (/^<(script|style)\b/i.test(part)) skipped = part.match(/^<(\w+)/)[1];
        return part.replace(/\b(placeholder|title|alt|aria-label|aria-description)=("([^"]*)"|'([^']*)')/gi, (match, attr, quoted, double, single) => `${attr}=${quoted[0]}${messagePart(double ?? single, translate).replace(/"/g,'&quot;').replace(/'/g,'&#39;')}${quoted[0]}`);
      }
      return skipped ? part : messagePart(part, translate);
    });
  }
  function templateParts(strings, values) {
    return typeof strings === 'string' ? strings : strings.reduce((result, part, index) => result + (index ? `\uE000${index - 1}\uE001` : '') + part, '');
  }
  function interpolate(source, values) {
    return source.replace(/\uE000(\d+)\uE001/g, (_, index) => String(values[index] ?? ''));
  }
  function html(strings, ...values) {
    const source = templateParts(strings, values);
    return interpolate(mapHTML(source, message => t(message)), values);
  }
  function msg(strings, ...values) {
    const source = templateParts(strings, values);
    return interpolate(messagePart(source, message => t(message)), values);
  }
  function messagesFromHTML(source) {
    const result = new Set();
    mapHTML(source, message => { result.add(message); return message; });
    return [...result];
  }
  function messagesFromText(source) {
    const result = [];
    messagePart(source, message => { result.push(message); return message; });
    return result;
  }
  return {
    t, html, msg, key, normalize, language, locale, messagesFromHTML, messagesFromText,
    field(record, name) {
      const value = record?.[name] ?? '';
      const translated = language()==='en' ? record?.translations?.en?.[name] : undefined;
      return translated || t(value);
    },
    status(value) {
      const labels={manual_refund_logged:['Remboursement manuel enregistré','Manual refund recorded'],not_configured:['Non configuré','Not configured'],skipped:['Non envoyé','Not sent'],pending:['En attente','Pending'],paid:['Payée','Paid'],processing:['En traitement','Processing'],succeeded:['Confirmé','Confirmed'],cancelled:['Annulée','Cancelled'],canceled:['Annulée','Cancelled'],refunded:['Remboursée','Refunded'],published:['Publié','Published'],draft:['Brouillon','Draft'],sent:['Envoyé','Sent'],not_sent:['Non envoyé','Not sent'],failed:['Échec','Failed'],valid:['Valide','Valid'],checked_in:['Entrée confirmée','Checked in'],none:['Aucun','None']};
      return labels[value]?.[language()==='en'?1:0] || t(value);
    },
    setLanguage(value) { current = normalize(value); return current; },
    setLanguageProvider(provider) { languageProvider = provider; },
    has(message) { return Object.prototype.hasOwnProperty.call(english, key(message)); },
    number(value, options = {}) { return new Intl.NumberFormat(locale(), options).format(Number(value) || 0); },
    currency(value) { return new Intl.NumberFormat(locale(), { style:'currency', currency:'CAD' }).format(Number(value) || 0); }
  };
});
