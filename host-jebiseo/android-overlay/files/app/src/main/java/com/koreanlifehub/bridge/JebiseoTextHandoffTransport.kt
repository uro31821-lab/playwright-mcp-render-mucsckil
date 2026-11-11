package com.koreanlifehub.bridge

import org.json.JSONObject

/** Existing agent_step carrier; original signed envelope is mandatory, never a legacy fallback. */
internal object JebiseoTextHandoffTransport {
    private val keys=setOf("schema","phase","taskId","threadDigest","sourceDigest","promptDigest",
        "runDigest","preparedPrompt","requestId","previousReceipt")
    fun matches(j:JSONObject)=j.optString("action").startsWith("jebiseo_") ||
        j.optString("text").startsWith("__JH_JEBISEO_")
    fun parse(j:JSONObject):JebiseoTextHandoffPolicy.Request? { return try {
        if(j.optString("type")!="agent_step" || j.optString("text")!=JebiseoTextHandoffPolicy.MARKER)null
        else {
            val raw=j.opt("value") as? String ?: return null
            if(raw.length>8192)return null
            // The strict existing parser rejects duplicate keys, trailing values and invalid JSON.
            SecureJobPayloadCanonicalizer.canonicalPayload(raw)
            val v=JSONObject(raw)
            if(v.keys().asSequence().toSet()!=keys || keys.any{v.opt(it) !is String})return null
            val r=JebiseoTextHandoffPolicy.Request(v.getString("schema"),v.getString("phase"),v.getString("taskId"),
                v.getString("threadDigest"),v.getString("sourceDigest"),v.getString("promptDigest"),v.getString("runDigest"),
                v.getString("preparedPrompt"),v.getString("requestId"),v.getString("previousReceipt"))
            if(JebiseoTextHandoffPolicy.actions[j.optString("action")]!=r.phase ||
                JebiseoTextHandoffPolicy.validate(r)!=null)null else r
        }
    }catch(_:Exception){null} }

    /** Called only AFTER verifyServerJob succeeded. General bindTool/catalog is unchanged. */
    fun verifyBinding(j:JSONObject,active:SecureBridge56.ActiveView):SecureBridge56.Verify {
        val r=parse(j)?:return SecureBridge56.Verify(false,"jebiseo_contract_invalid")
        val b=binding(j)?:return SecureBridge56.Verify(false,"jebiseo_binding_invalid")
        if(b.sessionId!=active.sessionId || b.deviceDigest!=active.deviceDigest ||
            j.optString("mcpToolName")!="life_android_step" || j.optString("taskDigest")!=r.runDigest ||
            j.optString("secureRequestedEffect")!="REVERSIBLE_WRITE" ||
            j.opt("containsCredential")!=false || j.optString("dataClass")!="NON_SENSITIVE")
            return SecureBridge56.Verify(false,"jebiseo_secure_scope_mismatch")
        return SecureBridge56.Verify(true,"jebiseo_secure_bound")
    }
    fun binding(j:JSONObject):JebiseoTextHandoffPolicy.Binding? =
        JebiseoTextHandoffPolicy.Binding(j.optString("secureSessionId"),j.optString("commandId"),
            j.optString("targetDeviceDigest")).takeIf{JebiseoTextHandoffPolicy.validBinding(it)}
    fun execute(service:BridgeService,j:JSONObject):JSONObject {
        val active=SecureBridge56Runtime.session.activeView()
            ?:return error("jebiseo_secure_session_required")
        val verified=verifyBinding(j,active)
        if(!verified.ok)return error(verified.code)
        val request=parse(j)?:return error("jebiseo_contract_invalid")
        val bound=binding(j)?:return error("jebiseo_binding_invalid")
        return JebiseoTextHandoffRuntime.execute(service,j,request,bound)
    }
    fun error(code:String)=JSONObject().put("schema",JebiseoTextHandoffPolicy.RESULT_SCHEMA)
        .put("ok",false).put("code",code).put("phoneActionDispatched",false)
        .put("resultVerified",false).put("automaticReplay",false).put("businessResultVerified",false)
}
