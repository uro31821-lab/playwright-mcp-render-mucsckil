package com.jh.pobiseo.assist.review;

import com.jh.pobiseo.assist.CameraSurfacePolicy.Bounds;
import com.jh.pobiseo.assist.CameraSurfacePolicy.Node;
import com.jh.pobiseo.assist.CameraSurfacePolicy.Profile;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Offline metadata evidence review ONLY. Not a collector, enrollment authority or device route.
 * Labels, identities and samples must ultimately come from an approved local observation session.
 * This class does NOT authenticate them: a plausible fixture is not physical-camera evidence.
 * It returns only a NON-ATTESTED draft, rejected by the existing runtime CameraSurfacePolicy.
 * No images, node text/descriptions, network, disk writes, timers or Android APIs are used.
 */
public final class CameraProfileReview {
    private CameraProfileReview() {}
    public enum Screen { CAMERA, CHAT, PHOTO_REVIEW }
    public enum Status { REJECTED, DRAFT_REQUIRES_LOCAL_REVIEW }
    public enum Reason { INVALID_INPUT, IDENTITY_CHANGED, DUPLICATE_CAPTURE, INCOMPLETE_SAMPLE,
        INSUFFICIENT_COVERAGE, CAMERA_SIGNATURE_MISSING, CAMERA_INPUT_PRESENT,
        CAMERA_PROHIBITED_MARKER, NEGATIVE_SURFACE_COLLISION, UNATTESTED_DRAFT_ONLY }
    /** screenScope is a locally measured configuration fingerprint, NOT a chat string.
     * Retain package/version/signer/scope together; never export the Profile alone for enrollment.
     */
    public record Identity(String packageName,long versionCode,String signerDigest,String screenScope) {
        public Identity {
            if(packageName==null||!packageName.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")
                ||packageName.length()>200||versionCode<=0||signerDigest==null
                ||!signerDigest.matches("[a-f0-9]{64}(:[a-f0-9]{64}){0,3}")
                ||screenScope==null||!screenScope.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("invalid identity");
        }
    }
    /** Metadata fields only. Capture IDs identify distinct reads; opening IDs identify camera visits.
     * Multiple reads of one opening cannot satisfy the reopen coverage requirement.
     */
    public record Sample(Screen screen,String captureId,String openingId,Identity identity,
            Bounds window,List<Node> nodes,boolean applicationWindow,boolean active,
            boolean unoccluded,boolean complete) {
        public Sample {
            Objects.requireNonNull(screen);Objects.requireNonNull(identity);Objects.requireNonNull(window);
            if(!identifier(captureId)||!identifier(openingId))throw new IllegalArgumentException("invalid sample identity");
            Objects.requireNonNull(nodes);
            if(nodes.size()>512)throw new IllegalArgumentException("sample too large");
            nodes=List.copyOf(nodes);
        }
    }
    public record Draft(Identity identity,Profile profile) {
        public Draft {
            Objects.requireNonNull(identity);Objects.requireNonNull(profile);
            if(profile.cameraOnlySurfaceAttested()||!identity.packageName().equals(profile.packageName())
                ||identity.versionCode()!=profile.versionCode())throw new IllegalArgumentException("unattested identity-bound draft required");
        }
        @Override public String toString(){return "Draft[unattested, not enrolled]";}
    }
    public record Review(Status status,Reason reason,Draft draft,int sampleCount) {
        public Review {
            Objects.requireNonNull(status);Objects.requireNonNull(reason);
            if((status==Status.DRAFT_REQUIRES_LOCAL_REVIEW)!=(draft!=null)||sampleCount<0)
                throw new IllegalArgumentException("invalid review result");
        }
        public boolean physicalEvidenceVerified(){return false;}
        public boolean cameraVerified(){return false;}
        public boolean profileEnrolled(){return false;}
        public boolean permitsGesture(){return false;}
        public boolean permitsPixels(){return false;}
        @Override public String toString(){return "Review["+status+","+reason+",samples="+sampleCount+"]";}
    }
    public static Review review(Identity expected,List<Sample> samples,List<String> cameraAnchorIds,
            String previewId,Set<String> prohibitedIds) {
        if(expected==null||samples==null||samples.size()>32||cameraAnchorIds==null
            ||cameraAnchorIds.size()<2||cameraAnchorIds.size()>8||prohibitedIds==null||prohibitedIds.size()>32)
            return reject(Reason.INVALID_INPUT,0);
        final List<Sample> data; final Profile draft;
        try {
            data=List.copyOf(samples);
            if(!resource(previewId,expected.packageName()))return reject(Reason.INVALID_INPUT,data.size());
            for(String id:cameraAnchorIds)if(!resource(id,expected.packageName()))return reject(Reason.INVALID_INPUT,data.size());
            for(String id:prohibitedIds)if(!resource(id,expected.packageName()))return reject(Reason.INVALID_INPUT,data.size());
            draft=new Profile(expected.packageName(),expected.versionCode(),cameraAnchorIds,previewId,prohibitedIds,false);
        }catch(IllegalArgumentException|NullPointerException e){return reject(Reason.INVALID_INPUT,0);}
        int count=data.size();Set<String> captures=new HashSet<>(),openings=new HashSet<>();
        int cameras=0,chats=0,reviews=0;
        // Validate ALL negative controls, not just the samples which happen to pass the matcher.
        for(Sample s:data){
            if(!expected.equals(s.identity()))return reject(Reason.IDENTITY_CHANGED,count);
            if(!captures.add(s.captureId()))return reject(Reason.DUPLICATE_CAPTURE,count);
            if(!usable(s))return reject(Reason.INCOMPLETE_SAMPLE,count);
            if(s.screen()==Screen.CAMERA){cameras++;openings.add(s.openingId());}
            else if(s.screen()==Screen.CHAT)chats++;else reviews++;
        }
        if(cameras<2||openings.size()<2||chats<1||reviews<1)return reject(Reason.INSUFFICIENT_COVERAGE,count);
        for(Sample s:data){
            if(s.screen()!=Screen.CAMERA){
                // Even disabled controls, edit fields or a convenient prohibited marker cannot
                // conceal reused camera IDs on a chat/photo-review negative control.
                if(hasSignature(s,draft,false))return reject(Reason.NEGATIVE_SURFACE_COLLISION,count);
                continue;
            }
            for(Node n:s.nodes())if(n.visible()&&(n.editable()||n.password()))return reject(Reason.CAMERA_INPUT_PRESENT,count);
            for(Node n:s.nodes())if(n.visible()&&draft.prohibitedIds().contains(n.resourceId()))return reject(Reason.CAMERA_PROHIBITED_MARKER,count);
            if(!hasSignature(s,draft,true))return reject(Reason.CAMERA_SIGNATURE_MISSING,count);
        }
        return new Review(Status.DRAFT_REQUIRES_LOCAL_REVIEW,Reason.UNATTESTED_DRAFT_ONLY,new Draft(expected,draft),count);
    }
    private static boolean usable(Sample s){
        if(!s.applicationWindow()||!s.active()||!s.unoccluded()||!s.complete()||s.nodes().isEmpty())return false;
        for(Node n:s.nodes())if(n.visible()&&!s.window().contains(n.bounds()))return false;
        return true;
    }
    private static boolean hasSignature(Sample s,Profile p,boolean positive){
        Node preview=unique(s,p.previewId());if(preview==null)return false;
        List<Bounds> independent=new ArrayList<>();
        for(String id:p.cameraAnchorIds()){
            Node n=unique(s,id);if(n==null||(positive&&!n.enabled()))return false;
            // Coincident positive anchors may describe the same control, not two independent ones.
            if(positive&&(n.bounds().equals(preview.bounds())||independent.contains(n.bounds())))return false;
            independent.add(n.bounds());
        }
        return true;
    }
    private static Node unique(Sample s,String id){
        Node found=null;for(Node n:s.nodes())if(n.visible()&&n.resourceId().equals(id)){
            if(found!=null)return null;found=n;
        }return found;
    }
    private static boolean identifier(String s){return s!=null&&s.matches("[A-Za-z0-9_.:-]{1,128}");}
    private static boolean resource(String s,String pkg){return s!=null&&s.length()<=256&&s.startsWith(pkg+":id/")
        &&s.substring((pkg+":id/").length()).matches("[A-Za-z0-9_.$]+");}
    private static Review reject(Reason reason,int n){return new Review(Status.REJECTED,reason,null,n);}
}
