// Synthetic local test only. No network or real session credentials.
import {readFileSync} from 'node:fs';
import {TrustedDeviceRegistry} from './trusted-device-registry.mjs';
const i=JSON.parse(readFileSync(process.argv[2],'utf8'));
const r=new TrustedDeviceRegistry({databasePath:i.path,serverDigest:i.server,catalogDigest:i.catalog,
 now:()=>i.now,authorizeEnrollment:()=>null,authorizeRevocation:()=>null});
try{r.verifyReconnectProof(i.proof);console.log(JSON.stringify({ok:true}));}
catch(e){console.log(JSON.stringify({ok:false,code:e.code??'ERROR'}));}
finally{r.close();}
