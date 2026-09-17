/* Keep customer order-detail totals aligned with server commerce totals. */
(() => {
  const original = window.viewProfileOrder;
  if (typeof original !== 'function') return;

  function currency(value) {
    return I18n.currency(toMoney(Number(value) || 0));
  }

  function addCommerceRows(order) {
    const totals = document.querySelector('.account-detail-totals');
    if (!totals || totals.dataset.commerceProfileEnhanced === '1') return;
    const totalRow = totals.querySelector('.total') || totals.lastElementChild;
    if (!totalRow) return;

    const rows = [];
    if (order.freeShippingApplied || Number(order.shippingTotal) > 0) {
      rows.push(`<div><span>${safeText(I18n.t('Livraison'))}</span><strong>${order.freeShippingApplied ? safeText(I18n.t('Gratuite')) : currency(order.shippingTotal)}</strong></div>`);
    }
    if (Array.isArray(order.taxLines) && order.taxLines.length) {
      order.taxLines.forEach(line => rows.push(`<div><span>${safeText(line.label || I18n.t('Taxes'))} (${Number(line.rate) || 0}%)</span><strong>${currency(line.amount)}</strong></div>`));
    } else if (Number(order.taxTotal) > 0) {
      rows.push(`<div><span>${safeText(I18n.t('Taxes'))}</span><strong>${currency(order.taxTotal)}</strong></div>`);
    }
    if (rows.length) totalRow.insertAdjacentHTML('beforebegin', rows.join(''));
    totals.dataset.commerceProfileEnhanced = '1';
  }

  window.viewProfileOrder = function(orderId, ...args) {
    const result = original.call(this, orderId, ...args);
    try {
      const orders = typeof profileOrders !== 'undefined' && Array.isArray(profileOrders) ? profileOrders : [];
      const order = orders.find(item => String(item.id) === String(orderId));
      if (order) setTimeout(() => addCommerceRows(order), 0);
    } catch (error) {
      console.warn('Could not enhance customer order totals:', error);
    }
    return result;
  };
})();
