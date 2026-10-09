// Test-only multi-process CAS contender. Reads ephemeral fixture secrets from stdin, never argv/logs.
import {createInterface} from 'node:readline';
import {LifeCheckpointStore} from './life-checkpoint-store.mjs';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();
const config=JSON.parse((await lines.next()).value);config.key=Buffer.from(config.key,'hex');
const store=new LifeCheckpointStore(config);config.key.fill(0);console.log('READY');
try{if((await lines.next()).value!=='GO')throw Error('fixture_protocol');try{store.compareAndSet(config.owner,config.checkpoint,0);console.log('WON');}catch(e){if(e.code!=='checkpoint_conflict')throw e;console.log(e.code);}}
finally{store.close();}
