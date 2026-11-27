/** Additive composition AFTER all existing exact-source/security guards.
 * The signed Android catalog, original OAuth registrar and old tools are unchanged.
 */
const IMPORT_ANCHOR = "import {registerJHEvidenceSearchTool} from '../evidence/perplexity-search.mjs';\n";
const IMPORT = "import {installGeminiMediaService,registerGeminiMediaTools,geminiMediaRequested} from '../gemini-media/gemini-tools.mjs';\n";
// The existing ordinary-peer parent adds its authenticated request argument.
const MCP_ANCHORS = ['function createMcp(){', 'function createMcp(peerRequest){'];
const EVIDENCE_ANCHOR = '  // Evidence search: server-side OAuth tool only.';
const SLOT = `let jhGeminiMediaService56=null;
export function installGeminiMediaStore56(resources){
  if(jhGeminiMediaService56)throw Error('GEMINI_RUNTIME_ALREADY_INSTALLED');
  jhGeminiMediaService56=installGeminiMediaService(resources);
  return !!jhGeminiMediaService56;
}
export async function closeGeminiMedia56(){await jhGeminiMediaService56?.close();}
`;
const REGISTRATION = `  // Gemini media: existing owner OAuth only; both features default OFF.
  if(geminiMediaRequested(process.env)) {
    registerGeminiMediaTools({registerOAuthTool,z,textResult,
      getService:()=>jhGeminiMediaService56});
  }
`;
const count = (source, text) => source.split(text).length - 1;
export function patchGeminiMediaRuntime56(source) {
  if (typeof source !== 'string' || [IMPORT_ANCHOR, EVIDENCE_ANCHOR,
    'const registerOAuthTool=(name,config,handler)=>{', 'const SECURE56_TOOL_CATALOG_DIGEST=']
    .some(anchor => count(source, anchor) !== 1) ||
    MCP_ANCHORS.reduce((total, anchor) => total + count(source, anchor), 0) !== 1 ||
    source.includes('jhGeminiMediaService56')) {
    throw Error('GEMINI_COMPOSITION_ANCHOR_CHANGED');
  }
  const mcpAnchor = MCP_ANCHORS.find(anchor => source.includes(anchor));
  const result = source.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + IMPORT)
    .replace(mcpAnchor, SLOT + mcpAnchor)
    .replace(EVIDENCE_ANCHOR, REGISTRATION + EVIDENCE_ANCHOR);
  if (result.replace(IMPORT, '').replace(SLOT, '').replace(REGISTRATION, '') !== source) throw Error('GEMINI_COMPOSITION_SCOPE_CHANGED');
  return result;
}

/** The supplementary layer must reverse to the complete attested parent. */
export function reverseGeminiMediaRuntime56(source) {
  if (typeof source !== 'string' || [IMPORT, SLOT, REGISTRATION].some(part => count(source, part) !== 1)) {
    throw Error('GEMINI_COMPOSITION_REVERSE_ANCHOR_CHANGED');
  }
  const original = source.replace(IMPORT, '').replace(SLOT, '').replace(REGISTRATION, '');
  if (patchGeminiMediaRuntime56(original) !== source) throw Error('GEMINI_COMPOSITION_REVERSE_SCOPE_CHANGED');
  return original;
}
