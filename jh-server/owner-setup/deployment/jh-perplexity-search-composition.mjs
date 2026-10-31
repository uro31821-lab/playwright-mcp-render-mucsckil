/**
 * Add JH Evidence Search as a standalone, disabled-by-default MCP tool.
 * Invoke only AFTER the existing Secure56/JH167 runtime composition has passed
 * its original exact-source guards. Do not change Android's signed tool catalog,
 * protocol_version, OAuth, approvals, owner state, browser, or APK.
 */
const IMPORT = "import {registerJHEvidenceSearchTool} from '../evidence/perplexity-search.mjs';\n";
const OPEN_COMPLETION_IMPORT = 'import {awaitOpenCompletion as jhAwaitOpenCompletion56, OPEN_COMPLETION_WAIT_MS as jhOpenWait56, OPEN_STATUS_WAIT_MS as jhOpenStatusWait56} from "../deployment/jh167-open-completion.mjs";\n';
const TOOL_ANCHOR = '  registerOAuthTool("life_status",{';
const SECURITY_ANCHOR = 'const registerOAuthTool=(name,config,handler)=>{';
const ANDROID_DIGEST_ANCHOR = 'const SECURE56_TOOL_CATALOG_DIGEST=';
const REGISTRATION = `  // Evidence search: server-side OAuth tool only. No phone/Android action.
  // Both switches must be explicitly set; absent key/flag => tool invisible.
  if (process.env.JH_EVIDENCE_SEARCH_ENABLED==='1' &&
      typeof process.env.PERPLEXITY_API_KEY==='string' &&
      process.env.PERPLEXITY_API_KEY.trim().length>=12) {
    registerJHEvidenceSearchTool({registerOAuthTool,z,textResult,
      apiKey:process.env.PERPLEXITY_API_KEY});
  }
`;
const count = (source, needle) => source.split(needle).length - 1;

export function patchJHEvidenceSearchRuntime56(source) {
  if (typeof source !== 'string' || !source.startsWith(OPEN_COMPLETION_IMPORT) ||
      count(source, OPEN_COMPLETION_IMPORT) !== 1 || count(source, TOOL_ANCHOR) !== 1 ||
      count(source, SECURITY_ANCHOR) !== 1 || count(source, ANDROID_DIGEST_ANCHOR) !== 1 ||
      source.includes(IMPORT.trim()) || source.includes('jh_evidence_search') ||
      source.includes('JH_EVIDENCE_SEARCH_ENABLED')) {
    throw Error('JH_EVIDENCE_COMPOSITION_ANCHOR_CHANGED');
  }
  const result = source.replace(OPEN_COMPLETION_IMPORT, OPEN_COMPLETION_IMPORT + IMPORT)
    .replace(TOOL_ANCHOR, REGISTRATION + TOOL_ANCHOR);
  if (!result.startsWith(OPEN_COMPLETION_IMPORT + IMPORT) ||
      result.replace(OPEN_COMPLETION_IMPORT + IMPORT, OPEN_COMPLETION_IMPORT)
        .replace(REGISTRATION + TOOL_ANCHOR, TOOL_ANCHOR) !== source) {
    throw Error('JH_EVIDENCE_COMPOSITION_SCOPE_CHANGED');
  }
  return result;
}
