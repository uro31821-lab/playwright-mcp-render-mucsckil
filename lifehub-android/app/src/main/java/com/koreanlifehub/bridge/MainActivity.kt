package com.koreanlifehub.bridge
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 60, 40, 40)
        }
        val text = TextView(this).apply {
            this.text = "Korean Life Hub Bridge 6.0\n\nCloud Hub와 연결됩니다.\n화면읽기·클릭·입력·스크린샷을 지원합니다.\n아래 버튼을 눌러 접근성 서비스에서 Life Hub Bridge를 켜세요."
        }
        val button = Button(this).apply {
            this.text = "접근성 설정 열기"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        }
        layout.addView(text); layout.addView(button); setContentView(layout)
    }
}
