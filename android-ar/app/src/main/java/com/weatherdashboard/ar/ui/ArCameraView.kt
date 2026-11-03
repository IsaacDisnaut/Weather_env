package com.weatherdashboard.ar.ui

import android.opengl.GLSurfaceView
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.weatherdashboard.ar.ar.ArSessionController

/**
 * ภาพจากกล้อง AR วาดบน GLSurfaceView ธรรมดาแล้วให้ Compose ซ้อนทับด้านบน
 *
 * ผู้เรียกต้องจับคู่ onResume/onPause ของ [GLSurfaceView] กับ lifecycle เอง
 * จึงคืนตัว view ออกไปทาง [onViewCreated]
 */
@Composable
fun ArCameraView(
    controller: ArSessionController,
    onViewCreated: (GLSurfaceView) -> Unit,
    modifier: Modifier = Modifier,
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            GLSurfaceView(context).apply {
                preserveEGLContextOnPause = true
                setEGLContextClientVersion(2)
                // alpha 8 bit กับ depth 16 bit ตามที่ตัวอย่างของ ARCore ใช้
                setEGLConfigChooser(8, 8, 8, 8, 16, 0)
                setRenderer(controller)
                renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
                setWillNotDraw(false)
                onViewCreated(this)
            }
        },
    )
}
