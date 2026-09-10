/* One editable catalog for private and corporate events. */
let eventOptions = [], adminEventOptions = [], eventOptionsError = false, adminEventOptionsError = false;

async function fetchEventOptions(admin = false) {
  const response = await artyFetch(admin ? '/api/admin/event-options' : '/api/event-options', admin ? {headers:authH()} : {});
  if (!response.ok) throw new Error(I18n.t('Impossible de charger les options.'));
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(I18n.t('Impossible de charger les options.'));
  return data;
}
async function loadEventOptions() {
  try { eventOptions = await fetchEventOptions();eventOptionsError = false; }
  catch { eventOptions = [];eventOptionsError = true; }
}
async function loadAdminEventOptions() {
  try { adminEventOptions = await fetchEventOptions(true);adminEventOptionsError = false; }
  catch { adminEventOptions = [];adminEventOptionsError = true; }
}
function eventOptionPriceHTML(option) {
  if (option.price === null) return I18n.html`<p class="team-option-price"><strong>Sur devis</strong></p>`;
  return `<p class="team-option-price"><strong>${I18n.currency(option.price)}</strong><span>${safeText(I18n.t(option.priceUnit === 'group' ? 'par groupe, plus taxes' : 'par personne, plus taxes'))}</span></p>`;
}
function renderEventOptions() {
  const grid = document.getElementById('eventOptionsGrid');if (!grid) return;
  if (eventOptionsError) {
    grid.innerHTML = I18n.html`<div class="event-offers-empty" role="status"><p>Impossible de charger les options.</p><button type="button" class="btn btn-ghost" onclick="reloadEventOptions()">Réessayer</button></div>`;
    return;
  }
  grid.innerHTML = eventOptions.map((option,index) => I18n.html`<article class="team-card team-option-card">
    <div class="team-card-body">
      <span class="team-option-label">${safeText(I18n.t('Option {0}',[index+1]))}</span>
      <h3>${safeText(option.title)}</h3>
      ${option.description ? `<p class="event-offer-description">${safeText(option.description)}</p>` : ''}
      ${eventOptionPriceHTML(option)}
      ${option.includes?.length ? `<ul class="team-option-inclusions">${option.includes.map(item => `<li>${safeText(item)}</li>`).join('')}</ul>` : ''}
      <button type="button" class="btn btn-orange" onclick="selectEventOption('${safeAttr(option.id)}')">Demander une soumission</button>
    </div>
  </article>`).join('') || I18n.html`<div class="event-offers-empty"><p>Parlez-nous de votre occasion : nous préparerons une proposition adaptée à votre groupe.</p><button type="button" class="btn btn-teal" onclick="navigate('#/event-builder')">Demander une soumission</button></div>`;
}
async function reloadEventOptions() { await loadEventOptions();renderEventOptions();initScrollEffects(); }
function selectEventOption(id) {
  const option = eventOptions.find(item => item.id === id);if (!option) return;
  prefillPrivateEventType(option.title);
}

function eventOptionLanguageFields(language) {
  const suffix = language === 'fr' ? 'Fr' : 'En';
  return I18n.html`<fieldset class="event-option-language" lang="${language}">
    <legend>${language === 'fr' ? 'Français' : 'English'}</legend>
    <div class="form-group"><label for="eventOptionTitle${suffix}">Titre de l’option</label><input id="eventOptionTitle${suffix}" type="text" maxlength="160" ${language === 'fr' ? 'required' : ''}></div>
    <div class="form-group"><label for="eventOptionDescription${suffix}">Description</label><textarea id="eventOptionDescription${suffix}" maxlength="2000"></textarea></div>
    <div class="form-group"><label for="eventOptionIncludes${suffix}">Ce qui est inclus</label><textarea id="eventOptionIncludes${suffix}" rows="5" aria-describedby="eventOptionIncludesHelp${suffix}"></textarea><small id="eventOptionIncludesHelp${suffix}">Un élément par ligne, 24 au maximum.</small></div>
  </fieldset>`;
}
function renderAdminEventOptions() {
  const panel = document.getElementById('adminEventOptionsPanel');if (!panel) return;
  if (adminEventOptionsError) {
    panel.innerHTML = I18n.html`<div class="admin-form-card" role="status"><p>Impossible de charger les options.</p><button type="button" class="btn btn-teal" onclick="reloadAdminEventOptions()">Réessayer</button></div>`;
    return;
  }
  panel.innerHTML = I18n.html`<div class="admin-event-options-layout">
    <form class="admin-form-card" id="eventOptionForm" onsubmit="saveAdminEventOption(event)">
      <h3 id="eventOptionFormTitle">Ajouter une option</h3>
      <p class="admin-help">Ces options apparaissent dans la section « Événements privés et entreprises ». Complétez les deux langues avant de publier.</p>
      <input type="hidden" id="eventOptionEditId">
      ${eventOptionLanguageFields('fr')}${eventOptionLanguageFields('en')}
      <div class="form-row">
        <div class="form-group"><label for="eventOptionPrice">Prix ($ CA)</label><input id="eventOptionPrice" type="number" min="0" max="100000" step="0.01" inputmode="decimal" aria-describedby="eventOptionPriceHelp"><small id="eventOptionPriceHelp">Laissez vide pour afficher « Sur devis ».</small></div>
        <div class="form-group"><label for="eventOptionPriceUnit">Tarification</label><select id="eventOptionPriceUnit"><option value="person">Par personne</option><option value="group">Par groupe</option></select></div>
      </div>
      <div class="form-group"><label for="eventOptionSortOrder">Ordre d’affichage</label><input id="eventOptionSortOrder" type="number" min="0" max="999999" step="1" value="0" required><small>Les plus petits nombres apparaissent en premier.</small></div>
      <label class="event-option-publish" for="eventOptionPublished"><input id="eventOptionPublished" type="checkbox">Visible sur le site</label>
      <p class="admin-help">Une option masquée reste enregistrée dans l’administration.</p>
      <div class="event-option-editor-actions"><button type="submit" id="eventOptionSave" class="btn btn-orange">Enregistrer l’option</button><button type="button" class="btn btn-ghost" onclick="resetAdminEventOption()">Annuler</button></div>
    </form>
    <div><h3>Vos options d’événements</h3><div class="admin-event-options-list" id="adminEventOptionsList"></div></div>
  </div>`;
  renderAdminEventOptionsList();
  resetAdminEventOption();
}
function renderAdminEventOptionsList() {
  const list = document.getElementById('adminEventOptionsList');if (!list) return;
  list.innerHTML = adminEventOptions.map(option => I18n.html`<article class="admin-event-option-row">
    <span class="event-option-status">${safeText(I18n.t(option.published ? 'Visible sur le site' : 'Masquée'))}</span>
    <h4>${safeText(option.title)}</h4>
    ${eventOptionPriceHTML(option)}
    <p>${safeText(I18n.t('Ordre d’affichage : {0}',[option.sortOrder]))}</p>
    <div class="admin-event-option-actions"><button type="button" class="btn btn-teal btn-sm" onclick="editAdminEventOption('${safeAttr(option.id)}')">Modifier</button><button type="button" class="btn btn-ghost btn-sm" onclick="deleteAdminEventOption('${safeAttr(option.id)}',this)">Supprimer</button></div>
  </article>`).join('') || I18n.html`<div class="admin-form-card"><p>Aucune option pour le moment. Créez votre première option avec le formulaire.</p></div>`;
}
async function reloadAdminEventOptions() { await loadAdminEventOptions();renderAdminEventOptions(); }
function resetAdminEventOption() {
  document.getElementById('eventOptionForm')?.reset();
  const id = document.getElementById('eventOptionEditId');if (id) id.value = '';
  const title = document.getElementById('eventOptionFormTitle');if (title) title.textContent = I18n.t('Ajouter une option');
  const order = document.getElementById('eventOptionSortOrder');if (order) order.value = Math.min(999999,Math.max(-1,...adminEventOptions.map(option => option.sortOrder))+1);
}
function editAdminEventOption(id) {
  if (document.getElementById('eventOptionSave')?.disabled) return;
  const option = adminEventOptions.find(item => item.id === id);if (!option) return;
  resetAdminEventOption();
  document.getElementById('eventOptionEditId').value = option.id;
  document.getElementById('eventOptionFormTitle').textContent = I18n.t('Modifier l’option');
  for (const [suffix,content] of [['Fr',option],['En',option.translations?.en || {}]]) {
    document.getElementById('eventOptionTitle'+suffix).value = content.title || '';
    document.getElementById('eventOptionDescription'+suffix).value = content.description || '';
    document.getElementById('eventOptionIncludes'+suffix).value = (content.includes || []).join('\n');
  }
  document.getElementById('eventOptionPrice').value = option.price ?? '';
  document.getElementById('eventOptionPriceUnit').value = option.priceUnit;
  document.getElementById('eventOptionSortOrder').value = option.sortOrder;
  document.getElementById('eventOptionPublished').checked = option.published;
  document.getElementById('eventOptionForm')?.scrollIntoView({behavior:'smooth',block:'start'});
  document.getElementById('eventOptionTitleFr')?.focus({preventScroll:true});
}
function collectAdminEventOption() {
  const value = id => document.getElementById(id).value.trim();
  const content = suffix => ({title:value('eventOptionTitle'+suffix),description:value('eventOptionDescription'+suffix),includes:value('eventOptionIncludes'+suffix).split('\n').map(item => item.trim()).filter(Boolean)});
  return {...content('Fr'),translations:{en:content('En')},price:value('eventOptionPrice') === '' ? null : Number(value('eventOptionPrice')),priceUnit:value('eventOptionPriceUnit'),sortOrder:Number(value('eventOptionSortOrder')),published:document.getElementById('eventOptionPublished').checked};
}
async function saveAdminEventOption(event) {
  event.preventDefault();
  const form = document.getElementById('eventOptionForm'),button = document.getElementById('eventOptionSave');
  if (!form.reportValidity() || button.disabled) return;
  const body = collectAdminEventOption(),id = document.getElementById('eventOptionEditId').value;
  if (body.published && (!body.translations.en.title || (body.description && !body.translations.en.description) || body.includes.length !== body.translations.en.includes.length)) {
    showToast(I18n.t('Complétez la version anglaise avant de publier cette option.'),'error');return;
  }
  button.disabled = true;
  // Freeze this form while saving so a slow response cannot clear a newer edit.
  const controls = [...form.querySelectorAll('input,textarea,select,button')];controls.forEach(control => control.disabled = true);
  try {
    const response = await artyFetch('/api/admin/event-options'+(id ? '/'+encodeURIComponent(id) : ''),{method:id ? 'PUT' : 'POST',headers:authH(),body:JSON.stringify(body)});
    const data = await response.json();if (!response.ok) throw new Error(data.error || I18n.t('Enregistrement impossible.'));
    adminEventOptions = [...adminEventOptions.filter(option => option.id !== data.option.id),data.option].sort((a,b) => a.sortOrder-b.sortOrder || a.id.localeCompare(b.id));
    renderAdminEventOptionsList();resetAdminEventOption();
    showToast(I18n.t('Option enregistrée.'),'success');
    await loadEventOptions();
  } catch(error) { showToast(error.message || I18n.t('Enregistrement impossible.'),'error'); }
  finally { controls.forEach(control => control.disabled = false); }
}
async function deleteAdminEventOption(id,button) {
  if (button?.disabled || document.getElementById('eventOptionSave')?.disabled) return;
  if (!confirm(I18n.t('Supprimer définitivement cette option ?'))) return;
  if (button) button.disabled = true;
  try {
    const response = await artyFetch('/api/admin/event-options/'+encodeURIComponent(id),{method:'DELETE',headers:authH()});
    const data = await response.json();if (!response.ok) throw new Error(data.error || I18n.t('Suppression impossible.'));
    adminEventOptions = adminEventOptions.filter(option => option.id !== id);
    if (document.getElementById('eventOptionEditId').value === id) resetAdminEventOption();
    renderAdminEventOptionsList();showToast(I18n.t('Option supprimée.'),'success');await loadEventOptions();
  } catch(error) { showToast(error.message || I18n.t('Suppression impossible.'),'error'); }
  finally { if (button) button.disabled = false; }
}
