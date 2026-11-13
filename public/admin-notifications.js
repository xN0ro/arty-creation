/* Arty admin alerts: read state is kept on the server per staff member. */
(()=>{
'use strict';
let snapshot={counts:{support:0,orders:0,crm:0},total:0,through:{},allowed:{}};
let pendingSection='',loading=false;
const t=(fr,en)=>typeof I18n!=='undefined'&&I18n.language?.()==='en'?en:fr;
const isTeam=()=>!!currentUser&&['admin','staff'].includes(currentUser.role);
const formats={
 support:{fr:'Service à la clientèle',en:'Customer service',icon:'✉'},
 orders:{fr:'Nouvelles ventes',en:'New sales',icon:'●'},
 crm:{fr:'Prospects CRM',en:'CRM leads',icon:'◈'}
};
function badge(count,label,className=''){
 const value=Math.max(0,Number(count)||0);if(!value)return '';
 return '<span class="arty-unread-badge '+className+'" aria-label="'+value+' '+label+'">'+(value>99?'99+':value)+'</span>';
}
function render(){
 const stats=snapshot.counts||{},total=Number(snapshot.total)||0;
 const nav=document.querySelector('#navAuth .nav-user');
 if(nav){
   nav.querySelector('.arty-unread-badge')?.remove();
   if(isTeam()&&total)nav.insertAdjacentHTML('beforeend',badge(total,t('nouvelles notifications','new notifications')));
 }
 const adminLink=document.querySelector('#navAuth .admin-link');
 if(adminLink){
   adminLink.querySelector('.arty-unread-badge')?.remove();
   if(isTeam()&&total)adminLink.insertAdjacentHTML('beforeend',badge(total,t('nouveautés','new items')));
 }
 const dropdown=document.querySelector('#navAuth .nav-dropdown-menu');
 if(dropdown){
   dropdown.querySelector('.arty-alert-quick-links')?.remove();
   if(isTeam()&&total){
     const links=Object.keys(formats).filter(kind=>stats[kind]>0).map(kind=>'<button type="button" onclick="ARTYAdminAlerts.open(\''+kind+'\')">'+formats[kind].icon+' '+t(formats[kind].fr,formats[kind].en)+badge(stats[kind],'')+'</button>').join('');
     dropdown.insertAdjacentHTML('afterbegin','<div class="arty-alert-quick-links">'+links+'</div>');
   }
 }
 const targets={
  support:document.querySelector('.admin-tab[onclick*="\'support\'"]'),
  orders:document.querySelector('.admin-tab[onclick*="\'orders\'"]'),
  crm:document.querySelector('[data-crm-main]')
 };
 for(const [kind,el] of Object.entries(targets)){
   if(!el)continue;
   el.querySelector('.arty-unread-badge')?.remove();
   if(isTeam()&&stats[kind])el.insertAdjacentHTML('beforeend',badge(stats[kind],'', 'section'));
 }
 const shell=document.querySelector('.admin-pro-container'),existing=document.getElementById('artyAdminAlertSummary');
 if(!shell){existing?.remove();return}
 if(!isTeam()||!total){existing?.remove();return}
 let host=existing;
 if(!host){
   host=document.createElement('section');host.id='artyAdminAlertSummary';host.className='arty-alert-summary';
   const anchor=shell.querySelector('.admin-stats');
   if(anchor)anchor.insertAdjacentElement('afterend',host);else shell.prepend(host);
 }
 const actions=Object.keys(formats).filter(kind=>stats[kind]>0).map(kind=>{
   return '<button type="button" onclick="ARTYAdminAlerts.open(\''+kind+'\')">'+formats[kind].icon+' '+t(formats[kind].fr,formats[kind].en)+badge(stats[kind],'')+'</button>';
 }).join('');
 host.innerHTML='<div><strong>'+t('Nouveautés à consulter','New activity')+'</strong><small>'+t('Ouvrez une section pour marquer ses notifications comme vues.','Open a section to mark its alerts as viewed.')+'</small></div><div class="arty-alert-summary-actions">'+actions+'</div>';
}
async function refresh(){
 if(!isTeam()||!authToken){snapshot={counts:{support:0,orders:0,crm:0},total:0,through:{},allowed:{}};render();return}
 if(loading)return;loading=true;
 try{
   const response=await artyFetch('/api/admin/notifications',{headers:authH(),cache:'no-store'});
   if(!response.ok)throw Error('Notification fetch failed');
   snapshot=await response.json();
   render();
 }catch(e){console.warn('ARTY notifications:',e.message)}
 finally{loading=false}
}
async function seen(kind){
 if(!snapshot?.through?.[kind]||!snapshot?.counts?.[kind])return;
 const through=snapshot.through[kind];
 try{
   const response=await artyFetch('/api/admin/notifications/seen',{method:'POST',headers:authH(),body:JSON.stringify({kind,through})});
   if(!response.ok)throw Error('Notification mark failed');
   const data=await response.json();
   if(data.notification){snapshot=data.notification;render()}
 }catch(e){console.warn('ARTY notifications:',e.message)}
}
function currentTab(kind){
 return kind==='crm'?document.querySelector('[data-crm-main]'):
  document.querySelector('.admin-tab[onclick*="\''+kind+'\'"]');
}
function open(kind){
 if(!formats[kind])return;
 document.querySelector('#navAuth .nav-dropdown-menu')?.classList.remove('open');
 if(location.hash!=='#/admin'){
   pendingSection=kind;
   location.hash='#/admin';
   setTimeout(checkPending,350);
   return;
 }
 const tab=currentTab(kind);
 if(tab){pendingSection='';tab.click();}
 else{pendingSection=kind;setTimeout(checkPending,300)}
}
function checkPending(){
 if(!pendingSection||location.hash!=='#/admin')return;
 const target=currentTab(pendingSection);
 if(target){const kind=pendingSection;pendingSection='';target.click()}
}
function install(){
 // This script is loaded last, after the CRM/support overrides.
 const original=window.switchAdminTab;
 if(typeof original==='function'&&!original.__artyAlertsWrapped){
   const wrapped=function(kind,button,...rest){
     const result=original.call(this,kind,button,...rest);
     if(formats[kind]){
       Promise.resolve(result).then(()=>seen(kind)).catch(e=>console.warn('Notification section:',e.message));
     }
     return result;
   };
   wrapped.__artyAlertsWrapped=true;
   window.switchAdminTab=wrapped;
 }
 const observer=new MutationObserver(()=>{render();checkPending()});
 const adminTabs=document.querySelector('#page-admin .admin-tabs');
 if(adminTabs)observer.observe(adminTabs,{childList:true,subtree:false});
 window.addEventListener('hashchange',()=>{setTimeout(()=>{render();checkPending();refresh()},0)});
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 setInterval(()=>{if(!document.hidden)refresh()},45000);
 setTimeout(refresh,1800);
}
function style(){
 if(document.getElementById('artyAdminAlertsStyle'))return;
 const sheet=document.createElement('style');sheet.id='artyAdminAlertsStyle';
 sheet.textContent=`
 .arty-unread-badge{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#d94f4f;color:#fff;font-size:11px;font-weight:800;line-height:1;vertical-align:middle;margin-left:6px;white-space:nowrap}
 .nav-user .arty-unread-badge{position:static;margin-left:6px}
 .admin-tab .arty-unread-badge{margin-left:7px}
 .arty-alert-quick-links{padding:6px;border-bottom:1px solid rgba(0,0,0,.09);display:grid;gap:4px}
 .arty-alert-quick-links button{border:0;background:transparent;color:inherit;font:inherit;font-size:13px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;cursor:pointer;border-radius:8px}
 .arty-alert-quick-links button:hover{background:rgba(26,155,168,.09)}
 .arty-alert-summary{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;margin:16px 0;padding:15px 17px;background:#f5fbfa;border:1px solid #c9e8e3;border-radius:16px}
 .arty-alert-summary>div:first-child{display:grid;gap:3px}
 .arty-alert-summary strong{font-size:14px;color:#285557}
 .arty-alert-summary small{font-size:12px;color:#667775}
 .arty-alert-summary-actions{display:flex;flex-wrap:wrap;gap:8px}
 .arty-alert-summary-actions button{cursor:pointer;border-radius:10px;background:white;border:1px solid #d9eae8;padding:9px 12px;font:inherit;font-size:13px;color:#244b4c}
 .arty-alert-summary-actions button:hover{border-color:#1b9aaa}
 `;
 document.head.append(sheet);
}
window.ARTYAdminAlerts={refresh,render,open,seen};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{style();install()});else{style();install()}
})();
