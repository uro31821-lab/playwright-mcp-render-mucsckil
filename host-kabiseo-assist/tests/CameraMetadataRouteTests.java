package com.jh.pobiseo.assist;

import com.jh.pobiseo.assist.CameraSurfacePolicy.*;
import com.jh.pobiseo.assist.CameraMetadataRoute.*;
import java.util.List;
import java.util.Set;

public final class CameraMetadataRouteTests {
    static int tests,assertions;
    static void check(boolean ok){assertions++;if(!ok)throw new AssertionError("check "+assertions);}
    static void run(String label,Runnable test){test.run();tests++;System.out.println("PASS route "+tests+": "+label);}
    static final String PKG="fixture.camera",P=PKG+":id/preview",A=PKG+":id/shutter",B=PKG+":id/back";
    static final Binding BIND=new Binding("cmd","open",PKG,1,7,0,"layout",1000);
    static final Profile PROFILE=new Profile(PKG,1,List.of(A,B),P,Set.of(PKG+":id/chat"),true);
    static Observation observation(Binding b,long at) {
        return new Observation(b.commandId(),b.openingId(),b.packageName(),b.versionCode(),b.windowId(),b.displayId(),b.layoutRevision(),at,true,true,true,true,
            new Bounds(0,0,1000,1800),List.of(
            new Node(P,new Bounds(0,0,1000,1500),true,true,false,false),
            new Node(A,new Bounds(400,1550,500,1650),true,true,false,false),
            new Node(B,new Bounds(50,1550,150,1650),true,true,false,false)));
    }
    static Request request(String id){return new Request(CameraMetadataRoute.ACTION,id,"cmd");}
    static final class Host implements CameraMetadataRoute.Host {
        boolean enabled=true,permitted=true,throwsOnAuthorize;Binding binding=BIND;String layout="layout";Profile profile=PROFILE;
        @Override public boolean metadataRouteEnabled(){return enabled;}
        @Override public Binding authorize(Request r){if(throwsOnAuthorize)throw new IllegalStateException("secret");return binding;}
        @Override public Permit metadataPermit(Binding b){return permitted?new Permit(true,true,true,true,true):Permit.deny();}
        @Override public String currentLayoutRevision(Binding b){return layout;}
        @Override public Profile enrolledProfile(Binding b){return profile;}
    }
    static final class Fixture {
        Host host=new Host();long now=1100;int reads;Runnable during=()->{};
        CameraMetadataRoute.Reader read=(b,p)->{reads++;during.run();return observation(b,1100);};
        CameraMetadataRoute route=new CameraMetadataRoute(host,(b,p)->read.read(b,p),()->now);
        Receipt go(){return route.handle(request("r"));}
    }
    public static void main(String[] args) {
        run("default host disabled",()->{var r=new CameraMetadataRoute(new CameraMetadataRoute.Host(){},(b,p)->{throw new AssertionError("read");},()->1100);check(r.handle(request("r")).reason()==Reason.ROUTE_DISABLED);});
        run("disabled feature never reads",()->{var f=new Fixture();f.host.enabled=false;check(f.go().reason()==Reason.ROUTE_DISABLED);check(f.reads==0);});
        run("unknown action does not fall back",()->{var f=new Fixture();check(f.route.handle(new Request("agent_snapshot","r","cmd")).reason()==Reason.UNSUPPORTED_ACTION);check(f.reads==0);});
        run("null request rejected",()->check(new Fixture().route.handle(null).reason()==Reason.UNSUPPORTED_ACTION));
        run("valid measured camera read",()->{var f=new Fixture();check(f.go().status()==Status.CAMERA_READ_ONLY);check(f.reads==1);});
        run("receipt never grants pixels gestures or camera changes",()->{var r=new Fixture().go();check(!r.permitsGesture());check(!r.permitsPixels());check(!r.cameraSettingsChanged());});
        run("profile missing remains metadata only",()->{var f=new Fixture();f.host.profile=null;check(f.go().status()==Status.PROFILE_REQUIRED);});
        run("missing binding denied",()->{var f=new Fixture();f.host.binding=null;check(f.go().reason()==Reason.NOT_AUTHORIZED);check(f.reads==0);});
        run("host permit required",()->{var f=new Fixture();f.host.permitted=false;check(f.go().reason()==Reason.NOT_AUTHORIZED);check(f.reads==0);});
        run("foreign command binding denied",()->{var f=new Fixture();f.host.binding=new Binding("other","open",PKG,1,7,0,"layout",1000);check(f.go().reason()==Reason.NOT_AUTHORIZED);});
        run("changed layout denied before read",()->{var f=new Fixture();f.host.layout="folded";check(f.go().reason()==Reason.NOT_AUTHORIZED);check(f.reads==0);});
        run("expired binding denied before read",()->{var f=new Fixture();f.now=4001;check(f.go().reason()==Reason.NOT_AUTHORIZED);});
        run("future binding denied",()->{var f=new Fixture();f.now=999;check(f.go().reason()==Reason.NOT_AUTHORIZED);});
        run("duplicate request returns receipt not another read",()->{var f=new Fixture();var first=f.go();f.now=1110;var second=f.go();check(second.replayed());check(second.completedAt()==first.completedAt());check(f.reads==1);});
        run("different request in same command allowed",()->{var f=new Fixture();f.go();f.route.handle(request("another"));check(f.reads==2);});
        run("reuse request with new opening denied",()->{var f=new Fixture();f.go();f.host.binding=new Binding("cmd","new-open",PKG,1,7,0,"layout",1000);check(f.go().reason()==Reason.REQUEST_SCOPE_CHANGED);check(f.reads==1);});
        run("revoked command cannot retrieve cached success",()->{var f=new Fixture();f.go();f.host.permitted=false;check(!f.go().replayed());check(f.go().reason()==Reason.NOT_AUTHORIZED);});
        run("revocation during read hides result",()->{var f=new Fixture();f.during=()->f.host.permitted=false;check(f.go().reason()==Reason.BINDING_CHANGED);});
        run("fold during read hides result",()->{var f=new Fixture();f.during=()->f.host.layout="folded";check(f.go().reason()==Reason.BINDING_CHANGED);});
        run("binding expiry during read hides result",()->{var f=new Fixture();f.during=()->f.now=4001;check(f.go().reason()==Reason.BINDING_CHANGED);});
        run("slow observation denied",()->{var f=new Fixture();f.during=()->f.now=1451;check(f.go().reason()==Reason.SURFACE_NOT_VERIFIED);});
        run("null metadata denied",()->{var f=new Fixture();f.read=(b,p)->null;check(f.go().reason()==Reason.READ_FAILED);});
        run("throwing reader produces sanitized unavailable receipt",()->{var f=new Fixture();f.read=(b,p)->{throw new IllegalStateException("private-text");};var r=f.go();check(r.status()==Status.UNAVAILABLE);check(!r.toString().contains("private-text"));check(f.go().replayed());});
        run("authorization exception is sanitized",()->{var f=new Fixture();f.host.throwsOnAuthorize=true;check(f.go().reason()==Reason.HOST_FAILURE);check(f.reads==0);});
        run("reader reentry is busy and cannot recurse",()->{var f=new Fixture();f.during=()->check(f.route.handle(request("nested")).reason()==Reason.BUSY);check(f.go().status()==Status.CAMERA_READ_ONLY);check(f.reads==1);});
        run("bounded receipt storage rejects overflow without evicting history",()->{var f=new Fixture();for(int i=0;i<CameraMetadataRoute.MAX_RECEIPTS;i++)check(f.route.handle(request("r"+i)).status()==Status.CAMERA_READ_ONLY);check(f.route.handle(request("overflow")).reason()==Reason.RECEIPT_CAPACITY);check(f.route.handle(request("r0")).replayed());check(f.reads==CameraMetadataRoute.MAX_RECEIPTS);});
        run("untrusted observation identity recomputed",()->{var f=new Fixture();f.read=(b,p)->observation(new Binding("cmd","other",PKG,1,7,0,"layout",1000),1100);check(f.go().reason()==Reason.SURFACE_NOT_VERIFIED);});
        run("wrong profile version denied",()->{var f=new Fixture();f.host.profile=new Profile(PKG,2,List.of(A,B),P,Set.of(),true);check(f.go().reason()==Reason.SURFACE_NOT_VERIFIED);});
        run("identifier validation bounds input",()->{for(String bad:new String[]{"", "x".repeat(129),"contains spaces","line\nbreak"}){try{request(bad);throw new AssertionError("bad input accepted");}catch(IllegalArgumentException e){assertions++;}}});
        System.out.println("CameraMetadataRouteTests: "+tests+" scenarios, "+assertions+" assertions; synthetic host bindings, not JH authentication or phone validation.");
    }
}
