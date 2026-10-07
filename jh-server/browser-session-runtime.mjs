import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha = b => createHash('sha256').update(b).digest('hex');
const PARENT = 'd6277e7d3132b076d4dad4507d2bfba4d29bc6ee3aab55c7fa7c45d0336e728d';
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
  if (reversed !== source) throw Error('browser_session_reversal_failed');
  return Buffer.from(output);
}
// Runtime activation is added only after CI has measured and sealed both hashes.
