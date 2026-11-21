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
  System.out.println("ZOOM_ONLY_SMOKE_PASS");
 }
}
