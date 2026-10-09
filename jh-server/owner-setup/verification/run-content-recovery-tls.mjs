/** Real separate JVMs/Node processes, same encrypted checkpoint DB, loopback HTTPS; no user accounts. */
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import assert from 'node:assert/strict';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {contentCanonical as canonical} from '../server-continuation/life-content-wire.mjs';
const jar=resolve(process.argv[2]),evidence=process.argv[3]?resolve(process.argv[3]):null;
const dir=mkdtempSync(join(tmpdir(),'jh-content-e2e-')),key=randomBytes(32),owner='a'.repeat(64),serverDigest='c'.repeat(64),token=randomBytes(32).toString('hex');
const conf={databasePath:join(dir,'state.db'),key:key.toString('hex'),owner,serverDigest,token,tlsKey:join(dir,'leaf.key'),tlsCert:join(dir,'leaf.pem')};
const sourcePath=join(dir,'original-book.txt');writeFileSync(sourcePath,'selected synthetic pages');
let active=null,failure=null;const checks=[];let counters=[];
function exec(bin,args){return execFileSync(bin,args,{stdio:['pipe','pipe','pipe'],timeout:20000});}
async function childProbe(mode,workflow,kind='memory'){
 const grant=descriptions[kind];
 const child=spawn('java',['-Djavax.net.ssl.trustStore='+join(dir,'trust.p12'),'-Djavax.net.ssl.trustStorePassword=fixture-only-password','-Djdk.net.hosts.file='+join(dir,'hosts'),'-cp',jar,'com.koreanlifehub.bridge.LifeContentTlsProbe'],{stdio:['pipe','pipe','pipe']});
 let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);const done=new Promise(ok=>child.once('exit',(code,signal)=>ok({code,signal})));
 const timer=setTimeout(()=>child.kill('SIGKILL'),45000);
 child.stdin.end(canonical({mode,kind,workflow,origin:active.origin,owner,server:serverDigest,token,expiresAt:grant.expiresAt,sourcePath})+'\n');
 const result=await done;clearTimeout(timer);assert.equal(result.code,0,mode+':'+out+'\n'+err);assert.match(out,/PASS /);return out.trim();
}
const descriptions={};
for(const kind of ['memory','book','join']){
 const text=execFileSync('java',['-cp',jar,'com.koreanlifehub.bridge.LifeContentTlsProbe'],{input:canonical({mode:'describe',kind})+'\n',encoding:'utf8',timeout:10000});
 descriptions[kind]={...JSON.parse(text.trim()),expiresAt:Date.now()+600000};
}
async function start(){
 const p=spawn(process.execPath,[new URL('./content-server-fixture.mjs',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});
 let err='';p.stderr.on('data',b=>err+=b);const ended=new Promise(ok=>p.once('exit',(code,signal)=>ok({code,signal,err})));
 const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();p.stdin.write(JSON.stringify(conf)+'\n');
 const ready=await lines.next();if(ready.done)throw new Error('fixture_start_failed '+err);const x=JSON.parse(ready.value);assert.equal(x.event,'ready');
 active={p,lines,ended,origin:'https://localhost:'+x.port};
}
async function cmd(x){active.p.stdin.write(JSON.stringify(x)+'\n');const line=await active.lines.next();if(line.done)throw new Error('fixture_exited');return JSON.parse(line.value);}
async function grant(workflow,kind='memory'){return cmd({cmd:'grant',value:{...descriptions[kind],workflow}});}
async function stop(kill=false){if(!active)return;const a=active;counters.push(await cmd({cmd:'stats'}));if(kill)a.p.kill('SIGKILL');else{await cmd({cmd:'close'});a.p.stdin.end();}const e=await a.ended;active=null;if(!kill)assert.equal(e.code,0,e.err);}
async function scenario(name,fn){console.log('START '+name+' '+new Date().toISOString());await fn();checks.push({name,passed:true});console.log('PASS '+name);}
try{
 exec('openssl',['req','-x509','-newkey','rsa:2048','-keyout',join(dir,'ca.key'),'-out',join(dir,'ca.pem'),'-nodes','-subj','/CN=JH CONTENT TEST ONLY CA','-days','1']);
 exec('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',conf.tlsKey,'-out',join(dir,'leaf.csr'),'-subj','/CN=localhost']);
 writeFileSync(join(dir,'leaf.ext'),'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n');
 exec('openssl',['x509','-req','-in',join(dir,'leaf.csr'),'-CA',join(dir,'ca.pem'),'-CAkey',join(dir,'ca.key'),'-CAcreateserial','-out',conf.tlsCert,'-days','1','-extfile',join(dir,'leaf.ext')]);
 exec('keytool',['-importcert','-noprompt','-alias','jh-content-fixture','-file',join(dir,'ca.pem'),'-keystore',join(dir,'trust.p12'),'-storetype','PKCS12','-storepass','fixture-only-password']);
 writeFileSync(join(dir,'hosts'),'127.0.0.1 localhost\n');
 const initial=new LifeCheckpointStore({...conf,key,initialize:true});initial.initializeContentStorage();initial.close();await start();
 await scenario('actual_host_first_wave_input_and_fetched_text_persisted',async()=>{await grant('resume');await childProbe('first','resume');});
 await scenario('sigkill_server_new_jvm_receives_original_query_and_prior_body',async()=>{await stop(true);await start();await grant('resume');await childProbe('continue','resume');});
 await scenario('third_jvm_recovers_final_answer_without_gpt_regeneration',()=>childProbe('final','resume'));
 await scenario('book_selected_source_reference_saved_without_media_copy',async()=>{await grant('book','book');await childProbe('first','book','book');});
 await scenario('new_jvm_book_pages_and_result_body_recovered',()=>childProbe('continue','book','book'));
 await scenario('source_content_change_blocks_restored_book',async()=>{await grant('changed_book','book');await childProbe('first','changed_book','book');writeFileSync(sourcePath,'changed source content');await childProbe('original_changed','changed_book','book');writeFileSync(sourcePath,'selected synthetic pages');});
 await scenario('two_verified_dependencies_restored_into_existing_join',async()=>{await grant('join','join');await childProbe('first','join','join');await stop(true);await start();await grant('join','join');await childProbe('continue','join','join');});
 await scenario('cancel_preserves_original_but_hides_restored_body',async()=>{await grant('cancel');await childProbe('first','cancel');await cmd({cmd:'cancel',workflow:'cancel'});await childProbe('cancelled','cancel');});
 await scenario('lost_input_ack_does_not_repeat_put',async()=>{await grant('lostinput');await cmd({cmd:'mode',value:'drop_input'});const before=await cmd({cmd:'stats'});await childProbe('lost_input_ack','lostinput');const after=await cmd({cmd:'stats'});assert.equal(after.contentPuts-before.contentPuts,1);});
 await scenario('lost_result_ack_does_not_publish_or_rerun',async()=>{await grant('lostresult');await cmd({cmd:'mode',value:'drop_result'});const before=await cmd({cmd:'stats'});await childProbe('lost_result_ack','lostresult');const after=await cmd({cmd:'stats'});assert.equal(after.resultPuts-before.resultPuts,1);});
 await scenario('missing_archived_receipt_holds_dependents_no_producer_replay',async()=>{
  await grant('missing');await childProbe('first','missing');await stop();
  // Deliberate test corruption of synthetic content only; production has no delete API.
  const db=new DatabaseSync(conf.databasePath);try{db.exec('DELETE FROM life_content WHERE rowid=(SELECT max(rowid) FROM life_content)');}finally{db.close();}
  await start();await grant('missing');await childProbe('missing','missing');
 });
 await scenario('sqlite_never_contains_plain_query_book_or_answer',async()=>{const b=readFileSync(conf.databasePath);for(const text of ['합성 기록의 입력','selected synthetic pages','합성 최종 답변'])assert.equal(b.includes(Buffer.from(text)),false);});
}catch(e){failure=e;console.error(e.stack??String(e));}
finally{
 try{await stop();}catch(e){failure??=e;active?.p.kill('SIGKILL');}
 key.fill(0);delete conf.key;rmSync(dir,{recursive:true,force:true});
 const result={passed:!failure,scenarios:checks.length,checks,error:failure?String(failure):null,counters,
  scope:'Actual production LifeHost/Session/Verifier/checkpoint/content transports; loopback HTTPS, SQLite AES-GCM, separate JVM and server restarts. Fixture accounts/GPT/Memoria responses/original book source. No phone/cloud deployment.',
  phoneOperations:0,productionProviderCalls:0,productionDeployment:false};
 if(evidence)writeFileSync(evidence,JSON.stringify(result,null,2));console.log('SUMMARY '+JSON.stringify({passed:result.passed,scenarios:checks.length}));
}
if(failure)process.exitCode=1;
