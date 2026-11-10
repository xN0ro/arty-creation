'use strict';

// Ticket seats are held while Stripe completes checkout, not indefinitely.
const HOLD_DURATION_MS = 10 * 60 * 1000;

function holdExpiresAt(order) {
  const explicit = Date.parse(String(order?.eventHoldExpiresAt || ''));
  if (Number.isFinite(explicit)) return explicit;
  const created = Date.parse(String(order?.createdAt || ''));
  return Number.isFinite(created) ? created + HOLD_DURATION_MS : Infinity;
}

function isExpiredEventSeatHold(order, now = Date.now()) {
  if (!order?.eventSeatsReserved || order.eventSeatsReleased) return false;
  // Paid and refunded orders must never be expired by a checkout timeout.
  if (['paid', 'refund_pending', 'refunded', 'refund_needed'].includes(String(order.paymentStatus || ''))) return false;
  return now >= holdExpiresAt(order);
}

module.exports = { HOLD_DURATION_MS, holdExpiresAt, isExpiredEventSeatHold };
