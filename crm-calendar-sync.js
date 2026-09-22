'use strict';

const crm=require('./crm-core');
const workflow=require('./crm-workflow');
const google=require('./google-calendar');
const queues=new Map();
function raw(db,kind,id){return (db[kind==='event'?'eventRequests':kind==='contact'?'contactRequests':'crmLeads']||[]).find(x=>String(x.id)===String(id))}

// Persist business changes before calling this module. Each calendar response is
// merged into a fresh database snapshot, never into the earlier request snapshot.
function sync({kind,id,read,write}){
  const key=`${kind}:${id}`;
  const job=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
    const db=read(),item=raw(db,kind,id);if(!item)return {action:'missing'};
    const lead=crm.buildLeads(db).find(x=>x.kind===kind&&String(x.id)===String(id));if(!lead)return {action:'missing'};
    const list=workflow.tasks(item.crm),results=[];
    for(const task of list){
      if(task.status!=='open'&&!task.calendar?.eventId)continue;
      let result;
      try{result=await google.syncFollowUp({...lead,id:`${id}:${task.id}`,status:'task',nextFollowUp:task.status==='open'?task.dueAt:'',followUpType:task.type,followUpDuration:task.duration,adminNote:task.note||lead.adminNote},task.calendar||{},db.crmIntegrations?.googleCalendar||{})}
      catch(error){result={action:'error',error:String(error.message||error).slice(0,1000)}}
      const latest=read(),saved=raw(latest,kind,id);
      if(saved){
        saved.crm=crm.crmMeta(saved.crm);const current=saved.crm.tasks.find(x=>x.id===task.id);
        if(current){current.calendar={...current.calendar,eventId:result.eventId??current.calendar?.eventId??'',htmlLink:result.action==='deleted'?'':result.htmlLink??current.calendar?.htmlLink??'',status:result.action,error:result.error||'',syncedAt:new Date().toISOString()};workflow.mirror(saved.crm);write(latest)}
      }
      results.push(result);
    }
    return results.find(r=>r.action==='error')||results.find(r=>r.action==='not_configured')||results.at(-1)||{action:'none'};
  });
  queues.set(key,job);job.finally(()=>{if(queues.get(key)===job)queues.delete(key)}).catch(()=>{});return job;
}
module.exports={sync,isSyncing:(kind,id)=>queues.has(`${kind}:${id}`)};
