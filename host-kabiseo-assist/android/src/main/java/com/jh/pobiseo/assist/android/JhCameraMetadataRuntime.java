package com.jh.pobiseo.assist.android;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Display;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import com.jh.pobiseo.assist.CameraCommandGate;
import com.jh.pobiseo.assist.CameraCommandGate.Command;
import com.jh.pobiseo.assist.CameraCommandGate.Live;
import com.jh.pobiseo.assist.CameraMetadataRoute;
import com.jh.pobiseo.assist.CameraSurfacePolicy.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** Bounded read-only bridge from the existing signed poll worker to its existing service main thread.
 * No new service, listener, launch, pixels, gestures, attachment or camera setting changes.
 * The caller must already have verified the ORIGINAL job and keep its cancellation/session checks live.
 * No profile is auto-enrolled; an unprofiled GPT window can NEVER claim camera verification.
 */
@android.annotation.TargetApi(34)
@SuppressWarnings("deprecation")
public final class JhCameraMetadataRuntime {
    private JhCameraMetadataRuntime() {}
    public interface Profiles { Profile enrolled(String packageName,long versionCode,String signerDigest); }
    private record Surface(int windowId,int displayId,long versionCode,String signer,String layout) {}
    public static CameraMetadataRoute.Receipt run(AccessibilityService service,Command command,
            String verifiedCode,Supplier<Live> live,LongSupplier transportNow,LongSupplier eventRevision,Profiles profiles) {
        if(service==null||live==null||transportNow==null||eventRevision==null||profiles==null)return denied(CameraMetadataRoute.Reason.NOT_AUTHORIZED);
        if(android.os.Build.VERSION.SDK_INT<34)return denied(CameraMetadataRoute.Reason.ROUTE_DISABLED);
        // Called by the existing polling worker. Never block the service's main looper.
        if(Looper.myLooper()==Looper.getMainLooper())return denied(CameraMetadataRoute.Reason.HOST_FAILURE);
        final long began=SystemClock.elapsedRealtime();
        final AtomicBoolean open=new AtomicBoolean(true);
        final CountDownLatch done=new CountDownLatch(1);
        final AtomicReference<CameraMetadataRoute.Receipt> output=new AtomicReference<>();
        final java.util.concurrent.atomic.AtomicLong publishedRevision=new java.util.concurrent.atomic.AtomicLong(-1);
        final Handler main=new Handler(Looper.getMainLooper());
        final Runnable task=()->{
            try {
                if(!allowed(command,live,transportNow,verifiedCode,open,began))return;
                final long revision=eventRevision.getAsLong();
                final Surface surface=surface(service,command.targetPackage(),revision);
                if(surface==null||revision!=eventRevision.getAsLong())return;
                final Binding binding=new Binding(command.commandId(),UUID.randomUUID().toString(),command.targetPackage(),
                    surface.versionCode(),surface.windowId(),surface.displayId(),surface.layout(),SystemClock.elapsedRealtime());
                final CameraMetadataRoute.Request request=new CameraMetadataRoute.Request(command.action(),command.id(),command.commandId());
                final CameraMetadataRoute.Host host=new CameraMetadataRoute.Host(){
                    private boolean current() {
                        return allowed(command,live,transportNow,verifiedCode,open,began)&&revision==eventRevision.getAsLong()
                            &&surface.equals(surface(service,command.targetPackage(),revision));
                    }
                    @Override public boolean metadataRouteEnabled(){return current();}
                    @Override public Binding authorize(CameraMetadataRoute.Request r){return request.equals(r)&&current()?binding:null;}
                    @Override public Permit metadataPermit(Binding b){return binding.equals(b)&&current()?new Permit(true,true,true,true,true):Permit.deny();}
                    @Override public String currentLayoutRevision(Binding b){return binding.equals(b)&&current()?surface.layout():null;}
                    @Override public Profile enrolledProfile(Binding b){return binding.equals(b)&&current()
                        ?profiles.enrolled(command.targetPackage(),surface.versionCode(),surface.signer()):null;}
                };
                CameraMetadataRoute.Receipt result=new JhCameraMetadataEndpoint(service,host).handle(request);
                if(allowed(command,live,transportNow,verifiedCode,open,began)&&revision==eventRevision.getAsLong()
                        &&surface.equals(surface(service,command.targetPackage(),revision))){publishedRevision.set(revision);output.set(result);}
            }catch(RuntimeException e){output.set(denied(CameraMetadataRoute.Reason.READ_FAILED));}
            finally{done.countDown();}
        };
        try {
            if(!allowed(command,live,transportNow,verifiedCode,open,began))return denied(CameraMetadataRoute.Reason.NOT_AUTHORIZED);
            if(!main.post(task))return denied(CameraMetadataRoute.Reason.HOST_FAILURE);
            if(!done.await(CameraCommandGate.LOCAL_LEASE_MS,TimeUnit.MILLISECONDS))return denied(CameraMetadataRoute.Reason.READ_FAILED);
            if(!allowed(command,live,transportNow,verifiedCode,open,began))return denied(CameraMetadataRoute.Reason.BINDING_CHANGED);
            if(publishedRevision.get()!=eventRevision.getAsLong())return denied(CameraMetadataRoute.Reason.BINDING_CHANGED);
            CameraMetadataRoute.Receipt r=output.get();return r==null?denied(CameraMetadataRoute.Reason.READ_FAILED):r;
        }catch(InterruptedException e){Thread.currentThread().interrupt();return denied(CameraMetadataRoute.Reason.BINDING_CHANGED);}
        finally{open.set(false);main.removeCallbacks(task);}
    }
    private static boolean allowed(Command c,Supplier<Live> live,LongSupplier transportNow,String verified,AtomicBoolean open,long began) {
        try{return open.get()&&CameraCommandGate.localLeaseLive(began,SystemClock.elapsedRealtime())
            &&CameraCommandGate.check(c,live.get(),verified,transportNow.getAsLong())==CameraCommandGate.Decision.ALLOW_METADATA_ONLY;}
        catch(RuntimeException e){return false;}
    }
    private static Surface surface(AccessibilityService service,String pkg,long revision) {
        var info=service.getServiceInfo();
        int flags=AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS|AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        if(info==null||(info.flags&flags)!=flags
            ||(info.getCapabilities()&AccessibilityServiceInfo.CAPABILITY_CAN_RETRIEVE_WINDOW_CONTENT)==0)return null;
        var all=service.getWindowsOnAllDisplays();
        Surface found=null;
        try {
            if(all==null||all.size()>8)return null;
            for(int i=0;i<all.size();i++){
                List<AccessibilityWindowInfo> windows=all.valueAt(i);if(windows==null)continue;
                if(windows.size()>64)return null;
                for(AccessibilityWindowInfo w:windows){
                    if(w==null||w.getType()!=AccessibilityWindowInfo.TYPE_APPLICATION||!w.isActive()||!w.isFocused())continue;
                    AccessibilityNodeInfo root=w.getRoot();
                    try{
                        if(root==null||root.getWindowId()!=w.getId()||!pkg.contentEquals(root.getPackageName()==null?"":root.getPackageName()))continue;
                        if(found!=null)return null; // Ambiguous active target is not a usable binding.
                        Rect b=new Rect();w.getBoundsInScreen(b);
                        if(b.isEmpty()||b.left<0||b.top<0)return null;
                        for(AccessibilityWindowInfo other:windows)if(other!=null&&other.getId()!=w.getId()&&other.getLayer()>w.getLayer()){
                            Rect covered=new Rect();other.getBoundsInScreen(covered);if(Rect.intersects(b,covered))return null;
                        }
                        PackageInfo p=service.getPackageManager().getPackageInfo(pkg,PackageManager.GET_SIGNING_CERTIFICATES);
                        if(p.signingInfo==null)return null;
                        Signature[] signatures=p.signingInfo.getApkContentsSigners();if(signatures==null||signatures.length==0)return null;
                        List<String> signers=new ArrayList<>();
                        for(Signature signature:signatures)signers.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
                        Collections.sort(signers);String signer=String.join(":",signers);
                        DisplayManager dm=service.getSystemService(DisplayManager.class);
                        Display display=dm==null?null:dm.getDisplay(w.getDisplayId());if(display==null)return null;
                        String layout=revision+":"+w.getDisplayId()+":"+display.getRotation()+":"+b.flattenToString()+":"+signer;
                        found=new Surface(w.getId(),w.getDisplayId(),p.getLongVersionCode(),signer,layout);
                    }finally{if(root!=null)root.recycle();}
                }
            }
            return found;
        }catch(PackageManager.NameNotFoundException|NoSuchAlgorithmException|RuntimeException e){return null;}
        finally{if(all!=null)for(int i=0;i<all.size();i++){var list=all.valueAt(i);if(list!=null)for(var w:list)if(w!=null)w.recycle();}}
    }
    private static String hex(byte[] data){StringBuilder out=new StringBuilder();for(byte b:data)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
    private static CameraMetadataRoute.Receipt denied(CameraMetadataRoute.Reason reason){
        return new CameraMetadataRoute.Receipt(CameraMetadataRoute.Status.DENIED,reason,false,SystemClock.elapsedRealtime());
    }
}
