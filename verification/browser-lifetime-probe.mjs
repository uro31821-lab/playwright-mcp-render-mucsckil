// Exact deployed browser image + actual Chromium. Synthetic loopback page only.
// Run inside a network-none container. Baseline failure must reproduce before fix is accepted.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrowserTransport} from '../jh-server/browser-transport.mjs';
import {createBrowserSession} from '../jh-server/browser-session.mjs';
import {createBrowserSession as baselineSession} from './browser-session-before-heartbeat.mjs';
import {createBrowserHeartbeat} from '../jh-server/browser-heartbeat.mjs';
const ENDPOINT='https://playwright-mcp-yzcy.onrender.com/mcp';
const token='local-fixture-only-not-production-000000000000000000000';
const logs=[],results=[];
const proxy=spawn(process.execPath,['/work/render-auth-proxy.mjs',process.execPath,'/app/cli.js',
  '--headless','--browser','chromium','--no-sandbox','--host','127.0.0.1','--port','19131',
  '--allowed-hosts','*'],{env:{...process.env,PORT:'19130',UPSTREAM_PORT:'19131',MCP_TOKEN:token},stdio:['ignore','pipe','pipe']});
proxy.stdout.on('data',b=>logs.push(b.toString()));proxy.stderr.on('data',b=>logs.push(b.toString()));
const page=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<title>JH Local Lifetime Test</title><h1>JH Local Lifetime Test</h1><input aria-label="Sample note"><a href="/second">Next page</a>');});
await new Promise(r=>page.listen(19132,'127.0.0.1',r));
const connects=()=>new Promise(r=>{const s=connect(19130,'127.0.0.1');s.once('connect',()=>{s.destroy();r(true)});s.once('error',()=>r(false));s.setTimeout(250,()=>{s.destroy();r(false)});});
try{
  for(let i=0;i<120&&!(await connects());i++){if(proxy.exitCode!==null)throw Error('proxy_start_failed');await delay(250);}
  assert(await connects(),'proxy ready');
  for(const mode of ['baseline-direct','baseline-proxy','fixed-direct','fixed-proxy']){
    const fixed=mode.startsWith('fixed'),trace=[];
    const local='http://127.0.0.1:'+(mode.endsWith('direct')?19131:19130)+'/mcp';
    const ids=new Map();const label=s=>!s?null:(ids.has(s)?ids.get(s):(ids.set(s,ids.size+1),ids.get(s)));
    const fetchImpl=async(_,opts)=>{const m=opts.body?JSON.parse(opts.body):{};const res=await fetch(local,opts);
      trace.push({method:opts.method==='GET'?'GET_SSE':m.method??'ping_reply',tool:m.params?.name??null,
        status:res.status,session:label(new Headers(opts.headers).get('mcp-session-id')),createdSession:label(res.headers.get('mcp-session-id'))});return res;};
    const transport=createBrowserTransport({endpoint:ENDPOINT,token,timeoutMs:20000,fetchImpl});
    const session=fixed?createBrowserSession({transport,heartbeatFactory:createBrowserHeartbeat({transport,endpoint:ENDPOINT,token,fetchImpl})}):baselineSession({transport});
    const row={mode,trace};results.push(row);
    try{
      row.navigate=await session.tool('browser_navigate',{url:'http://127.0.0.1:19132/first'});assert(!row.navigate.isError);
      await delay(6500); // Longer than the actual upstream's default 5000ms ping deadline.
      row.snapshot=await session.tool('browser_snapshot',{});assert(!row.snapshot.isError);
      row.persisted=JSON.stringify(row.snapshot).includes('JH Local Lifetime Test');
      assert.equal(row.persisted,fixed,mode+' 6.5-second page lifetime');
      if(fixed){
        const text=row.snapshot.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
        const ref=/textbox "Sample note"[^\n]*\[ref=(\w+)\]/.exec(text)?.[1];assert(ref,'live textbox reference');
        const typed=await session.tool('browser_type',{element:'Sample note',ref,text:'retained test note'});assert(!typed.isError);
        await delay(6500);row.inputSnapshot=await session.tool('browser_snapshot',{});assert(!row.inputSnapshot.isError);
        const current=row.inputSnapshot.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
        assert(current.includes('retained test note'),'input retained after another heartbeat period');
        const link=/link "Next page"[^\n]*\[ref=(\w+)\]/.exec(current)?.[1];assert(link);
        const clicked=await session.tool('browser_click',{element:'Next page',ref:link});assert(!clicked.isError);
        row.linkSnapshot=await session.tool('browser_snapshot',{});assert(JSON.stringify(row.linkSnapshot).includes('19132/second'));
        row.pingReplies=trace.filter(x=>x.method==='ping_reply').length;assert(row.pingReplies>=3);
        assert.equal(trace.filter(x=>x.method==='initialize').length,1,'no session replacement during use');
        assert.equal(trace.filter(x=>x.tool==='browser_type').length,1);assert.equal(trace.filter(x=>x.tool==='browser_click').length,1);
      }else assert(trace.some(x=>x.status===404),'baseline loses its session');
      assert.equal(trace.filter(x=>x.tool==='browser_navigate').length,1,'no navigation replay');row.passed=true;
    }finally{session.close?.();}
  }
  console.log('ACTUAL_CHROMIUM_PAGE_LIFETIME_CONFIRMED',JSON.stringify(results.map(x=>({mode:x.mode,passed:x.passed,persisted:x.persisted,pingReplies:x.pingReplies}))));
}finally{
  writeFileSync('/out/probe.json',JSON.stringify(results,null,2));
  proxy.kill('SIGTERM');page.close();await Promise.race([new Promise(r=>proxy.once('exit',r)),delay(3000)]);
  if(proxy.exitCode===null)proxy.kill('SIGKILL');writeFileSync('/out/proxy.log',logs.join(''));
}
