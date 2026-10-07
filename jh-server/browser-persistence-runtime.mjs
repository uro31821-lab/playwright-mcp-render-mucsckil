import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const PARENT='8f4f205ada0c00b5af99a99bdba3966d5b7825761fb3ecd53627156330fd63e4';
const EVENTS='4ac90e7825857fd332f8423c5efca2d7e60e3819c587c8b9336182eb584504b6';
const BEFORE='const browserTransport = createBrowserTransport();';
const AFTER='const browserTransport = withBrowserEvents(createBrowserTransport());';
const IMPORT='import {withBrowserEvents} from "../../browser-events.mjs";\n';
export function prepareBrowserPersistenceRuntime(input){
 const bytes=readFileSync(input);
 if(sha(bytes)!==PARENT||sha(readFileSync(new URL('./browser-events.mjs',import.meta.url)))!==EVENTS)throw Error('browser_persistence_identity_mismatch');
 const source=bytes.toString('utf8');
 if(source.split(BEFORE).length!==2)throw Error('browser_persistence_anchor_mismatch');
 const output=IMPORT+source.replace(BEFORE,AFTER);
 if(output.slice(IMPORT.length).replace(AFTER,BEFORE)!==source)throw Error('browser_persistence_scope_mismatch');
 const target=new URL('./verification-output/candidate/server-browser-persistence.mjs',import.meta.url);
 const temp=new URL('./verification-output/candidate/server-browser-persistence.mjs.tmp',import.meta.url);
 writeFileSync(temp,output,{mode:0o600});renameSync(temp,target);
 if(sha(readFileSync(target))!==sha(output))throw Error('browser_persistence_readback_mismatch');
 return target;
}
