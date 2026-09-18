'use strict';

const crypto=require('crypto');
const https=require('https');

let tokenCache={token:'',expiresAt:0,key:''};

function env(name){return String(process.env[name]||'').trim()}
function config(){
  const site=env('ARTY_PUBLIC_URL').replace(/\/+$/,'');
  return{
    oauthClientId:env('GOOGLE_CALENDAR_CLIENT_ID')||env('GOOGLE_CLIENT_ID'),
    oauthClientSecret:env('GOOGLE_CALENDAR_CLIENT_SECRET'),
    redirectUri:env('GOOGLE_CALENDAR_REDIRECT_URI')||(site?site+'/api/google-calendar/oauth/callback':''),
    serviceAccountEmail:env('GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL'),
    privateKey:env('GOOGLE_CALENDAR_PRIVATE_KEY').replace(/\\n/g,'\n'),
    calendarId:env('GOOGLE_CALENDAR_ID')||'primary',
    timeZone:env('GOOGLE_CALENDAR_TIME_ZONE')||process.env.ARTY_TIME_ZONE||'America/Toronto'
  };
}
function oauthReady(){
  const c=config();return Boolean(c.oauthClientId&&c.oauthClientSecret&&c.redirectUri);
}
function serviceAccountReady(){
  const c=config();return Boolean(c.serviceAccountEmail&&c.privateKey&&c.calendarId);
}
function connected(integration={}){
  return Boolean(integration?.refreshTokenEncrypted&&oauthReady())||serviceAccountReady();
}
function base64url(value){
  const input=Buffer.isBuffer(value)?value:Buffer.from(String(value));
  return input.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function form(data){return new URLSearchParams(data).toString()}
function httpsJson(options,body=''){
  return new Promise((resolve,reject)=>{
    const req=https.request(options,res=>{
      let raw='';
      res.on('data',chunk=>raw+=chunk);
      res.on('end',()=>{
        let parsed={};
        try{parsed=raw?JSON.parse(raw):{}}catch{parsed={raw}}
        if(res.statusCode>=400){
          const error=new Error(parsed?.error?.message||parsed?.error_description||`Google Calendar error ${res.statusCode}`);
          error.statusCode=res.statusCode;error.payload=parsed;return reject(error);
        }
        resolve(parsed);
      });
    });
    req.on('error',reject);
    if(body)req.write(body);
    req.end();
  });
}
function keyMaterial(){
  const secret=config().oauthClientSecret;
  if(!secret)throw new Error('Google Calendar OAuth client secret is not configured');
  return crypto.createHash('sha256').update('arty-google-calendar:'+secret).digest();
}
function encryptRefreshToken(token){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',keyMaterial(),iv);
  const encrypted=Buffer.concat([cipher.update(String(token),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv,tag,encrypted].map(x=>x.toString('base64')).join('.');
}
function decryptRefreshToken(value){
  const [ivRaw,tagRaw,dataRaw]=String(value||'').split('.');
  if(!ivRaw||!tagRaw||!dataRaw)throw new Error('Stored Google Calendar authorization is invalid');
  const decipher=crypto.createDecipheriv('aes-256-gcm',keyMaterial(),Buffer.from(ivRaw,'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw,'base64')),decipher.final()]).toString('utf8');
}
function authorizationUrl(state){
  const c=config();
  if(!oauthReady())throw new Error('Google Calendar OAuth is not configured');
  const q=new URLSearchParams({
    client_id:c.oauthClientId,
    redirect_uri:c.redirectUri,
    response_type:'code',
    access_type:'offline',
    prompt:'consent',
    include_granted_scopes:'true',
    scope:'openid email https://www.googleapis.com/auth/calendar.events',
    state:String(state||'')
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?'+q.toString();
}
async function exchangeCode(code){
  const c=config(),body=form({
    code:String(code||''),
    client_id:c.oauthClientId,
    client_secret:c.oauthClientSecret,
    redirect_uri:c.redirectUri,
    grant_type:'authorization_code'
  });
  const result=await httpsJson({
    hostname:'oauth2.googleapis.com',path:'/token',method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
  },body);
  if(!result.refresh_token)throw new Error('Google did not return a refresh token. Reconnect and approve Calendar access.');
  let email='';
  if(result.id_token){
    try{
      const payload=JSON.parse(Buffer.from(result.id_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
      email=String(payload.email||'').trim().toLowerCase();
    }catch{}
  }
  return{
    refreshTokenEncrypted:encryptRefreshToken(result.refresh_token),
    email,
    scope:String(result.scope||''),
    connectedAt:new Date().toISOString()
  };
}
async function oauthAccessToken(integration,force=false){
  const encrypted=String(integration?.refreshTokenEncrypted||'');
  if(!encrypted)throw new Error('Google Calendar is not connected');
  const cacheKey=crypto.createHash('sha256').update(encrypted).digest('hex').slice(0,16);
  if(!force&&tokenCache.token&&tokenCache.key===cacheKey&&Date.now()<tokenCache.expiresAt-60000)return tokenCache.token;
  const c=config(),body=form({
    client_id:c.oauthClientId,
    client_secret:c.oauthClientSecret,
    refresh_token:decryptRefreshToken(encrypted),
    grant_type:'refresh_token'
  });
  const result=await httpsJson({
    hostname:'oauth2.googleapis.com',path:'/token',method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
  },body);
  const token=String(result.access_token||'');if(!token)throw new Error('Google Calendar access token was not returned');
  tokenCache={token,key:cacheKey,expiresAt:Date.now()+(Number(result.expires_in)||3600)*1000};return token;
}
async function serviceAccessToken(force=false){
  const c=config(),cacheKey='service:'+c.serviceAccountEmail;
  if(!force&&tokenCache.token&&tokenCache.key===cacheKey&&Date.now()<tokenCache.expiresAt-60000)return tokenCache.token;
  const now=Math.floor(Date.now()/1000);
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=base64url(JSON.stringify({
    iss:c.serviceAccountEmail,
    scope:'https://www.googleapis.com/auth/calendar.events',
    aud:'https://oauth2.googleapis.com/token',
    iat:now-5,exp:now+3600
  }));
  const unsigned=`${header}.${claim}`,signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),c.privateKey);
  const assertion=`${unsigned}.${base64url(signature)}`,body=form({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
  const result=await httpsJson({
    hostname:'oauth2.googleapis.com',path:'/token',method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
  },body);
  const token=String(result.access_token||'');if(!token)throw new Error('Google Calendar access token was not returned');
  tokenCache={token,key:cacheKey,expiresAt:Date.now()+(Number(result.expires_in)||3600)*1000};return token;
}
async function accessToken(integration,force=false){
  if(integration?.refreshTokenEncrypted&&oauthReady())return oauthAccessToken(integration,force);
  if(serviceAccountReady())return serviceAccessToken(force);
  throw new Error('Google Calendar is not configured');
}
async function calendarRequest(method,path,body=null,integration={},retry=true){
  const token=await accessToken(integration,false),payload=body===null?'':JSON.stringify(body);
  try{
    return await httpsJson({
      hostname:'www.googleapis.com',path,method,
      headers:{Authorization:`Bearer ${token}`,...(body===null?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)})}
    },payload);
  }catch(error){
    if(retry&&error.statusCode===401){tokenCache={token:'',expiresAt:0,key:''};return calendarRequest(method,path,body,integration,false)}
    throw error;
  }
}
function clean(value,max=500){return String(value??'').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
function localDateTime(value){
  const raw=String(value||'').trim();if(!raw)return'';
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw+'T09:00:00';
  const m=raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/);
  return m?`${m[1]}T${m[2]}:${m[3]||'00'}`:'';
}
function plusMinutes(local,minutes){
  const d=new Date(local+'Z');if(Number.isNaN(d.getTime()))return local;
  d.setUTCMinutes(d.getUTCMinutes()+minutes);return d.toISOString().slice(0,19);
}
function followUpLabel(type){
  return({call:'Call',email:'Email',meeting:'Meeting',quote:'Quote follow-up',other:'Follow-up'})[String(type||'')]||'Follow-up';
}
function buildEvent(lead,integration={}){
  const c=config(),start=localDateTime(lead.nextFollowUp),duration=Math.max(5,Math.min(480,Number(lead.followUpDuration)||30));
  const type=String(lead.followUpType||'call'),name=clean(lead.name||lead.email,140),owner=String(lead.owner||'').trim().toLowerCase(),connectedEmail=String(integration?.email||'').trim().toLowerCase();
  if(!start||!validEmail(owner))return null;
  const lines=[
    `ARTY CRM ${followUpLabel(type)}`,
    lead.reference?`Lead: ${clean(lead.reference,120)}`:'',
    lead.title?`Request: ${clean(lead.title,240)}`:'',
    lead.email?`Customer email: ${clean(lead.email,240)}`:'',
    lead.phone?`Customer phone: ${clean(lead.phone,100)}`:'',
    lead.adminNote?`CRM note: ${clean(lead.adminNote,1200)}`:'',
    'Internal ARTY follow-up. The customer is not invited.'
  ].filter(Boolean);
  return{
    summary:`ARTY — ${followUpLabel(type)} — ${name}`.slice(0,300),
    description:lines.join('\n'),
    start:{dateTime:start,timeZone:c.timeZone},
    end:{dateTime:plusMinutes(start,duration),timeZone:c.timeZone},
    attendees:owner&&owner!==connectedEmail?[{email:owner}]:[],
    reminders:{useDefault:false,overrides:[{method:'popup',minutes:15}]},
    visibility:'private',
    extendedProperties:{private:{artyLeadKey:`${lead.kind}:${lead.id}`,artyOwner:owner}}
  };
}
function eventPath(eventId='',query=''){
  const c=config(),calendar=encodeURIComponent(c.calendarId);
  return`/calendar/v3/calendars/${calendar}/events${eventId?'/'+encodeURIComponent(eventId):''}${query}`;
}
async function deleteEvent(eventId,integration={}){
  if(!eventId||!connected(integration))return{action:'none'};
  try{await calendarRequest('DELETE',eventPath(eventId,'?sendUpdates=all'),null,integration);return{action:'deleted',eventId:''}}
  catch(error){if(error.statusCode===404||error.statusCode===410)return{action:'deleted',eventId:''};throw error}
}
async function syncFollowUp(lead,calendarMeta={},integration={}){
  const existingId=String(calendarMeta.eventId||'');
  if(!connected(integration))return{action:'not_configured',eventId:existingId,htmlLink:String(calendarMeta.htmlLink||'')};
  const shouldDelete=!lead.nextFollowUp||!lead.owner||['won','lost'].includes(String(lead.status||''));
  if(shouldDelete)return deleteEvent(existingId,integration);
  const event=buildEvent(lead,integration);if(!event)return deleteEvent(existingId,integration);
  if(existingId){
    try{
      const updated=await calendarRequest('PATCH',eventPath(existingId,'?sendUpdates=all'),event,integration);
      return{action:'updated',eventId:updated.id||existingId,htmlLink:updated.htmlLink||calendarMeta.htmlLink||''};
    }catch(error){if(error.statusCode!==404&&error.statusCode!==410)throw error}
  }
  const created=await calendarRequest('POST',eventPath('','?sendUpdates=all'),event,integration);
  return{action:'created',eventId:created.id||'',htmlLink:created.htmlLink||''};
}
function status(integration={}){
  const c=config();
  return{
    oauthConfigured:oauthReady(),
    connected:Boolean(integration?.refreshTokenEncrypted&&oauthReady()),
    connectedEmail:String(integration?.email||''),
    connectedAt:String(integration?.connectedAt||''),
    calendarId:c.calendarId,
    timeZone:c.timeZone,
    legacyServiceAccountConfigured:serviceAccountReady()
  };
}

module.exports={config,oauthReady,connected,authorizationUrl,exchangeCode,syncFollowUp,status};
