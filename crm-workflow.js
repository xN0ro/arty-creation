'use strict';

const {randomUUID}=require('node:crypto');
const CLOSED=new Set(['won','refunded','lost']);
const TYPES=['call','email','meeting','quote','other'];
const OUTCOMES=['reached','no_answer','email_sent','meeting_done','quote_followed','other'];
const clean=(v,max=3000)=>String(v??'').trim().slice(0,max);
function invalid(fr,en){const error=new Error(en);error.fr=fr;error.status=400;throw error}
function zone(){return process.env.GOOGLE_CALENDAR_TIME_ZONE||process.env.ARTY_TIME_ZONE||'America/Toronto'}
function clock(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function due(value){
  const raw=clean(value,40);if(!raw)return '';
  const normalized=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw+'T09:00':raw;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized))invalid('Date et heure invalides','Invalid date and time');
  const parsed=new Date(normalized+':00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,16)!==normalized)invalid('Date et heure invalides','Invalid date and time');
  return normalized;
}
function tasks(raw={}){
  if(Array.isArray(raw.tasks))return raw.tasks.map(t=>({...t,calendar:{...(t.calendar||{})}}));
  if(!raw.nextFollowUp)return [];
  return [{id:'legacy-follow-up',type:TYPES.includes(raw.followUpType)?raw.followUpType:'call',title:'',dueAt:String(raw.nextFollowUp).slice(0,16),duration:Number(raw.followUpDuration)||30,priority:'normal',note:clean(raw.adminNote),status:CLOSED.has(raw.status)?'cancelled':'open',createdAt:raw.createdAt||raw.updatedAt||'',createdBy:raw.createdBy||'',updatedAt:raw.updatedAt||'',calendar:{...(raw.calendar||{})},legacy:true}];
}
function nextTask(list){return list.filter(t=>t.status==='open'&&t.dueAt).sort((a,b)=>a.dueAt.localeCompare(b.dueAt)||a.id.localeCompare(b.id))[0]||null}
function mirror(meta){
  const task=nextTask(meta.tasks);meta.nextFollowUp=task?.dueAt||'';meta.followUpType=task?.type||'call';meta.followUpDuration=task?.duration||30;meta.calendar=task?.calendar||{};return meta;
}
function event(meta,type,actor,detail={}){
  meta.activities=Array.isArray(meta.activities)?meta.activities:[];
  const entry={id:randomUUID(),type,at:new Date().toISOString(),by:clean(actor,240),...detail};meta.activities.push(entry);return entry;
}
function prepare(meta){meta.tasks=tasks(meta);meta.activities=Array.isArray(meta.activities)?meta.activities:[];return meta}
function createTask(meta,input,actor){
  prepare(meta);const dueAt=due(input.dueAt);if(!dueAt)invalid('Choisissez la date du suivi','Choose a follow-up date');
  if(!TYPES.includes(input.type||'call'))invalid('Type de suivi invalide','Invalid task type');
  const requestKey=clean(input.requestKey,100);
  const same=meta.tasks.find(t=>requestKey&&t.requestKey===requestKey);if(same)return same;
  const now=new Date().toISOString();
  const task={id:randomUUID(),requestKey,type:input.type||'call',title:clean(input.title,180),dueAt,duration:Math.max(5,Math.min(480,Number(input.duration)||30)),priority:input.priority==='high'?'high':'normal',note:clean(input.note),status:'open',createdAt:now,updatedAt:now,createdBy:actor,calendar:{}};
  meta.tasks.push(task);event(meta,'task_created',actor,{taskId:task.id,dueAt,typeLabel:task.type,note:task.note});mirror(meta);return task;
}
function updateTask(meta,id,input,actor){
  prepare(meta);const task=meta.tasks.find(t=>t.id===id);if(!task)return null;
  const action=input.action||'reschedule';
  if(!['complete','cancel','reschedule'].includes(action))invalid('Action invalide','Invalid task action');
  if(task.status!=='open')return task;
  if(action==='reschedule'){
    const date=due(input.dueAt);if(!date)invalid('Choisissez la date du suivi','Choose a follow-up date');
    event(meta,'task_rescheduled',actor,{taskId:id,from:task.dueAt,dueAt:date,note:clean(input.note)});task.dueAt=date;
    if(TYPES.includes(input.type))task.type=input.type;
    if(input.duration!==undefined)task.duration=Math.max(5,Math.min(480,Number(input.duration)||30));
    if(input.priority!==undefined)task.priority=input.priority==='high'?'high':'normal';
    if(input.note!==undefined)task.note=clean(input.note);
  }else{
    if(action==='complete'&&!OUTCOMES.includes(input.outcome))invalid('Choisissez le résultat','Choose an outcome');
    task.status=action==='complete'?'completed':'cancelled';task.completedAt=new Date().toISOString();task.completedBy=actor;task.outcome=action==='complete'?input.outcome:'';task.resultNote=clean(input.note);
    event(meta,action==='complete'?'task_completed':'task_cancelled',actor,{taskId:id,outcome:task.outcome,note:task.resultNote,typeLabel:task.type});
  }
  task.updatedAt=new Date().toISOString();mirror(meta);return task;
}
function logActivity(meta,input,actor){
  prepare(meta);if(!['call','email','meeting','note'].includes(input.type))invalid('Type d’activité invalide','Invalid activity type');
  if(input.type!=='note'&&!OUTCOMES.includes(input.outcome))invalid('Choisissez le résultat','Choose an outcome');
  if(input.type==='note'&&!clean(input.note))invalid('Ajoutez une note','Add a note');
  const requestKey=clean(input.requestKey,100),existing=meta.activities.find(x=>requestKey&&x.requestKey===requestKey);if(existing)return existing;
  return event(meta,'interaction',actor,{channel:input.type,outcome:input.outcome||'',note:clean(input.note),requestKey});
}
// Compatibility for existing lead forms. A changed date edits one open task; an
// unchanged field never creates a duplicate or rewrites the completed history.
function applyLegacy(meta,previous,patch,actor){
  prepare(meta);
  if(patch.nextFollowUp!==undefined&&String(patch.nextFollowUp)!==String(previous.nextFollowUp||'')){
    const current=nextTask(meta.tasks),date=due(patch.nextFollowUp);
    if(current)updateTask(meta,current.id,date?{action:'reschedule',dueAt:date}:{action:'cancel'},actor);
    else if(date)createTask(meta,{dueAt:date,type:meta.followUpType,duration:meta.followUpDuration,note:meta.adminNote},actor);
  }
  const primary=nextTask(meta.tasks);if(primary){if(patch.followUpType!==undefined)primary.type=meta.followUpType;if(patch.followUpDuration!==undefined)primary.duration=meta.followUpDuration}
  if(CLOSED.has(meta.status)&&!CLOSED.has(previous.status)){
    for(const task of meta.tasks.filter(t=>t.status==='open'))updateTask(meta,task.id,{action:'cancel',note:'Lead closed'},actor);
  }
  mirror(meta);
}
module.exports={CLOSED,TYPES,OUTCOMES,clock,zone,due,tasks,nextTask,mirror,event,prepare,createTask,updateTask,logActivity,applyLegacy,invalid};
