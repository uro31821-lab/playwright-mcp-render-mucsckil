import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {once} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {randomBytes,createHmac} from 'node:crypto';import assert from 'node:assert/strict';
import {TrustedDeviceRegistry,sha256} from '../trusted-server/trusted-device-registry.mjs';
import {TrustedSettingsService} from '../trusted-server/trusted-settings-service.mjs';
process.env.PORT='0';process.env.PUBLIC_BASE_URL='https://jh-secure-bridge-fix4.onrender.com';process.env.LIFE_HUB_TOKEN=randomBytes(32).toString('base64url');
const {httpServer,installTrustedSessionRegistry56}=await import('../server-integration/server.mjs');
if(!httpServer.listening)await once(httpServer,'listening');
const origin='http://127.0.0.1:'+httpServer.address().port;
const dir=mkdtempSync(join(tmpdir(),'jh-real-wire-')),context=Object.freeze({}),deviceId='synthetic-jvm-only';
const server=sha256(process.env.PUBLIC_BASE_URL+'/mcp|jh-secure-bridge56'),catalog='a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
const registry=new TrustedDeviceRegistry({databasePath:join(dir,'trust.db'),serverDigest:server,catalogDigest:catalog,
 authorizeEnrollment:(ctx,e)=>ctx===context?{ownerDigest:sha256('synthetic-owner'),enrollmentId:e.consentRequestId,expiresAt:Date.now()+30000,exactConsentDigest:sha256(JSON.stringify(e))}:null,
 authorizeRevocation:ctx=>ctx===context?{ownerDigest:sha256('synthetic-owner')}:null});
const checks=[];let failure=null;let child,lines,childErrors='',receipt,offer,authority,mcpRequest;
const request=async(route,body,headers={})=>{
 const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
 return {status:response.status,text:await response.text(),cache:response.headers.get('cache-control')};
};
async function next(){const v=await lines.next();assert.equal(v.done,false,childErrors);return v.value.split('\t');}
function send(x){child.stdin.write(x.join('\t')+'\n')}
let timeout;
try{
 assert.equal((await request('/device/trusted/challenge',{})).status,404);checks.push('trust endpoints disabled until host explicitly installs registry');
 authority=installTrustedSessionRegistry56(registry);
 assert.throws(()=>installTrustedSessionRegistry56(registry),/ALREADY_INSTALLED/);
 assert.equal((await request('/device/trusted/enroll',{})).status,404);checks.push('no public enrollment or body-confirmation route');
 assert.equal((await request('/device/trusted/challenge',{confirmed:true})).status,400);checks.push('body boolean cannot create trust');
 child=spawn('java',['-jar',process.argv[2]],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH}});
 timeout=setTimeout(()=>child.kill('SIGKILL'),30000);child.stderr.on('data',b=>childErrors+=b.toString());lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
 const hello=await next();assert.equal(hello[0],'HELLO');
 receipt=registry.enroll({publicKeySpki:hello[1],deviceDigest:sha256('jh56|'+deviceId),requestedTrustMs:86400000,consentRequestId:randomBytes(24).toString('base64url')},context);
 const cResponse=await request('/device/trusted/challenge',{deviceId,trustId:receipt.trustId,clientNonce:hello[2]});assert.equal(cResponse.status,200);const c=JSON.parse(cResponse.text);
 send(['CONTEXT',receipt.trustId,receipt.ownerDigest,receipt.deviceDigest,receipt.serverDigest,receipt.catalogDigest,receipt.keyDigest,receipt.createdAt,receipt.expiresAt,c.challengeId,c.serverNonce,c.issuedAt,c.expiresAt]);
 const proof=await next();assert.equal(proof[0],'PROOF');
 const exchange=await request('/device/trusted/reconnect',{deviceId,proof:{challenge:c,signature:proof[1]}});assert.equal(exchange.status,200,exchange.text);offer=JSON.parse(exchange.text);assert.equal(exchange.cache,'no-store');
 assert.equal(authority.inspectTrust(receipt.trustId).activeSessions,0);checks.push('real HTTP proof verified and pending session created without ACTIVE');
 // Legacy activation must not convert this trust pending into manual approval.
 const n=randomBytes(24).toString('base64url'),exp=Date.now()+20000,key=Buffer.from(offer.secureSessionSecret,'base64url');
 const mac=createHmac('sha256',key).update(`activate|${offer.secureSessionId}|${offer.deviceDigest}|${n}|${exp}`).digest('hex');
 const legacy=await request('/device/activate',{deviceId,sessionDigest:offer.sessionDigest},{'x-jh-session':offer.secureSessionId,'x-jh-device':offer.deviceDigest,'x-jh-nonce':n,'x-jh-expires':String(exp),'x-jh-mac':mac});
 assert.equal(legacy.status,401);checks.push('legacy approval endpoint rejects trusted pending even with valid legacy MAC');
 const oFields=['version','code','purpose','trustId','challengeId','clientNonce','redemptionId','ownerDigest','deviceDigest','serverIdentityDigest','toolCatalogDigest','secureSessionId','secureSessionSecret','sessionDigest','secureExpiresAt','activationExpiresAt','sessionActive','actionApprovalGranted','screenConsentGranted'];
 send(['OFFER',...oFields.map(k=>offer[k])]);
 const a=await next();assert.equal(a[0],'ACTIVATE');const activation=Object.fromEntries(['trustId','challengeId','redemptionId','sessionId','deviceDigest','sessionDigest','nonce','expiresAt','mac'].map((k,i)=>[k,k==='expiresAt'?Number(a[i+1]):a[i+1]]));
 const activationResponse=await request('/device/trusted/activate',{deviceId,...activation});assert.equal(activationResponse.status,200,activationResponse.text);const confirmed=JSON.parse(activationResponse.text);
 const rFields=['version','code','purpose','trustId','challengeId','redemptionId','sessionId','deviceDigest','sessionDigest','nonce','expiresAt','mac','actionApprovalGranted','screenConsentGranted'];send(['CONFIRMED',...rFields.map(k=>confirmed[k])]);
 assert.equal((await next())[0],'ACTIVE');checks.push('real Kotlin session validates confirmation MAC and becomes ACTIVE');
 const taskDigest=sha256('synthetic-read-only-status-test');
 mcpRequest=request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'life_android_secure_status',arguments:{task_digest:taskDigest}}},{authorization:'Bearer '+process.env.LIFE_HUB_TOKEN,accept:'application/json, text/event-stream'});
 await new Promise(r=>setTimeout(r,100));send(['GET_POLL']);const pp=await next();assert.equal(pp[0],'POLL');
 const ph={'x-jh-session':pp[1],'x-jh-device':pp[2],'x-jh-nonce':pp[3],'x-jh-expires':pp[4],'x-jh-mac':pp[5]};
 const jobResponse=await request('/device/poll?deviceId='+deviceId,undefined,ph);assert.equal(jobResponse.status,200,jobResponse.text);const j=JSON.parse(jobResponse.text);
 send(['JOB',Buffer.from(jobResponse.text).toString('base64'),j.id,j.type,j.secureSessionId,offer.deviceDigest,j.secureNonce,j.secureExpiresAt,j.securePayloadDigest,j.secureMac,taskDigest]);
 const completion=await next();assert.equal(completion[0],'COMPLETE');checks.push('existing MCP queue -> signed poll -> actual Kotlin canonicalizer and verifyServerJob -> status read');
 const body=JSON.parse(Buffer.from(completion[1],'base64').toString());
 const complete=await request('/job/'+j.id+'/complete',body,{'x-jh-session':offer.secureSessionId,'x-jh-device':offer.deviceDigest,'x-jh-result-digest':completion[2],'x-jh-nonce':completion[3],'x-jh-expires':completion[4],'x-jh-mac':completion[5]});assert.equal(complete.status,200,complete.text);
 const rpc=await mcpRequest;assert.equal(rpc.status,200);assert.match(rpc.text,/secure_status_verified/);checks.push('signed Kotlin completion accepted and actual MCP result returned');
 const settings=new TrustedSettingsService({registry,sessionAuthority:authority});const removal=await settings.remove(receipt.trustId,context);assert.equal(removal.complete,true);assert.equal(removal.deviceSideCancellationVerified,false);
 const denied=await request('/device/poll?deviceId='+deviceId,undefined,ph);assert.equal(denied.status,401);checks.push('settings revoke removes actual active Bridge session and future poll is denied');
 send(['REVOKED']);assert.equal((await next())[0],'DONE');child.stdin.end();
 const exit=await once(child,'exit');assert.equal(exit[0],0,childErrors);
}catch(e){failure=e;}
finally{
 clearTimeout(timeout);child?.kill('SIGTERM');
 // Complete any already-started local read request before closing; no live device is involved.
 if(mcpRequest)await mcpRequest.catch(()=>{});
 await new Promise(resolve=>httpServer.close(resolve));registry.close();rmSync(dir,{recursive:true,force:true});
 const result={passed:!failure,checks,error:failure?String(failure)+' '+childErrors:null,scope:'real local HTTP server and actual Kotlin/JVM classes; synthetic owner enrollment and software test key; not Android phone',phoneOperations:0,productionDeployments:0};
 writeFileSync(process.argv[3]||'evidence/http-kotlin-wire.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:checks.length,error:result.error},null,2));
}
if(failure)process.exitCode=1;
