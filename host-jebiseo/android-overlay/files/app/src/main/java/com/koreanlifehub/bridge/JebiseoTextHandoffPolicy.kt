package com.koreanlifehub.bridge

import java.security.MessageDigest
import java.security.SecureRandom

/** Narrow source-selection protocol. This never makes a general LEFT click/input grant. */
object JebiseoTextHandoffPolicy {
    const val SCHEMA="JH_JEBISEO_AUTO3_V1"
    const val RESULT_SCHEMA="JH_JEBISEO_AUTO3_RESULT_V1"
    const val MARKER="__JH_JEBISEO_TEXT_HANDOFF_V1__"
    const val TTL_MS=120_000L
    const val SELECT="SELECT_REQUEST_TEXT"
    const val MENU="CLICK_GEMINI_MENU"
    const val SUBMIT="SUBMIT_GEMINI"
    val actions=mapOf("jebiseo_select_request_text" to SELECT,
        "jebiseo_click_gemini_menu" to MENU,"jebiseo_submit_gemini" to SUBMIT)
    val menuLabels=setOf("Gemini에게 물어보기","Ask Gemini")
    // Framework selection toolbar item identity. A matching sentence in GPT is not a toolbar.
    const val TOOLBAR_ITEM_ID="android:id/floating_toolbar_menu_item_text"
    private val hex64=Regex("[a-f0-9]{64}")
    private val id=Regex("[A-Za-z0-9_.-]{1,96}")
    private val requestId=Regex("[a-f0-9]{32}")
    private val receipt=Regex("jhr_[a-f0-9]{48}")
    data class Request(val schema:String,val phase:String,val taskId:String,val threadDigest:String,
        val sourceDigest:String,val promptDigest:String,val runDigest:String,val preparedPrompt:String,
        val requestId:String,val previousReceipt:String)
    data class Binding(val sessionId:String,val commandId:String,val deviceDigest:String)
    data class Range(val start:Int,val end:Int)
    data class Check(val ok:Boolean,val code:String,val duplicate:Boolean=false)
    data class Receipt(val token:String,val expiresAt:Long)
    /** Cancellation swaps a generation without waiting for execution or platform locks.
     * An old worker may finish writing its own state, but can never republish the active state. */
    class StateSlot<T:Any>(private val factory:()->T) {
        @Volatile private var active=factory()
        fun capture():T=active
        fun current(expected:T):Boolean=active===expected
        fun clear(){active=factory()}
    }
    fun sha(value:String):String=MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        .joinToString(""){"%02x".format(it)}
    fun material(parts:List<String>)=parts.joinToString("|"){"${it.length}:$it"}
    fun runDigest(r:Request)=sha(material(listOf(SCHEMA,r.taskId,r.threadDigest,r.sourceDigest,r.promptDigest)))
    fun fingerprint(r:Request)=sha(material(listOf(r.schema,r.phase,r.taskId,r.threadDigest,r.sourceDigest,
        r.promptDigest,r.runDigest,r.preparedPrompt,r.requestId,r.previousReceipt)))
    fun validate(r:Request):String? = when {
        r.schema!=SCHEMA || r.phase !in actions.values -> "jebiseo_contract_invalid"
        !id.matches(r.taskId) || !requestId.matches(r.requestId) -> "jebiseo_identity_invalid"
        listOf(r.threadDigest,r.sourceDigest,r.promptDigest,r.runDigest).any{!hex64.matches(it)} -> "jebiseo_digest_invalid"
        !GeminiNativeContract.safePrompt(r.preparedPrompt) -> "jebiseo_prompt_invalid"
        sha(r.preparedPrompt)!=r.promptDigest || runDigest(r)!=r.runDigest -> "jebiseo_digest_mismatch"
        r.phase==SELECT && r.previousReceipt.isNotEmpty() -> "jebiseo_unexpected_receipt"
        r.phase!=SELECT && !receipt.matches(r.previousReceipt) -> "jebiseo_previous_receipt_required"
        else -> null
    }
    fun validBinding(b:Binding)=b.sessionId.isNotBlank() && b.sessionId.length<=160 &&
        requestId.matches(b.commandId) && hex64.matches(b.deviceDigest)
    /** UTF-16 indices are the Android ACTION_SET_SELECTION contract; no text normalization. */
    fun uniqueRange(text:String,prompt:String):Range? {
        if(text.length>16384 || !GeminiNativeContract.safePrompt(prompt))return null
        val start=text.indexOf(prompt)
        if(start<0 || text.indexOf(prompt,start+1)>=0)return null
        return Range(start,start+prompt.length)
    }
    fun selectionMatches(text:String,prompt:String,start:Int,end:Int):Boolean =
        uniqueRange(text,prompt)?.let{it.start==start && it.end==end && text.substring(start,end)==prompt}==true
    fun toolbarItem(viewId:String,className:String,windowOwnedBySource:Boolean):Boolean =
        windowOwnedBySource && viewId==TOOLBAR_ITEM_ID && className=="android.widget.TextView"

    /** No Android effects here. One run, ordered receipts and exact duplicate detection. */
    class Ledger(private val now:()->Long={System.currentTimeMillis()},
        private val newToken:()->String={val b=ByteArray(24);SecureRandom().nextBytes(b);"jhr_"+b.joinToString(""){"%02x".format(it)}}) {
        private data class Run(val binding:Binding,val seed:Request,var phase:String="NEW",
            var receipt:String="",var expiresAt:Long,var activeRequest:String?=null)
        private data class Attempt(val binding:Binding,val fingerprint:String,val run:String,var terminal:Boolean=false)
        private val runs=linkedMapOf<String,Run>()
        private val attempts=linkedMapOf<String,Attempt>()
        @Synchronized fun clear(){runs.clear();attempts.clear()}
        @Synchronized fun reserve(r:Request,b:Binding):Check {
            validate(r)?.let{return Check(false,it)}
            if(!validBinding(b))return Check(false,"jebiseo_binding_invalid")
            val fp=fingerprint(r)
            attempts[r.requestId]?.let { old ->
                return if(old.binding!=b || old.fingerprint!=fp)Check(false,"jebiseo_request_id_changed")
                else if(!old.terminal && (runs[old.run]?.expiresAt ?: 0)<now())Check(false,"jebiseo_receipt_expired")
                else Check(true,"jebiseo_existing_request",true)
            }
            if(attempts.size>=48)return Check(false,"jebiseo_command_capacity")
            var run=runs[r.runDigest]
            if(run==null){
                if(r.phase!=SELECT)return Check(false,"jebiseo_prior_phone_receipt_missing")
                if(runs.size>=16)return Check(false,"jebiseo_command_capacity")
                run=Run(b,r,expiresAt=now()+TTL_MS);runs[r.runDigest]=run
            }
            if(run.binding!=b || run.seed.taskId!=r.taskId || run.seed.preparedPrompt!=r.preparedPrompt ||
                run.seed.threadDigest!=r.threadDigest || run.seed.sourceDigest!=r.sourceDigest ||
                run.seed.promptDigest!=r.promptDigest)return Check(false,"jebiseo_run_binding_changed")
            if(run.expiresAt<now())return Check(false,"jebiseo_receipt_expired")
            if(run.activeRequest!=null)return Check(false,"jebiseo_phase_in_progress")
            val expected=when(run.phase){"NEW"->SELECT;SELECT->MENU;MENU->SUBMIT;else->"TERMINAL"}
            if(expected!=r.phase || (r.phase!=SELECT && run.receipt!=r.previousReceipt))
                return Check(false,"jebiseo_phase_or_receipt_mismatch")
            run.activeRequest=r.requestId;attempts[r.requestId]=Attempt(b,fp,r.runDigest)
            return Check(true,"jebiseo_request_reserved")
        }
        @Synchronized fun current(r:Request,b:Binding):Boolean {
            val run=runs[r.runDigest]?:return false
            val a=attempts[r.requestId]?:return false
            return !a.terminal && a.binding==b && a.fingerprint==fingerprint(r) &&
                run.binding==b && run.activeRequest==r.requestId && now()<=run.expiresAt
        }
        /** Complete only after actual phone readback. Failures are terminal and never replayed. */
        @Synchronized fun complete(r:Request,b:Binding,verified:Boolean):Receipt? {
            if(!current(r,b))return null
            val run=runs.getValue(r.runDigest);val a=attempts.getValue(r.requestId)
            a.terminal=true;run.activeRequest=null
            if(!verified){run.phase="FAILED";run.receipt="";return null}
            run.phase=r.phase
            if(r.phase==SUBMIT){run.receipt="";return null}
            val token=newToken()
            if(!receipt.matches(token)){run.phase="FAILED";run.receipt="";return null}
            run.receipt=token;run.expiresAt=now()+TTL_MS
            return Receipt(token,run.expiresAt)
        }
    }
}
