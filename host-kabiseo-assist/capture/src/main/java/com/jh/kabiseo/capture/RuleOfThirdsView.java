package com.jh.kabiseo.capture;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.View;

/** Lightweight noninteractive rule-of-thirds view; no analysis or image storage. */
public final class RuleOfThirdsView extends View {
    private final Paint grid=new Paint(Paint.ANTI_ALIAS_FLAG);
    public RuleOfThirdsView(Context context) {
        super(context);
        grid.setColor(Color.argb(135,255,255,255));
        grid.setStrokeWidth(getResources().getDisplayMetrics().density);
        setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        setClickable(false);
    }
    @Override protected void onDraw(Canvas c) {
        super.onDraw(c);
        float w=getWidth(),h=getHeight();
        for(int i=1;i<=2;i++){
            c.drawLine(w*i/3f,0,w*i/3f,h,grid);
            c.drawLine(0,h*i/3f,w,h*i/3f,grid);
        }
    }
}
