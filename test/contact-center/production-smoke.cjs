/* Runs the real production entry point with an isolated DB and simulated email delivery. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {spawn}=require('node:child_process');

test('production wrapper serves the contact URL, assets, metadata and durable request API',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arty-contact-production-'));
  const dbPath=path.join(temp,'db.json');fs.writeFileSync(dbPath,JSON.stringify({users:[],sessions:[],adminEmails:[],kits:[],categories:[],events:[],orders:[],contactRequests:[],supportRequests:[]}));
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,PORT:String(port),ARTY_DATA_DIR:temp,ARTY_DB_PATH:dbPath,ARTY_EMAIL_MODE:'log',RESEND_API_KEY:'',ARTY_PUBLIC_URL:'https://arty.example.test'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Production server did not start: '+output)),10000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code+' '+output));});child.stdout.on('data',()=>{if(output.includes('Arty! server →')){clearTimeout(timer);resolve();}});});
    const base=`http://127.0.0.1:${port}`;
    for(const route of ['/contact','/contact/']){
      const response=await fetch(base+route),html=await response.text();assert.equal(response.status,200);
      assert(html.includes('<base href="/">'));assert(html.includes('Contact &amp; assistance | ARTY'));assert(html.includes('"@type":"ContactPage"'));assert(html.includes('id="page-contact"'));
      assert(html.includes('contact-center.js?v='));assert(html.includes('contact-center.css?v='));
    }
    assert((await (await fetch(base+'/contact?lang=en')).text()).includes('Contact &amp; support | ARTY'));
    assert((await (await fetch(base+'/sitemap.xml')).text()).includes('/contact</loc>'));
    for(const asset of ['/contact-center.css','/contact-center.js'])assert.equal((await fetch(base+asset)).status,200);
    const response=await fetch(base+'/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Smoke Test',email:'nobody@example.test',topic:'livraison',message:'This is a local test. Do not deliver email.',requestKey:'production-smoke-key-123'})});
    const receipt=await response.json();assert.equal(response.status,200);assert.equal(receipt.success,true);
    const saved=JSON.parse(fs.readFileSync(dbPath,'utf8'));assert.equal(saved.supportRequests.length,1);assert.equal(saved.supportRequests[0].id,receipt.reference);assert.equal(saved.supportRequests[0].channel,'orders');
    assert.equal((await fetch(base+'/api/admin/support-requests')).status,401);
  }finally{
    if(child.exitCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await closed;}
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
