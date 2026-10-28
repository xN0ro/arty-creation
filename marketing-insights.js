'use strict';
// Consent-based, first-party aggregate reporting. No IP addresses, raw visitor IDs,
// emails, query strings or full referrers are stored.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const ALLOWED=new Set(['page_view','view_item','view_event','add_to_cart','begin_checkout','lead']);
function filePath(){
  const dir=process.env.ARTY_DB_PATH?path.dirname(path.resolve(process.env.ARTY_DB_PATH)):(process.env.ARTY_DATA_DIR||process.env.DATA_DIR||process.env.RENDER_DISK_PATH||(process.env.RENDER&&fs.existsSync('/var/data')?'/var/data':path.join(__dirname,'data')));
  return path.join(dir,'marketing-insights.json');
}
function read(){try{const data=JSON.parse(fs.readFileSync(filePath(),'utf8'));return data&&typeof data==='object'?data:{}}catch{return {}}}
function write(data){
  const file=filePath();fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data));fs.renameSync(tmp,file);
}
function clean(value,max=80){return String(value||'').toLowerCase().replace(/[^a-z0-9_\-./#]/g,'').slice(0,max)}
function dayNow(){return new Date().toISOString().slice(0,10)}
function inc(target,key){target[key]=(target[key]||0)+1}
function stamp(value,day){return crypto.createHash('sha256').update(day+':'+value).digest('hex').slice(0,20)}
function record(kind,raw={}){
  if(!ALLOWED.has(kind)&&kind!=='login')return;
  const today=dayNow(),data=read();for(const date of Object.keys(data))if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<new Date(Date.now()-90*864e5).toISOString().slice(0,10))delete data[date];
  const entry=data[today]||{counts:{},pages:{},sources:{},devices:{},visitors:[],sessions:[]};
  inc(entry.counts,kind);
  if(kind==='page_view'){
    const url=(clean(raw.page||'/',110)||'/').replace(/(#\/ticket\/)[^/]+/i,'$1private').replace(/(#\/event-quote\/)[^/]+/i,'$1private');
    inc(entry.pages,url);
    inc(entry.sources,clean(raw.source||'direct',45)||'direct');
    inc(entry.devices,['mobile','tablet','desktop'].includes(raw.device)?raw.device:'unknown');
    if(/^[a-zA-Z0-9-]{12,70}$/.test(raw.visitor||'')){
      const id=stamp(raw.visitor,today);
      if(!entry.visitors.includes(id)&&entry.visitors.length<10000)entry.visitors.push(id);
    }
    if(/^[a-zA-Z0-9-]{12,70}$/.test(raw.session||'')){
      const id=stamp(raw.session,today);
      if(!entry.sessions.includes(id)&&entry.sessions.length<15000)entry.sessions.push(id);
    }
  }
  data[today]=entry;write(data);
}
function since(iso,cutoff){const ms=Date.parse(iso||'');return Number.isFinite(ms)&&ms>=cutoff}
function summary(db,days){
  const span=[7,30,90].includes(Number(days))?Number(days):30;
  const cutoff=Date.now()-(span-1)*864e5;
  const first=new Date(cutoff).toISOString().slice(0,10),data=read();
  const counts={},pages={},sources={},devices={},timeline=[];
  let visitors=0,sessions=0;
  for(let i=0;i<span;i++){
    const date=new Date(Date.parse(first+'T00:00:00Z')+i*864e5).toISOString().slice(0,10);
    const d=data[date]||{};
    for(const [k,v]of Object.entries(d.counts||{}))counts[k]=(counts[k]||0)+v;
    for(const [k,v]of Object.entries(d.pages||{}))pages[k]=(pages[k]||0)+v;
    for(const [k,v]of Object.entries(d.sources||{}))sources[k]=(sources[k]||0)+v;
    for(const [k,v]of Object.entries(d.devices||{}))devices[k]=(devices[k]||0)+v;
    visitors+=(d.visitors||[]).length;sessions+=(d.sessions||[]).length;
    timeline.push({date,views:d.counts?.page_view||0,sessions:(d.sessions||[]).length});
  }
  const rangeStart=Date.parse(first+'T00:00:00Z');
  const signups=(db.users||[]).filter(u=>since(u.createdAt,rangeStart)).length;
  const paidOrders=(db.orders||[]).filter(o=>!o.isTest&&o.paymentStatus==='paid'&&since(o.paidAt||o.updatedAt||o.createdAt,rangeStart));
  const revenue=paidOrders.reduce((sum,o)=>sum+(Number(o.total)||0),0);
  const manualTickets=(db.bookings||[]).filter(b=>b.paymentMethod==='e_transfer'&&since(b.bookedAt,rangeStart));
  const rank=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>({name,count}));
  return {days:span,from:first,to:dayNow(),counts,visitorsDailySum:visitors,sessions,pageViews:counts.page_view||0,signups,logins:counts.login||0,orders:paidOrders.length,revenue:Math.round(revenue*100)/100,manualBookings:manualTickets.length,manualAdmissions:manualTickets.reduce((sum,b)=>sum+(Number(b.guests)||0),0),topPages:rank(pages),sources:rank(sources),devices:rank(devices),timeline,collectionNotice:'Page views, sessions and visitor estimates only include opted-in browser analytics since installation. Visitors are unique per day and summed across the period; not deduplicated across days.'};
}
function install(app,{adminOnly,readDb}){
  // Instrument successful authentication server-side; do not record names,
  // emails, credentials or auth tokens in the reporting file.
  app.use(['/api/users/login','/api/users/google'],(req,res,next)=>{
    if(req.method!=='POST')return next();
    const old=res.json.bind(res);
    res.json=function(value){if(res.statusCode<400&&value?.success===true){try{record('login')}catch(err){console.warn('ARTY analytics login:',err.message)}}return old(value)};
    next();
  });
  app.post('/api/marketing-insights/track',(req,res)=>{
    const input=req.body||{};
    if(input.consent!==true||!ALLOWED.has(input.event))return res.status(400).json({error:'Analytics consent required'});
    if(/bot|crawler|spider|headless/i.test(req.headers['user-agent']||''))return res.status(204).end();
    try{record(input.event,input);res.status(204).end()}catch(err){console.error('ARTY analytics:',err.message);res.status(503).json({error:'Measurement unavailable'})}
  });
  app.get('/api/admin/marketing-insights',adminOnly,(req,res)=>{
    res.set('Cache-Control','no-store');
    try{res.json(summary(readDb(),req.query.days))}catch(err){res.status(503).json({error:'Analytics report unavailable'})}
  });
}
module.exports={install,summary,record};
