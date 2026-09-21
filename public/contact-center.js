/* Dedicated customer contact page. No customer drafts are stored on this device. */
(() => {
  'use strict';
  const T = (fr, en) => I18n.language() === 'en' ? en : fr;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { topic: 'commande', draft: {}, busy: false, saved: null, error: '', key: '', fingerprint: '', initialized: false };
  const paths = {
    commande: '<path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M7 5l10 4"/>',
    livraison: '<path d="M2 5h12v12H2zM14 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    produit: '<path d="m14 4 6 6M5 14 16 3a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L10 19M10 19c-1 3-5 3-8 3 2-2 0-6 3-7a4 4 0 0 1 5 4Z"/>',
    paiement: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/>',
    'événement': '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M8 15h2M14 15h2"/>',
    autre: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2v-9a9 9 0 1 1 19-2Z"/><path d="M8 10h8M8 14h5"/>',
    arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'
  };
  const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key] || paths.autre}</svg>`;
  const topics = () => [
    ['commande', T('Ma commande','My order'), T('Modifier ou vérifier','Change or check')],
    ['livraison', T('Ma livraison','My delivery'), T('Suivi ou colis reçu','Tracking or a parcel')],
    ['produit', T('Kit & Studio','Kit & Studio'), T('Conseils ou assistance','Advice or assistance')],
    ['paiement', T('Un paiement','A payment'), T('Facture ou transaction','Invoice or transaction')],
    ['événement', T('Un événement','An event'), T('Groupes et occasions','Groups and occasions')],
    ['autre', T('Autre question','Another question'), T('On vous écoute','We’re here to help')]
  ];
  const hints = () => ({
    commande: T('Indiquez ce que vous souhaitez vérifier ou modifier. Le numéro de commande nous aidera à retrouver votre achat.','Tell us what you would like to check or change. Your order number helps us find your purchase.'),
    livraison: T('Précisez le problème : suivi, retard, colis abîmé ou article manquant.','Tell us about the issue: tracking, a delay, a damaged parcel or a missing item.'),
    produit: T('Précisez le nom du kit ou l’étape du Studio qui vous pose problème.','Tell us the kit name or the Studio step you need help with.'),
    paiement: T('Décrivez la transaction concernée. Ne partagez jamais votre numéro de carte ou votre mot de passe.','Describe the transaction. Never share your card number or password.'),
    'événement': T('Parlez-nous de votre occasion, du lieu et de vos envies. Une date et un nombre de personnes, même estimés, nous aideront.','Tell us about your occasion, location and ideas. An approximate date and group size will help.'),
    autre: T('Une idée, une question ou un projet ? Donnez-nous quelques détails pour que nous puissions bien vous aider.','An idea, a question or a project? Share a few details so we can help.')
  });
  const fields = ['name','email','orderReference','eventDate','guests','message','website'];
  const id = key => 'contact-' + key;
  function capture() {
    fields.forEach(key => { const el = document.getElementById(id(key)); if (el) state.draft[key] = el.value; });
  }
  function field(key, label, attrs = '', hint = '') {
    return `<div class="contact-field"><label for="${id(key)}">${label}</label><input id="${id(key)}" name="${key}" value="${esc(state.draft[key] || '')}" ${attrs} aria-describedby="${id(key)}-error${hint ? ' '+id(key)+'-hint' : ''}">${hint ? `<small id="${id(key)}-hint">${hint}</small>` : ''}<span class="contact-field-error" id="${id(key)}-error" hidden></span></div>`;
  }
  function extras() {
    const optional = `<span>${T('facultatif','optional')}</span>`;
    if (state.topic === 'événement') return `<div class="contact-field-row">${field('eventDate', T('Date souhaitée','Preferred date')+' '+optional, 'type="date"')}${field('guests', T('Nombre de personnes','Group size')+' '+optional, 'type="number" inputmode="numeric" min="1" max="10000" step="1" placeholder="10"')}</div><a class="contact-inline-link" href="#/event-builder">${T('Vous souhaitez préparer un événement ?','Ready to plan an event?')} ${T('Créer ma demande','Build my request')} ${icon('arrow')}</a>`;
    if (state.topic !== 'autre') return field('orderReference', T('Numéro de commande','Order number')+' '+optional, 'type="text" maxlength="80" autocomplete="off"', T('Vous le trouverez dans votre courriel de confirmation.','You can find it in your confirmation email.'));
    return '';
  }
  function success() {
    const sent = state.saved.emailStatus === 'sent';
    return `<div class="contact-success" role="status" tabindex="-1" id="contactSuccess"><span class="contact-success-icon">${icon('check')}</span><p class="contact-eyebrow">${T('Demande enregistrée','Request saved')}</p><h2>${T('Merci, on prend le relais.','Thank you. We’ll take it from here.')}</h2><p>${T('Notre équipe examinera votre demande et vous répondra à','Our team will review your request and reply to')} <strong>${esc(state.saved.email)}</strong>.</p><div class="contact-reference"><span>${T('Votre référence','Your reference')}</span><strong translate="no">${esc(state.saved.reference)}</strong></div><p class="contact-success-note">${sent ? T('Un accusé de réception vous a été envoyé. Pensez à vérifier vos courriels indésirables.','A confirmation email has been sent. Please check your spam folder too.') : T('Conservez cette référence. Votre demande est bien enregistrée, même si le courriel de confirmation ne vous parvient pas.','Keep this reference. Your request is saved even if the confirmation email does not arrive.')}</p><div class="contact-success-actions"><a class="contact-submit" href="#/paintings">${T('Découvrir les kits','Explore the kits')} ${icon('arrow')}</a><button type="button" class="contact-text-button" id="contactNewRequest">${T('Envoyer une autre demande','Send another request')}</button></div></div>`;
  }
  function form() {
    return `<form id="contactCenterForm" novalidate aria-label="${T('Contacter ARTY','Contact ARTY')}" aria-busy="${state.busy}">
      <fieldset class="contact-form-fields" ${state.busy ? 'disabled' : ''}>
        <fieldset class="contact-topics"><legend><span class="contact-step">01</span>${T('Comment peut-on vous aider ?','How can we help?')}</legend><div class="contact-topic-grid">${topics().map(([key,label,sub]) => `<label class="contact-topic"><input type="radio" name="topic" value="${key}" ${state.topic === key ? 'checked' : ''}><span class="contact-topic-body">${icon(key)}<span><strong>${label}</strong><small>${sub}</small></span><span class="contact-topic-check">${icon('check')}</span></span></label>`).join('')}</div></fieldset>
        <div class="contact-form-heading"><span class="contact-step">02</span><h2>${T('Parlons de votre demande','Tell us a little more')}</h2></div>
        <p class="contact-required-note">${T('Les champs marqués * sont obligatoires.','Fields marked * are required.')}</p>
        <div class="contact-field-row">${field('name', T('Votre nom','Your name')+' *','type="text" autocomplete="name" maxlength="140" required')}${field('email', T('Votre courriel','Your email')+' *','type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="240" required')}</div>
        <div id="contactExtras">${extras()}</div>
        <div class="contact-topic-hint" id="contactTopicHint">${hints()[state.topic]}</div>
        <div class="contact-field"><label for="contact-message">${T('Votre message','Your message')} *</label><textarea id="contact-message" name="message" rows="5" minlength="10" maxlength="3000" required aria-describedby="contactTopicHint contact-message-error contactMessageCount" placeholder="${T('Expliquez-nous ce qui se passe…','Tell us what’s happening…')}">${esc(state.draft.message || '')}</textarea><div class="contact-message-meta"><span class="contact-field-error" id="contact-message-error" hidden></span><small id="contactMessageCount">${(state.draft.message || '').length} / 3 000</small></div></div>
        <div class="contact-bot-field" aria-hidden="true"><label for="contact-website">Website</label><input id="contact-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <p class="contact-privacy">${icon('lock')}<span>${T('Vos renseignements servent à traiter votre demande.','Your details are used to handle your request.')} <a href="#/privacy">${T('Confidentialité','Privacy policy')}</a></span></p>
        <div class="contact-submit-row"><span>${T('Une réponse de notre équipe, par courriel.','A reply from our team, by email.')}</span><button type="submit" class="contact-submit">${state.busy ? T('Envoi en cours…','Sending…') : T('Envoyer ma demande','Send my request')} ${icon('arrow')}</button></div>
      </fieldset>
      <div class="contact-form-error" role="alert" id="contactFormError" tabindex="-1" ${state.error ? '' : 'hidden'}>${esc(state.error)}</div>
    </form>`;
  }
  function render() {
    const root = document.getElementById('contactPageContent'); if (!root) return;
    capture();
    if(document.getElementById('page-contact')?.classList.contains('active')){document.title=T('Contact & assistance | ARTY','Contact & support | ARTY');document.querySelector('meta[name="description"]')?.setAttribute('content',T('Une question sur une commande, une livraison, un kit ou un événement ? Contactez l’équipe ARTY.','A question about an order, delivery, painting kit or event? Contact the ARTY team.'));}
    const queryTopic = new URLSearchParams(location.hash.split('?')[1] || '').get('topic');
    if (!state.initialized) {
      if (topics().some(([key]) => key === queryTopic)) state.topic = queryTopic;
      if (typeof currentUser !== 'undefined' && currentUser) state.draft = {name:currentUser.name || '', email:currentUser.email || '', ...state.draft};
      state.initialized = true;
    }
    root.innerHTML = `<div class="contact-shell"><a class="contact-back" href="#/">${T('Accueil','Home')} <span>/</span> ${T('Contact','Contact')}</a><header class="contact-hero"><p class="contact-eyebrow"><span></span>${T('Contact & assistance','Contact & support')}</p><h1>${T('On est là','We’re here')}<br><span>${T('pour vous.','for you.')}</span></h1><p>${T('Une question sur votre commande ou une idée à partager ? Chaque belle expérience commence par une conversation.','A question about your order or an idea to share? Every great experience starts with a conversation.')}</p></header>
      <div class="contact-layout-new"><aside class="contact-aside"><div class="contact-promise"><span class="contact-promise-icon">${icon('autre')}</span><h2>${T('La bonne équipe.<br>Le bon coup de main.','The right team.<br>A helping hand.')}</h2><p>${T('Choisissez votre sujet, racontez-nous les détails. Nous nous occupons de la suite.','Choose a topic and share the details. We’ll take care of the next step.')}</p><ol><li><span>1</span>${T('Votre demande est enregistrée.','Your request is saved.')}</li><li><span>2</span>${T('Notre équipe prend connaissance des détails.','Our team reviews the details.')}</li><li><span>3</span>${T('Nous vous répondons par courriel.','We reply to you by email.')}</li></ol></div><div class="contact-quick-help"><p class="contact-eyebrow">${T('Un raccourci utile','A useful shortcut')}</p><a href="#/profile">${icon('commande')}<span><strong>${T('Mes commandes','My orders')}</strong><small>${T('Retrouver mes achats et mes demandes','Find purchases and support requests')}</small></span>${icon('arrow')}</a><a href="#/tutorials">${icon('produit')}<span><strong>${T('Les tutoriels','Tutorials')}</strong><small>${T('Un peu d’aide pour créer','A little help with your creation')}</small></span>${icon('arrow')}</a><a href="#/policies">${icon('livraison')}<span><strong>${T('Les politiques d’achat','Purchase policies')}</strong><small>${T('Livraison, retours et conditions','Shipping, returns and terms')}</small></span>${icon('arrow')}</a></div></aside><section class="contact-panel" aria-label="${T('Votre demande','Your request')}">${state.saved ? success() : form()}</section></div><p class="contact-signoff">${T('Moins de soucis. Plus de créativité.','Less worry. More creativity.')} <span>ARTY.</span></p></div>`;
    root.querySelector('#contactCenterForm')?.addEventListener('submit', submit);
    root.querySelectorAll('[name="topic"]').forEach(el => el.addEventListener('change', () => {
      capture(); state.topic = el.value;
      document.getElementById('contactExtras').innerHTML = extras();
      document.getElementById('contactTopicHint').textContent = hints()[state.topic];
    }));
    root.removeEventListener('input', handleInput);
    root.addEventListener('input', handleInput);
    root.querySelector('#contactNewRequest')?.addEventListener('click', () => { state.saved=null;state.draft={};state.key='';state.fingerprint='';state.error='';render();root.querySelector('[name="topic"]:checked')?.focus(); });
  }
  // A delegated listener survives the conditional fields without installing duplicates.
  function handleInput(event) {
    const el=event.target;
    el.removeAttribute('aria-invalid');
    const error=document.getElementById(el.id+'-error');if(error){error.hidden=true;error.textContent='';}
    if(el.id==='contact-message')document.getElementById('contactMessageCount').textContent=el.value.length+' / 3 000';
  }
  function validate() {
    let first=null;
    const fail=(key,message)=>{const el=document.getElementById(id(key));if(!el)return;const error=document.getElementById(id(key)+'-error');error.textContent=message;error.hidden=false;el.setAttribute('aria-invalid','true');first=first||el;};
    document.querySelectorAll('#contactCenterForm .contact-field-error').forEach(el=>{el.hidden=true;el.textContent='';});
    document.querySelectorAll('#contactCenterForm [aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
    if(!state.draft.name?.trim())fail('name',T('Indiquez votre nom.','Enter your name.'));
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.draft.email?.trim() || '') || document.getElementById('contact-email').validity.typeMismatch)fail('email',T('Indiquez un courriel valide.','Enter a valid email.'));
    if((state.draft.message?.trim().length || 0)<10)fail('message',T('Ajoutez au moins 10 caractères pour nous aider.','Add at least 10 characters so we can help.'));
    if(state.topic==='événement'&&state.draft.guests&&(!Number.isInteger(Number(state.draft.guests))||Number(state.draft.guests)<1||Number(state.draft.guests)>10000))fail('guests',T('Indiquez de 1 à 10 000 personnes.','Enter between 1 and 10,000 people.'));
    if(first)first.focus();
    return !first;
  }
  async function submit(event) {
    event.preventDefault();if(state.busy)return;capture();if(!validate())return;
    const payload={...state.draft,topic:state.topic};
    const fingerprint=JSON.stringify(payload);
    if(!state.key||state.fingerprint!==fingerprint){state.key=crypto.randomUUID?.()||'contact-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);state.fingerprint=fingerprint;}
    payload.requestKey=state.key;
    state.busy=true;state.error='';
    const form=document.getElementById('contactCenterForm');
    form.setAttribute('aria-busy','true');form.querySelector('.contact-form-fields').disabled=true;
    form.querySelector('[type="submit"]').textContent=T('Envoi en cours…','Sending…');
    document.getElementById('contactFormError').hidden=true;
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
    try {
      const response=await artyFetch('/api/contact',{method:'POST',headers:typeof authH==='function'?authH():{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.success||!data.reference)throw new Error(data.error||T('Impossible d’envoyer la demande. Réessayez.','Unable to send your request. Please try again.'));
      state.saved={reference:data.reference,email:payload.email.trim(),emailStatus:data.emailStatus};state.draft={};state.key='';
    } catch(error) {
      state.error=error.name==='AbortError'||error instanceof TypeError ? T('La connexion a été interrompue. Vos renseignements sont conservés ici. Réessayez : la même demande ne sera pas créée deux fois.','The connection was interrupted. Your details are still here. Try again: the same request will not be created twice.') : error.message;
    } finally {
      clearTimeout(timeout);state.busy=false;
      // Do not move focus away from another page if the customer navigated during the request.
      if(state.saved)document.getElementById('contactCenterForm')?.remove();
      render();
      if(document.getElementById('page-contact')?.classList.contains('active'))document.getElementById(state.saved?'contactSuccess':'contactFormError')?.focus();
    }
  }
  window.renderContactPage=render;
})();
