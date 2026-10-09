// Synthetic test-only process. Configuration/temporary key arrives on stdin, never CLI or logs.
import {createInterface} from 'node:readline';
import {LifeCheckpointStore} from './life-checkpoint-store.mjs';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();
const x=JSON.parse((await lines.next()).value),key=Buffer.from(x.key,'hex');
const store=new LifeCheckpointStore({...x,key});console.log('READY');await lines.next();
try{store.workerOperation(x.owner,x.request,{workerDigest:x.worker,readOnlyTasks:new Set(['task_a'])},100000);console.log('WON');}
catch(e){console.log(e.code??'FAILED');}finally{store.close();key.fill(0);}
