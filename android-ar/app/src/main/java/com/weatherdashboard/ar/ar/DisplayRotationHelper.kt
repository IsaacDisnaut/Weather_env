package com.weatherdashboard.ar.ar

import android.content.Context
import android.hardware.display.DisplayManager
import android.view.Display
import com.google.ar.core.Session

/**
 * บอก ARCore ว่าจอหมุนไปทางไหนและ viewport ใหญ่เท่าไร
 * ถ้าไม่บอก ภาพจากกล้องจะยืดผิดสัดส่วนและตำแหน่งที่ฉายลงจอจะเพี้ยน
 */
class DisplayRotationHelper(context: Context) : DisplayManager.DisplayListener {

    private val displayManager = context.getSystemService(DisplayManager::class.java)
    private val display: Display = displayManager.getDisplay(Display.DEFAULT_DISPLAY)

    private var viewportChanged = false
    private var viewportWidth = 0
    private var viewportHeight = 0

    fun onResume() = displayManager.registerDisplayListener(this, null)

    fun onPause() = displayManager.unregisterDisplayListener(this)

    fun onSurfaceChanged(width: Int, height: Int) {
        viewportWidth = width
        viewportHeight = height
        viewportChanged = true
    }

    /** ต้องเรียกก่อน session.update() ทุกครั้งที่ viewport เปลี่ยน */
    fun updateSessionIfNeeded(session: Session) {
        if (!viewportChanged) return
        session.setDisplayGeometry(display.rotation, viewportWidth, viewportHeight)
        viewportChanged = false
    }

    override fun onDisplayAdded(displayId: Int) = Unit

    override fun onDisplayRemoved(displayId: Int) = Unit

    override fun onDisplayChanged(displayId: Int) {
        viewportChanged = true
    }
}
