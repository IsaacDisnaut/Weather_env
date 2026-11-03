package com.weatherdashboard.ar.ar

import android.app.Activity
import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.util.Log
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.NotYetAvailableException
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.abs
import kotlin.math.hypot

/** สถานะของกล้อง AR ที่หน้าจอต้องรู้เพื่อบอกผู้ใช้ว่าติดตรงไหน */
sealed interface ArStatus {
    data object Initializing : ArStatus
    data object NeedsCameraPermission : ArStatus
    data object Installing : ArStatus
    data object Unsupported : ArStatus
    data object Ready : ArStatus
    data class Failed(val message: String) : ArStatus
}

/** รูป marker หนึ่งใบที่กล้องเห็นอยู่ตอนนี้ พร้อมตำแหน่งบนจอ (พิกเซล) */
data class TrackedMarker(
    val id: String,
    val deviceId: String,
    val label: String,
    val location: String?,
    val kind: MarkerKind,
    val xPx: Float,
    val yPx: Float,
    /** ความกว้างของรูปบนจอ ใช้ย่อ/ขยาย popup ตามระยะ */
    val widthPx: Float,
    /** ระยะจริงเป็นเมตร — null เมื่อไม่ได้ระบุ widthMeters ของ marker ใบนั้นไว้ */
    val distanceM: Float?,
    /** false = ใช้ตำแหน่งล่าสุดที่จำไว้ เพราะ marker เพิ่งหลุดเฟรมไปชั่วคราว */
    val fullTracking: Boolean,
) {
    /**
     * คีย์สำหรับจัดลำดับใกล้-ไกล ยิ่งน้อยยิ่งใกล้
     *
     * ถ้ารู้ขนาดจริงก็ใช้ระยะเป็นเมตรตรง ๆ ถ้าไม่รู้ก็ถือว่า "ใบที่เห็นใหญ่กว่าคืออยู่ใกล้กว่า"
     * ซึ่งถูกเสมอเมื่อพิมพ์ทุกใบขนาดเท่ากัน (ตัวเลขที่ได้ไม่ใช่เมตร ใช้เทียบกันเองเท่านั้น)
     */
    val nearness: Float get() = distanceM ?: (1000f / widthPx.coerceAtLeast(1f))
}

/**
 * หัวใจของฝั่ง AR — ถือ ARCore session, วาดภาพกล้อง, ส่งภาพแต่ละเฟรมให้ [ArucoScanner]
 * ถอดรหัส marker แล้วแปลงมุมของ marker เป็นพิกัดบนจอ ให้ Compose เอา popup ไปวางทับได้พอดี
 *
 * ARCore ทำหน้าที่แค่สองอย่างคือให้ภาพกล้องกับค่าพารามิเตอร์เลนส์ ส่วนการ "รู้ว่าเห็นใบไหน"
 * เป็นงานของ OpenCV ทั้งหมด ผลพลอยได้คือ popup ขึ้นได้แม้ ARCore ยังไม่ TRACKING
 * (ห้องมืดหรือฉากเรียบ ๆ ที่ ARCore หา feature ไม่เจอ ก็ยังอ่าน marker ออก)
 *
 * ที่ไม่ใช้ Sceneform/Filament เพราะสิ่งที่ต้องแสดงคือ "หน้าต่างข้อความ" ล้วน ๆ
 * วาดด้วย Compose ตรง ๆ ได้ผลดีกว่าและตัด dependency 3D ออกทั้งก้อน
 */
class ArSessionController(private val context: Context) : GLSurfaceView.Renderer {

    private val backgroundRenderer = BackgroundRenderer()
    private val displayRotationHelper = DisplayRotationHelper(context)

    private var session: Session? = null
    private var installRequested = false

    /** กัน resume ซ้ำ เพราะทั้ง lifecycle observer และการขอสิทธิ์กล้องต่างก็เรียกเข้ามา */
    private var resumed = false

    private val scanner = ArucoScanner()

    /** หมายเลข ArUco -> ข้อมูลอุปกรณ์ที่ผูกไว้ */
    private var markerDefs: Map<Int, MarkerDef> = emptyMap()

    private val _status = MutableStateFlow<ArStatus>(ArStatus.Initializing)
    val status: StateFlow<ArStatus> = _status.asStateFlow()

    private val _trackedMarkers = MutableStateFlow<List<TrackedMarker>>(emptyList())
    val trackedMarkers: StateFlow<List<TrackedMarker>> = _trackedMarkers.asStateFlow()

    private val _loadedMarkers = MutableStateFlow<List<MarkerDef>>(emptyList())
    val loadedMarkers: StateFlow<List<MarkerDef>> = _loadedMarkers.asStateFlow()

    private val _rejectedMarkers = MutableStateFlow<List<String>>(emptyList())
    val rejectedMarkers: StateFlow<List<String>> = _rejectedMarkers.asStateFlow()

    private var viewportWidth = 0
    private var viewportHeight = 0

    /** มุมทั้งสี่ของ marker หลังแปลงเป็นพิกัดบนจอ ใช้ซ้ำทุกเฟรมกัน GC ทำงานบน GL thread */
    private val viewCorners = FloatArray(8)

    private class Smoothed(var x: Float, var y: Float, var width: Float)

    private val smoothing = HashMap<String, Smoothed>()

    /** ใบที่เพิ่งเห็น (id -> เวลาที่เห็น กับค่าล่าสุด) ใช้กัน popup กระพริบตอน marker หลุดเฟรมแวบเดียว */
    private val recentMarkers = LinkedHashMap<String, Pair<Long, TrackedMarker>>()
    private var lastEmitted: List<TrackedMarker> = emptyList()
    private var lastEmitNanos = 0L
    private var lastDebugLogNanos = 0L

    // ---------- lifecycle ----------

    fun resume(activity: Activity, hasCameraPermission: Boolean) {
        if (!hasCameraPermission) {
            _status.value = ArStatus.NeedsCameraPermission
            return
        }

        if (session == null) {
            try {
                when (ArCoreApk.getInstance().requestInstall(activity, !installRequested)) {
                    ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
                        // ผู้ใช้ถูกพาไปติดตั้ง Google Play Services for AR แล้วจะกลับมาที่ onResume อีกรอบ
                        installRequested = true
                        _status.value = ArStatus.Installing
                        return
                    }

                    ArCoreApk.InstallStatus.INSTALLED -> Unit
                }

                session = Session(context).also { configure(it) }
                installRequested = false
            } catch (error: UnavailableDeviceNotCompatibleException) {
                Log.e(TAG, "เครื่องนี้ไม่รองรับ ARCore", error)
                _status.value = ArStatus.Unsupported
                return
            } catch (error: UnavailableException) {
                Log.e(TAG, "เปิด ARCore ไม่ได้", error)
                _status.value = ArStatus.Failed(error.message ?: "ARCore unavailable")
                return
            } catch (error: Exception) {
                Log.e(TAG, "สร้าง session ไม่สำเร็จ", error)
                _status.value = ArStatus.Failed(error.message ?: "session error")
                return
            }
        }

        if (resumed) {
            _status.value = ArStatus.Ready
            return
        }

        try {
            session?.resume()
            resumed = true
        } catch (error: CameraNotAvailableException) {
            Log.e(TAG, "กล้องถูกใช้งานโดยแอปอื่น", error)
            session?.close()
            session = null
            _status.value = ArStatus.Failed(error.message ?: "camera unavailable")
            return
        }

        displayRotationHelper.onResume()
        _status.value = ArStatus.Ready
    }

    fun pause() {
        val current = session ?: return
        if (!resumed) return
        resumed = false
        displayRotationHelper.onPause()
        current.pause()
        _trackedMarkers.value = emptyList()
        lastEmitted = emptyList()
        smoothing.clear()
        recentMarkers.clear()
    }

    fun destroy() {
        resumed = false
        session?.close()
        session = null
        scanner.release()
    }

    private fun configure(session: Session) {
        val catalog = MarkerCatalog.load(context.assets)

        markerDefs = catalog.accepted.associateBy { it.arucoId }
        _loadedMarkers.value = catalog.accepted
        _rejectedMarkers.value = if (scanner.isReady) {
            catalog.rejected
        } else {
            catalog.rejected + "OpenCV โหลดไม่ได้ — ตรวจจับ marker ไม่ได้ทั้งหมด"
        }

        val config = Config(session).apply {
            focusMode = Config.FocusMode.AUTO
            // เอาเฟรมล่าสุดเสมอ ไม่ต้องรอให้ GL ตามทัน — ภาพจะลื่นกว่า
            updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
            // ใช้แค่ภาพจากกล้อง ปิดการหาพื้นกับการประเมินแสงเพื่อประหยัดแบต
            planeFindingMode = Config.PlaneFindingMode.DISABLED
            lightEstimationMode = Config.LightEstimationMode.DISABLED
        }
        session.configure(config)

        Log.i(
            TAG,
            "โหลด marker ได้ ${catalog.accepted.size} ใบ ใช้ไม่ได้ ${catalog.rejected.size} ใบ " +
                "| OpenCV ${if (scanner.isReady) "พร้อม" else "ไม่พร้อม"}",
        )
    }

    // ---------- GLSurfaceView.Renderer ----------

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        backgroundRenderer.createOnGlThread()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        viewportWidth = width
        viewportHeight = height
        GLES20.glViewport(0, 0, width, height)
        displayRotationHelper.onSurfaceChanged(width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)

        val current = session ?: return
        displayRotationHelper.updateSessionIfNeeded(current)

        try {
            current.setCameraTextureName(backgroundRenderer.textureId)
            val frame = current.update()
            backgroundRenderer.draw(frame)

            /*
             * ไม่ต้องรอ camera.trackingState == TRACKING เพราะการอ่าน ArUco ใช้ภาพเฟรมเดียว
             * ไม่ได้พึ่ง motion tracking ของ ARCore — ห้องมืดหรือฉากเรียบที่ ARCore ไม่ TRACKING
             * ก็ยังอ่าน marker ได้ แค่ log ไว้เผื่อไล่ปัญหา
             */
            if (frame.camera.trackingState != TrackingState.TRACKING) {
                logThrottled(
                    "กล้องยังไม่ TRACKING: ${frame.camera.trackingState} " +
                        "เหตุผล=${frame.camera.trackingFailureReason} (ยังอ่าน ArUco ต่อได้)",
                )
            }

            publish(collectMarkers(frame))
        } catch (error: Throwable) {
            // อย่าให้ GL thread ตาย ไม่งั้นจอค้างดำและกู้กลับไม่ได้
            Log.e(TAG, "วาดเฟรมไม่สำเร็จ", error)
        }
    }

    // ---------- ถอดรหัส marker แล้วแปลงเป็นพิกัดบนจอ ----------

    /**
     * อ่าน ArUco ทุกใบในเฟรมนี้ แล้วแปลงมุมทั้งสี่จากพิกัดภาพกล้องเป็นพิกัดบนจอ
     *
     * ใช้ `frame.transformCoordinates2d()` ของ ARCore แปลงให้ เพราะภาพจากกล้องกับสิ่งที่เห็น
     * บนจอมีทั้งการหมุนตามการถือเครื่องและการ crop ให้เต็มจอ คำนวณเองพลาดง่าย
     */
    private fun collectMarkers(frame: Frame): List<TrackedMarker> {
        val now = System.nanoTime()

        val hits = try {
            frame.acquireCameraImage().use { image -> scanner.detect(image) }
        } catch (error: NotYetAvailableException) {
            // เฟรมแรก ๆ ภาพ CPU ยังไม่มา ถือว่าเฟรมนี้ไม่เจออะไร แล้วปล่อยให้ตัวกันกระพริบทำงาน
            emptyList()
        } catch (error: Throwable) {
            Log.e(TAG, "ขอภาพจากกล้องไม่สำเร็จ", error)
            emptyList()
        }

        val intrinsics = frame.camera.imageIntrinsics
        val focal = intrinsics.focalLength
        val principal = intrinsics.principalPoint

        val markers = ArrayList<TrackedMarker>(hits.size)
        val seen = HashSet<String>(hits.size)

        for (hit in hits) {
            val def = markerDefs[hit.id] ?: continue

            frame.transformCoordinates2d(
                Coordinates2d.IMAGE_PIXELS,
                hit.corners,
                Coordinates2d.VIEW,
                viewCorners,
            )

            var sumX = 0f
            var sumY = 0f
            for (corner in 0 until 4) {
                sumX += viewCorners[corner * 2]
                sumY += viewCorners[corner * 2 + 1]
            }
            val centerX = sumX / 4f
            val centerY = sumY / 4f

            // ปล่อยให้เลยขอบจอได้นิดหน่อย popup จะได้ไม่กระพริบตอน marker อยู่ริมเฟรม
            val marginX = viewportWidth * OFFSCREEN_MARGIN
            val marginY = viewportHeight * OFFSCREEN_MARGIN
            if (centerX < -marginX || centerX > viewportWidth + marginX) continue
            if (centerY < -marginY || centerY > viewportHeight + marginY) continue

            // ความกว้างบนจอ = เฉลี่ยของขอบบนกับขอบล่าง ใช้ย่อ/ขยาย popup ตามระยะ
            val topEdge = hypot(viewCorners[2] - viewCorners[0], viewCorners[3] - viewCorners[1])
            val bottomEdge = hypot(viewCorners[4] - viewCorners[6], viewCorners[5] - viewCorners[7])
            val widthPx = (topEdge + bottomEdge) / 2f

            val distance = scanner.estimateDistanceM(
                corners = hit.corners,
                widthMeters = def.widthMeters,
                focalX = focal[0],
                focalY = focal[1],
                principalX = principal[0],
                principalY = principal[1],
            )

            val smoothed = smooth(def.image, centerX, centerY, widthPx)
            val marker = TrackedMarker(
                id = def.image,
                deviceId = def.deviceId,
                label = def.label,
                location = def.location,
                kind = def.kind,
                xPx = smoothed.x,
                yPx = smoothed.y,
                widthPx = smoothed.width,
                distanceM = distance,
                fullTracking = true,
            )

            markers += marker
            seen += def.image
            recentMarkers[def.image] = now to marker
        }

        /*
         * ArUco อ่านทีละเฟรม ถ้าเฟรมไหนอ่านพลาด (ภาพเบลอ แสงแวบ มือสั่น) popup จะดับแล้วติดใหม่
         * จนกะพริบ จึงให้ใบที่เพิ่งเห็นอยู่ต่อได้อีกครู่หนึ่ง โดยทำเครื่องหมายว่าไม่ได้เห็นจริง
         * ในเฟรมนี้ (fullTracking = false) ให้ UI หรี่ลงได้
         */
        recentMarkers.entries.removeAll { entry -> now - entry.value.first > STALE_MARKER_GRACE_NANOS }
        for ((id, entry) in recentMarkers) {
            if (id in seen) continue
            markers += entry.second.copy(fullTracking = false)
        }

        smoothing.keys.retainAll(recentMarkers.keys)
        logDetection(hits, markers)
        return markers
    }

    /**
     * log สถานะการตรวจจับวินาทีละครั้ง — ใช้ตอบคำถามว่า "ทำไม popup ไม่ขึ้น"
     * ได้ว่าเป็นเพราะ ARCore ยังไม่เห็นรูป หรือเห็นแล้วแต่ popup ไปอยู่นอกจอ
     *
     *   adb logcat -s ArSessionController
     */
    private fun logDetection(hits: List<ArucoHit>, markers: List<TrackedMarker>) {
        val now = System.nanoTime()
        if (now - lastDebugLogNanos < DEBUG_LOG_INTERVAL_NANOS) return
        lastDebugLogNanos = now

        if (hits.isEmpty()) {
            Log.d(TAG, "ยังไม่เจอ ArUco ในเฟรม viewport=${viewportWidth}x$viewportHeight")
            return
        }

        val detail = hits.joinToString { hit ->
            val def = markerDefs[hit.id]
            "#${hit.id}" + if (def == null) "(ไม่ได้ผูกกับอุปกรณ์)" else "->${def.deviceId}"
        }
        val positions = markers.joinToString { marker ->
            "${marker.id}@${marker.xPx.toInt()},${marker.yPx.toInt()} " +
                "w=${marker.widthPx.toInt()} d=${marker.distanceM?.let { "%.2f m".format(it) } ?: "ไม่รู้ขนาดจริง"}"
        }
        Log.d(TAG, "aruco=${hits.size} [$detail] popup=${markers.size} [$positions]")
    }

    /** log ได้มากสุดวินาทีละครั้ง — onDrawFrame วิ่ง 30-60 ครั้งต่อวินาที */
    private fun logThrottled(message: String) {
        val now = System.nanoTime()
        if (now - lastDebugLogNanos < DEBUG_LOG_INTERVAL_NANOS) return
        lastDebugLogNanos = now
        Log.d(TAG, message)
    }

    /**
     * มุมที่อ่านได้สั่นเล็กน้อยทุกเฟรม ถ้าเอาไปวาดตรง ๆ popup จะสั่นตาม
     * จึงถ่วงด้วยค่าเฉลี่ยเคลื่อนที่ให้ขยับนุ่มขึ้น
     */
    private fun smooth(id: String, x: Float, y: Float, width: Float): Smoothed {
        val current = smoothing[id]
        if (current == null) {
            val fresh = Smoothed(x, y, width)
            smoothing[id] = fresh
            return fresh
        }
        current.x += (x - current.x) * SMOOTHING
        current.y += (y - current.y) * SMOOTHING
        current.width += (width - current.width) * SMOOTHING
        return current
    }

    /**
     * GL thread วิ่ง 30-60 เฟรมต่อวินาที แต่ Compose ไม่จำเป็นต้องวาดใหม่ทุกเฟรม
     * ส่งต่อเฉพาะตอนที่รายการเปลี่ยนจริง หรือตำแหน่งขยับพอให้ตาเห็น
     */
    private fun publish(markers: List<TrackedMarker>) {
        val structuralChange = markers.size != lastEmitted.size ||
            markers.any { marker -> lastEmitted.none { it.id == marker.id } }

        if (!structuralChange) {
            val now = System.nanoTime()
            if (now - lastEmitNanos < MIN_EMIT_INTERVAL_NANOS) return

            val moved = markers.any { marker ->
                val previous = lastEmitted.first { it.id == marker.id }
                abs(previous.xPx - marker.xPx) > POSITION_EPSILON ||
                    abs(previous.yPx - marker.yPx) > POSITION_EPSILON ||
                    abs(previous.widthPx - marker.widthPx) > POSITION_EPSILON ||
                    previous.fullTracking != marker.fullTracking
            }
            if (!moved) return
            lastEmitNanos = now
        } else {
            lastEmitNanos = System.nanoTime()
        }

        // คัดลอกออกไป เพราะค่าที่ถ่วงไว้จะถูกแก้ต่อในเฟรมถัดไป
        lastEmitted = markers.map { it.copy() }
        _trackedMarkers.value = lastEmitted
    }

    private companion object {
        const val TAG = "ArSessionController"
        const val SMOOTHING = 0.35f
        const val POSITION_EPSILON = 1.2f
        const val OFFSCREEN_MARGIN = 0.35f

        /** popup อยู่ต่อได้นานเท่านี้หลังเฟรมล่าสุดที่อ่าน marker ใบนั้นได้ */
        const val STALE_MARKER_GRACE_NANOS = 500_000_000L
        const val MIN_EMIT_INTERVAL_NANOS = 33_000_000L
        const val DEBUG_LOG_INTERVAL_NANOS = 1_000_000_000L
    }
}
