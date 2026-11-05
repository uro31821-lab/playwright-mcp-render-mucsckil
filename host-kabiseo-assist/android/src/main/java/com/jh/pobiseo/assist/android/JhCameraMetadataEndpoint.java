package com.jh.pobiseo.assist.android;

import android.accessibilityservice.AccessibilityService;
import android.os.Looper;
import android.os.SystemClock;
import com.jh.pobiseo.assist.CameraMetadataRoute;
import com.jh.pobiseo.assist.CameraSurfacePolicy.*;
import java.util.Objects;

/** Integration connector for the EXISTING JH service. No service/permission is registered here.
 * Must be invoked only by an explicit camera-metadata command route, never by snapshot fallback.
 * Supplying Host is not the same as implementing host security. Default Host denies everything.
 */
public final class JhCameraMetadataEndpoint {
    private final CameraMetadataRoute route;
    public JhCameraMetadataEndpoint(AccessibilityService service,CameraMetadataRoute.Host verifiedHost) {
        Objects.requireNonNull(service);Objects.requireNonNull(verifiedHost);
        CameraSurfaceInspector inspector=new CameraSurfaceInspector(service,new CameraSurfaceInspector.HostGuard() {
            @Override public Permit metadataPermit(Binding b) {return verifiedHost.metadataPermit(b);}
            @Override public String currentLayoutRevision(Binding b) {return verifiedHost.currentLayoutRevision(b);}
        });
        route=new CameraMetadataRoute(verifiedHost,
            (binding,profile)->inspector.inspect(binding,profile).metadata(),SystemClock::elapsedRealtime);
    }
    public CameraMetadataRoute.Receipt handle(CameraMetadataRoute.Request request) {
        if(Looper.myLooper()!=Looper.getMainLooper())
            throw new IllegalStateException("existing service main thread required");
        return route.handle(request);
    }
}
