package com.jh.pobiseo.assist;

import java.util.Objects;

/** Additional scope checks AFTER the existing Secure56 MAC/nonce/payload verifier.
 * This class is NOT a signature verifier. Live values must be read from the host, never JSON.
 */
public final class CameraCommandGate {
    private CameraCommandGate() {}
    public static final String JOB_TYPE = "kabiseo_camera_metadata";
    public static final String TOOL = "life_android_kabiseo_metadata";
    public static final String PACKAGE = "com.openai.chatgpt";
    public static final long LOCAL_LEASE_MS = 1500;
    public record Command(String id,String commandId,String sessionId,String type,String tool,
                          String action,String effect,String targetPackage,String deviceDigest,
                          String taskDigest,long expiresAt) {}
    public record Live(boolean enabled,boolean connected,boolean unlocked,boolean generationCurrent,
                       String commandId,String sessionId,String deviceDigest) {}
    public enum Decision { ALLOW_METADATA_ONLY, DISABLED, SIGNATURE_NOT_VERIFIED, INVALID_REQUEST,
        SCOPE_MISMATCH, INACTIVE, EXPIRED }
    public static Decision check(Command c,Live live,String verifiedCode,long wallNow) {
        if(live==null||!live.enabled())return Decision.DISABLED;
        if(!"secure_verified".equals(verifiedCode))return Decision.SIGNATURE_NOT_VERIFIED;
        if(c==null||!identifier(c.id())||!hex(c.commandId(),32)||!identifier(c.sessionId())
            ||!hex(c.deviceDigest(),64)||!hex(c.taskDigest(),64))return Decision.INVALID_REQUEST;
        if(!JOB_TYPE.equals(c.type())||!TOOL.equals(c.tool())||!CameraMetadataRoute.ACTION.equals(c.action())
            ||!"READ_ONLY".equals(c.effect())||!PACKAGE.equals(c.targetPackage()))return Decision.SCOPE_MISMATCH;
        if(!live.connected()||!live.unlocked()||!live.generationCurrent())return Decision.INACTIVE;
        if(!Objects.equals(c.commandId(),live.commandId())||!Objects.equals(c.sessionId(),live.sessionId())
            ||!Objects.equals(c.deviceDigest(),live.deviceDigest()))return Decision.SCOPE_MISMATCH;
        // Conservatively deny clock skew. Never extend a signed expiration using a local clock.
        if(wallNow<0||c.expiresAt()<=wallNow||c.expiresAt()-wallNow>60_000)return Decision.EXPIRED;
        return Decision.ALLOW_METADATA_ONLY;
    }
    public static boolean localLeaseLive(long began,long now) {
        return began>=0&&now>=began&&now-began<LOCAL_LEASE_MS;
    }
    private static boolean identifier(String s) {return s!=null&&s.matches("[A-Za-z0-9_.:-]{1,128}");}
    private static boolean hex(String s,int count) {return s!=null&&s.matches("[a-f0-9]{"+count+"}");}
}
