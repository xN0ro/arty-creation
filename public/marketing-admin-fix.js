/* ARTY Marketing Admin: immediate tab mounting + bilingual admin UI */
(() => {
  if (window.__ARTY_MARKETING_ADMIN_FIX__) return;
  window.__ARTY_MARKETING_ADMIN_FIX__ = true;

  const COPY = new Map([
    ['Acquisition & mesure','Acquisition & measurement'],
    ['Préparez les liens publicitaires, les aperçus sociaux, l’attribution des ventes et les futures connexions GA4 / Meta.','Prepare advertising links, social previews, sales attribution, and future GA4 / Meta connections.'],
    ['Infrastructure prête','Infrastructure ready'],
    ['Configuration du site','Site configuration'],
    ['Ces valeurs contrôlent les liens canoniques et les aperçus partagés.','These values control canonical links and shared social previews.'],
    ['URL officielle','Official URL'],
    ['Titre par défaut','Default title'],
    ['Description par défaut','Default description'],
    ['Image sociale par défaut','Default social image'],
    ['Google & Meta','Google & Meta'],
    ['Vous pouvez enregistrer les identifiants maintenant ou plus tard. Rien ne se charge tant que l’outil n’est pas activé et accepté par le visiteur.','You can save the IDs now or later. Nothing loads until the tool is enabled and accepted by the visitor.'],
    ['Activer GA4','Enable GA4'],
    ['Activer Meta Pixel','Enable Meta Pixel'],
    ['Google Search Console — balise de vérification','Google Search Console — verification tag'],
    ['Meta — vérification du domaine','Meta — domain verification'],
    ['Meta Conversions API utilisera plus tard un jeton sécurisé côté serveur (Render). Le jeton ne sera jamais placé dans le navigateur ou dans cette page Admin.','Meta Conversions API will later use a secure server-side token in Render. The token will never be placed in the browser or on this Admin page.'],
    ['Générateur de lien de campagne','Campaign link generator'],
    ['Créez un lien prêt pour Facebook, Instagram, Google ou une autre campagne. ARTY conservera ces paramètres avec la commande.','Create a link ready for Facebook, Instagram, Google, or another campaign. ARTY will keep these campaign parameters with the order.'],
    ['Destination','Destination'],
    ['Source','Source'],
    ['Medium','Medium'],
    ['Nom de campagne','Campaign name'],
    ['Contenu (optionnel)','Content (optional)'],
    ['Copier','Copy'],
    ['Attribution des commandes','Order attribution'],
    ['Source et campagne enregistrées avec les nouvelles commandes. Ce résumé devient plus utile à mesure que les campagnes tournent.','Source and campaign are saved with new orders. This summary becomes more useful as campaigns run.'],
    ['Pages prêtes pour la publicité','Advertising-ready pages'],
    ['Chaque produit, événement et catégorie possède un lien public stable, un identifiant marketing et des métadonnées personnalisables.','Every product, event, and category has a stable public link, a marketing ID, and customizable metadata.'],
    ['Sauvegarder le marketing','Save marketing settings'],
    ['Produits','Products'],
    ['Événements','Events'],
    ['Catégories','Categories'],
    ['Copier le lien','Copy link'],
    ['URL / slug personnalisé','Custom URL / slug'],
    ['Image sociale (URL)','Social image (URL)'],
    ['Titre Facebook / Google','Facebook / Google title'],
    ['Description sociale / SEO','Social / SEO description'],
    ['Les nouvelles commandes commenceront à enregistrer leur source/campagne automatiquement.','New orders will automatically begin recording their source and campaign.'],
    ['Campagne','Campaign'],
    ['Commandes','Orders'],
    ['Ventes','Sales'],
    ['Aucun élément.','No items.'],
    ['Mesure d’audience et publicité','Analytics and advertising'],
    ['ARTY peut utiliser, avec votre consentement lorsqu’il est requis, des outils de mesure d’audience et de publicité pour comprendre la performance du site et des campagnes. Les technologies optionnelles peuvent être refusées. Les fonctions essentielles du panier, de la commande et du paiement ne dépendent pas de votre acceptation.','With your consent when required, ARTY may use analytics and advertising tools to understand website and campaign performance. Optional technologies can be declined. Essential cart, ordering, and payment functions do not depend on your acceptance.']
  ]);

  const PLACEHOLDERS = new Map([
    ['Valeur content de la balise Google','Content value from the Google verification tag'],
    ['Valeur content de la balise Meta','Content value from the Meta verification tag'],
    ['Description du produit, de l’événement ou de la catégorie','Product, event, or category description']
  ]);

  const isEnglish = () => typeof I18n !== 'undefined' && I18n.language?.() === 'en';

  function translateTextNode(node) {
    if (!isEnglish() || !node?.nodeValue) return;
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    const translated = COPY.get(trimmed);
    if (!translated) return;
    node.nodeValue = `${raw.match(/^\s*/)?.[0] || ''}${translated}${raw.match(/\s*$/)?.[0] || ''}`;
  }

  function translateMarketingUI() {
    const panel = document.getElementById('adminMarketingPanel');
    const tab = document.querySelector('[data-admin-marketing-tab]');
    if (tab) tab.textContent = 'Marketing';
    if (!panel) return;
    if (!isEnglish()) return;

    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script,style,textarea')) continue;
      translateTextNode(node);
    }
    panel.querySelectorAll('[placeholder]').forEach(element => {
      const translated = PLACEHOLDERS.get(element.getAttribute('placeholder') || '');
      if (translated) element.setAttribute('placeholder', translated);
    });
  }

  function translatePrivacyCopy() {
    const section = document.querySelector('[data-marketing-privacy]');
    if (!section || !isEnglish()) return;
    const heading = section.querySelector('h3');
    const paragraph = section.querySelector('p');
    if (heading) heading.textContent = COPY.get('Mesure d’audience et publicité');
    if (paragraph) paragraph.textContent = COPY.get('ARTY peut utiliser, avec votre consentement lorsqu’il est requis, des outils de mesure d’audience et de publicité pour comprendre la performance du site et des campagnes. Les technologies optionnelles peuvent être refusées. Les fonctions essentielles du panier, de la commande et du paiement ne dépendent pas de votre acceptation.');
  }

  function ensureMarketingScaffold() {
    const tabs = document.querySelector('.admin-tabs');
    if (tabs && !tabs.querySelector('[data-admin-marketing-tab]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-tab';
      button.dataset.adminMarketingTab = 'true';
      button.textContent = 'Marketing';
      button.addEventListener('click', () => {
        if (typeof window.switchAdminTab === 'function') window.switchAdminTab('marketing', button);
      });
      tabs.append(button);
    }
    if (!document.getElementById('adminMarketingPanel')) {
      const panel = document.createElement('div');
      panel.id = 'adminMarketingPanel';
      panel.style.display = 'none';
      const anchor = document.getElementById('adminCommercePanel') || document.getElementById('adminAnnouncementPanel');
      anchor?.insertAdjacentElement('afterend', panel);
    }
  }

  function marketingVisible() {
    const panel = document.getElementById('adminMarketingPanel');
    return !!panel && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none';
  }

  function installHooks() {
    if (typeof window.renderAdminMarketing !== 'function' || window.renderAdminMarketing.__artyBilingual) return false;

    const originalRender = window.renderAdminMarketing;
    window.renderAdminMarketing = async function(...args) {
      ensureMarketingScaffold();
      const result = await originalRender.apply(this, args);
      translateMarketingUI();
      return result;
    };
    window.renderAdminMarketing.__artyBilingual = true;

    if (typeof window.setArtyLanguage === 'function' && !window.setArtyLanguage.__artyMarketingAware) {
      const originalLanguage = window.setArtyLanguage;
      window.setArtyLanguage = async function(language) {
        const wasMarketing = marketingVisible();
        const result = await originalLanguage.apply(this, arguments);
        ensureMarketingScaffold();
        translatePrivacyCopy();
        if (wasMarketing) {
          const button = document.querySelector('[data-admin-marketing-tab]');
          if (button && typeof window.switchAdminTab === 'function') {
            window.switchAdminTab('marketing', button);
            if (typeof window.renderAdminMarketing === 'function') await window.renderAdminMarketing();
          }
        } else {
          translateMarketingUI();
        }
        return result;
      };
      window.setArtyLanguage.__artyMarketingAware = true;
    }

    ensureMarketingScaffold();
    translateMarketingUI();
    translatePrivacyCopy();
    return true;
  }

  // Mount immediately even if the user landed directly on #/admin.
  ensureMarketingScaffold();

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    ensureMarketingScaffold();
    if (installHooks() || attempts > 80) clearInterval(timer);
  }, 50);

  // The Admin DOM can be rerendered; keep the tab present without requiring another click.
  const observer = new MutationObserver(() => {
    ensureMarketingScaffold();
    if (marketingVisible()) translateMarketingUI();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
