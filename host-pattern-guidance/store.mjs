/** Private local storage only. Cooperating writers use lock + revision CAS.
 * External Library writes still require its version guard and readback.
 */
import {constants} from 'node:fs';
import {open,lstat,realpath,link,rename,unlink} from 'node:fs/promises';
import {dirname,basename,resolve,isAbsolute,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createState,validateState,mutate,detectPatterns,evaluateProposal,challenge,context,MAX_BYTES,check,fail} from './engine.mjs';
async function pathOf(path){check(typeof path==='string'&&isAbsolute(path),'PATTERN_STORE_PATH');return join(await realpath(dirname(resolve(path))),basename(path));}
function regular(s){check(s.isFile()&&s.nlink===1,'PATTERN_STORE_UNSAFE');if(process.platform!=='win32')check((s.mode&0o077)===0,'PATTERN_STORE_PERMISSIONS');check(s.size<=MAX_BYTES,'PATTERN_CAPACITY');}
async function read(path){const before=await lstat(path);regular(before);const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const current=await f.stat();regular(current);check(before.ino===current.ino&&before.dev===current.dev,'PATTERN_STORE_CHANGED');return await f.readFile('utf8');}finally{await f.close();}}
async function locked(path,fn){let lock;try{lock=await open(path+'.lock','wx',0o600);}catch(e){if(e.code==='EEXIST')fail('PATTERN_STORE_BUSY');throw e;}
 const identity=await lock.stat();try{return await fn();}finally{await lock.close();try{const stat=await lstat(path+'.lock');if(stat.ino===identity.ino&&stat.dev===identity.dev)await unlink(path+'.lock');}catch(e){if(e.code!=='ENOENT')throw e;}}}
async function save(path,state,old){const temp=path+'.'+randomUUID()+'.tmp';let f;try{f=await open(temp,'wx',0o600);const bytes=JSON.stringify(state);check(Buffer.byteLength(bytes)<=MAX_BYTES,'PATTERN_CAPACITY');await f.writeFile(bytes);await f.sync();await f.close();f=null;
 if(old===null){try{await link(temp,path);}catch(e){if(e.code==='EEXIST')fail('PATTERN_STORE_EXISTS');throw e;}}
 else{check(await read(path)===old,'PATTERN_STORE_CHANGED');await rename(temp,path);}
 }finally{if(f)await f.close();try{await unlink(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}}
function decode(raw,owner){let s;try{s=JSON.parse(raw);}catch{fail('PATTERN_STORE_INVALID_JSON');}s=validateState(s);check(s.ownerScope===owner,'PATTERN_OWNER_MISMATCH');return s;}
export async function execute(command,{store,owner,input={}}){check(typeof owner==='string'&&owner.length>0,'PATTERN_OWNER_REQUIRED');const path=await pathOf(store);
 if(command==='init')return locked(path,async()=>{const s=createState({ownerScope:owner,now:input.now});await save(path,s,null);return {ok:true,revision:0,result:{initialized:true}};});
 if(command==='mutate')return locked(path,async()=>{const raw=await read(path),s=decode(raw,owner),next=mutate(s,input);validateState(next.state);if(next.result.changed)await save(path,next.state,raw);return {ok:true,revision:next.state.revision,result:next.result};});
 const s=decode(await read(path),owner);const readers={patterns:detectPatterns,evaluate:evaluateProposal,challenge,context};
 check(command==='validate'||Object.hasOwn(readers,command),'PATTERN_COMMAND_INVALID');
 return {ok:true,revision:s.revision,result:command==='validate'?{valid:true,schema:s.schema}:readers[command](s,input)};
}
