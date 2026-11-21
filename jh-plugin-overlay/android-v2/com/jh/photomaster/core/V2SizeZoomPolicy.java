package com.jh.photomaster.core;

/** One finite, bounded size-only framing correction; NO scene tracking, image
 * transfer, remote AUTO or shutter. Authenticated host/device gates apply
 * independently before any CameraX setZoomRatio side-effect. */
public final class V2SizeZoomPolicy {
    private V2SizeZoomPolicy() {}
    public static final String PROTOCOL = "JH_CAMERA_V2_ZOOM_ONLY_V1";
    public static final float MAX_QUALITY_ZOOM = 2.0f;
    public static final float EPSILON = 0.02f;
    // Relative to the CURRENT zoom, never an absolute 0.1x / 0.2x addition.

    public static float choose(float current,float min,float max,String direction,String strength){
        if(!Float.isFinite(current)||!Float.isFinite(min)||!Float.isFinite(max)||
           current<=0.0f||min<=0.0f||max<min||
           current<min-EPSILON||current>max+EPSILON||
           !("IN".equals(direction)||"OUT".equals(direction)))return Float.NaN;
        final float multiplier;
        if("SMALL".equals(strength))multiplier="IN".equals(direction)?1.15f:0.85f;
        else if("MEDIUM".equals(strength))multiplier="IN".equals(direction)?1.25f:0.75f;
        else return Float.NaN;
        final float upper=Math.min(max,MAX_QUALITY_ZOOM);
        if(upper<min)return Float.NaN;
        final float raw=current*multiplier;
        final float suggested=Math.max(min,Math.min(upper,raw));
        return !Float.isFinite(suggested)||Math.abs(suggested-current)<EPSILON?
            Float.NaN:suggested;
    }
}
