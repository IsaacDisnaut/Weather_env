package com.weatherdashboard.ar

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import com.weatherdashboard.ar.ar.ArSessionController
import com.weatherdashboard.ar.data.DashboardClient
import com.weatherdashboard.ar.data.DeviceContentStore
import com.weatherdashboard.ar.data.Prefs
import com.weatherdashboard.ar.data.QuizSession
import com.weatherdashboard.ar.data.SensorRepository
import com.weatherdashboard.ar.data.UsageTracker
import com.weatherdashboard.ar.ui.ArScreen
import com.weatherdashboard.ar.ui.SensorArTheme
import kotlinx.coroutines.launch

/**
 * แอปมีหน้าจอเดียว — กล้อง AR เต็มจอ
 *
 * Activity ทำหน้าที่แค่ประกอบสามส่วนเข้าด้วยกันแล้วดูแลอายุการใช้งานของมัน
 *   Prefs                ที่อยู่ dashboard + ภาษา
 *   SensorRepository     ค่าเซนเซอร์จาก REST + SSE
 *   ArSessionController  ARCore + การแปลงตำแหน่งรูปเป็นพิกัดบนจอ
 *   DeviceContentStore   ข้อความกับคลิปวิดีโอประจำอุปกรณ์จากโฟลเดอร์ ar-content/
 *   UsageTracker         นับการสแกนรายจุด เวลาที่ใช้งาน และส่ง feedback กลับไปที่ dashboard
 *   QuizSession          เกมตอบคำถามที่เล่นจาก marker ชนิด quiz
 */
class MainActivity : ComponentActivity() {

    // ใช้ตัวเดียวกันทั้งการอ่านค่าเซนเซอร์และการส่งสถิติ จะได้ไม่เปิด connection pool ซ้อนกัน
    private val client = DashboardClient()
    private val repository = SensorRepository(client)
    private lateinit var prefs: Prefs
    private lateinit var controller: ArSessionController
    private lateinit var contentStore: DeviceContentStore
    private lateinit var usage: UsageTracker
    private lateinit var quiz: QuizSession

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // วาดใต้ status bar ให้ภาพกล้องเต็มจอจริง ๆ
        WindowCompat.setDecorFitsSystemWindows(window, false)
        // ระหว่างส่องกล้องผู้ใช้ไม่ได้แตะจอ อย่าให้จอดับกลางทาง
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        prefs = Prefs(this)
        controller = ArSessionController(this)
        contentStore = DeviceContentStore(this)
        usage = UsageTracker(this, prefs, client)
        // ผูกกับอายุของ Activity เกมจึงค้างอยู่ที่ข้อเดิมเมื่อ marker หลุดเฟรมแล้วส่องใหม่
        quiz = QuizSession(client, prefs, lifecycleScope)

        // เปลี่ยนที่อยู่เซิร์ฟเวอร์ในหน้า Settings แล้วให้ต่อใหม่ทันที
        lifecycleScope.launch {
            prefs.baseUrl.collect { url -> repository.connect(url) }
        }

        setContent {
            SensorArTheme {
                ArScreen(
                    controller = controller,
                    repository = repository,
                    prefs = prefs,
                    contentStore = contentStore,
                    tracker = usage,
                    quiz = quiz,
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        repository.stop()
        controller.destroy()
        usage.destroy()
    }
}
