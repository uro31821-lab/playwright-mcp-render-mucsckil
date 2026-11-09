package com.jh.kabiseo.capture;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.extensions.ExtensionMode;
import androidx.camera.extensions.ExtensionsManager;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Native camera owned by JH's process. NOT ChatGPT's embedded camera.
 *
 * No model/AI detector is bundled at this stage. Standard CameraX AE/AF/AWB
 * handles most scenes. When low light persists, an explicitly NIGHT-only OEM
 * extension is permitted if supported; AUTO/face retouch are never selected.
 * Luma analysis is a simple hint and NOT model inference.
 *
 * Camera permission is requested locally; no background camera, automatic
 * shutter, network, photo upload, app switching or face beautification.
 *
 * Source integration candidate only. Not wired into deployed JH or installed.
 */
public final class JhSmartCaptureActivity extends ComponentActivity {
    private static final int REQUEST_CAMERA=1702;
    private final ExecutorService analysisExecutor=Executors.newSingleThreadExecutor();
    private PreviewView viewfinder;
    private TextView hint;
    private Button shutter;
    private ProcessCameraProvider provider;
    private ExtensionsManager extensionsManager;
    private volatile long lastLumaSampleAt=-1L; // reset on UI thread; sampled on analysis thread
    private int consecutiveDarkSamples; // accessed only by Android main thread
    private boolean nightModeAttempted;
    private Preview ownPreview;
    private ImageCapture ownCapture;
    private ImageAnalysis ownAnalysis;
    private Camera camera;
    private boolean captureInProgress;
    private boolean foregroundStarted;
    private boolean openingInProgress;
    private volatile int openingRevision; // capture analysis may read this from a worker

    /** Existing JH must explicitly dispatch this Intent after its own user request. */
    public static Intent explicitIntent(Context context) {
        Intent intent=new Intent(context,JhSmartCaptureActivity.class);
        if(!(context instanceof android.app.Activity))intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        // Android 9 and earlier require legacy shared-storage permissions; this
        // module intentionally does not request them or silently change storage.
        if(Build.VERSION.SDK_INT<Build.VERSION_CODES.Q) {
            show("Android 10 이상에서 갤러리 저장을 지원합니다.");
            shutter.setEnabled(false);
            return;
        }
        ensureCameraPermission();
    }

    private static int dp(Context context,int value) {
        return (int)(context.getResources().getDisplayMetrics().density*value+.5f);
    }
    private void buildUi() {
        FrameLayout root=new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        viewfinder=new PreviewView(this);
        viewfinder.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        viewfinder.setContentDescription("카비서 카메라 미리보기, 화면을 탭하면 초점 이동");
        root.addView(viewfinder,new FrameLayout.LayoutParams(-1,-1));
        root.addView(new RuleOfThirdsView(this),new FrameLayout.LayoutParams(-1,-1));

        hint=new TextView(this);
        hint.setTextColor(Color.WHITE);
        hint.setBackgroundColor(0xB3000000);
        hint.setPadding(dp(this,14),dp(this,12),dp(this,14),dp(this,12));
        hint.setTextSize(16f);
        hint.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        hint.setText("카메라 준비 중");
        FrameLayout.LayoutParams top=new FrameLayout.LayoutParams(-1,-2,Gravity.TOP);
        top.setMargins(dp(this,10),dp(this,20),dp(this,10),0);
        root.addView(hint,top);

        LinearLayout actions=new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        actions.setBackgroundColor(0xBB000000);
        actions.setPadding(dp(this,16),dp(this,14),dp(this,16),dp(this,14));

        Button close=new Button(this);
        close.setText("닫기");
        close.setContentDescription("카메라를 닫고 이전 화면으로");
        close.setOnClickListener(v->finish());
        actions.addView(close,new LinearLayout.LayoutParams(0,dp(this,64),1f));

        shutter=new Button(this);
        shutter.setText("● 촬영");
        shutter.setTextSize(20f);
        shutter.setEnabled(false);
        shutter.setContentDescription("사진 촬영 후 갤러리에 저장");
        shutter.setOnClickListener(v->takePhoto());
        LinearLayout.LayoutParams shoot=new LinearLayout.LayoutParams(0,dp(this,74),2f);
        shoot.setMargins(dp(this,12),0,0,0);
        actions.addView(shutter,shoot);

        FrameLayout.LayoutParams bottom=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);
        root.addView(actions,bottom);

        viewfinder.setOnTouchListener((v,e)->{
            if(e.getAction()==MotionEvent.ACTION_UP) {
                focusAt(e.getX(),e.getY());
                v.performClick();
                return true;
            }
            return e.getAction()==MotionEvent.ACTION_DOWN;
        });
        setContentView(root);
    }

    private void show(String s){hint.setText(s);}
    private void ensureCameraPermission() {
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) {
            maybeStartCamera();
        } else {
            requestPermissions(new String[]{Manifest.permission.CAMERA},REQUEST_CAMERA);
        }
    }

    /** Never request a second CameraProvider while another opening is in flight. */
    private void maybeStartCamera() {
        if(!foregroundStarted||openingInProgress||ownCapture!=null||isFinishing()||isDestroyed()
            ||Build.VERSION.SDK_INT<Build.VERSION_CODES.Q)return;
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)
            return;
        openingInProgress=true;
        openCamera();
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(request,permissions,grants);
        if(request==REQUEST_CAMERA) {
            if(grants.length==1&&grants[0]==PackageManager.PERMISSION_GRANTED)maybeStartCamera();
            else {show("카메라 권한이 허용되지 않았습니다.");shutter.setEnabled(false);}
        }
    }

    private void openCamera() {
        if(!openingInProgress||!foregroundStarted||isFinishing()||isDestroyed()
            ||Build.VERSION.SDK_INT<Build.VERSION_CODES.Q){
            openingInProgress=false;
            return;
        }
        final int token=++openingRevision;
        consecutiveDarkSamples=0;
        nightModeAttempted=false;
        lastLumaSampleAt=-1L;
        extensionsManager=null;
        try {
            ListenableFuture<ProcessCameraProvider> future=ProcessCameraProvider.getInstance(this);
            future.addListener(()->{
                if(token!=openingRevision||!foregroundStarted||isFinishing()||isDestroyed())return;
                try {
                    provider=future.get();
                    // The ordinary preview starts NOW; never block first frame on
                    // optional OEM ExtensionsManager initialization.
                    if(!bindCamera(CameraSelector.DEFAULT_BACK_CAMERA,false)){
                        openingInProgress=false;
                        return;
                    }
                    openingInProgress=false;
                    try {
                        ListenableFuture<ExtensionsManager> extFuture=
                            ExtensionsManager.getInstanceAsync(getApplicationContext(),provider);
                        extFuture.addListener(()->{
                            if(token!=openingRevision||!foregroundStarted||isFinishing()||isDestroyed())return;
                            try {
                                extensionsManager=extFuture.get();
                                // If a dark scene was observed before optional OEM init,
                                // consider NIGHT only when its real capability is known.
                                maybeEnableNightMode(token);
                            }catch(Exception ignored){
                                extensionsManager=null;
                                nightModeAttempted=true;
                            }
                        },ContextCompat.getMainExecutor(this));
                    }catch(Exception ignored){
                        nightModeAttempted=true;
                    }
                }catch(Exception e){
                    openingInProgress=false;
                    show("카메라 시작 실패. 기기 지원 상태를 확인하세요.");
                }
            },ContextCompat.getMainExecutor(this));
        }catch(RuntimeException e){
            openingInProgress=false;
            show("카메라 초기화 실패. 카메라 권한과 기기를 확인하세요.");
        }
    }

    private void maybeEnableNightMode(int token) {
        if(token!=openingRevision||nightModeAttempted||captureInProgress
            ||ownAnalysis==null||isFinishing()||isDestroyed())return;
        if(consecutiveDarkSamples<5)return;
        // Optional manager may still be loading; do not waste the only attempt.
        if(extensionsManager==null)return;
        nightModeAttempted=true; // once per camera opening, no oscillation/retries
        try {
            CameraSelector base=CameraSelector.DEFAULT_BACK_CAMERA;
            if(extensionsManager.isExtensionAvailable(base,ExtensionMode.NIGHT)) {
                CameraSelector night=extensionsManager.getExtensionEnabledCameraSelector(
                    base,ExtensionMode.NIGHT);
                if(bindCamera(night,true))return;
                // No extension retry; restore ordinary AF/AE/AWB camera if vendor fails.
                bindCamera(base,false);
            }
        }catch(Exception ignored) {
            if(ownCapture==null)bindCamera(CameraSelector.DEFAULT_BACK_CAMERA,false);
        }
    }

    private boolean bindCamera(CameraSelector selector,boolean nightExtension) {
        if(provider==null||isFinishing()||isDestroyed())return false;
        releaseOwnUseCases();
        Preview preview=new Preview.Builder().build();
        ImageCapture capture=new ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).build();
        preview.setSurfaceProvider(viewfinder.getSurfaceProvider());
        ImageAnalysis analysis=null;
        // OEM extensions may only support Preview + ImageCapture. Do not force
        // ImageAnalysis into an extension session or add an unverified ML model.
        if(!nightExtension){
            analysis=new ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build();
            analysis.setAnalyzer(analysisExecutor,this::analyzeFrame);
        }
        try {
            Camera opened=(analysis==null)
                ?provider.bindToLifecycle(this,selector,preview,capture)
                :provider.bindToLifecycle(this,selector,preview,capture,analysis);
            ownPreview=preview;ownCapture=capture;ownAnalysis=analysis;camera=opened;
            captureInProgress=false;shutter.setEnabled(true);
            show(nightExtension?"야간 촬영 모드 · 촬영 준비":"자동 초점·자동 노출 · 촬영 준비");
            return true;
        }catch(Exception ex) {
            // Do not retry/capture without a valid bound camera.
            if(analysis!=null)analysis.clearAnalyzer();
            shutter.setEnabled(false);
            show("이 카메라 모드는 지원되지 않습니다.");
            return false;
        }
    }

    private void analyzeFrame(ImageProxy frame) {
        try {
            long now=android.os.SystemClock.elapsedRealtime();
            if(lastLumaSampleAt>=0&&now-lastLumaSampleAt<400)return;
            lastLumaSampleAt=now;
            if(frame.getPlanes().length<1)return;
            ImageProxy.PlaneProxy plane=frame.getPlanes()[0];
            ByteBuffer buffer=plane.getBuffer();
            float y=FrameLuma.sampleMean(buffer,frame.getWidth(),frame.getHeight(),
                plane.getRowStride(),plane.getPixelStride());
            String level=FrameLuma.hint(y);
            int token=openingRevision;
            // Main thread owns UI, binding and the mode-switch counter.
            runOnUiThread(()->{
                if(token!=openingRevision||ownAnalysis==null||captureInProgress||isFinishing())return;
                if("LOW_LIGHT".equals(level)) {
                    consecutiveDarkSamples=Math.min(consecutiveDarkSamples+1,5);
                    show("어두운 장면 · 자동 노출 작동 중");
                    maybeEnableNightMode(token);
                } else {
                    consecutiveDarkSamples=0;
                    show("VERY_BRIGHT".equals(level)
                        ?"밝은 장면 · 자동 노출 작동 중":"자동 초점·자동 노출 · 촬영 준비");
                }
            });
        }catch(RuntimeException ignored) {
            // Invalid Y planes should not stop preview or expose frame bytes.
        }finally{frame.close();}
    }
    private void focusAt(float x,float y) {
        if(camera==null||captureInProgress)return;
        MeteringPoint point=viewfinder.getMeteringPointFactory().createPoint(x,y);
        FocusMeteringAction action=new FocusMeteringAction.Builder(point,
            FocusMeteringAction.FLAG_AF|FocusMeteringAction.FLAG_AE|FocusMeteringAction.FLAG_AWB)
            .setAutoCancelDuration(3,TimeUnit.SECONDS).build();
        if(camera.getCameraInfo().isFocusMeteringSupported(action))
            camera.getCameraControl().startFocusAndMetering(action);
    }
    private void takePhoto() {
        if(captureInProgress||ownCapture==null||Build.VERSION.SDK_INT<29)return;
        captureInProgress=true;shutter.setEnabled(false);show("사진 저장 중");
        String stamp=new SimpleDateFormat("yyyyMMdd_HHmmss_SSS",Locale.US).format(new Date());
        ContentValues values=new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME,"JH_"+stamp+".jpg");
        values.put(MediaStore.MediaColumns.MIME_TYPE,"image/jpeg");
        values.put(MediaStore.Images.Media.RELATIVE_PATH,"DCIM/JHCamera");
        ImageCapture.OutputFileOptions options=new ImageCapture.OutputFileOptions.Builder(
            getContentResolver(),MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values).build();
        ownCapture.takePicture(options,ContextCompat.getMainExecutor(this),
            new ImageCapture.OnImageSavedCallback(){
                @Override public void onImageSaved(ImageCapture.OutputFileResults saved) {
                    captureInProgress=false;
                    show("사진 저장 완료");
                    setResult(RESULT_OK);
                    finish(); // returns to whichever JH screen explicitly opened us
                }
                @Override public void onError(ImageCaptureException error) {
                    captureInProgress=false;
                    shutter.setEnabled(ownCapture!=null);
                    show("저장 실패 · 다시 촬영하거나 닫아 주세요");
                }
            });
    }
    private void releaseOwnUseCases() {
        shutter.setEnabled(false);
        if(ownAnalysis!=null)ownAnalysis.clearAnalyzer();
        if(provider!=null) {
            if(ownAnalysis!=null)provider.unbind(ownAnalysis);
            if(ownCapture!=null)provider.unbind(ownCapture);
            if(ownPreview!=null)provider.unbind(ownPreview);
        }
        ownAnalysis=null;ownCapture=null;ownPreview=null;camera=null;
    }
    @Override protected void onStop() {
        foregroundStarted=false;
        ++openingRevision; // invalidates all late CameraProvider/OEM callbacks
        openingInProgress=false;
        extensionsManager=null;
        releaseOwnUseCases();
        super.onStop();
    }
    @Override protected void onStart() {
        super.onStart();
        foregroundStarted=true;
        maybeStartCamera(); // one opening only; onCreate doesn't race this callback
    }
    @Override protected void onDestroy() {
        ++openingRevision;
        foregroundStarted=false;
        openingInProgress=false;
        extensionsManager=null;
        releaseOwnUseCases();
        analysisExecutor.shutdown();
        super.onDestroy();
    }
}
