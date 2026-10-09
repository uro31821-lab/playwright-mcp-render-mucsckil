/** Real Kotlin HTTPS client + existing LifeSession/Verifier + Node SQLite backend in separate
 * processes. All accounts, tokens, provider outcomes and certificates are test fixtures. */
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {canonical} from '../server-continuation/life-checkpoint-wire.mjs';
const jar=resolve(process.argv[2]);const evidence=process.argv[3]?resolve(process.argv[3]):null;
const dir=mkdtempSync(join(tmpdir(),'jh-continuation-tls-')),key=randomBytes(32),serverDigest='c'.repeat(64),owner='a'.repeat(64),token=randomBytes(32).toString('hex');
const conf={databasePath:join(dir,'life.db'),key:key.toString('hex'),serverDigest,owner,token,tlsKey:join(dir,'leaf.key'),tlsCert:join(dir,'leaf.pem'),wrongKey:join(dir,'wrong.key'),wrongCert:join(dir,'wrong.pem')};
let active=null;const checks=[];let failure=null;const totals=[];
function exec(bin,args){execFileSync(bin,args,{stdio:['ignore','pipe','pipe'],timeout:20000});}
function makeTls(){
 exec('openssl',['req','-x509','-newkey','rsa:2048','-keyout',join(dir,'ca.key'),'-out',join(dir,'ca.pem'),'-nodes','-subj','/CN=JH TEST ONLY CA','-days','1']);
 for(const [name,host] of [['leaf','localhost'],['wrong','not-localhost.invalid']]){
  exec('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',join(dir,name+'.key'),'-out',join(dir,name+'.csr'),'-subj','/CN='+host]);
  writeFileSync(join(dir,name+'.ext'),'subjectAltName=DNS:'+host+'\nextendedKeyUsage=serverAuth\n');
  exec('openssl',['x509','-req','-in',join(dir,name+'.csr'),'-CA',join(dir,'ca.pem'),'-CAkey',join(dir,'ca.key'),'-CAcreateserial','-out',join(dir,name+'.pem'),'-days','1','-extfile',join(dir,name+'.ext')]);
 }
 exec('keytool',['-importcert','-noprompt','-alias','jh-fixture-ca','-file',join(dir,'ca.pem'),'-keystore',join(dir,'trust.p12'),'-storetype','PKCS12','-storepass','fixture-only-password']);
 // Standard JVM hosts resolution only. No production TLS verifier or socket factory is replaced.
 writeFileSync(join(dir,'hosts'),'127.0.0.1 localhost\n');
}
async function start(){
 const p=spawn(process.execPath,[new URL('./continuation-server-fixture.mjs',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});
 let stderr='';p.stderr.on('data',b=>stderr+=b);const lines=createInterface({input:p.stdout})[Symbol.asyncIterator]();
 const ended=new Promise(resolve=>p.once('exit',(code,signal)=>resolve({code,signal,stderr})));
 p.stdin.write(JSON.stringify(conf)+'\n');const first=JSON.parse((await lines.next()).value);assert.equal(first.event,'ready');
 return {p,lines,ended,origin:'https://localhost:'+first.port};
}
async function cmd(x){active.p.stdin.write(JSON.stringify(x)+'\n');return JSON.parse((await active.lines.next()).value);}
async function stop(kill=false){if(!active)return;const a=active;
 if(kill)a.p.kill('SIGKILL');else{await cmd({cmd:'close'});a.p.stdin.end();}
 const exit=await a.ended;if(!kill)assert.equal(exit.code,0,exit.stderr);active=null;
}
async function probe(mode,workflow,{trusted=true,overrideToken=token,expectedExit=0}={}){
 const args=[...(trusted?['-Djavax.net.ssl.trustStore='+join(dir,'trust.p12'),'-Djavax.net.ssl.trustStorePassword=fixture-only-password']:[]),
  '-Djdk.net.hosts.file='+join(dir,'hosts'),'-cp',jar,'com.koreanlifehub.bridge.LifeContinuationTlsProbe'];
 const child=spawn('java',args,{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
 child.stdin.end(canonical({mode,workflow,origin:active.origin,owner,server:serverDigest,token:overrideToken})+'\n');
 const result=await exit;clearTimeout(timer);assert.equal(result.code,expectedExit,mode+':'+out+'\n'+err);
 if(expectedExit===0)assert.match(out,/PASS /);return out.trim();
}
async function scenario(name,fn){await fn();checks.push({name,passed:true});console.log('PASS '+name);}
try{
 makeTls();new LifeCheckpointStore({...conf,key,initialize:true}).close();active=await start();
 await scenario('separate_jvm_first_wave_persisted',()=>probe('first_wave','resume_fixture'));
 await scenario('server_sigkill_and_new_jvm_execute_remaining_wave_only',async()=>{totals.push(await cmd({cmd:'stats'}));await stop(true);active=await start();await probe('resume_wave','resume_fixture');});
 await scenario('killed_inflight_client_is_held_without_replay',async()=>{await probe('crash_inflight','crash_fixture',{expectedExit:73});await probe('hold_after_crash','crash_fixture');});
 await scenario('second_client_cancel_blocks_late_success',()=>probe('cancel_during_call','cancel_fixture'));
 await scenario('cancel_survives_server_restart',async()=>{totals.push(await cmd({cmd:'stats'}));await stop(true);active=await start();await probe('read_cancelled','cancel_fixture');});
 await scenario('lost_cas_reply_reconciled_by_read_not_retry',async()=>{await cmd({cmd:'mode',value:'drop'});await probe('lost_ack','lost_fixture');const s=await cmd({cmd:'stats'});assert.equal(s.writes.lost_fixture,1);assert.equal(s.dropped,1);});
 await scenario('wrong_authentication_rejected',()=>probe('negative','negative_fixture',{overrideToken:'0'.repeat(64)}));
 for(const mode of ['redirect','html','oversize','gzip','truncated']){
  await scenario('https_'+mode+'_rejected_without_retry',async()=>{await cmd({cmd:'mode',value:mode});const before=await cmd({cmd:'stats'});await probe('negative','negative_fixture');const after=await cmd({cmd:'stats'});assert.equal(after.requests-before.requests,1);assert.equal(after.sinks,0);});
 }
 await cmd({cmd:'mode',value:'normal'});
 await scenario('default_jvm_trust_rejects_test_ca',async()=>{const before=await cmd({cmd:'stats'});await probe('negative','negative_fixture',{trusted:false});const after=await cmd({cmd:'stats'});assert.equal(after.requests,before.requests);});
 await scenario('trusted_ca_wrong_hostname_rejected',async()=>{await cmd({cmd:'mode',value:'wrong-hostname'});const before=await cmd({cmd:'stats'});await probe('negative','negative_fixture');const after=await cmd({cmd:'stats'});assert.equal(after.requests,before.requests);});
 totals.push(await cmd({cmd:'stats'}));
}catch(e){failure=e;console.error(e.stack??String(e));}
finally{
 try{await stop();}catch(e){failure??=e;active?.p.kill('SIGKILL');}
 key.fill(0);delete conf.key;rmSync(dir,{recursive:true,force:true});
 const result={passed:!failure,scenarios:checks.length,checks,error:failure?String(failure):null,statsByServerProcess:totals,
  scope:'Actual JVM production Session/Verifier/HTTPS and Node encrypted SQLite in loopback processes; synthetic narrow-scope authentication, provider results, software keys and test CA. Not real account/phone/cloud deployment or source/receipt body migration.',
  phoneOperations:0,productionNetworkCalls:0,productionDeployment:false};
 if(evidence)writeFileSync(evidence,JSON.stringify(result,null,2));
 console.log('SUMMARY '+JSON.stringify({passed:result.passed,scenarios:checks.length}));
}
if(failure)process.exitCode=1;
