package com.jh.pobiseo.assist.review;

import com.jh.pobiseo.assist.CameraSurfacePolicy;
import com.jh.pobiseo.assist.CameraSurfacePolicy.Bounds;
import com.jh.pobiseo.assist.CameraSurfacePolicy.Node;
import com.jh.pobiseo.assist.CameraSurfacePolicy.Profile;
import com.jh.pobiseo.assist.review.CameraProfileReview.*;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.LongSupplier;

/** Candidate LOCAL handoff, not an Android collector or authentication implementation.
 * The trusted in-process Host must bind original authorization, locally observed screen labels,
 * immutable metadata, identity and a one-use phone-local approval. Defaults deny everything.
 * No endpoint accepts a caller's boolean as proof. A synthetic Host is NOT device evidence.
 * Only an in-memory, session-scoped profile lease is issued. No persistent store, pixels, text,
 * network, camera action or disk access. Not wired into the current Android/null provider.
 */
public final class CameraProfileHandoff implements AutoCloseable {
    public static final long MAX_SESSION_MS=300_000;
    public static final int MAX_SAMPLES=32;
    public enum State { COLLECTING, REVIEW_READY, COMMITTING, ENROLLED_LOCAL_LEASE, CLOSED }
    public enum Reason { ACCEPTED, BUSY, WRONG_STATE, SESSION_INVALID, INVALID_CAPTURE,
        DUPLICATE_CAPTURE, CAPACITY, UNVERIFIED_CAPTURE, APPROVAL_REJECTED,
        TICKET_MISMATCH, ENROLLED_LOCAL_LEASE, HOST_FAILURE }
    public record Scope(String enrollmentId,String commandId,String deviceDigest,Identity identity,
                        long issuedAt,long expiresAt) {
        public Scope {
            if(!identifier(enrollmentId)||!identifier(commandId)||deviceDigest==null
                ||!deviceDigest.matches("[a-f0-9]{64}")||identity==null||issuedAt<0||expiresAt<=issuedAt
                ||expiresAt-issuedAt>MAX_SESSION_MS)throw new IllegalArgumentException("invalid scope");
        }
        @Override public String toString(){return "Scope[local enrollment binding]";}
    }
    public record Captured(Sample sample,long observedAt) {
        public Captured {Objects.requireNonNull(sample);if(observedAt<0)throw new IllegalArgumentException("invalid time");}
        @Override public String toString(){return "Captured[metadata only]";}
    }
    public record ApprovalRequest(String evidenceDigest,Identity identity,int sampleCount) {
        @Override public String toString(){return "ApprovalRequest[exact local review required]";}
    }
    public interface Host {
        /** Must return the CURRENT original host binding; null on cancellation/lock/session drift. */
        default Scope currentScope(){return null;}
        default boolean collectionApproved(Scope scope){return false;}
        /** Verify provenance AND locally established screen/opening/capture labels, not just fields. */
        default boolean verifyCapture(Scope scope,Captured capture){return false;}
        /** Atomically consume an existing phone-local approval for exactly this digest and scope.
         * This method MUST NOT launch an approval UI or submit/replay a device command.
         * Throw/false is terminal: this controller never retries an uncertain consumption.
         */
        default boolean consumeLocalApproval(Scope scope,ApprovalRequest request){return false;}
        default boolean enrollmentStillApproved(Scope scope,String evidenceDigest){return false;}
    }
    public record Receipt(State state,Reason reason,int retainedSamples) {
        public boolean permitsGesture(){return false;}
        public boolean permitsPixels(){return false;}
        public boolean cameraSettingsChanged(){return false;}
    }
    /** Cannot be constructed by callers. Valid only for the controller instance that prepared it. */
    public static final class Ticket {
        private final Draft draft;private final String evidenceDigest;private final int sampleCount;
        private Ticket(Draft draft,String digest,int count){this.draft=draft;this.evidenceDigest=digest;this.sampleCount=count;}
        public Draft draft(){return draft;}
        public String evidenceDigest(){return evidenceDigest;}
        public int sampleCount(){return sampleCount;}
        @Override public String toString(){return "Ticket[unattested, local approval pending]";}
    }
    private final Scope scope;private final Host host;private final LongSupplier clock;
    private final List<Captured> captures=new ArrayList<>();
    private final Set<String> captureIds=new HashSet<>();
    private State state=State.COLLECTING;private boolean busy;
    private long lastTime=-1;private Ticket ticket;private Profile lease;private String approvedDigest;
    public CameraProfileHandoff(Scope scope,Host host,LongSupplier monotonicClock){
        this.scope=Objects.requireNonNull(scope);this.host=Objects.requireNonNull(host);this.clock=Objects.requireNonNull(monotonicClock);
    }
    public synchronized Receipt accept(Captured capture){
        if(busy)return receipt(Reason.BUSY);busy=true;
        try{
            if(state!=State.COLLECTING)return receipt(Reason.WRONG_STATE);
            if(!live())return receipt(Reason.SESSION_INVALID);
            if(capture==null||!validCapture(capture,lastTime))return receipt(Reason.INVALID_CAPTURE);
            if(captureIds.contains(capture.sample().captureId()))return receipt(Reason.DUPLICATE_CAPTURE);
            if(captures.size()>=MAX_SAMPLES)return receipt(Reason.CAPACITY);
            if(!host.verifyCapture(scope,capture))return receipt(Reason.UNVERIFIED_CAPTURE);
            if(!live())return receipt(Reason.SESSION_INVALID);
            if(!validCapture(capture,lastTime))return receipt(Reason.INVALID_CAPTURE);
            captures.add(capture);captureIds.add(capture.sample().captureId());return receipt(Reason.ACCEPTED);
        }catch(RuntimeException e){close();return receipt(Reason.HOST_FAILURE);}
        finally{busy=false;}
    }
    /** All retained samples are reviewed; callers cannot silently omit a failed negative control. */
    public synchronized Ticket prepare(List<String> anchors,String preview,Set<String> prohibited){
        if(busy)return null;busy=true;
        try{
            if(state!=State.COLLECTING||!live())return null;
            Review review=CameraProfileReview.review(scope.identity(),captures.stream().map(Captured::sample).toList(),anchors,preview,prohibited);
            if(review.status()!=Status.DRAFT_REQUIRES_LOCAL_REVIEW||!live())return null;
            ticket=new Ticket(review.draft(),evidenceDigest(review.draft()),captures.size());
            state=State.REVIEW_READY;return ticket;
        }catch(RuntimeException e){close();return null;}finally{busy=false;}
    }
    public synchronized Receipt commit(Ticket candidate){
        if(busy)return receipt(Reason.BUSY);busy=true;
        try{
            if(state!=State.REVIEW_READY)return receipt(Reason.WRONG_STATE);
            if(candidate==null||candidate!=ticket)return receipt(Reason.TICKET_MISMATCH);
            if(!live())return receipt(Reason.SESSION_INVALID);
            if(!ticket.evidenceDigest.equals(evidenceDigest(ticket.draft))){close();return receipt(Reason.TICKET_MISMATCH);}
            final Ticket pending=ticket;state=State.COMMITTING;
            boolean allowed=host.consumeLocalApproval(scope,new ApprovalRequest(pending.evidenceDigest,scope.identity(),pending.sampleCount));
            if(!allowed){close();return receipt(Reason.APPROVAL_REJECTED);}
            if(!live()||!host.enrollmentStillApproved(scope,pending.evidenceDigest)||!live()){
                close();return receipt(Reason.SESSION_INVALID);
            }
            Profile p=pending.draft.profile();
            lease=new Profile(p.packageName(),p.versionCode(),p.cameraAnchorIds(),p.previewId(),p.prohibitedIds(),true);
            approvedDigest=pending.evidenceDigest;ticket=null;captures.clear();captureIds.clear();
            state=State.ENROLLED_LOCAL_LEASE;return receipt(Reason.ENROLLED_LOCAL_LEASE);
        }catch(RuntimeException e){close();return receipt(Reason.HOST_FAILURE);}finally{busy=false;}
    }
    /** Fetch on EVERY read, with the full measured identity. Never cache the returned Profile.
     * The old three-argument Android Profiles interface lacks screenScope and cannot be wired
     * directly to this method without adding a fresh local full-identity check.
     */
    public synchronized Profile resolve(Identity actual){
        if(busy)return null;busy=true;
        try{
            if(state!=State.ENROLLED_LOCAL_LEASE||!live()||!scope.identity().equals(actual))return null;
            if(!host.enrollmentStillApproved(scope,approvedDigest)||!live()){close();return null;}
            return lease;
        }catch(RuntimeException e){close();return null;}finally{busy=false;}
    }
    public synchronized Receipt status(){return receipt(state==State.ENROLLED_LOCAL_LEASE?Reason.ENROLLED_LOCAL_LEASE:Reason.WRONG_STATE);}
    /** Also callable from a Host callback: a cancellation cannot be overwritten by its result. */
    @Override public synchronized void close(){state=State.CLOSED;captures.clear();captureIds.clear();ticket=null;lease=null;approvedDigest=null;}
    private Receipt receipt(Reason reason){return new Receipt(state,reason,captures.size());}
    private boolean live(){
        if(state==State.CLOSED||!timeValid())return false;
        if(!scope.equals(host.currentScope())||!host.collectionApproved(scope)||!timeValid()||state==State.CLOSED){close();return false;}
        return true;
    }
    private boolean timeValid(){
        long now=clock.getAsLong();
        if(now<lastTime||now<scope.issuedAt()||now>=scope.expiresAt()){close();return false;}
        lastTime=now;return true;
    }
    private boolean validCapture(Captured c,long now){
        Sample s=c.sample();
        if(!scope.identity().equals(s.identity())||c.observedAt()<scope.issuedAt()||c.observedAt()>now
            ||now-c.observedAt()>CameraSurfacePolicy.OBSERVATION_TTL_MS||!s.applicationWindow()
            ||!s.active()||!s.unoccluded()||!s.complete()||s.nodes().isEmpty())return false;
        String prefix=scope.identity().packageName()+":id/";
        for(Node n:s.nodes()){
            String id=n.resourceId();
            if(id.length()>256||(!id.isEmpty()&&(!id.startsWith(prefix)||!id.substring(prefix.length()).matches("[A-Za-z0-9_.$]+"))))return false;
            if(n.visible()&&(!s.window().contains(n.bounds())||n.password()))return false;
        }
        return true;
    }
    private String evidenceDigest(Draft draft){
        try{
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);
            out.writeUTF("KABISEO_LOCAL_PROFILE_HANDOFF_V020");out.writeUTF(scope.enrollmentId());out.writeUTF(scope.commandId());
            out.writeUTF(scope.deviceDigest());out.writeLong(scope.issuedAt());out.writeLong(scope.expiresAt());
            Identity id=scope.identity();out.writeUTF(id.packageName());out.writeLong(id.versionCode());out.writeUTF(id.signerDigest());out.writeUTF(id.screenScope());
            Profile p=draft.profile();out.writeInt(p.cameraAnchorIds().size());for(String a:p.cameraAnchorIds())out.writeUTF(a);
            out.writeUTF(p.previewId());List<String> prohibited=new ArrayList<>(p.prohibitedIds());prohibited.sort(String::compareTo);
            out.writeInt(prohibited.size());for(String x:prohibited)out.writeUTF(x);
            out.writeInt(captures.size());
            for(Captured c:captures){Sample s=c.sample();out.writeLong(c.observedAt());out.writeUTF(s.screen().name());
                out.writeUTF(s.captureId());out.writeUTF(s.openingId());box(out,s.window());out.writeBoolean(s.applicationWindow());
                out.writeBoolean(s.active());out.writeBoolean(s.unoccluded());out.writeBoolean(s.complete());out.writeInt(s.nodes().size());
                for(Node n:s.nodes()){out.writeUTF(n.resourceId());box(out,n.bounds());out.writeBoolean(n.visible());out.writeBoolean(n.enabled());out.writeBoolean(n.editable());out.writeBoolean(n.password());}}
            out.flush();byte[] hash=MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray());
            StringBuilder text=new StringBuilder(64);for(byte b:hash){text.append(Character.forDigit((b>>>4)&15,16));text.append(Character.forDigit(b&15,16));}return text.toString();
        }catch(IOException|NoSuchAlgorithmException e){throw new IllegalStateException("evidence digest unavailable");}
    }
    private static void box(DataOutputStream out,Bounds b)throws IOException{out.writeInt(b.left());out.writeInt(b.top());out.writeInt(b.right());out.writeInt(b.bottom());}
    private static boolean identifier(String s){return s!=null&&s.matches("[A-Za-z0-9_.:-]{1,128}");}
}
