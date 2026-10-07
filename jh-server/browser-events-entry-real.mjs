// CI-only complete JH entry -> unchanged bearer proxy -> real pinned Chromium.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const temp=mkdtempSync(join(tmpdir(),'jh-real-entry-'));
const preload=join(temp,'map.mjs');
writeFileSync(preload,`const f=globalThis.fetch;globalThis.fetch=(u,o)=>f(String(u)==='https://playwright-mcp-yzcy.onrender.com/mcp'?'http://127.0.0.1:18937/mcp':u,o);`);
let pageLoads=0;
const page=createServer((q,r)=>{if(q.url==='/')pageLoads++;r.writeHead(200,{'content-type':'text/html'});r.end('<title>JH Complete Entry Page</title><h1>JH Complete Entry Page</h1>');});
await new Promise(r=>page.listen(18938,'127.0.0.1',r));
const child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'auth-diagnostics-entry.mjs'],{env:{PATH:process.env.PATH,PORT:'18939',PUBLIC_BASE_URL:'https://fixture.invalid',LIFE_HUB_TOKEN:'a'.repeat(32),JH_BROWSER_MCP_URL:'https://playwright-mcp-yzcy.onrender.com/mcp',JH_BROWSER_MCP_TOKEN:'synthetic-test-browser-events-token'},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',x=>{log+=x;});child.stderr.on('data',x=>{log+=x;});
const client=new Client({name:'jh-real-entry',version:'1'},{capabilities:{}});
try{
 let ready=false;for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error(log);try{await fetch('http://127.0.0.1:18939/',{signal:AbortSignal.timeout(100)});ready=true;break;}catch{}await delay(50);}assert(ready);
 await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:18939/mcp'),{requestInit:{headers:{authorization:'Bearer '+'a'.repeat(32)}}}));
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return r.content.map(x=>x.text||'').join('\n');};
 assert((await call('life_web_navigate',{url:'http://127.0.0.1:18938/'})).includes('JH Complete Entry Page'));
 for(const wait of[6000,6000,6000]){await delay(wait);assert((await call('life_web_snapshot')).includes('JH Complete Entry Page'));}
 assert.equal(pageLoads,1);
 assert(!log.includes('a'.repeat(32))&&!log.includes('synthetic-test-browser-events-token'));
 console.log('FULL_ENTRY_REAL_BROWSER_PASS',JSON.stringify({unchangedAuthProxy:true,delayedReadbacks:3,pageLoads,retained:true}));
}finally{
 await client.close().catch(()=>{});
 child.kill('SIGTERM');await delay(200);if(child.exitCode===null)child.kill('SIGKILL');
 page.closeAllConnections();await new Promise(r=>page.close(r));rmSync(temp,{recursive:true,force:true});
}
