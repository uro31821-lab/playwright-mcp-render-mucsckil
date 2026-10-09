// Test-only process. Input is ephemeral synthetic material over stdin, not argv.
import {OAuth2Client} from 'google-auth-library';
import {EnrollmentStore} from './enrollment-store.mjs';
import {GoogleOwnerVerifier} from './owner-enrollment.mjs';
import {createOwnerRegistryService} from './owner-registry-service.mjs';
let text='';for await(const b of process.stdin)text+=b;const p=JSON.parse(text);text='';
const store=new EnrollmentStore({...p.config,key:Buffer.from(p.config.key,'base64')});
const client=new OAuth2Client();client.getFederatedSignonCertsAsync=async()=>({certs:{fixture:p.cert},format:'PEM'});
const clock=()=>p.now;const verifier=new GoogleOwnerVerifier({clientId:p.clientId,allowedSubjects:[p.subject],clock,oauthClient:client});
const service=createOwnerRegistryService({store,verifier,registryPath:p.registryPath,serverOrigin:p.origin,catalogDigest:p.catalog,clock});
if(p.mode==='after-insert'){const original=service.registry.enroll.bind(service.registry);service.registry.enroll=(...a)=>{original(...a);process.exit(83)};}
if(p.mode==='before-insert')service.registry.enroll=()=>{process.exit(82)};
if(p.mode==='cancel-before-revoke')service.registry.revoke=()=>{process.exit(84)};
try{const r=p.mode==='cancel-before-revoke'?await service.cancel(p.input):await service.finish(p.input);console.log(JSON.stringify({code:r.code}));}
catch(e){console.log(JSON.stringify({code:e.code||'ERROR'}));}
finally{service.close();store.close();}
