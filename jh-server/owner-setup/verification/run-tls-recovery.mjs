/** Isolated TLS fixture. Real transport and exact server; synthetic account/key,
 * test-only JVM CA and hosts file. No external endpoint or actual phone is contacted. */
import {createServer as createTlsServer} from 'node:https';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';import {once} from 'node:events';import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {TrustedDeviceRegistry,sha256} from '../trusted-server/trusted-device-registry.mjs';
const clock={now:Date.now()};Date.now=()=>clock.now;
process.env.PORT='0';process.env.PUBLIC_BASE_URL='https://jh-secure-bridge-fix4.onrender.com';process.env.LIFE_HUB_TOKEN=randomBytes(32).toString('base64url');
const {httpServer,installTrustedSessionRegistry56}=await import('../server-integration/server.mjs');
if(!httpServer.listening)await once(httpServer,'listening');
const internal='http://127.0.0.1:'+httpServer.address().port,dir=mkdtempSync(join(tmpdir(),'jh-tls-')),context=Object.freeze({});
const registry=new TrustedDeviceRegistry({databasePath:join(dir,'trust.db'),serverDigest:sha256(process.env.PUBLIC_BASE_URL+'/mcp|jh-secure-bridge56'),catalogDigest:'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',
 authorizeEnrollment:(c,e)=>c===context?{ownerDigest:sha256('synthetic-account-only'),enrollmentId:e.consentRequestId,expiresAt:Date.now()+30000,exactConsentDigest:sha256(JSON.stringify(e))}:null,
 authorizeRevocation:c=>c===context?{ownerDigest:sha256('synthetic-account-only')}:null});
installTrustedSessionRegistry56(registry);
let drop=false,activationRequests=0,dropped=0,sinkRequests=0,httpRequests=0;const counts={};
const tls=createTlsServer({key:readFileSync('work/tls/key.pem'),cert:readFileSync('work/tls/cert.pem')},async(req,res)=>{
 httpRequests++;
 if(req.url==='/redirect-sink'){sinkRequests++;res.writeHead(200,{'content-type':'application/json'}).end('{}');return}
 const chunks=[];for await(const b of req)chunks.push(b);const bytes=Buffer.concat(chunks);const b=JSON.parse(bytes.toString());
 if(b.mode){counts[b.mode]=(counts[b.mode]||0)+1;
  if(b.mode==='redirect'){res.writeHead(307,{location:process.env.PUBLIC_BASE_URL+'/redirect-sink'}).end();return}
  if(b.mode==='html'){res.writeHead(200,{'content-type':'text/html'}).end('<html/>');return}
  if(b.mode==='oversize-header'){res.writeHead(200,{'content-type':'application/json','content-length':'40000'}).end('{}');return}
  if(b.mode==='oversize-stream'){res.writeHead(200,{'content-type':'application/json'});res.write(' '.repeat(20000));res.end(' '.repeat(20000));return}
  if(b.mode==='gzip'){res.writeHead(200,{'content-type':'application/json','content-encoding':'gzip'}).end('{}');return}
  if(b.mode==='truncated'){res.writeHead(200,{'content-type':'application/json','content-length':'100'});res.write('{}');setImmediate(()=>res.destroy());return}
  res.writeHead(200,{'content-type':'application/json'}).end('{}');return;
 }
 try{const response=await fetch(internal+req.url,{method:'POST',headers:{'content-type':'application/json'},body:bytes,signal:AbortSignal.timeout(8000)});
  const text=await response.text();
  if(req.url.endsWith('/activate')){activationRequests++;if(drop){drop=false;dropped++;res.destroy();return}}
  res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'}).end(text);
 }catch{res.writeHead(503,{'content-type':'application/json'}).end('{"ok":false}')}
});tls.on('tlsClientError',()=>{});
await new Promise((yes,no)=>{tls.once('error',no);tls.listen(443,'127.0.0.1',yes)});
const args=trusted=>[...(trusted?['-Djavax.net.ssl.trustStore='+resolve('work/tls/trust.p12'),'-Djavax.net.ssl.trustStorePassword=temporary-fixture-only']:[]),'-Djdk.net.hosts.file='+resolve('work/tls/hosts'),'-cp','work/tls-probe.jar'];
const steps=[];let failure=null;let child;
async function negative(modes,trust=true){const p=spawn('java',[...args(trust),'com.koreanlifehub.bridge.TlsTransportNegativeProbeKt',...modes],{stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
 const timer=setTimeout(()=>p.kill('SIGKILL'),25000);const [code]=await once(p,'exit');clearTimeout(timer);assert.equal(code,0,err);assert.equal(out.trim().split('\n').length,modes.length);return out.trim().split('\n').map(x=>x.split('\t')[1]);}
try{
 child=spawn('java',[...args(true),'com.koreanlifehub.bridge.TrustedRecoveryTlsProbeKt'],{stdio:['pipe','pipe','pipe']});let error='';child.stderr.on('data',b=>error+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),40000);
 for await(const line of createInterface({input:child.stdout})){
  const a=line.split('\t');
  if(a[0]==='HELLO'){
    const receipt=registry.enroll({publicKeySpki:a[1],deviceDigest:sha256('jh56|tls-recovery-fixture'),requestedTrustMs:86400000,consentRequestId:randomBytes(24).toString('base64url')},context);
    child.stdin.write(Buffer.from(JSON.stringify(receipt)).toString('base64')+'\n');
  }else if(a[0]==='ADVANCE'){clock.now+=Number(a[1]);child.stdin.write(String(clock.now)+'\n')}
  else if(a[0]==='DROP_ACTIVATION'){drop=true;child.stdin.write('OK\n')}
  else if(a[0]==='STEP')steps.push(a[1]);
  else if(a[0]==='DONE')child.stdin.end();
  else throw Error('Unexpected fixture message');
 }
 const exit=child.exitCode??(await once(child,'exit'))[0];clearTimeout(timer);assert.equal(exit,0,error);
 assert.equal(steps.length,6);assert.equal(activationRequests,4);assert.equal(dropped,1);
 steps.push('lost response produced exactly one wire activation request; no transparent replay observed on this JVM');
 const negativeResults=await negative(['redirect','html','oversize-header','oversize-stream','gzip','truncated']);
 assert.equal(sinkRequests,0);for(const m of negativeResults)assert.equal(counts[m],1);
 steps.push('redirect, content type, oversized body, encoding and truncated responses rejected');
 const before=httpRequests;await negative(['untrusted-ca'],false);assert.equal(httpRequests,before);steps.push('untrusted TLS certificate rejected before HTTP request');
 // Certificate trusted by the fixture CA but containing a different hostname.
 tls.setSecureContext({key:readFileSync('work/tls/wrong-key.pem'),cert:readFileSync('work/tls/wrong-cert.pem')});
 await negative(['wrong-hostname']);assert.equal(httpRequests,before);steps.push('trusted CA with wrong hostname rejected before HTTP request');
}catch(e){failure=e}
finally{child?.kill('SIGTERM');await new Promise(r=>tls.close(r));await new Promise(r=>httpServer.close(r));registry.close();rmSync(dir,{recursive:true,force:true});
 const result={passed:!failure,steps,error:failure?String(failure):null,activationRequests,droppedActivationResponses:dropped,negativeRequests:counts,redirectSinkRequests:sinkRequests,
  scope:'actual HTTPS Java transport and exact Kotlin/Node session+recovery protocol, loopback-only; synthetic account/software key/test CA; accelerated session clock; NOT Android Keystore or production TLS/phone',productionCalls:0,phoneOperations:0};
 writeFileSync('evidence/tls-recovery-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
if(failure)process.exitCode=1;
