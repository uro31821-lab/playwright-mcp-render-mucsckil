/** Test helper only; synthetic identity provider and ephemeral software keys. */
import {OAuth2Client} from 'google-auth-library';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {EnrollmentStore} from './enrollment-store.mjs';
import {GoogleOwnerVerifier,enrollmentMessage} from './owner-enrollment.mjs';
import {createOwnerRegistryService,outcomeMaterial,STATUS_PURPOSE,CANCEL_PURPOSE} from './owner-registry-service.mjs';
export {STATUS_PURPOSE,CANCEL_PURPOSE};
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const clientId='fixture-client.apps.googleusercontent.com',subject='fixture-owner-001';
export const origin='https://jh-secure-bridge-fix4.onrender.com';
export const catalog='a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
export const issuer=generateKeyPairSync('rsa',{modulusLength:2048}),cert=issuer.publicKey.export({format:'pem',type:'spki'});
export const accountDigest=hash('JH_GOOGLE_OWNER_V1|https://accounts.google.com|'+subject+'|'+clientId);
export function jwt(claims,key=issuer.privateKey){const a=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'fixture'})).toString('base64url'),b=Buffer.from(JSON.stringify(claims)).toString('base64url'),m=a+'.'+b;return m+'.'+sign('RSA-SHA256',Buffer.from(m),key).toString('base64url');}
export function context(t){
 const dir=mkdtempSync(join(tmpdir(),'jh-owner-join-'));chmodSync(dir,0o700);let now=Date.now();const clock=()=>now;
 const config={filename:join(dir,'owner.db'),key:randomBytes(32),epoch:'fixture-integrated-epoch-0001'};
 const store=new EnrollmentStore({...config,initialize:true});const client=new OAuth2Client();client.getFederatedSignonCertsAsync=async()=>({certs:{fixture:cert},format:'PEM'});
 const verifier=new GoogleOwnerVerifier({clientId,allowedSubjects:[subject],clock,oauthClient:client});
 const serviceConfig={store,verifier,serverOrigin:origin,catalogDigest:catalog,registryPath:join(dir,'registry.db'),clock};
 const service=createOwnerRegistryService({...serviceConfig,initializeRegistry:true});
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=key.publicKey.export({format:'der',type:'spki'}).toString('base64url');
 const deviceId='fixture-'+randomBytes(12).toString('hex'),deviceDigest=hash('jh56|'+deviceId);
 const begin=extra=>service.begin({publicKeySpki:spki,deviceDigest,durationDays:7,...extra});
 const make=(i,claims={},privateKey=key.privateKey)=>{const n=Math.floor(clock()/1000);return {requestId:i.requestId,idToken:jwt({iss:'https://accounts.google.com',aud:clientId,azp:clientId,sub:subject,iat:n,exp:n+3600,nonce:i.googleNonce,...claims}),consentSignature:sign('sha256',enrollmentMessage(i.manifestDigest,accountDigest),privateKey).toString('base64url')};};
 const proof=(i,purpose=STATUS_PURPOSE,svc=service,privateKey=key.privateKey)=>{const challenge=svc.outcomeChallenge({requestId:i.requestId,purpose});return {challenge,signature:sign('sha256',outcomeMaterial(challenge),privateKey).toString('base64url')};};
 const close=()=>{try{service.close();}catch{}store.close();};t?.after(()=>{close();rmSync(dir,{recursive:true,force:true});});
 return {dir,config,store,client,verifier,serviceConfig,service,key,spki,deviceId,deviceDigest,clock,advance:ms=>now+=ms,begin,make,proof,close};
}
