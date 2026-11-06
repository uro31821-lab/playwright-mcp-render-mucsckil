package com.jh.kabiseo.session;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** Pure setting-plan state machine, not a camera/UI driver or authorization provider.
 * Inspired by public CameraX session/capability patterns, implemented independently.
 * A host must bind observations, capabilities and completions to its actual authorized
 * camera session. CameraInfo's optimistic ZoomState alone is NOT settled completion.
 * Never opens cameras, dispatches gestures, captures pixels, persists settings or retries.
 */
public final class CameraSettingsSession {
    public enum Control { ZOOM_RATIO, EXPOSURE_INDEX, TORCH }
    public enum Backend { OWNED_CAMERA_API, VERIFIED_HOST_UI, READ_ONLY }
    public enum State { READY, ACTIVE, RESTORING, RESTORED, CONFLICT, NEEDS_RECONCILIATION, INVALIDATED }
    public record Scope(String opening, String camera, String layout, Backend backend) {
        public Scope { text(opening); text(camera); text(layout); Objects.requireNonNull(backend); }
    }
    /** EXPOSURE_INDEX is an integer index, NOT EV; the real adapter maps EV using ExposureState.step. */
    public record Support(double min, double max, boolean readable, boolean writable, boolean restorable) {
        public Support { if (!Double.isFinite(min)||!Double.isFinite(max)||min>max) throw new IllegalArgumentException("invalid limits"); }
    }
    public record Capabilities(Scope scope, Map<Control,Support> controls) {
        public Capabilities {
            Objects.requireNonNull(scope); controls=Map.copyOf(controls);
            for (var e:controls.entrySet()) {
                var r=e.getValue();
                if (e.getKey()==Control.ZOOM_RATIO && r.min()<=0) throw new IllegalArgumentException("positive zoom required");
                if (e.getKey()!=Control.ZOOM_RATIO && (r.min()!=Math.rint(r.min())||r.max()!=Math.rint(r.max()))) throw new IllegalArgumentException("integer control required");
                if (e.getKey()==Control.TORCH && (r.min()!=0||r.max()!=1)) throw new IllegalArgumentException("torch is boolean, not photo flash mode");
            }
        }
    }
    /** Sequence and monotonic time come from an actual local observer, not chat or screenshot guesses. */
    public record View(Scope scope, long sequence, long observedAt, boolean open, boolean settled, Map<Control,Double> values) {
        public View {
            Objects.requireNonNull(scope); values=Map.copyOf(values);
            if (sequence<0||observedAt<0) throw new IllegalArgumentException("invalid observation");
            for (var e:values.entrySet()) {
                double v=e.getValue();
                if (!Double.isFinite(v)||(e.getKey()==Control.ZOOM_RATIO&&v<=0)
                    ||(e.getKey()==Control.EXPOSURE_INDEX&&v!=Math.rint(v))
                    ||(e.getKey()==Control.TORCH&&v!=0&&v!=1)) throw new IllegalArgumentException("invalid value");
            }
        }
    }
    public static final class Plan {
        private final Control control; private final double before,target; private final long sequence;
        private final boolean restoring,clamped;
        private Plan(Control c,double before,double target,long sequence,boolean restoring,boolean clamped) {
            this.control=c; this.before=before; this.target=target; this.sequence=sequence; this.restoring=restoring; this.clamped=clamped;
        }
        public Control control(){return control;}
        public double before(){return before;}
        public double target(){return target;}
        public boolean restoring(){return restoring;}
        public boolean clamped(){return clamped;}
        public boolean grantsDevicePermission(){return false;}
        @Override public String toString(){return "Plan["+control+",restore="+restoring+",not-authority]";}
    }
    private final Scope scope;
    private final Capabilities capabilities;
    private final EnumMap<Control,Double> initial=new EnumMap<>(Control.class);
    private final EnumMap<Control,Double> expected=new EnumMap<>(Control.class);
    private final LinkedHashSet<Control> touched=new LinkedHashSet<>();
    private State state=State.READY;
    private Plan pending;
    private long lastNow,lastSequence;
    public CameraSettingsSession(Capabilities capabilities,View initialView,long now) {
        this.capabilities=Objects.requireNonNull(capabilities); this.scope=capabilities.scope();
        Objects.requireNonNull(initialView);
        if (!scope.equals(initialView.scope())||!initialView.open()||!initialView.settled()
                ||now<initialView.observedAt()||now-initialView.observedAt()>750) throw new IllegalArgumentException("fresh settled baseline required");
        for (var e:initialView.values().entrySet()) {
            Support s=capabilities.controls().get(e.getKey());
            if (s!=null&&(e.getValue()<s.min()||e.getValue()>s.max())) throw new IllegalArgumentException("baseline outside limits");
        }
        initial.putAll(initialView.values());expected.putAll(initial);lastNow=now;lastSequence=initialView.sequence();
    }
    public synchronized State state(){return state;}
    public synchronized boolean restorationVerified(){return state==State.RESTORED;}
    public synchronized Optional<Plan> propose(Control control,double desired,View view,long now) {
        Objects.requireNonNull(control);
        if (pending!=null||!(state==State.READY||state==State.ACTIVE)) return Optional.empty();
        if (!fresh(view,now)||!consistent(view)) return Optional.empty();
        Support support=capabilities.controls().get(control);
        if (scope.backend()==Backend.READ_ONLY||support==null||!support.readable()||!support.writable()||!support.restorable()
                ||!initial.containsKey(control)||!view.values().containsKey(control)||!Double.isFinite(desired)) return Optional.empty();
        if (!equal(view.values().get(control),expected.get(control))) { state=State.CONFLICT;return Optional.empty(); }
        if (control==Control.TORCH&&desired!=0&&desired!=1) return Optional.empty();
        if (control==Control.EXPOSURE_INDEX&&desired!=Math.rint(desired)) return Optional.empty();
        double target=Math.max(support.min(),Math.min(support.max(),desired));
        if (equal(target,view.values().get(control))) return Optional.empty();
        pending=new Plan(control,view.values().get(control),target,view.sequence(),false,!equal(target,desired));
        return Optional.of(pending);
    }
    /** Call after capture/cancel while the SAME camera is still available, before close/unbind.
     * Returns each restore proposal ONCE; a missing/uncertain completion is never replayed.
     */
    public synchronized Optional<Plan> nextRestore(View view,long now) {
        if (pending!=null||!(state==State.READY||state==State.ACTIVE||state==State.RESTORING)) return Optional.empty();
        if (!fresh(view,now)||!consistent(view)) return Optional.empty();
        state=State.RESTORING;
        var reverse=new ArrayList<>(touched);Collections.reverse(reverse);
        for (Control c:reverse) {
            double original=initial.get(c),current=view.values().get(c);
            if (!equal(original,current)) {
                pending=new Plan(c,current,original,view.sequence(),true,false);
                return Optional.of(pending);
            }
        }
        state=State.RESTORED;return Optional.empty();
    }
    /** definitiveApplied means a matched completion from the existing real adapter, not optimism.
     * An actual executor still needs its original signature/approval checks before EACH write.
     */
    public synchronized boolean complete(Plan plan,boolean definitiveApplied,View view,long now) {
        if (plan==null||plan!=pending) return false;
        pending=null;
        if (!definitiveApplied) { state=State.NEEDS_RECONCILIATION;return false; }
        if (!fresh(view,now)) return false;
        if (view.sequence()<=plan.sequence||!view.values().containsKey(plan.control)
                ||!equal(view.values().get(plan.control),plan.target)) { state=State.NEEDS_RECONCILIATION;return false; }
        // A different control changed during an asynchronous operation: do not overwrite the user.
        for (Control c:touched) if (c!=plan.control&&!equal(expected.get(c),view.values().get(c))) {
            state=State.CONFLICT;return false;
        }
        expected.put(plan.control,plan.target);touched.add(plan.control);
        state=plan.restoring?State.RESTORING:State.ACTIVE;
        return true;
    }
    public synchronized void invalidate() {pending=null;state=State.INVALIDATED;}
    private boolean fresh(View v,long now) {
        if (v==null||!scope.equals(v.scope())||!v.open()||now<lastNow||v.observedAt()>now
                ||now-v.observedAt()>750||v.sequence()<lastSequence) {invalidate();return false;}
        if (!v.settled()) {pending=null;state=State.NEEDS_RECONCILIATION;return false;}
        lastNow=now;lastSequence=v.sequence();return true;
    }
    private boolean consistent(View v) {
        for (Control c:touched) if (!equal(expected.get(c),v.values().get(c))) {state=State.CONFLICT;return false;}
        return true;
    }
    private static boolean equal(Double a,Double b) {return a!=null&&b!=null&&Math.abs(a-b)<=0.000001;}
    private static void text(String s){if(s==null||s.isBlank()||s.length()>256)throw new IllegalArgumentException("invalid scope");}
}
