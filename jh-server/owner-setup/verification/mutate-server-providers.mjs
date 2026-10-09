/** Test guards on isolated temporary copies. No production file or credential is changed. */
import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.resolve(process.argv[2]);mkdirSync(out,{recursive:true});
const cases=[
 ['exact-fetch-selection','server-worker/provider-session.mjs',"allowed.has('memory_search')&&selected.has(args.memory_id)","allowed.has('memory_search')",'fetch restricted to selected successful search IDs'],
 ['tool-definition','server-adapter/memoria-mcp-read-port.mjs',"check(stable(now)===stable(catalog),'memory_tool_definition_changed');","check(true,'memory_tool_definition_changed');",'tool definition change rejects before call'],
 ['post-generation-authorization','server-adapter/gpt-life-adapter.mjs',"assert(current?.ownerId===authorization.ownerId,'authorization_changed_after_response');","assert(true,'authorization_changed_after_response');",'existing GPT adapter rechecks authorization after response']];
const results=[];
for(const [name,file,old,next,pattern]of cases){
 const temp=mkdtempSync(path.join(tmpdir(),'jh-provider-mutation-'));
 try{
  for(const d of ['server-worker','server-adapter','deployment','owner-enrollment'])cpSync(path.join(root,d),path.join(temp,d),{recursive:true,filter:x=>!x.includes('node_modules')});
  mkdirSync(path.join(temp,'verification'));cpSync(path.join(root,'verification/provider-fixture.mjs'),path.join(temp,'verification/provider-fixture.mjs'));
  const run=()=>spawnSync(process.execPath,['--test','--test-name-pattern',pattern,'server-worker/provider-session.test.mjs'],{cwd:temp,encoding:'utf8',timeout:20000});
  let r=run();writeFileSync(path.join(out,name+'-baseline.log'),r.stdout+r.stderr);assert.equal(r.status,0);
  let s=readFileSync(path.join(temp,file),'utf8');assert.equal(s.split(old).length,2);writeFileSync(path.join(temp,file),s.replace(old,next));
  r=run();writeFileSync(path.join(out,name+'-mutation.log'),r.stdout+r.stderr);
  assert.notEqual(r.status,0);assert.match(r.stdout,/AssertionError/);assert.doesNotMatch(r.stderr,/SyntaxError|ERR_MODULE_NOT_FOUND/);
  results.push({name,baselinePassed:true,assertionDetected:true});console.log('PASS mutation '+name);
 }finally{rmSync(temp,{recursive:true,force:true});}
}
writeFileSync(path.join(out,'result.json'),JSON.stringify({count:results.length,results},null,2));
