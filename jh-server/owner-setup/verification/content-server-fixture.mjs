/** TEST ONLY. All grant changes and deletion commands are restricted to this private fixture stdin. */
import {createServer} from 'node:https';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {createLifeCheckpointHandler} from '../server-continuation/life-checkpoint-http.mjs';
import {createLifeContentHandler,CONTENT_PATH} from '../server-continuation/life-content-http.mjs';
import {contentParse as parse} from '../server-continuation/life-content-wire.mjs';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();
const conf=JSON.parse((await lines.next()).value),key=Buffer.from(conf.key,'hex');
const store=new LifeCheckpointStore({databasePath:conf.databasePath,key,serverDigest:conf.serverDigest});key.fill(0);delete conf.key;
let grant=null,mode='normal',dropped=0;const stats={contentPuts:0,resultPuts:0,contentGets:0,requests:0};
const authenticate=req=>req.headers.authorization==='Bearer '+conf.token&&grant?{ownerDigest:conf.owner,expiresAt:grant.expiresAt,
 scopes:new Set(['jh.life.read','jh.life.write','jh.life.control','jh.life.content.read','jh.life.content.write']),workflowId:grant.workflow,planDigest:grant.plan,
 contentClasses:new Set(['INPUT_TEXT','INPUT_SOURCE','RESULT_TEXT']),contentRefs:new Set(grant.inputs),resultTaskIds:new Set(grant.tasks)}:null;
const checkpoint=createLifeCheckpointHandler({store,authenticate}),content=createLifeContentHandler({store,authenticate});
const server=createServer({key:readFileSync(conf.tlsKey),cert:readFileSync(conf.tlsCert)},async(req,res)=>{
 stats.requests++;const chunks=[];let x;
 req.on('data',b=>chunks.push(b));req.on('end',()=>{try{x=parse(Buffer.concat(chunks));if(req.url===CONTENT_PATH){if(x.operation==='put'){stats.contentPuts++;if(x.category==='RESULT_TEXT')stats.resultPuts++;}else stats.contentGets++;}}catch{}});
 const end=res.end.bind(res);res.end=function(body,...args){if(req.url===CONTENT_PATH&&x?.operation==='put'&&(mode==='drop_input'&&x.category==='INPUT_TEXT'||mode==='drop_result'&&x.category==='RESULT_TEXT')){mode='normal';dropped++;res.destroy();return res;}return end(body,...args);};
 try{if(!await checkpoint(req,res)&&!await content(req,res))res.writeHead(404).end();}catch{res.destroy();}
});server.on('tlsClientError',()=>{});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));console.log(JSON.stringify({event:'ready',port:server.address().port}));
for await(const line of {[Symbol.asyncIterator]:()=>lines}){
 const x=JSON.parse(line);
 if(x.cmd==='grant'){grant=x.value;console.log(JSON.stringify({event:'grant'}));}
 else if(x.cmd==='mode'){mode=x.value;console.log(JSON.stringify({event:'mode'}));}
 else if(x.cmd==='stats')console.log(JSON.stringify({...stats,dropped}));
 else if(x.cmd==='cancel'){const cp=store.load(conf.owner,x.workflow);store.control(conf.owner,x.workflow,cp.revision,'cancel');console.log(JSON.stringify({event:'cancelled'}));}
 else if(x.cmd==='close'){server.closeAllConnections();await new Promise(ok=>server.close(ok));store.close();console.log(JSON.stringify({event:'closed'}));break;}
}
