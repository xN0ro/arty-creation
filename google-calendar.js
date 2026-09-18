'use strict';

const crypto=require('crypto');
const https=require('https');

let tokenCache={token:'',expiresAt:0};

function env(name){return String(process.env[name]||'').trim()}
function config(){
  return{
    serviceAccountEmail:env('GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL'),
    privateKey:env('GOOGLE_CALENDAR_PRIVATE_KEY').replace(/\\n/g,'\n'),
    calendarId:env('GOOGLE_CALENDAR_ID'),
    timeZone:env('GOOGLE_CALENDAR_TIME_ZONE')||process.env.ARTY_TIME_ZONE||'America/Toronto'
  };
}
function configured(){
  const c=config();
  return Boolean(c.serviceAccountEmail&&c.privateKey&&c.calendarId);
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
async function accessToken(force=false){
  if(!configured())throw new Error('Google Calendar is not configured');
  if(!force&&tokenCache.token&&Date.now()<tokenCache.expiresAt-60000)return tokenCache.token;
  const c=config(),now=Math.floor(Date.now()/1000);
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=base64url(JSON.stringify({
    iss:c.serviceAccountEmail,
    scope:'https://www.googleapis.com/auth/calendar.events',
    aud:'https://oauth2.googleapis.com/token',
    iat:now-5,
    exp:now+3600
  }));
  const unsigned=`${header}.${claim}`;
  const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),c.privateKey);
  const assertion=`${unsigned}.${base64url(signature)}`;
  const body=form({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
  const result=await httpsJson({
    hostname:'oauth2.googleapis.com',path:'/token',method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
  },body);
  tokenCache={token:String(result.access_token||''),expiresAt:Date.now()+(Number(result.expires_in)||3600)*1000};
  if(!tokenCache.token)throw new Error('Google Calendar access token was not returned');
  return tokenCache.token;
}
async function calendarRequest(method,path,body=null,retry=true){
  const token=await accessToken(false),payload=body===null?'':JSON.stringify(body);
  try{
    return await httpsJson({
      hostname:'www.googleapis.com',path,method,
      headers:{
        Authorization:`Bearer ${token}`,
        ...(body===null?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)})
      }
    },payload);
  }catch(error){
    if(retry&&error.statusCode===401){tokenCache={token:'',expiresAt:0};return calendarRequest(method,path,body,false)}
    throw error;
  }
}
function clean(value,max=500){return String(value??'').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
function localDateTime(value){
  const raw=String(value||'').trim();
  if(!raw)return'';
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw+'T09:00:00';
  const m=raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/);
  return m?`${m[1]}T${m[2]}:${m[3]||'00'}`:'';
}
function plusMinutes(local,minutes){
  const d=new Date(local+'Z');if(Number.isNaN(d.getTime()))return local;
  d.setUTCMinutes(d.getUTCMinutes()+minutes);
  return d.toISOString().slice(0,19);
}
function followUpLabel(type){
  return({call:'Call',email:'Email',meeting:'Meeting',quote:'Quote follow-up',other:'Follow-up'})[String(type||'')]||'Follow-up';
}
function buildEvent(lead){
  const c=config(),start=localDateTime(lead.nextFollowUp),duration=Math.max(5,Math.min(480,Number(lead.followUpDuration)||30));
  const type=String(lead.followUpType||'call'),name=clean(lead.name||lead.email,140),owner=String(lead.owner||'').trim().toLowerCase();
  if(!start||!validEmail(owner))return null;
  const lines=[
    `ARTY CRM ${followUpLabel(type)}`,
    lead.reference?`Lead: ${clean(lead.reference,120)}`:'',
    lead.title?`Request: ${clean(lead.title,240)}`:'',
    lead.email?`Customer email: ${clean(lead.email,240)}`:'',
    lead.phone?`Customer phone: ${clean(lead.phone,100)}`:'',
    lead.adminNote?`CRM note: ${clean(lead.adminNote,1200)}`:'',
    'This is an internal ARTY follow-up. The customer is not invited.'
  ].filter(Boolean);
  return{
    summary:`ARTY — ${followUpLabel(type)} — ${name}`.slice(0,300),
    description:lines.join('\n'),
    start:{dateTime:start,timeZone:c.timeZone},
    end:{dateTime:plusMinutes(start,duration),timeZone:c.timeZone},
    attendees:[{email:owner}],
    reminders:{useDefault:false,overrides:[{method:'popup',minutes:15}]},
    visibility:'private',
    extendedProperties:{private:{artyLeadKey:`${lead.kind}:${lead.id}`,artyOwner:owner}}
  };
}
function eventPath(eventId='',query=''){
  const c=config(),calendar=encodeURIComponent(c.calendarId);
  return`/calendar/v3/calendars/${calendar}/events${eventId?'/'+encodeURIComponent(eventId):''}${query}`;
}
async function deleteEvent(eventId){
  if(!eventId||!configured())return{action:'none'};
  try{await calendarRequest('DELETE',eventPath(eventId,'?sendUpdates=none'),null);return{action:'deleted',eventId:''}}
  catch(error){if(error.statusCode===404||error.statusCode===410)return{action:'deleted',eventId:''};throw error}
}
async function syncFollowUp(lead,calendarMeta={}){
  const existingId=String(calendarMeta.eventId||'');
  if(!configured())return{action:'not_configured',eventId:existingId,htmlLink:String(calendarMeta.htmlLink||'')};
  const shouldDelete=!lead.nextFollowUp||!lead.owner||['won','lost'].includes(String(lead.status||''));
  if(shouldDelete)return deleteEvent(existingId);
  const event=buildEvent(lead);
  if(!event)return deleteEvent(existingId);
  if(existingId){
    try{
      const updated=await calendarRequest('PATCH',eventPath(existingId,'?sendUpdates=none'),event);
      return{action:'updated',eventId:updated.id||existingId,htmlLink:updated.htmlLink||calendarMeta.htmlLink||''};
    }catch(error){if(error.statusCode!==404&&error.statusCode!==410)throw error}
  }
  const created=await calendarRequest('POST',eventPath('','?sendUpdates=none'),event);
  return{action:'created',eventId:created.id||'',htmlLink:created.htmlLink||''};
}

module.exports={configured,config,syncFollowUp};
