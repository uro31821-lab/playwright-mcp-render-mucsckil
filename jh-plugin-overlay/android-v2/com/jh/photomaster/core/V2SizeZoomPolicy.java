package com.jh.photomaster.core;

/** One finite, bounded size-only framing correction; NO scene tracking, image
 * transfer, remote AUTO or shutter. Authenticated host/device gates apply
 * independently before any CameraX setZoomRatio side-effect. */
public final class V2SizeZoomPolicy {
    private V2SizeZoomPolicy() {}
    public static final String PROTOCOL = "JH_AI_CAMERA_V2_SIZE_ZOOM_V1";
    public static final float MAX_QUALITY_ZOOM = 2.0f;
    public static final float EPSILON = 0.02f;
    public static final float SMALL_STEP = 0.10f;
    public static final float MEDIUM_STEP = 0.20f;

    public static float choose(float current,float min,float max,String direction,String strength){
        if(!Float.isFinite(current)||!Float.isFinite(min)||!Float.isFinite(max)||
           current<=0.0f||min<=0.0f||max<min||
           current<min-EPSILON||current>max+EPSILON||
           !("IN".equals(direction)||"OUT".equals(direction)))return Float.NaN;
        final float delta;
        if("SMALL".equals(strength))delta=SMALL_STEP;
        else if("MEDIUM".equals(strength))delta=MEDIUM_STEP;
        else return Float.NaN;
        final float upper=Math.min(max,MAX_QUALITY_ZOOM);
        if(upper<min)return Float.NaN;
        final float raw=current+("IN".equals(direction)?delta:-delta);
        final float suggested=Math.max(min,Math.min(upper,raw));
        return !Float.isFinite(suggested)||Math.abs(suggested-current)<EPSILON?
            Float.NaN:suggested;
    }
}
