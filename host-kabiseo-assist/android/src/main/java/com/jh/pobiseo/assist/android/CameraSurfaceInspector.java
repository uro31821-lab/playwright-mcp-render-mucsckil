package com.jh.pobiseo.assist.android;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.graphics.Rect;
import android.os.Looper;
import android.os.SystemClock;
import android.util.SparseArray;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import com.jh.pobiseo.assist.CameraSurfacePolicy;
import com.jh.pobiseo.assist.CameraSurfacePolicy.*;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Read-only adapter for a NEW explicit host camera-metadata route. Not a split-policy bypass.
 * Reads no node text/description, no pixels; dispatches no gestures. No service/component is registered.
 * Host must supply a fresh, authenticated package/version/window binding, not a screenshot coordinate guess.
 */
@SuppressWarnings("deprecation")
public final class CameraSurfaceInspector {
    public interface HostGuard {
        default Permit metadataPermit(Binding binding){return Permit.deny();}
        /** Return latest event-derived layout revision; null if unknown or changed. */
        default String currentLayoutRevision(Binding binding){return null;}
    }
    public record Report(Result decision,Observation metadata) {}
    private record Pending(AccessibilityNodeInfo node,int depth) {}
    private record Scan(List<Node> nodes,boolean complete) {}
    private final AccessibilityService service;
    private final HostGuard guard;
    public CameraSurfaceInspector(AccessibilityService service,HostGuard guard) {
        this.service=Objects.requireNonNull(service);this.guard=Objects.requireNonNull(guard);
    }
    /** Main-thread bounded pass, called by the existing host. No timer, listener or automatic retries. */
    public Report inspect(Binding b,Profile profile) {
        if(Looper.myLooper()!=Looper.getMainLooper())return denied("host_main_thread_required");
        SparseArray<List<AccessibilityWindowInfo>> displayWindows=null;
        List<AccessibilityWindowInfo> windows=null;
        AccessibilityNodeInfo root=null;
        try {
            long started=SystemClock.elapsedRealtime();
            Permit initial=guard.metadataPermit(b);
            if(!CameraSurfacePolicy.mayReadMetadata(b,initial,started))return denied("metadata_authorization_missing_or_expired");
            var info=service.getServiceInfo();
            int flags=AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS|AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
            if(info==null||(info.flags&flags)!=flags
                ||(info.getCapabilities()&AccessibilityServiceInfo.CAPABILITY_CAN_RETRIEVE_WINDOW_CONTENT)==0)
                return denied("host_metadata_capabilities_missing");
            if(!b.layoutRevision().equals(guard.currentLayoutRevision(b)))return denied("layout_not_current");
            long version=service.getPackageManager().getPackageInfo(b.packageName(),0).getLongVersionCode();
            if(version!=b.versionCode())return denied("package_version_changed");
            displayWindows=service.getWindowsOnAllDisplays();
            windows=displayWindows==null?null:displayWindows.get(b.displayId());
            if(windows==null)return denied("bound_display_not_available");
            AccessibilityWindowInfo target=null;
            for(AccessibilityWindowInfo w:windows)if(w.getId()==b.windowId()&&w.getDisplayId()==b.displayId()) {
                if(target!=null)return denied("ambiguous_window");target=w;
            }
            if(target==null||target.getType()!=AccessibilityWindowInfo.TYPE_APPLICATION||!target.isActive())
                return denied("bound_application_window_missing");
            Rect bounds=new Rect();target.getBoundsInScreen(bounds);
            Bounds area=box(bounds);boolean unoccluded=true;
            for(AccessibilityWindowInfo w:windows)if(w.getId()!=target.getId()&&w.getDisplayId()==b.displayId()
                &&w.getLayer()>target.getLayer()) {
                Rect other=new Rect();w.getBoundsInScreen(other);
                if(!other.isEmpty()&&Rect.intersects(bounds,other)){unoccluded=false;break;}
            }
            if(!unoccluded)return denied("other_window_covers_target");
            root=target.getRoot();
            if(root==null||root.getWindowId()!=b.windowId()||!b.packageName().contentEquals(root.getPackageName()==null?"":root.getPackageName()))
                return denied("root_identity_not_verified");
            Scan scan=scan(root,b,started);
            long ended=SystemClock.elapsedRealtime();
            Permit finalPermit=guard.metadataPermit(b);
            if(!b.layoutRevision().equals(guard.currentLayoutRevision(b)))return denied("layout_changed_during_read");
            Observation o=new Observation(b.commandId(),b.openingId(),b.packageName(),version,b.windowId(),b.displayId(),
                b.layoutRevision(),started,true,true,unoccluded,scan.complete(),area,scan.nodes());
            Result result=CameraSurfacePolicy.inspect(b,finalPermit,o,profile,ended);
            // On any failure, do not export partially read metadata.
            return new Report(result,result.state()==State.DENIED?null:o);
        } catch(android.content.pm.PackageManager.NameNotFoundException|RuntimeException e) {
            return denied("metadata_read_failed");
        } finally {
            if(root!=null)root.recycle();
            if(displayWindows!=null)for(int i=0;i<displayWindows.size();i++) {
                List<AccessibilityWindowInfo> list=displayWindows.valueAt(i);
                if(list!=null)for(AccessibilityWindowInfo w:list)if(w!=null)w.recycle();
            }
        }
    }
    private Scan scan(AccessibilityNodeInfo root,Binding b,long started) {
        ArrayDeque<Pending> todo=new ArrayDeque<>();List<Node> out=new ArrayList<>();boolean complete=true;int visited=0;
        todo.add(new Pending(AccessibilityNodeInfo.obtain(root),0));
        try {
            while(!todo.isEmpty()) {
                Pending item=todo.removeFirst();AccessibilityNodeInfo n=item.node();
                try {
                    if(++visited>512||item.depth()>24||SystemClock.elapsedRealtime()-started>200){complete=false;break;}
                    if(n.getWindowId()!=b.windowId()||!b.packageName().contentEquals(n.getPackageName()==null?"":n.getPackageName())) {
                        complete=false;break;
                    }
                    if(!n.isVisibleToUser())continue;
                    Rect rect=new Rect();n.getBoundsInScreen(rect);
                    // Invalid visible bounds are not silently discarded: they could hide an input field.
                    Bounds position=box(rect);
                    String id=n.getViewIdResourceName();
                    if(id==null||!id.matches("[A-Za-z0-9_.]+:id/[A-Za-z0-9_.$]+"))id="";
                    out.add(new Node(id,position,true,n.isEnabled(),n.isEditable(),n.isPassword()));
                    int children=n.getChildCount();
                    if(children<0||children>512||visited+todo.size()+children>512){complete=false;break;}
                    for(int i=0;i<children;i++) {
                        AccessibilityNodeInfo child=n.getChild(i);
                        if(child==null){complete=false;break;}
                        todo.addLast(new Pending(child,item.depth()+1));
                    }
                    if(!complete)break;
                } finally {n.recycle();}
            }
        } finally {while(!todo.isEmpty())todo.removeFirst().node().recycle();}
        return new Scan(List.copyOf(out),complete);
    }
    private static Bounds box(Rect r){return new Bounds(r.left,r.top,r.right,r.bottom);}
    private static Report denied(String code){return new Report(new Result(State.DENIED,code,null),null);}
}
