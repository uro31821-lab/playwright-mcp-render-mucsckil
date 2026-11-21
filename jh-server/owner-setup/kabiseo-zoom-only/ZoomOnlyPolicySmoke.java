import com.jh.photomaster.core.V2SubjectSizeZoomPolicy;
import com.jh.photomaster.core.V2SubjectSizeZoomPolicy.State;
class ZoomOnlyPolicySmoke {
 static void expect(State s,V2SubjectSizeZoomPolicy.Decision d){
  if(d.state!=s)throw new AssertionError("expected "+s+" got "+d.state);
 }
 public static void main(String[] args){
  expect(State.APPLY,V2SubjectSizeZoomPolicy.decide(1,1,1.15f,1,10,false,false,false));
  expect(State.APPLY,V2SubjectSizeZoomPolicy.decide(1.5f,1.5f,.85f,1,10,false,false,false));
  expect(State.MOVE_REQUIRED,V2SubjectSizeZoomPolicy.decide(1,1,.85f,1,10,false,false,false));
  expect(State.MOVE_REQUIRED,V2SubjectSizeZoomPolicy.decide(2,2,1.25f,1,10,false,false,false));
  expect(State.PERSPECTIVE_REQUIRED,V2SubjectSizeZoomPolicy.decide(1,1,1.15f,1,10,true,false,false));
  expect(State.MANUAL_PRIORITY,V2SubjectSizeZoomPolicy.decide(1.2f,1.2f,1.15f,1,10,false,true,false));
  expect(State.CAMERA_BUSY,V2SubjectSizeZoomPolicy.decide(1.2f,1.2f,1.15f,1,10,false,false,true));
  expect(State.STALE_CAMERA_STATUS,V2SubjectSizeZoomPolicy.decide(1.5f,1.1f,.85f,1,10,false,false,false));
  // Regression: fractional overshoot must not exceed the 2x quality cap.
  expect(State.MOVE_REQUIRED,V2SubjectSizeZoomPolicy.decide(1.60004f,1.60004f,1.25f,1,8,false,false,false));
  // Reducing an existing user-controlled >2x zoom to a safe value is permitted.
  expect(State.APPLY,V2SubjectSizeZoomPolicy.decide(2.3f,2.3f,.85f,1,8,false,false,false));
  expect(State.MOVE_REQUIRED,V2SubjectSizeZoomPolicy.decide(2.3f,2.3f,1.15f,1,8,false,false,false));
  expect(State.INVALID,V2SubjectSizeZoomPolicy.decide(.99995f,.99995f,1.15f,1,8,false,false,false));
  expect(State.INVALID,V2SubjectSizeZoomPolicy.decide(1f,.99995f,1.15f,1,8,false,false,false));
  expect(State.INVALID,V2SubjectSizeZoomPolicy.decide(10.00001f,10.00001f,.85f,1,10,false,false,false));
  // Deterministic policy invariants across 12,000 zoom inputs, 100 independent JVM runs in CI.
  java.util.Random rnd=new java.util.Random(0x22851001L);
  float[] scales={.75f,.85f,1f,1.15f,1.25f};
  int checked=0;
  for(int i=0;i<12000;i++){
    float min=rnd.nextBoolean()?1f:.5f;
    float max=rnd.nextBoolean()?8f:2f;
    float current=min+rnd.nextFloat()*(max-min);
    float scale=scales[i%scales.length];
    boolean perspective=i%17==0,manual=i%23==0,busy=i%29==0;
    V2SubjectSizeZoomPolicy.Decision d=V2SubjectSizeZoomPolicy.decide(
       current,current,scale,min,max,perspective,manual,busy);
    if(d.state==null)throw new AssertionError("null zoom policy state "+i);
    if(d.mayApply()){
      if(!Float.isFinite(d.targetZoom)||d.targetZoom<min||d.targetZoom>max||
         d.targetZoom>V2SubjectSizeZoomPolicy.MAX_QUALITY_ZOOM)
        throw new AssertionError("zoom limit violation "+i);
      if((scale>=1&&d.targetZoom<current)||(scale<=1&&d.targetZoom>current))
        throw new AssertionError("reversed zoom direction "+i);
      if(perspective||manual||busy)
        throw new AssertionError("zoom modified during busy or manual state "+i);
    }else if(!Float.isNaN(d.targetZoom)&&d.state!=State.MATCHED)
      throw new AssertionError("unapproved camera target "+i);
    checked++;
  }
  if(checked!=12000)throw new AssertionError("partial zoom fuzz");
  System.out.println("ZOOM_ONLY_12000_INVARIANTS_PASS");
  System.out.println("ZOOM_ONLY_SMOKE_PASS");
 }
}
