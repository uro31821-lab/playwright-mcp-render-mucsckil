/**
 * Stage52: ORIGINAL Secure56 result-to-Stage49 read-only wire adapter.
 *
 * No MCP route, native executor, new Android job, or approval capability.
 * `readOriginalVerifiedReceipt` MUST be the existing private original Secure56
 * signed receipt verifier, injected ONLY by the authenticated host. A caller's
 * JSON flag, asserted HMAC, result string or signature is never proof.
 */
import {validateStage49SignedWindowDiagnostic} from './stage49-native-select-window-diagnostic.mjs';

const hex32 = x => typeof x === 'string' && /^[a-f0-9]{32}$/.test(x);
const hex64 = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const context = x => typeof x === 'string' && /^ssc_[a-f0-9]{32}$/.test(x);
const item = x => typeof x === 'string' && /^item_[a-f0-9]{16}$/.test(x);
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const fail = code => Object.freeze({ok:false,code,readOnly:true,
  originalActionResultVerified:false,verifiedNativeWindowAssociation:false,
  authorizedToPick:false,phoneActionDispatched:false,automaticReplay:false,
  nativeSelectPhoneE2eVerified:false});

/** Construct once within the authenticated original host; never expose the
 * callback or the returned verifier as a user-selectable MCP tool. The original
 * owner/SQLite journal, nonce/HMAC/device-session binding must run first.
 * A returned signed true in a phone-supplied object does NOT satisfy this.
 */
export function createStage52OriginalSignedSelectReadback({readOriginalVerifiedReceipt}={}) {
  if(typeof readOriginalVerifiedReceipt!=='function')
    throw new TypeError('ORIGINAL_SIGNED_READER_REQUIRED');
  return async function readOnlyStage52({originalReceiptRef,expected}={}) {
    if(typeof originalReceiptRef!=='string'||originalReceiptRef.length<16||
       originalReceiptRef.length>256 || !/^[A-Za-z0-9._:-]+$/.test(originalReceiptRef))
      return fail('ORIGINAL_RECEIPT_REFERENCE_REQUIRED');
    if(!obj(expected)||!hex32(expected.commandId)||!hex32(expected.requestId)||
       !context(expected.contextId)||!item(expected.targetItemRef)||
       !hex64(expected.deviceDigest)||
       typeof expected.secureSessionId!=='string'||expected.secureSessionId.length<8)
      return fail('CURRENT_OWNER_BINDING_REQUIRED');
    let receipt;
    try {receipt = await readOriginalVerifiedReceipt(originalReceiptRef,expected);}
    catch {return fail('ORIGINAL_SECURE56_READ_UNAVAILABLE');}
    // These are server-verified output fields; no raw phone or caller-supplied
    // `verified` / `signed` flag can be used as a substitute.
    if(!obj(receipt)||receipt.originalSecure56Verified!==true||
       receipt.originalOwnerVerified!==true||
       receipt.originalResultReceiptVerified!==true)
      return fail('ORIGINAL_SECURE56_VERIFICATION_REQUIRED');
    const j=receipt.originalJob, r=receipt.originalResult;
    if(!obj(j)||!obj(r)||j.type!=='split_screen_session_followup'||
       j.action!=='CLICK'||
       j.command!=='오른쪽 화면에서 지정 선택 메뉴 열기'||
       j.commandId!==expected.commandId||j.requestId!==expected.requestId||
       j.contextId!==expected.contextId||j.targetItemRef!==expected.targetItemRef||
       j.targetDeviceDigest!==expected.deviceDigest||
       j.secureSessionId!==expected.secureSessionId)
      return fail('ORIGINAL_SELECT_JOB_BINDING_MISMATCH');
    // The native effect may already have executed: do not replay it.
    // Diagnostic `phoneActionDispatched:false` means NO NEW action dispatched
    // by this pure reader. It is NOT a claim about the older SELECT OPEN.
    if(r.ok!==false||r.code!=='split_screen_changed_or_missing'||
       r.resultVerified!==false||r.nativeSelectPopupReadOnly!==true||
       r.originalSelectOpenOutcome!=='NEEDS_REVIEW_NO_REPLAY'||
       !obj(r.nativeSelectWindowDiagnostic))
      return fail('ORIGINAL_SELECT_UNKNOWN_RECEIPT_REQUIRED');
    const d=r.nativeSelectWindowDiagnostic;
    const known=new Set(['STAGE49_OVERLAPPING_NON_APP_WINDOW_OBSERVED',
      'STAGE49_APPLICATION_WINDOW_COUNT_DIAGNOSTIC',
      'STAGE49_NO_OVERLAPPING_NON_APP_WINDOW',
      'STAGE49_ORIGINAL_WORK_BOUNDS_UNAVAILABLE']);
    if(!known.has(d.code))return fail('ORIGINAL_NATIVE_DIAGNOSTIC_CODE_INVALID');
    // Map actual installed Stage51 wire fields to the Stage49 pure classifier,
    // without ever promoting an unknown SELECT to a verified action or PICK.
    const originalFailure={
      code:d.code==='STAGE49_APPLICATION_WINDOW_COUNT_DIAGNOSTIC'?
        'STAGE45_APPLICATION_WINDOW_COUNT_UNVERIFIED':'STAGE45_FOREIGN_OVERLAY_UNVERIFIED',
      popupReadOnly:true,originalActionResultVerified:false,
      authorizedToPick:false,phoneActionDispatched:false,automaticReplay:false};
    const classified=validateStage49SignedWindowDiagnostic({
      originalFailure,diagnostic:d,serverSignedFrameVerified:true});
    if(classified.ok!==true)return fail(classified.code);
    return Object.freeze({...classified,
      code:'ORIGINAL_SIGNED_WINDOW_METADATA_READ_ONLY',
      nativeSelectPhoneE2eVerified:false,
      oldSelectOpenOutcome:'NEEDS_REVIEW_NO_REPLAY'});
  };
}