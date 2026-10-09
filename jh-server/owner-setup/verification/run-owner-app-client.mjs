import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {once} from 'node:events';
import {writeFileSync,rmSync} from 'node:fs';import {randomBytes} from 'node:crypto';
import {context,accountDigest,clientId,subject,jwt} from '../owner-enrollment/integration-fixture.mjs';
import {createOwnerEnrollmentHttpHandler} from '../owner-enrollment/owner-enrollment-http.mjs';
process.env.PORT='0';process.env.PUBLIC_BASE_URL='https://jh-secure-bridge-fix4.onrender.com';process.env.LIFE_HUB_TOKEN=randomBytes(32).toString('base64url');
const {httpServer,installTrustedSessionRegistry56,installOwnerEnrollmentHandler56}=await import('../server-integration/server.mjs');
if(!httpServer.listening)await once(httpServer,'listening');
const fixture=context();const authority=installTrustedSessionRegistry56(fixture.service.registry);fixture.service.installSessionAuthority(authority);
installOwnerEnrollmentHandler56(createOwnerEnrollmentHttpHandler({service:fixture.service,serverOrigin:process.env.PUBLIC_BASE_URL}));
const local='http://127.0.0.1:'+httpServer.address().port;let error=null,child,stderr='',tokens=0,finished=false;
const checks=[];let timeout;
try{
 child=spawn('java',['-cp',process.argv[2],'com.koreanlifehub.bridge.OwnerAppClientProbeKt',local,accountDigest],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH}});
 timeout=setTimeout(()=>child.kill('SIGKILL'),60000);child.stderr.on('data',b=>stderr+=b);
 for await(const line of createInterface({input:child.stdout})){
  const x=line.split('\t');
  if(x[0]==='GOOGLE_NONCE'){
    assert.match(x[1],/^[a-f0-9]{64}$/);const n=Math.floor(fixture.clock()/1000);
    const token=jwt({iss:'https://accounts.google.com',aud:clientId,azp:clientId,sub:subject,iat:n,exp:n+3600,nonce:x[1]});
    child.stdin.write('TOKEN\t'+token+'\n');tokens++;
  }else if(x[0]==='CHECK')checks.push(x[1]);else if(x[0]==='DONE')finished=true;
 }
 const exit=child.exitCode===null?(await once(child,'exit'))[0]:child.exitCode;
 assert.equal(exit,0,stderr);assert.equal(tokens,2);assert.equal(checks.length,8);assert.equal(finished,true);
}catch(e){error=String(e);}
finally{
 clearTimeout(timeout);child?.kill('SIGKILL');fixture.close();rmSync(fixture.dir,{recursive:true,force:true});httpServer.closeAllConnections();httpServer.close();
 const report={passed:error===null,checks,error,syntheticTokenCallbacks:tokens,nativeGoogleUiExecuted:false,liveGoogleTokens:0,phoneOperations:0,productionDeployment:false,
 scope:'Actual app controller/JSON/crypto/encrypted TrustJournal and actual Node owner gate/Registry/Bridge. Loopback HTTP only, synthetic issuer/software keys; not an Android device test.'};
 writeFileSync(process.argv[3],JSON.stringify(report,null,2));writeFileSync(process.argv[3]+'.stderr',stderr);
 console.log(JSON.stringify(report,null,2));
}
process.exit(error?1:0);
