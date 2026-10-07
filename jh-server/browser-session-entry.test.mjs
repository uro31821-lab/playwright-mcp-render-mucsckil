import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
const close=s=>new Promise(r=>{s.closeAllConnections();s.close(r);});

test('deployed entry + real MCP SDK: navigation/readback, expiry, no replay, caller authentication',{timeout:20000},async()=>{
  let sid='none',initializations=0,actions=0,page='about:blank',failAction=false;
  const upstream=createServer(async(req,res)=>{
    assert.equal(req.headers.authorization,'Bearer '+'b'.repeat(32));
    let text='';for await(const b of req)text+=b;const m=JSON.parse(text);
    if(m.method==='initialize'){
      assert.equal(req.headers['mcp-session-id'],undefined);sid='mock-'+(++initializations);
      res.writeHead(200,{'content-type':'application/json','mcp-session-id':sid});
      res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}}));return;
    }
    if(req.headers['mcp-session-id']!==sid){res.writeHead(404);res.end('Session not found');return;}
    if(m.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
    let result;
    if(m.method==='tools/list') result={tools:['browser_snapshot','browser_navigate','browser_click'].map(name=>({name,inputSchema:{type:'object',properties:{}}}))};
    else {
      actions++;
      if(failAction){failAction=false;sid='gone';res.writeHead(404);res.end('Session not found');return;}
      if(m.params.name==='browser_navigate')page=m.params.arguments.url;
      result={content:[{type:'text',text:page}]};
    }
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));
  });await listen(upstream);
  const reserve=createServer();await listen(reserve);const port=reserve.address().port;await close(reserve);
  const temp=mkdtempSync(join(tmpdir(),'jh-session-'));
  const preload=join(temp,'map.mjs');
  writeFileSync(preload,`const original=globalThis.fetch;globalThis.fetch=(u,o)=>original(String(u)==='https://playwright-mcp-yzcy.onrender.com/mcp'?'http://127.0.0.1:${upstream.address().port}/':u,o);`);
  const child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'auth-diagnostics-entry.mjs'],{
    cwd:dirname(fileURLToPath(import.meta.url)),env:{PATH:process.env.PATH,PORT:String(port),
      PUBLIC_BASE_URL:'https://fixture.invalid',LIFE_HUB_TOKEN:'a'.repeat(32),
      JH_BROWSER_MCP_URL:'https://playwright-mcp-yzcy.onrender.com/mcp',JH_BROWSER_MCP_TOKEN:'b'.repeat(32)},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',x=>{log+=x;});child.stderr.on('data',x=>{log+=x;});
  const client=new Client({name:'test-client',version:'1'},{capabilities:{}});
  try {
    let ready=false;for(let i=0;i<60;i++){
      if(child.exitCode!==null)throw Error('fixture runtime exited: '+log.slice(-1000));
      try{await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(100)});ready=true;break;}catch{}
      await new Promise(r=>setTimeout(r,50));
    }assert(ready,'actual entry listener ready');
    const transport=new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+port+'/mcp'),{
      requestInit:{headers:{authorization:'Bearer '+'a'.repeat(32)}}});
    await client.connect(transport);
    const call=(name,args={})=>client.callTool({name,arguments:args});
    const status=await call('life_status');assert.equal(JSON.parse(status.content[0].text).browser,'ready');
    await call('life_web_navigate',{url:'https://example.com/'});
    const view=await call('life_web_snapshot');assert.match(view.content[0].text,/https:\/\/example.com\//);
    assert.equal(actions,2);
    sid='expired';const before=initializations;
    assert.equal(JSON.parse((await call('life_status')).content[0].text).browser,'ready');
    assert.equal(initializations,before+1);
    await call('life_web_snapshot');
    failAction=true;const n=actions;const failed=await call('life_web_click',{target:'old-ref'});
    assert.equal(failed.isError,true);assert.match(failed.content[0].text,/not_replayed/);assert.equal(actions,n+1);
    await call('life_web_snapshot');assert.equal(actions,n+2);
    const unauthorized=await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
    const denial=await unauthorized.text();assert(unauthorized.status===401 || denial.includes('mcp/www_authenticate'));
    assert(!log.includes('a'.repeat(32))&&!log.includes('b'.repeat(32)));
    console.log('ENTRY_FLOW_CONFIRMED '+JSON.stringify({initializations,actions,navigationReadback:true,staleRecovery:true,noActionReplay:true,callerAuthPreserved:true}));
  } finally {
    await client.close().catch(()=>{});
    const exited=once(child,'exit');if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([exited,new Promise(r=>setTimeout(r,1000))]);if(child.exitCode===null)child.kill('SIGKILL');}
    await close(upstream);rmSync(temp,{recursive:true,force:true});
  }
});
