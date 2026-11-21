package com.jh.photomaster.core;

/** One-shot change of on-screen size only; perspective changes require camera movement.
 * The Android candidate uses existing CameraX setZoomRatio and independently reads it back. */
public final class V2SubjectSizeZoomPolicy {
  public static final String PROTOCOL="JH_CAMERA_V2_ZOOM_ONLY_V1";
  public static final float MIN_RELATIVE_SCALE=.75f;
  public static final float MAX_RELATIVE_SCALE=1.25f;
  public static final float MAX_QUALITY_ZOOM=2.0f;
  public static final float READBACK_TOLERANCE=.02f;
  public enum State { APPLY,MATCHED,MOVE_REQUIRED,PERSPECTIVE_REQUIRED,
    MANUAL_PRIORITY,CAMERA_BUSY,STALE_CAMERA_STATUS,INVALID }
  public static final class Decision {
    public final State state;
    public final float targetZoom;
    Decision(State state,float zoom){this.state=state;targetZoom=zoom;}
    public boolean mayApply(){return state==State.APPLY;}
  }
  private static boolean finite(float x){return !Float.isNaN(x)&&!Float.isInfinite(x);}
  private V2SubjectSizeZoomPolicy(){}
  public static Decision decide(float current,float expected,float scale,
    float min,float max,boolean perspective,boolean manualGestureActive,boolean busy){
    if(!finite(current)||!finite(expected)||!finite(scale)||!finite(min)||!finite(max)||
      current<=0||expected<=0||min<=0||max<min||
      current<min||current>max||expected<min||expected>max||
      scale<MIN_RELATIVE_SCALE||scale>MAX_RELATIVE_SCALE)
      return new Decision(State.INVALID,Float.NaN);
    if(busy)return new Decision(State.CAMERA_BUSY,Float.NaN);
    // AI is default; only a CURRENT in-flight manual zoom operation blocks this command.
    if(manualGestureActive)return new Decision(State.MANUAL_PRIORITY,Float.NaN);
    if(Math.abs(current-expected)>READBACK_TOLERANCE)
      return new Decision(State.STALE_CAMERA_STATUS,Float.NaN);
    if(perspective)return new Decision(State.PERSPECTIVE_REQUIRED,Float.NaN);
    final float upper=Math.min(max,MAX_QUALITY_ZOOM);
    if(min>upper)return new Decision(State.INVALID,Float.NaN);
    final float target=current*scale;
    if(!finite(target)||target<min||target>upper)
      return new Decision(State.MOVE_REQUIRED,Float.NaN);
    // A size-only change must never reverse the requested direction.
    if((scale>1.0f&&target<current)||(scale<1.0f&&target>current))
      return new Decision(State.MOVE_REQUIRED,Float.NaN);
    if(Math.abs(target-current)<=READBACK_TOLERANCE)
      return new Decision(State.MATCHED,current);
    return new Decision(State.APPLY,target);
  }
}
