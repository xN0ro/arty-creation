'use strict';

const crypto = require('node:crypto');
const marketing = require('./marketing-core');

const topics = {
  commande: { channel: 'orders', fr: 'Une commande', en: 'An order' },
  livraison: { channel: 'orders', fr: 'Une livraison', en: 'A delivery' },
  produit: { channel: 'support', fr: 'Un kit ou le Studio', en: 'A kit or the Studio' },
  paiement: { channel: 'orders', fr: 'Un paiement', en: 'A payment' },
  'événement': { channel: 'events', fr: 'Un événement', en: 'An event' },
  autre: { channel: 'contact', fr: 'Une autre question', en: 'Another question' }
};
const line = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

function normalize(body = {}, locale = 'fr') {
  body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const en = locale === 'en';
  const error = (fr, english) => ({ error: en ? english : fr });
  const legacy = { contact: 'autre', support: 'produit', orders: 'commande', events: 'événement' };
  const topic = line(body.topic) || legacy[line(body.channel)] || 'autre';
  if (!Object.prototype.hasOwnProperty.call(topics, topic)) return error('Choisissez un sujet valide.', 'Choose a valid topic.');
  const name = line(body.name), email = line(body.email).toLowerCase();
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const subject = line(body.subject) || topics[topic][en ? 'en' : 'fr'];
  const orderReference = topic !== 'événement' && topic !== 'autre' ? line(body.orderReference) : '';
  const eventDate = topic === 'événement' ? line(body.eventDate) : '';
  const guests = topic === 'événement' && body.guests !== '' && body.guests != null ? Number(body.guests) : null;
  const requestKey = line(body.requestKey);
  if (!name || name.length > 140 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 240 || message.length < 10 || message.length > 3000) {
    return error('Ajoutez votre nom, un courriel valide et un message de 10 à 3 000 caractères.', 'Add your name, a valid email and a message of 10 to 3,000 characters.');
  }
  if (subject.length > 120 || orderReference.length > 80 || (requestKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) || line(body.website)) return error('Vérifiez les renseignements du formulaire.', 'Check the form details.');
  if (eventDate && (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isFinite(Date.parse(eventDate)) || new Date(eventDate).toISOString().slice(0, 10) !== eventDate)) return error('Choisissez une date valide.', 'Choose a valid date.');
  if (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 10000)) return error('Indiquez de 1 à 10 000 personnes.', 'Enter between 1 and 10,000 people.');
  const value = { name, email, message, subject, topic, channel: topics[topic].channel, orderReference, eventDate, guests };
  return { value, requestKey, fingerprint: crypto.createHash('sha256').update(JSON.stringify({ ...value, subject:line(body.subject) })).digest('hex') };
}

function create(normalized, db, session, locale, attribution) {
  const now = new Date().toISOString();
  const suffix = `${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const data = normalized.value;
  // A supplied email or order number is not proof of account/order ownership.
  const user = session && (db.users || []).find(item => item.id === session.userId && String(item.email || '').toLowerCase() === data.email);
  const order = user && data.orderReference && (db.orders || []).find(item => item.userId === user.id && String(item.id) === data.orderReference);
  const ticket = {
    id: `SUP-${suffix}`, locale, source: 'contact', contactRequestId: `CONTACT-${suffix}`,
    userId: user ? user.id : null, customer: { name: data.name, email: data.email },
    orderId: order ? order.id : '', orderReference: data.orderReference,
    eventDate: data.eventDate, guests: data.guests,
    topic: data.topic, channel: data.channel, subject: data.subject, message: data.message,
    status: 'nouvelle', priority: 'normal', assignedTo: '', adminReply: '',
    messages: [{ id: `MSG-${suffix}`, role: 'customer', body: data.message, at: now, by: data.email }],
    internalNotes: [], history: [{ type: 'created', from: '', to: 'nouvelle', at: now, by: data.email }],
    createdAt: now, updatedAt: now, repliedAt: '',
    emailDelivery: { customer: 'pending', admin: 'pending' }
  };
  const contact = {
    ...data, id: ticket.contactRequestId, reference: ticket.id, supportRequestId: ticket.id,
    locale, requestKey: normalized.requestKey, fingerprint: normalized.fingerprint,
    marketingAttribution: marketing.normalizeAttribution(attribution),
    createdAt: now, updatedAt: now, emailDelivery: { customer: 'pending', admin: 'pending' },
    crm: { status: 'new', nextFollowUp: '', owner: '', tags: [], adminNote: '', updatedAt: now }
  };
  return { contact, ticket };
}

module.exports = { normalize, create };
