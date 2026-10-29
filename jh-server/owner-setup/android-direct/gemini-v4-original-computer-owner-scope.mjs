/** Stable digest of the ACTUAL signed RIGHT Gemini / LEFT ChatGPT window.
 * The original verified owner is always the input; a caller's digest is
 * never accepted as proof. No screen content, prompt or approval key stored.
 */
import {createHash} from 'node:crypto';
const KEYS=['deviceId','sessionId','commandId','workSide','chatSide',
 'workPackage','chatPackage','workWindowId','chatWindowId',
 'workBounds','chatBounds'];
const GEMINI='com.google.android.googlequicksearchbox';
export function nativeGeminiPrepareOwnerDigest(owner){
 if(!owner||typeof owner!=='object'||Array.isArray(owner)||
  owner.workSide!=='RIGHT'||owner.chatSide!=='LEFT'||
  owner.workPackage!==GEMINI||owner.chatPackage!=='com.openai.chatgpt'||
  !Number.isSafeInteger(owner.workWindowId)||
  !Number.isSafeInteger(owner.chatWindowId)||
  owner.workWindowId===owner.chatWindowId||
  !KEYS.every(k=>owner[k]!==undefined&&owner[k]!==null))
  throw Error('ORIGINAL_SIGNED_RIGHT_GEMINI_WINDOW_REQUIRED');
 return createHash('sha256').update(
  'JH-GEMINI-PREPARE-OWNER-V1|'+JSON.stringify(KEYS.map(k=>owner[k])),'utf8'
 ).digest('hex');
}
