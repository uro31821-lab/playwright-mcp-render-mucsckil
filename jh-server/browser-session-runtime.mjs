import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha = b => createHash('sha256').update(b).digest('hex');
const PARENT = 'd6277e7d3132b076d4dad4507d2bfba4d29bc6ee3aab55c7fa7c45d0336e728d';
const SESSION = 'ebc6b2c87bba4a46118b16e78deecdde1c3d7c4fc108e9c428bd94e9b93e278e';
const OUTPUT = '11127ad943403433b5ffee18753abfdd073fe5d8e970e6577281c4bf2aafb153';
const HEARTBEAT = '1778012afefcaeb418e6618a8730295ff086972d0f3b9082314ad39fa06bb33b';
const IMPORT = 'import {createBrowserSession} from "../../browser-session.mjs";\nimport {createBrowserHeartbeat} from "../../browser-heartbeat.mjs";\n';
const START = 'async function parseMcp(res){';
const END = '\nfunction createMcp(){';
const REPLACEMENT = `const browserSession = createBrowserSession({transport:browserTransport,heartbeatFactory:createBrowserHeartbeat({transport:browserTransport})});
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
  if (sha(readFileSync(new URL('./browser-heartbeat.mjs',import.meta.url))) !== HEARTBEAT)
    throw Error('browser_heartbeat_module_identity_mismatch');
  const output = patchBrowserSessionRuntime(readFileSync(inputUrl));
  const target = new URL('./verification-output/candidate/server-browser-session.mjs',import.meta.url);
  const temporary = new URL('./verification-output/candidate/server-browser-session.mjs.tmp',import.meta.url);
  writeFileSync(temporary,output,{mode:0o600});renameSync(temporary,target);
  if (sha(readFileSync(target)) !== OUTPUT) throw Error('browser_session_readback_mismatch');
  return target;
}
