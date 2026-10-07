// Diagnostic only: pinned browser image, real Chromium, isolated local page.
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrowserTransport} from '../jh-server/browser-transport.mjs';
import {createBrowserSession} from '../jh-server/browser-session.mjs';
const out='/out';
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(p,x.name)):[join(p,x.name)]);
const paths=walk('/app').filter(p=>/\.(?:mjs|cjs|js)$/.test(p));
writeFileSync(out+'/source-paths.txt',paths.filter(p=>/mcp|\/http\./i.test(p)).join('\n'));
let snippets='';
for(const p of paths){
  if(!/http|transport|mcpBundle/i.test(p))continue;
  const text=readFileSync(p,'utf8');
  if(!/StreamableHTTPServerTransport|sessions\.get|sessions =|_sessions/.test(text))continue;
  if(text.length<100000)snippets+='\n=== '+p+' ===\n'+text+'\n';
  else {const lines=text.split('\n');for(let i=0;i<lines.length;i++)if(/function.*(StreamableHTTP|streamable|Http)|sessions\.get|sessions =|sessions\.delete|onclose\s*=|connectionCount|disconnected/.test(lines[i]))snippets+='\n=== '+p+':'+(i+1)+' ===\n'+lines.slice(Math.max(0,i-8),i+35).join('\n')+'\n';}
}
writeFileSync(out+'/transport-source.txt',snippets.slice(0,250000));
const token='local-fixture-only-not-production-000000000000000000000';
const logs=[];
const proxy=spawn(process.execPath,['/work/render-auth-proxy.mjs',process.execPath,'/app/cli.js',
  '--headless','--browser','chromium','--no-sandbox','--host','127.0.0.1','--port','19131',
  '--allowed-hosts','127.0.0.1'],{env:{...process.env,PORT:'19130',UPSTREAM_PORT:'19131',MCP_TOKEN:token},stdio:['ignore','pipe','pipe']});
proxy.stdout.on('data',b=>logs.push(b.toString()));proxy.stderr.on('data',b=>logs.push(b.toString()));
const page=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<title>JH Local Lifetime Test</title><h1>JH Local Lifetime Test</h1><input aria-label="Sample note"><a href="/second">Next page</a>');});
await new Promise(r=>page.listen(19132,'127.0.0.1',r));
const connects=()=>new Promise(r=>{const s=connect(19130,'127.0.0.1');s.once('connect',()=>{s.destroy();r(true)});s.once('error',()=>r(false));s.setTimeout(250,()=>{s.destroy();r(false)});});
const results=[];
try{
  for(let i=0;i<120&&!(await connects());i++){if(proxy.exitCode!==null)throw Error('proxy_start_failed');await delay(250);}
  if(!(await connects()))throw Error('proxy_start_timeout');
  for(const mode of ['direct','proxy']){
    const trace=[];const local='http://127.0.0.1:'+(mode==='direct'?19131:19130)+'/mcp';
    const ids=new Map();const sidLabel=s=>!s?null:(ids.has(s)?ids.get(s):(ids.set(s,ids.size+1),ids.get(s)));
    const transport=createBrowserTransport({endpoint:'https://playwright-mcp-yzcy.onrender.com/mcp',token,
      timeoutMs:20000,fetchImpl:async(_,opts)=>{const req=JSON.parse(opts.body);const res=await fetch(local,opts);
        trace.push({method:req.method,tool:req.params?.name??null,status:res.status,
          inputSession:sidLabel(new Headers(opts.headers).get('mcp-session-id')),outputSession:sidLabel(res.headers.get('mcp-session-id'))});return res;}});
    const session=createBrowserSession({transport});const row={mode,trace};
    try{
      row.navigate=await session.tool('browser_navigate',{url:'http://127.0.0.1:19132/first'});
      if(row.navigate.isError)throw Error('navigation_failed');
      await delay(1200);row.snapshot=await session.tool('browser_snapshot',{});
      row.persisted=JSON.stringify(row.snapshot).includes('JH Local Lifetime Test');
      await delay(1200);row.secondSnapshot=await session.tool('browser_snapshot',{});
      row.persistedTwice=JSON.stringify(row.secondSnapshot).includes('JH Local Lifetime Test');
    }catch(e){row.error=e.message;process.exitCode=1;}
    results.push(row);
  }
  writeFileSync(out+'/probe.json',JSON.stringify(results,null,2));
  console.log('REAL_CHROMIUM_LIFETIME',JSON.stringify(results));
}finally{
  proxy.kill('SIGTERM');page.close();await Promise.race([new Promise(r=>proxy.once('exit',r)),delay(3000)]);
  if(proxy.exitCode===null)proxy.kill('SIGKILL');writeFileSync(out+'/proxy.log',logs.join(''));
}
