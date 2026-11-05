# Jebiseo actual phone AUTO3 — candidate wire V1

Status: development contract, not installed or phone-verified.

Existing signed job `type=agent_step`; one phase per job. Existing generic actions and LEFT protection stay unchanged.

| `action` | `phase` |
| --- | --- |
| `jebiseo_select_request_text` | `SELECT_REQUEST_TEXT` |
| `jebiseo_click_gemini_menu` | `CLICK_GEMINI_MENU` |
| `jebiseo_submit_gemini` | `SUBMIT_GEMINI` |

`text` is exactly `__JH_JEBISEO_TEXT_HANDOFF_V1__`. `value` is a JSON string with exactly these fields:

```json
{
  "schema": "JH_JEBISEO_AUTO3_V1",
  "phase": "SELECT_REQUEST_TEXT",
  "taskId": "task-id",
  "threadDigest": "64 lowercase hex",
  "sourceDigest": "64 lowercase hex",
  "promptDigest": "sha256(UTF-8 preparedPrompt)",
  "runDigest": "64 lowercase hex",
  "preparedPrompt": "exact visible ChatGPT text to select",
  "requestId": "32 lowercase hex",
  "previousReceipt": ""
}
```

`taskId` uses `[A-Za-z0-9_.-]{1,96}`. `preparedPrompt` obeys the existing GeminiNativeContract: at most 1200 code points and 2048 UTF-8 bytes, no forbidden control/format characters. The requested text must occur exactly once in exactly one visible, non-editable native ChatGPT node. Source text is never replaced with input typing or an Intent. `runDigest` is SHA-256 of UTF-8 length-prefixed fields joined by `|`: `[schema, taskId, threadDigest, sourceDigest, promptDigest]`, each field encoded `${value.length}:${value}` (all fields are ASCII; lengths unambiguous).

Required signed-envelope metadata: `mcpToolName=life_android_step`, `taskDigest=runDigest`, `targetDeviceDigest=current active device digest`, `secureRequestedEffect=REVERSIBLE_WRITE`, `containsCredential=false`, `dataClass=NON_SENSITIVE`, existing `commandId` (32 lowercase hex), existing valid Secure56 session/signature/expiry. All fields are included before the existing payload HMAC. The Android dedicated pre-bind validator admits only this exact reserved route; general `bindTool` allowlist does not broaden.

SELECT starts with empty previousReceipt. MENU requires the actual phone SELECT receipt. SUBMIT requires the actual phone MENU receipt. All phases must have the same secureSessionId, commandId, taskId, runDigest, source/thread/prompt digests and exact prompt. Local receipts expire in 120 seconds; state is cleared on command/site/service change. Receipts are process-local random capabilities, not server-created success assertions. Duplicate request IDs with changed content fail; completed/failed duplicate IDs return prior result without another action.

Phone cancellation replaces an entire volatile State generation without taking the execution monitor or calling platform code. In-flight work and approval callbacks keep only their captured State and must verify it is still current at each execution boundary. Late writes to the old State cannot recreate an active receipt or result after cancellation. The existing SiteWorkFence is unchanged.

MENU and SUBMIT reuse existing local exact one-shot approval (task/action/screen/package/window binding). First request may return `approvalPending=true`, `code=local_action_approval_required`, `phoneActionDispatched=false`. Resume uses the SAME requestId and SAME value in a fresh signed job; it reuses the existing pending request. No remote approve, new approval authority, or automatic replay. A changed screen cancels rather than carrying approval to a different target.

Common result fields: `schema=JH_JEBISEO_AUTO3_RESULT_V1`, `phase`, `requestId`, `runDigest`, `ok`, `code`, `phoneActionDispatched`, `resultVerified`, `automaticReplay=false`, `businessResultVerified=false`. Verified SELECT/MENU add `receipt`, `expiresAt`, `selectionVerified` or `draftVerified`. Receipt-bearing `ok=true` is issued only after actual Android readback. Approval pending adds `approvalPending=true` and `approvalRequestToken` but no next-phase receipt. SUBMIT reports `submissionVerified` separately; dispatch without visible new submitted message is `ok=false`, `gemini_submit_dispatched_unverified`, no replay. All results are returned through the existing Secure56 signed completion route.

Fixed successful codes: `jebiseo_selection_verified`, `jebiseo_gemini_draft_verified`, `jebiseo_submission_verified`. Receipt token format: `jhr_[a-f0-9]{48}`. `expiresAt` is epoch milliseconds. `secureInvocationExpiresAt` must be a signed future epoch-millisecond value on each invocation/resume; old expired signed jobs cannot dispatch after approval.

Supported route: native LEFT ChatGPT with observable ACTION_SET_SELECTION and textSelectionStart/End; RIGHT native Gemini with the existing exact draft ID and send review. A semantic ACTION_LONG_CLICK on the exact source node may open its toolbar before selection. System toolbar clicks require exactly one exact `Gemini에게 물어보기`/`Ask Gemini` node in the source application window or a currently OS-parent-linked child window inside the source pane. Unattributable cross-window toolbar, missing selection offsets, browser ChatGPT, whole-screen Gemini, changed split geometry, unknown/ambiguous targets and unobserved submit result fail closed. This candidate does not claim those UI variants are supported.

Menu membership additionally requires framework resource ID `android:id/floating_toolbar_menu_item_text` and class `android.widget.TextView`; only that node or its direct clickable parent can be invoked. The same words in ordinary conversation content are never menu proof. OEM menus that omit this observable identity remain unsupported. The resource comes from Android's framework selection toolbar and is also used by the Android CTS context-menu selector; this identifies a concrete supported UI contract, not a claim that the user's present menu has been observed.
