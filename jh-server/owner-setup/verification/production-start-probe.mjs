/** Test-only harness. Real startup code & databases & HTTP; the mount record is
 * synthetic because the test worker filesystem is ephemeral. No live login. */
import {loadOwnerConfiguration,loadOwnerKey} from '../deployment/owner-config.mjs';
import {startConfiguredOwnerServer,safeErrorCode} from '../deployment/owner-service-entry.mjs';
const config=loadOwnerConfiguration(process.env.JH_OWNER_CONFIG_FILE);
const key=loadOwnerKey(process.env.JH_OWNER_KEY_FILE,config);
const observations={mountInfo:`1 0 0:1 / / rw - overlay overlay rw\n2 1 8:1 / ${config.storageMount} rw,nosuid - ext4 /dev/test rw\n`,filesystemType:0xef53};
try{
 const server=await startConfiguredOwnerServer({config,key,port:0,bindAddress:'127.0.0.1',storageObservations:observations});key.fill(0);
 console.log('READY '+server.port);
 process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{
  if(s.trim()==='CRASH')process.exit(23);
  if(s.trim()==='CLOSE')void server.close().then(()=>process.exit(0));
 });
}catch(e){key.fill(0);console.error(safeErrorCode(e));process.exit(1);}
