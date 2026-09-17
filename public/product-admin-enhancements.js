/* ARTY product admin enhancements
 * - Products can belong to multiple categories while keeping categoryId as a legacy primary category.
 * - "Included in this kit" is edited as paired French/English rows and must be complete in both languages.
 * - Copying an existing product copies the full bilingual configuration, but intentionally clears name and images.
 */
(() => {
  const uniqueNumericIds = values => [...new Set((Array.isArray(values) ? values : []).map(value => Number(value)).filter(Number.isFinite))];

  function productCategoryIds(kit = {}) {
    const ids = uniqueNumericIds(kit.categoryIds);
    const primary = Number(kit.categoryId);
    if (Number.isFinite(primary) && !ids.includes(primary)) ids.unshift(primary);
    return ids;
  }

  function selectedAdminCategoryIds() {
    const choices = document.getElementById('aKitCategoryChoices');
    if (choices) {
      const checkboxes = Array.from(choices.querySelectorAll('input[type="checkbox"]:checked'));
      return uniqueNumericIds(checkboxes.map(input => input.value));
    }
    const select = document.getElementById('aKitCat');
    if (!select) return [];
    return uniqueNumericIds(Array.from(select.selectedOptions || []).map(option => option.value));
  }

  function syncCategorySelect(ids = []) {
    const select = document.getElementById('aKitCat');
    if (!select) return;
    let selected = uniqueNumericIds(ids);
    if (!selected.length && select.options.length) selected = [Number(select.options[0].value)].filter(Number.isFinite);
    Array.from(select.options).forEach(option => { option.selected = selected.includes(Number(option.value)); });
    document.querySelectorAll('#aKitCategoryChoices input[type="checkbox"]').forEach(input => {
      input.checked = selected.includes(Number(input.value));
    });
  }

  function ensureCategoryEditor(ids = []) {
    const select = document.getElementById('aKitCat');
    if (!select) return;
    select.multiple = true;
    select.setAttribute('aria-hidden', 'true');
    select.style.display = 'none';

    const group = select.closest('.form-group');
    const label = group?.querySelector('label');
    if (label) label.textContent = I18n.t('Catégories');

    const currentSelection = ids.length ? uniqueNumericIds(ids) : uniqueNumericIds(Array.from(select.selectedOptions || []).map(option => option.value));
    let choices = document.getElementById('aKitCategoryChoices');
    if (!choices) {
      choices = document.createElement('div');
      choices.id = 'aKitCategoryChoices';
      choices.className = 'admin-category-choice-grid';
      select.insertAdjacentElement('afterend', choices);
    }
    choices.innerHTML = (allCategories || []).map(category => `
      <label class="admin-category-choice">
        <input type="checkbox" value="${safeAttr(category.id)}">
        <span>${safeText(I18n.field(category, 'name'))}</span>
      </label>`).join('');
    choices.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', () => syncCategorySelect(selectedAdminCategoryIds()));
    });

    let help = group?.querySelector('.admin-category-choice-help');
    if (!help && group) {
      help = document.createElement('small');
      help.className = 'admin-category-choice-help';
      help.textContent = I18n.t('Sélectionnez une ou plusieurs catégories pour ce produit.');
      group.append(help);
    }
    syncCategorySelect(currentSelection);
  }

  function removeLegacyEnglishIncludesField() {
    const legacy = document.getElementById('english-kits-includes');
    legacy?.closest('.form-group')?.remove();
  }

  function ensureIncludeLanguageHint() {
    const section = document.getElementById('aKitIncludesList')?.closest('.admin-product-section');
    if (!section || section.querySelector('.admin-bilingual-includes-help')) return;
    const hint = document.createElement('p');
    hint.className = 'admin-bilingual-includes-help';
    hint.textContent = I18n.t('Chaque élément doit être rempli en français et en anglais. Les deux listes restent synchronisées.');
    const list = document.getElementById('aKitIncludesList');
    list?.insertAdjacentElement('beforebegin', hint);
  }

  function decorateIncludeRows(record = null) {
    removeLegacyEnglishIncludesField();
    ensureIncludeLanguageHint();
    const rows = Array.from(document.querySelectorAll('#aKitIncludesList .admin-repeat-row[data-kind="includes"]'));
    const translated = Array.isArray(record?.translations?.en?.includes) ? record.translations.en.includes : null;

    rows.forEach((row, index) => {
      const french = row.querySelector('.aKitIncludeItem');
      if (!french) return;
      french.lang = 'fr';
      french.placeholder = I18n.t('Ex: Toile pré-tracée 11 × 14');

      let englishWrap = row.querySelector('.admin-include-english');
      let english = englishWrap?.querySelector('[data-include-english]');
      if (!englishWrap) {
        englishWrap = document.createElement('label');
        englishWrap.className = 'admin-include-english';
        englishWrap.innerHTML = `<span>English</span><input type="text" lang="en" data-include-english placeholder="E.g. Pre-traced 11 × 14 canvas">`;
        row.querySelector('button')?.insertAdjacentElement('beforebegin', englishWrap);
        english = englishWrap.querySelector('[data-include-english]');
      }
      if (english) {
        english.id = `aKitIncludeEnglish-${index}`;
        if (translated) {
          const fallback = french.value.trim() ? I18n.t(french.value.trim(), [], 'en') : '';
          english.value = translated[index] ?? fallback;
        }
      }
    });
  }

  function pairedEnglishIncludes() {
    return Array.from(document.querySelectorAll('#aKitIncludesList .admin-repeat-row[data-kind="includes"]'))
      .filter(row => row.querySelector('.aKitIncludeItem')?.value.trim())
      .map(row => row.querySelector('[data-include-english]')?.value.trim() || '');
  }

  function validateProductEditor() {
    const categories = selectedAdminCategoryIds();
    if (!categories.length) {
      showToast(I18n.t('Sélectionnez au moins une catégorie'), 'error');
      return false;
    }
    const rows = Array.from(document.querySelectorAll('#aKitIncludesList .admin-repeat-row[data-kind="includes"]'));
    for (let index = 0; index < rows.length; index += 1) {
      const french = rows[index].querySelector('.aKitIncludeItem')?.value.trim() || '';
      const english = rows[index].querySelector('[data-include-english]')?.value.trim() || '';
      if (french && !english) {
        showToast(I18n.msg`Ajoutez la version anglaise de l’élément ${index + 1}`, 'error');
        rows[index].querySelector('[data-include-english]')?.focus();
        return false;
      }
      if (!french && english) {
        showToast(I18n.msg`Ajoutez la version française de l’élément ${index + 1}`, 'error');
        rows[index].querySelector('.aKitIncludeItem')?.focus();
        return false;
      }
    }
    return true;
  }

  function setEnglishProductField(field, value) {
    const input = document.getElementById(`english-kits-${field}`);
    if (input) input.value = value ?? '';
  }

  function englishProductValue(record, field) {
    const explicit = record?.translations?.en?.[field];
    if (explicit !== undefined && explicit !== null) return explicit;
    const source = record?.[field];
    return source ? I18n.t(source, [], 'en') : '';
  }

  function refreshAdminCategoryTable() {
    const tableRows = Array.from(document.querySelectorAll('#adminKitsPanel .admin-table-wrap tbody tr'));
    tableRows.forEach((row, index) => {
      const kit = (allKits || [])[index];
      const cell = row.children?.[1];
      if (!kit || !cell) return;
      const names = productCategoryIds(kit)
        .map(id => (allCategories || []).find(category => String(category.id) === String(id)))
        .filter(Boolean)
        .map(category => safeText(I18n.field(category, 'name')));
      cell.innerHTML = names.length ? names.map(name => `<span class="admin-category-pill">${name}</span>`).join(' ') : '—';
    });
  }

  function injectEnhancementStyles() {
    if (document.getElementById('artyProductAdminEnhancementStyles')) return;
    const style = document.createElement('style');
    style.id = 'artyProductAdminEnhancementStyles';
    style.textContent = `
      .admin-category-choice-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:4px}
      .admin-category-choice{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid rgba(44,36,24,.13);border-radius:12px;background:#fff;cursor:pointer}
      .admin-category-choice input{width:17px;height:17px;accent-color:var(--teal)}
      .admin-category-choice:has(input:checked){border-color:var(--teal);box-shadow:0 0 0 2px rgba(27,154,170,.08)}
      .admin-category-choice-help,.admin-bilingual-includes-help{display:block;margin-top:7px;color:var(--muted);font-size:.82rem}
      .admin-repeat-row[data-kind="includes"]{grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:end;gap:10px}
      .admin-include-english{display:grid;gap:5px;min-width:0}
      .admin-include-english span{font-size:.75rem;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.04em}
      .admin-include-english input{width:100%}
      .admin-category-pill{display:inline-block;margin:2px 4px 2px 0;padding:4px 8px;border-radius:999px;background:rgba(27,154,170,.09);color:var(--teal);font-size:.78rem;font-weight:600}
      @media (max-width:760px){.admin-repeat-row[data-kind="includes"]{grid-template-columns:1fr}.admin-repeat-row[data-kind="includes"]>button{justify-self:start}.admin-category-choice-grid{grid-template-columns:1fr}}
    `;
    document.head.append(style);
  }

  function applyCompleteProductCopy() {
    const id = document.getElementById('aKitTemplateSelect')?.value;
    const kit = (allKits || []).find(item => String(item.id) === String(id));
    if (!kit) return showToast(I18n.t('Choisissez un produit à copier'), 'error');

    const setValue = (elementId, value) => {
      const element = document.getElementById(elementId);
      if (element) element.value = value ?? '';
    };

    setValue('editKitId', '');
    setValue('aKitName', '');
    setValue('aKitPrice', kit.originalPrice ?? kit.price ?? '');
    setValue('aKitCompare', kit.compareAtPrice ?? '');
    setValue('aKitDesc', kit.description || '');
    setValue('aKitShortDesc', kit.shortDesc || '');
    setValue('aKitStockQty', kit.stockQty ?? '');
    setValue('aKitLowStock', kit.lowStockThreshold ?? 3);

    const stock = document.getElementById('aKitStock');
    const featured = document.getElementById('aKitFeatured');
    if (stock) stock.checked = kit.inStock !== false;
    if (featured) featured.checked = !!kit.featured;

    setAdminProductRows('images', []);
    setAdminProductRows('includes', Array.isArray(kit.includes) ? kit.includes : []);
    setAdminProductRows('sizes', Array.isArray(kit.sizeOptions) ? kit.sizeOptions.map(option => ({...option})) : []);
    setAdminProductRows('addons', Array.isArray(kit.addOns) ? kit.addOns.map(option => ({...option})) : []);
    ensureCategoryEditor(productCategoryIds(kit));

    setEnglishProductField('name', '');
    setEnglishProductField('description', englishProductValue(kit, 'description'));
    setEnglishProductField('shortDesc', englishProductValue(kit, 'shortDesc'));
    decorateIncludeRows(kit);

    const formTitle = document.getElementById('kitFormTitle');
    const cancel = document.getElementById('cancelKit');
    if (formTitle) formTitle.textContent = I18n.t('Ajouter un produit');
    if (cancel) cancel.style.display = 'none';

    document.querySelector('#adminKitsPanel .admin-form-card')?.scrollIntoView({behavior:'smooth', block:'start'});
    showToast(I18n.t('Produit copié. Ajoutez le nouveau nom et les nouvelles images, puis sauvegardez.'), 'success');
  }

  function install() {
    injectEnhancementStyles();

    const originalRenderAdminKits = window.renderAdminKits;
    if (typeof originalRenderAdminKits === 'function') {
      window.renderAdminKits = function(...args) {
        const result = originalRenderAdminKits.apply(this, args);
        const editId = document.getElementById('editKitId')?.value;
        const record = (allKits || []).find(item => String(item.id) === String(editId));
        ensureCategoryEditor(record ? productCategoryIds(record) : []);
        decorateIncludeRows(record || null);
        refreshAdminCategoryTable();
        return result;
      };
    }

    const originalEditKit = window.editKit;
    if (typeof originalEditKit === 'function') {
      window.editKit = function(id, ...args) {
        const result = originalEditKit.call(this, id, ...args);
        const kit = (allKits || []).find(item => String(item.id) === String(id));
        if (kit) {
          ensureCategoryEditor(productCategoryIds(kit));
          decorateIncludeRows(kit);
        }
        return result;
      };
    }

    const originalResetKitForm = window.resetKitForm;
    if (typeof originalResetKitForm === 'function') {
      window.resetKitForm = function(...args) {
        const result = originalResetKitForm.apply(this, args);
        ensureCategoryEditor([]);
        decorateIncludeRows(null);
        setEnglishProductField('name', '');
        return result;
      };
    }

    const originalSetAdminProductRows = window.setAdminProductRows;
    if (typeof originalSetAdminProductRows === 'function') {
      window.setAdminProductRows = function(kind, items = []) {
        const result = originalSetAdminProductRows.call(this, kind, items);
        if (kind === 'includes') decorateIncludeRows(null);
        return result;
      };
    }

    const originalAddAdminProductRow = window.addAdminProductRow;
    if (typeof originalAddAdminProductRow === 'function') {
      window.addAdminProductRow = function(kind, item = {}) {
        const result = originalAddAdminProductRow.call(this, kind, item);
        if (kind === 'includes') decorateIncludeRows(null);
        return result;
      };
    }

    const originalCollectEnglishTranslation = window.collectEnglishTranslation;
    if (typeof originalCollectEnglishTranslation === 'function') {
      window.collectEnglishTranslation = function(path) {
        const result = originalCollectEnglishTranslation.call(this, path);
        if (/^\/api\/admin\/(kits|product-templates)(?:\/[^/]+)?$/.test(path)) {
          const output = result || {translations:{en:{}}};
          output.translations = output.translations || {};
          output.translations.en = output.translations.en || {};
          output.translations.en.includes = pairedEnglishIncludes();
          return output;
        }
        return result;
      };
    }

    const originalArtyFetch = window.artyFetch;
    if (typeof originalArtyFetch === 'function') {
      window.artyFetch = function(input, options = {}) {
        try {
          const url = new URL(typeof input === 'string' ? input : input.url, location.href);
          const method = String(options.method || '').toUpperCase();
          if (/^\/api\/admin\/kits(?:\/[^/]+)?$/.test(url.pathname) && ['POST','PUT'].includes(method) && typeof options.body === 'string') {
            const payload = JSON.parse(options.body);
            const ids = selectedAdminCategoryIds();
            if (ids.length) {
              payload.categoryIds = ids;
              payload.categoryId = ids[0];
              options = {...options, body:JSON.stringify(payload)};
            }
          }
        } catch (error) {
          console.warn('Could not add product categories to request', error);
        }
        return originalArtyFetch.call(this, input, options);
      };
    }

    const originalSaveKit = window.saveKit;
    if (typeof originalSaveKit === 'function') {
      window.saveKit = function(...args) {
        if (!validateProductEditor()) return;
        return originalSaveKit.apply(this, args);
      };
    }

    if (typeof window.getFilteredKits === 'function') {
      const originalGetFilteredKits = window.getFilteredKits;
      window.getFilteredKits = function(...args) {
        const requestedCategory = String(catalogFilters?.category ?? 'all');
        if (requestedCategory === 'all') return originalGetFilteredKits.apply(this, args);
        const previous = catalogFilters.category;
        catalogFilters.category = 'all';
        let kits;
        try { kits = originalGetFilteredKits.apply(this, args); }
        finally { catalogFilters.category = previous; }
        return kits.filter(kit => productCategoryIds(kit).map(String).includes(requestedCategory));
      };
    }

    // mobile-gestures.js intentionally turns the old template selector into a product copier.
    // Replace its copy action after that script's load handler has run so bilingual fields are preserved too.
    window.applyProductTemplate = applyCompleteProductCopy;

    const editId = document.getElementById('editKitId')?.value;
    const record = (allKits || []).find(item => String(item.id) === String(editId));
    if (document.getElementById('adminKitsPanel')) {
      ensureCategoryEditor(record ? productCategoryIds(record) : []);
      decorateIncludeRows(record || null);
      refreshAdminCategoryTable();
    }
  }

  if (document.readyState === 'complete') install();
  else window.addEventListener('load', install);
})();
