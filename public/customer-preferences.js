/* ARTY customer communication preferences */
(()=>{
'use strict';
if(window.__ARTY_CUSTOMER_PREFERENCES__)return;window.__ARTY_CUSTOMER_PREFERENCES__=true;
const en=()=>{try{return I18n.language?.()==='en'}catch{return false}},t=(fr,enText)=>en()?enText:fr;
let prefs={preferredLanguage:'',marketingConsent:false,marketingConsentAt:''};
async function load(){
  if(!currentUser)return;
  try{const r=await artyFetch('/api/users/marketing-preferences',{headers:authH()});if(r.ok)prefs=await r.json()}catch{}
}
function render(){
  const panel=document.getElementById('panel-settings'),stack=panel?.querySelector('.account-settings-stack');if(!stack||document.getElementById('accountCommunicationPreferences'))return;
  const section=document.createElement('section');section.id='accountCommunicationPreferences';section.className='account-form-card';
  section.innerHTML=`<div class="account-card-title"><div><h3>${t('Préférences de communication','Communication preferences')}</h3><p>${t('Choisissez votre langue et si vous souhaitez recevoir les nouvelles, événements et offres ARTY.','Choose your language and whether you want to receive ARTY news, events and offers.')}</p></div></div>
    <div class="form-group"><label>${t('Langue préférée','Preferred language')}</label><select id="accountPreferredLanguage"><option value="fr" ${prefs.preferredLanguage==='fr'?'selected':''}>Français</option><option value="en" ${prefs.preferredLanguage==='en'?'selected':''}>English</option></select></div>
    <label class="account-marketing-consent"><input type="checkbox" id="accountMarketingConsent" ${prefs.marketingConsent?'checked':''}><span><strong>${t('Je souhaite recevoir les nouvelles ARTY','I want to receive ARTY news')}</strong><small>${t('Événements à venir, nouveaux kits et offres occasionnelles. Vous pourrez retirer votre consentement en tout temps.','Upcoming events, new kits and occasional offers. You can withdraw your consent at any time.')}</small></span></label>
    ${prefs.marketingConsentAt?`<p class="account-pref-date">${t('Préférence mise à jour','Preference updated')}: ${new Date(prefs.marketingConsentAt).toLocaleDateString(en()?'en-CA':'fr-CA')}</p>`:''}
    <button type="button" class="btn btn-ghost" onclick="saveAccountCommunicationPreferences()">${t('Enregistrer les préférences','Save preferences')}</button>`;
  stack.prepend(section);style();
}
window.saveAccountCommunicationPreferences=async()=>{
  try{
    const body={preferredLanguage:document.getElementById('accountPreferredLanguage')?.value||'fr',marketingConsent:!!document.getElementById('accountMarketingConsent')?.checked};
    const r=await artyFetch('/api/users/marketing-preferences',{method:'PUT',headers:authH(),body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));
    if(!r.ok)return showToast(d.error||t('Impossible de sauvegarder','Could not save'),'error');
    prefs=d;showToast(t('Préférences sauvegardées','Preferences saved'),'success');
  }catch{showToast(t('Erreur de connexion','Connection error'),'error')}
};
function style(){
  if(document.getElementById('artyCustomerPreferencesStyle'))return;const s=document.createElement('style');s.id='artyCustomerPreferencesStyle';s.textContent=`
  .account-marketing-consent{display:flex;gap:11px;align-items:flex-start;padding:12px;border:1px solid var(--border-light);border-radius:12px;background:var(--bg2);cursor:pointer;margin:10px 0}.account-marketing-consent input{width:18px;height:18px;margin-top:2px;accent-color:var(--teal)}.account-marketing-consent span{display:grid;gap:3px}.account-marketing-consent strong{font-size:.8rem}.account-marketing-consent small,.account-pref-date{color:var(--text-light);font-size:.68rem;line-height:1.45}.account-pref-date{margin:0 0 10px}
  `;document.head.appendChild(s)
}
const original=window.renderProfilePage;
if(typeof original==='function')window.renderProfilePage=async function(...args){await load();const result=await original.apply(this,args);render();return result};
})();