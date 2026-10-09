/** Assemble the existing owner/Life host with the exact live 95010ce browser modules.
 * No credentials, sockets, database initialization or deployment are performed here.
 */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const digest=b=>createHash('sha256').update(b).digest('hex');
export const LIVE_COMMIT='95010cefe67639b23af7493b5b16d1cf553ed4c9';
export const OWNER_SHA='a329fc7e71fb518a711a28146d34c5093a3f31486dc7ea8a9bd547e52d5118c6';
export const MODULES=Object.freeze({
 'browser-transport.mjs':'2289e56329e76ae86b6f14519958d45c8a31a0d53b134cee3a83fc9220ad008e',
 'browser-session.mjs':'f1e1e702fd5ac6f36bbc7bd98d318ca5cbc23c00c4fa3f0652dc704c34481fd5',
 'browser-events.mjs':'716ddf301e448510224f814c3eef83aed0885fa87490520ad39314eba40caa50'
});
const PREFIX='import {createBrowserTransport,installCatalogFraming} from "../browser-live/browser-transport.mjs";\n'+
'import {createBrowserSession} from "../browser-live/browser-session.mjs";\n'+
'import {withBrowserEvents} from "../browser-live/browser-events.mjs";\n';
const OLD_URL='const BROWSER_MCP = "http://life-browser-agent.railway.internal:8931/mcp";';
const NEW_URL='const browserTransport = createBrowserTransport();';
const START='async function parseMcp(res){',END='\nfunction createMcp(){';
const BLOCK=`const browserEventTransport=withBrowserEvents(browserTransport);
const browserSession=createBrowserSession({transport:browserEventTransport});
async function ensureBrowser(){ await browserSession.probe(); }
async function browserRpc(method,params={}){ return browserSession.rpc(method,params); }
async function browserTool(name,args={}){ return browserSession.tool(name,args); }
`;
const CATALOG='    if(isToolsList56){\n';
const LISTEN='if(process.env.JH_OWNER_DEFER_LISTEN!=="1")httpServer.listen(PORT,"0.0.0.0");';
const CLOSE='httpServer.once("close",()=>browserEventTransport.close());\n';
function once(source,text){if(source.split(text).length!==2)throw Error('UNIFIED_ANCHOR_MISMATCH');}
export function assembleUnifiedRuntime(bytes){
 if(!Buffer.isBuffer(bytes)||digest(bytes)!==OWNER_SHA)throw Error('UNIFIED_OWNER_SOURCE_MISMATCH');
 const src=bytes.toString('utf8');for(const x of [OLD_URL,START,END,CATALOG,LISTEN])once(src,x);
 const start=src.indexOf(START),end=src.indexOf(END,start);if(end<start)throw Error('UNIFIED_ANCHOR_MISMATCH');
 const removed=src.slice(start,end);
 let out=src.slice(0,start)+BLOCK+src.slice(end);
 out=PREFIX+out.replace(OLD_URL,NEW_URL).replace(CATALOG,CATALOG+'      installCatalogFraming(res);\n').replace(LISTEN,CLOSE+LISTEN);
 const reversed=out.slice(PREFIX.length).replace(NEW_URL,OLD_URL).replace(BLOCK,removed)
  .replace(CATALOG+'      installCatalogFraming(res);\n',CATALOG).replace(CLOSE+LISTEN,LISTEN);
 if(reversed!==src)throw Error('UNIFIED_PATCH_SCOPE_MISMATCH');
 return Buffer.from(out);
}
function inputs(root){
 for(const [file,hash]of Object.entries(MODULES))if(digest(readFileSync(path.join(root,'browser-live',file)))!==hash)throw Error('UNIFIED_LIVE_MODULE_MISMATCH');
 return assembleUnifiedRuntime(readFileSync(path.join(root,'server-integration/server.mjs')));
}
export function assertUnifiedRuntime(root){
 const expected=inputs(root),target=path.join(root,'server-integration/server-unified.mjs');
 if(!readFileSync(target).equals(expected))throw Error('UNIFIED_RUNTIME_MISMATCH');
 return target;
}
export function buildUnifiedRuntime(root=path.resolve(import.meta.dirname,'..')){
 const output=inputs(root),target=path.join(root,'server-integration/server-unified.mjs'),tmp=target+'.tmp';
 writeFileSync(tmp,output,{mode:0o600});renameSync(tmp,target);assertUnifiedRuntime(root);
 const record={schema:1,liveCommit:LIVE_COMMIT,ownerSha256:OWNER_SHA,modules:MODULES,
  outputSha256:digest(output),reversalEqualsOwner:true,authAndOwnerRoutesChanged:false,
  lifeStorageInitialized:false,listenerOpened:false,productionDeployment:false};
 writeFileSync(path.join(root,'evidence/unified-runtime-identity.json'),JSON.stringify(record,null,2)+'\n');
 return record;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(buildUnifiedRuntime()));
