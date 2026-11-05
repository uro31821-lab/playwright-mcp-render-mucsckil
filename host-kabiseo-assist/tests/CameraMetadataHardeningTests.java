package com.jh.pobiseo.assist;

import com.jh.pobiseo.assist.CameraSurfacePolicy.*;
import com.jh.pobiseo.assist.CameraMetadataRoute.*;
import java.util.List;
import java.util.Set;

/** Synthetic CURRENT host bindings only; no device, authentication server or camera is exercised. */
public final class CameraMetadataHardeningTests {
    private static int tests, assertions;
    private static void check(boolean ok) { assertions++; if(!ok) throw new AssertionError("check "+assertions); }
    private static void run(String label,Runnable test) { test.run();tests++;System.out.println("PASS hardening "+tests+": "+label); }
    private static final String PKG="fixture.camera",P=PKG+":id/preview",A=PKG+":id/shutter",B=PKG+":id/back";
    private static final Binding BIND=new Binding("cmd","open",PKG,1,7,0,"layout",1000);
    private static final Profile PROFILE=new Profile(PKG,1,List.of(A,B),P,Set.of(PKG+":id/chat"),true);
    private static final Permit PERMIT=new Permit(true,true,true,true,true);
    private static Request request(String id) { return new Request(CameraMetadataRoute.ACTION,id,"cmd"); }
    private static Observation observation(Binding b,long at) {
        return new Observation(b.commandId(),b.openingId(),b.packageName(),b.versionCode(),b.windowId(),b.displayId(),b.layoutRevision(),at,
            true,true,true,true,new Bounds(0,0,1000,1800),List.of(
                new Node(P,new Bounds(0,0,1000,1500),true,true,false,false),
                new Node(A,new Bounds(400,1550,500,1650),true,true,false,false),
                new Node(B,new Bounds(50,1550,150,1650),true,true,false,false)));
    }
    private static final class Fixture {
        long now=1100; boolean enabled=true,permitted=true,allowLegacy; int reads,authorizations;
        Binding current=BIND; Profile profile=PROFILE; Request lastRequest;
        Runnable duringRead=()->{},duringAuthorize=()->{},duringProfile=()->{};
        final CameraMetadataRoute route=new CameraMetadataRoute(new Host() {
            @Override public boolean metadataRouteEnabled() { return enabled; }
            @Override public Binding authorize(Request r) {
                authorizations++; lastRequest=r; duringAuthorize.run();
                if(!r.action().equals(CameraMetadataRoute.ACTION) && !allowLegacy) return null;
                return current;
            }
            @Override public Permit metadataPermit(Binding b) { return permitted?PERMIT:Permit.deny(); }
            @Override public String currentLayoutRevision(Binding b) { return "layout"; }
            @Override public Profile enrolledProfile(Binding b) { duringProfile.run();return profile; }
        }, (b,p)->{ reads++;duringRead.run();return observation(b,1100); },()->now);
        Receipt go() { return route.handle(request("r")); }
    }
    private static void deniedAfterRead(Fixture f) {
        Receipt r=f.go();check(r.status()==Status.DENIED);check(r.reason()==Reason.BINDING_CHANGED);
        check(!r.permitsGesture()&&!r.permitsPixels()&&!r.cameraSettingsChanged());check(f.reads==1);
    }
    public static void main(String[] args) {
        run("public name and new action are 카비서",()->{
            check(CameraMetadataRoute.DISPLAY_NAME.equals("카비서"));check(CameraMetadataRoute.ACTION.equals("KABISEO_CAMERA_METADATA"));
        });
        run("legacy action reaches host unchanged only with explicit host permission",()->{
            var f=new Fixture();f.allowLegacy=true;var r=new Request(CameraMetadataRoute.LEGACY_ACTION,"r","cmd");
            check(f.route.handle(r).status()==Status.CAMERA_READ_ONLY);check(f.lastRequest==r);check(f.reads==1);
        });
        run("legacy alias never bypasses host action authorization",()->{
            var f=new Fixture();check(f.route.handle(new Request(CameraMetadataRoute.LEGACY_ACTION,"r","cmd")).reason()==Reason.NOT_AUTHORIZED);check(f.reads==0);
        });
        run("changing an alias cannot reuse an existing request receipt",()->{
            var f=new Fixture();f.allowLegacy=true;f.go();
            check(f.route.handle(new Request(CameraMetadataRoute.LEGACY_ACTION,"r","cmd")).reason()==Reason.REQUEST_SCOPE_CHANGED);check(f.reads==1);
        });
        run("legacy alias with a different request remains explicitly authorized",()->{
            var f=new Fixture();f.allowLegacy=true;f.go();
            check(f.route.handle(new Request(CameraMetadataRoute.LEGACY_ACTION,"legacy-r","cmd")).status()==Status.CAMERA_READ_ONLY);check(f.reads==2);
        });
        run("feature disabled during read prevents successful result",()->{
            var f=new Fixture();f.duringRead=()->f.enabled=false;deniedAfterRead(f);
        });
        run("authorization withdrawn during read prevents successful result",()->{
            var f=new Fixture();f.duringRead=()->f.current=null;deniedAfterRead(f);
        });
        Binding[] replacements={
            new Binding("other-cmd","open",PKG,1,7,0,"layout",1000),
            new Binding("cmd","new-open",PKG,1,7,0,"layout",1000),
            new Binding("cmd","open","another.camera",1,7,0,"layout",1000),
            new Binding("cmd","open",PKG,2,7,0,"layout",1000),
            new Binding("cmd","open",PKG,1,8,0,"layout",1000),
            new Binding("cmd","open",PKG,1,7,1,"layout",1000),
            new Binding("cmd","open",PKG,1,7,0,"folded",1000),
            new Binding("cmd","open",PKG,1,7,0,"layout",1001)
        };
        String[] fields={"command","opening","package","version","window","display","layout","issued-at"};
        for(int i=0;i<replacements.length;i++){
            final Binding replacement=replacements[i];
            run("live binding change rejected: "+fields[i],()->{var f=new Fixture();f.duringRead=()->f.current=replacement;deniedAfterRead(f);});
        }
        run("profile revoked while reading invalidates camera claim",()->{
            var f=new Fixture();f.duringRead=()->f.profile=null;deniedAfterRead(f);
        });
        run("profile replaced while reading invalidates camera claim",()->{
            var f=new Fixture();f.duringRead=()->f.profile=new Profile(PKG,1,List.of(A,B),P,Set.of(PKG+":id/changed"),true);deniedAfterRead(f);
        });
        run("cached success cannot survive profile revocation",()->{
            var f=new Fixture();f.go();f.profile=null;var r=f.go();check(r.reason()==Reason.BINDING_CHANGED);check(!r.replayed());check(f.reads==1);
        });
        run("cached success cannot survive feature disable",()->{
            var f=new Fixture();f.go();f.enabled=false;check(f.go().reason()==Reason.ROUTE_DISABLED);check(f.reads==1);
        });
        run("authorizer reentry cannot recursively authorize",()->{
            var f=new Fixture();f.duringAuthorize=()->check(f.route.handle(request("nested")).reason()==Reason.BUSY);
            check(f.go().status()==Status.CAMERA_READ_ONLY);check(f.reads==1);
        });
        run("feature disabled by profile lookup prevents any read",()->{
            var f=new Fixture();f.duringProfile=()->f.enabled=false;
            check(f.go().reason()==Reason.BINDING_CHANGED);check(f.reads==0);
        });
        run("binding changed by profile lookup prevents any read",()->{
            var f=new Fixture();f.duringProfile=()->f.current=replacements[1];
            check(f.go().reason()==Reason.BINDING_CHANGED);check(f.reads==0);
        });
        run("host exception releases reentry lock and hides private details",()->{
            var f=new Fixture();f.duringAuthorize=()->{throw new IllegalStateException("private payload");};
            var r=f.go();check(r.reason()==Reason.HOST_FAILURE);check(!r.toString().contains("private payload"));
            f.duringAuthorize=()->{};check(f.go().status()==Status.CAMERA_READ_ONLY);
        });
        run("slow authorization rechecks expiry after host callbacks",()->{
            var f=new Fixture();f.duringAuthorize=()->{if(f.authorizations>=2) f.now=5000;};
            check(f.go().reason()==Reason.NOT_AUTHORIZED);check(f.reads==0);
        });
        run("unchanged binding is repeatedly authorized and remains read only",()->{
            var f=new Fixture();var r=f.go();check(f.authorizations>=4);check(r.status()==Status.CAMERA_READ_ONLY);
            check(!r.permitsGesture()&&!r.permitsPixels()&&!r.cameraSettingsChanged());
        });
        System.out.println("CameraMetadataHardeningTests: "+tests+" scenarios, "+assertions+" assertions; JVM synthetic cases, NOT device tests.");
    }
}
