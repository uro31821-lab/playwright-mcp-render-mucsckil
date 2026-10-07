import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha = b => createHash('sha256').update(b).digest('hex');
const PARENT = 'd6277e7d3132b076d4dad4507d2bfba4d29bc6ee3aab55c7fa7c45d0336e728d';
const SESSION = 'f1e1e702fd5ac6f36bbc7bd98d318ca5cbc23c00c4fa3f0652dc704c34481fd5';
const OUTPUT = '8f4f205ada0c00b5af99a99bdba3966d5b7825761fb3ecd53627156330fd63e4';
const IMPORT = 'import {createBrowserSession} from "../../browser-session.mjs";\n';
const START = 'async function parseMcp(res){';
const END = '\nfunction createMcp(){';
const REPLACEMENT = `const browserSession = createBrowserSession({transport:browserTransport});
async function ensureBrowser(){ await browserSession.probe(); }
async function browserRpc(method,params={}){ return browserSession.rpc(method,params); }
async function browserTool(name,args={}){ return browserSession.tool(name,args); }
`;
export function patchBrowserSessionRuntime(bytes) {
  if (!Buffer.isBuffer(bytes) || sha(bytes) !== PARENT) throw Error('browser_session_parent_identity_mismatch');
  const source = bytes.toString('utf8');
  if (source.split(START).length !== 2 || source.split(END).length !== 2) throw Error('browser_session_anchors_mismatch');
  const start = source.indexOf(START), end = source.indexOf(END, start);
  if (end < start) throw Error('browser_session_anchors_mismatch');
  const removed = source.slice(start,end);
  const output = IMPORT + source.slice(0,start) + REPLACEMENT + source.slice(end);
  const reversed = output.slice(IMPORT.length).replace(REPLACEMENT,removed);
  if (reversed !== source || sha(output) !== OUTPUT) throw Error('browser_session_reversal_or_identity_failed');
  return Buffer.from(output);
}
export function prepareBrowserSessionRuntime(inputUrl) {
  if (sha(readFileSync(new URL('./browser-session.mjs',import.meta.url))) !== SESSION)
    throw Error('browser_session_module_identity_mismatch');
  const output = patchBrowserSessionRuntime(readFileSync(inputUrl));
  const target = new URL('./verification-output/candidate/server-browser-session.mjs',import.meta.url);
  const temporary = new URL('./verification-output/candidate/server-browser-session.mjs.tmp',import.meta.url);
  writeFileSync(temporary,output,{mode:0o600});renameSync(temporary,target);
  if (sha(readFileSync(target)) !== OUTPUT) throw Error('browser_session_readback_mismatch');
  return target;
}
