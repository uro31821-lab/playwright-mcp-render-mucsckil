// CI only: independent real Chromium containers avoid profile-lock interference.
import assert from 'node:assert/strict';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createBrowserTransport} from './browser-transport.mjs';
import {createBrowserSession} from './browser-session.mjs';
const page = http.createServer((req,res) => {res.writeHead(200,{'content-type':'text/html'});res.end('<html><head><title>JH Retained Page</title></head><body><h1>JH Retained Page</h1><button onclick="this.textContent=\'ONE CLICK\'">Probe button</button></body></html>');});
await new Promise(r=>page.listen(18932,'127.0.0.1',r));
const text=r=>(r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
const results={};
try {
 let initCount=0;
 const current=createBrowserSession({transport:createBrowserTransport({endpoint:'https://playwright-mcp-yzcy.onrender.com/mcp',token:'synthetic-test-token-not-a-production-key',timeoutMs:30000,fetchImpl:async(_url,options)=>{if(JSON.parse(options.body).method==='initialize')initCount++;return fetch('http://127.0.0.1:18931/mcp',options);}})});
 assert(text(await current.tool('browser_navigate',{url:'http://127.0.0.1:18932/'})).includes('JH Retained Page'));
 await delay(12000);
 let after;try{after=text(await current.tool('browser_snapshot',{}));}catch(e){after=e.message;}
 results.current={retained:after.includes('JH Retained Page'),blank:after.includes('about:blank'),initializations:initCount,error:after.startsWith('browser_')?after:null};
 console.log('CURRENT_CLIENT',JSON.stringify(results.current));
 const client=new Client({name:'jh-persistence-control',version:'1.0'},{capabilities:{}});
 const t=new StreamableHTTPClientTransport(new URL('http://127.0.0.1:18933/mcp'));
 try{
  await client.connect(t);
  const nav=text(await client.callTool({name:'browser_navigate',arguments:{url:'http://127.0.0.1:18932/'}}));
  assert(nav.includes('JH Retained Page'),nav);
  await delay(12000);
  const one=text(await client.callTool({name:'browser_snapshot',arguments:{}}));
  await delay(6000);
  const two=text(await client.callTool({name:'browser_snapshot',arguments:{}}));
  results.sdk={retained:one.includes('JH Retained Page')&&two.includes('JH Retained Page')};
  console.log('SDK_CLIENT',JSON.stringify(results.sdk));
  assert(results.sdk.retained,'SDK control must retain actual page');
 }finally{await client.close();}
 console.log('PERSISTENCE_DIAGNOSIS',JSON.stringify(results));
}finally{page.closeAllConnections();await new Promise(r=>page.close(r));}
