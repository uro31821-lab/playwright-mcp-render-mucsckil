package com.jh.pobiseo.assist;

import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Metadata-only camera-surface validation. Never grants screenshot, gesture or other write access.
 * A new signed host route is required: do NOT use this as a fallback that ignores a split-screen denial.
 */
public final class CameraSurfacePolicy {
    private CameraSurfacePolicy() {}
    public static final long BINDING_TTL_MS = 3000;
    public static final long OBSERVATION_TTL_MS = 350;
    public record Bounds(int left,int top,int right,int bottom) {
        public Bounds { if(left<0||top<0||right<=left||bottom<=top) throw new IllegalArgumentException("invalid bounds"); }
        public boolean contains(Bounds b){return b!=null&&left<=b.left&&top<=b.top&&right>=b.right&&bottom>=b.bottom;}
        public boolean overlaps(Bounds b){return b!=null&&left<b.right&&right>b.left&&top<b.bottom&&bottom>b.top;}
    }
    public record Binding(String commandId,String openingId,String packageName,long versionCode,
                          int windowId,int displayId,String layoutRevision,long issuedAt) {
        public Binding {
            require(commandId);require(openingId);require(packageName);require(layoutRevision);
            if(versionCode<=0||windowId<0||displayId<0||issuedAt<0)throw new IllegalArgumentException("invalid binding");
        }
    }
    /** Must be derived by the host from the actual existing security checks, not caller-provided booleans. */
    public record Permit(boolean authenticatedDevice,boolean currentCommand,boolean userRequestedMetadata,
                         boolean packageIdentityVerified,boolean notRevoked) {
        public static Permit deny(){return new Permit(false,false,false,false,false);}
    }
    /** No text, content descriptions, screenshots, usernames or chat content. */
    public record Node(String resourceId,Bounds bounds,boolean visible,boolean enabled,
                       boolean editable,boolean password) {
        public Node {Objects.requireNonNull(resourceId);Objects.requireNonNull(bounds);}
    }
    public record Observation(String commandId,String openingId,String packageName,long versionCode,
                              int windowId,int displayId,String layoutRevision,long observedAt,
                              boolean applicationWindow,boolean active,boolean unoccluded,
                              boolean traversalComplete,Bounds windowBounds,List<Node> nodes) {
        public Observation {Objects.requireNonNull(windowBounds);nodes=List.copyOf(nodes);}
    }
    /** Enrol locally only after actual surface identification; no production profile is bundled. */
    public record Profile(String packageName,long versionCode,List<String> cameraAnchorIds,String previewId,
                          Set<String> prohibitedIds,boolean cameraOnlySurfaceAttested) {
        public Profile {
            require(packageName);require(previewId);cameraAnchorIds=List.copyOf(cameraAnchorIds);
            prohibitedIds=Set.copyOf(prohibitedIds);
            if(versionCode<=0||cameraAnchorIds.size()<2||Set.copyOf(cameraAnchorIds).size()!=cameraAnchorIds.size()
                ||cameraAnchorIds.contains(previewId)||prohibitedIds.contains(previewId))
                throw new IllegalArgumentException("distinct measured anchors required");
            for(String id:cameraAnchorIds){require(id);if(prohibitedIds.contains(id))throw new IllegalArgumentException("conflicting anchor");}
            for(String id:prohibitedIds)require(id);
        }
    }
    public enum State { DENIED, METADATA_ONLY_PROFILE_REQUIRED, READ_ONLY_CAMERA_SURFACE }
    public record Result(State state,String reason,Bounds preview) {
        /** Intentionally ALWAYS false: even a camera match is not authorization to act. */
        public boolean permitsGesture(){return false;}
        public boolean permitsPixels(){return false;}
    }
    public static boolean mayReadMetadata(Binding b,Permit p,long now) {
        return b!=null&&p!=null&&p.authenticatedDevice&&p.currentCommand&&p.userRequestedMetadata
            &&p.packageIdentityVerified&&p.notRevoked&&now>=b.issuedAt&&now-b.issuedAt<=BINDING_TTL_MS;
    }
    public static Result inspect(Binding b,Permit p,Observation o,Profile profile,long now) {
        if(!mayReadMetadata(b,p,now))return deny("metadata_authorization_missing_or_expired");
        if(o==null)return deny("no_observation");
        if(!Objects.equals(b.commandId,o.commandId)||!Objects.equals(b.openingId,o.openingId))return deny("command_or_opening_changed");
        if(!Objects.equals(b.packageName,o.packageName)||b.versionCode!=o.versionCode)return deny("package_or_version_changed");
        if(b.windowId!=o.windowId||b.displayId!=o.displayId||!Objects.equals(b.layoutRevision,o.layoutRevision))return deny("window_or_layout_changed");
        if(o.observedAt<b.issuedAt||o.observedAt>now||now-o.observedAt>OBSERVATION_TTL_MS)return deny("observation_not_fresh");
        if(!o.applicationWindow||!o.active||!o.unoccluded)return deny("camera_window_not_visible_or_unobscured");
        if(!o.traversalComplete||o.nodes.isEmpty()||o.nodes.size()>512)return deny("incomplete_metadata");
        for(Node n:o.nodes)if(n.visible&&(n.editable||n.password))return deny("visible_input_or_secret_field");
        if(profile==null)return new Result(State.METADATA_ONLY_PROFILE_REQUIRED,"camera_profile_not_enrolled",null);
        if(!profile.packageName.equals(o.packageName)||profile.versionCode!=o.versionCode||!profile.cameraOnlySurfaceAttested)
            return deny("profile_not_verified_for_this_version");
        for(Node n:o.nodes)if(n.visible&&profile.prohibitedIds.contains(n.resourceId))return deny("non_camera_surface_marker_present");
        for(String anchor:profile.cameraAnchorIds) {
            Node n=uniqueVisible(o.nodes,anchor);
            if(n==null||!o.windowBounds.contains(n.bounds))return deny("camera_anchor_missing_or_ambiguous");
        }
        Node preview=uniqueVisible(o.nodes,profile.previewId);
        if(preview==null||!o.windowBounds.contains(preview.bounds))return deny("preview_missing_ambiguous_or_outside");
        return new Result(State.READ_ONLY_CAMERA_SURFACE,"camera_metadata_matches_not_action_authorization",preview.bounds);
    }
    private static Node uniqueVisible(List<Node> nodes,String id) {
        Node found=null;
        for(Node n:nodes)if(n.visible&&id.equals(n.resourceId)){if(found!=null)return null;found=n;}
        return found;
    }
    private static Result deny(String reason){return new Result(State.DENIED,reason,null);}
    private static void require(String s){if(s==null||s.isBlank())throw new IllegalArgumentException("blank field");}
}
