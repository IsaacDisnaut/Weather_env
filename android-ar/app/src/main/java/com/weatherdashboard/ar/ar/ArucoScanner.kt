package com.weatherdashboard.ar.ar

import android.media.Image
import android.util.Log
import org.opencv.android.OpenCVLoader
import org.opencv.calib3d.Calib3d
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfDouble
import org.opencv.core.MatOfPoint2f
import org.opencv.core.MatOfPoint3f
import org.opencv.core.Point
import org.opencv.core.Point3
import org.opencv.objdetect.ArucoDetector
import org.opencv.objdetect.DetectorParameters
import org.opencv.objdetect.Objdetect
import kotlin.math.sqrt

/**
 * ArUco หนึ่งใบที่เจอในเฟรมนี้
 *
 * [corners] คือมุมทั้งสี่เรียงตามกติกาของ ArUco (ซ้ายบน ขวาบน ขวาล่าง ซ้ายล่าง)
 * เก็บเป็น x,y สลับกันไป 8 ค่า หน่วยเป็นพิกเซลของภาพจากกล้อง (ไม่ใช่พิกเซลบนจอ)
 */
data class ArucoHit(
    val id: Int,
    val corners: FloatArray,
) {
    // FloatArray เทียบด้วย equals ปกติไม่ได้ ต้องเขียนเองไม่งั้น data class หลอกตัวเอง
    override fun equals(other: Any?): Boolean =
        this === other || (other is ArucoHit && id == other.id && corners.contentEquals(other.corners))

    override fun hashCode(): Int = 31 * id + corners.contentHashCode()
}

/**
 * ตัวตรวจจับ ArUco — รับภาพขาวดำจากกล้องของ ARCore แล้วคืนหมายเลข marker กับมุมทั้งสี่
 *
 * ต่างจาก Augmented Images ของ ARCore ตรงที่ไม่ได้จำ "ลวดลาย" แต่ถอด **รหัส** ออกมาตรง ๆ
 * จึงเจอทันทีที่เห็นในเฟรมเดียว ไม่ต้องรอ ARCore สร้าง map ของฉากก่อน และรูปเล็ก ๆ
 * ที่ไม่มีรายละเอียดอย่าง ArUco ก็ใช้ได้ (Augmented Images จะปฏิเสธเพราะ feature ไม่พอ)
 *
 * **ห้ามแตะคลาสใด ๆ ของ OpenCV ก่อนเช็ก [available]** เพราะคอนสตรัคเตอร์ของคลาสพวกนั้น
 * เรียก native ทันที ถ้า .so ยังไม่ถูกโหลดจะได้ UnsatisfiedLinkError แล้วแอปตายคาที่
 * ทุกอย่างในคลาสนี้จึงสร้างแบบ lazy หลังจากยืนยันแล้วว่าโหลดสำเร็จ
 *
 * ออบเจกต์นี้ใช้ซ้ำ Mat เดิมทุกเฟรมเพื่อไม่ให้ GC ทำงานหนักบน GL thread
 * จึงต้องเรียกจากเธรดเดียวเท่านั้น (onDrawFrame)
 */
class ArucoScanner {

    /** สร้างได้ก็ต่อเมื่อ native library พร้อม — null = ปิดการตรวจจับไปเงียบ ๆ */
    private val detector: ArucoDetector? = if (available) createDetector() else null

    private var gray: Mat? = null
    private var pixels = ByteArray(0)

    /** ที่ทำงานของ solvePnP สร้างครั้งแรกที่ต้องใช้จริง */
    private var pose: PoseWorkspace? = null

    val isReady: Boolean get() = detector != null

    /**
     * ถอดรหัส marker ทั้งหมดในเฟรม
     *
     * [image] ต้องเป็น YUV_420_888 จาก `frame.acquireCameraImage()` — ใช้เฉพาะ plane
     * ความสว่าง (Y) ซึ่งก็คือภาพขาวดำอยู่แล้ว จึงไม่ต้องแปลงสีให้เปลืองแรง
     */
    fun detect(image: Image): List<ArucoHit> {
        val detector = detector ?: return emptyList()
        val source = toGray(image) ?: return emptyList()

        val cornerMats = ArrayList<Mat>()
        val idMat = Mat()
        try {
            detector.detectMarkers(source, cornerMats, idMat)
            if (idMat.empty()) return emptyList()

            val hits = ArrayList<ArucoHit>(cornerMats.size)
            for (index in cornerMats.indices) {
                val id = idMat.get(index, 0)?.firstOrNull()?.toInt() ?: continue
                val mat = cornerMats[index]
                val corners = FloatArray(8)
                for (corner in 0 until 4) {
                    val point = mat.get(0, corner) ?: continue
                    corners[corner * 2] = point[0].toFloat()
                    corners[corner * 2 + 1] = point[1].toFloat()
                }
                hits += ArucoHit(id, corners)
            }
            return hits
        } catch (error: Throwable) {
            Log.e(TAG, "ตรวจจับ ArUco ไม่สำเร็จ", error)
            return emptyList()
        } finally {
            cornerMats.forEach { it.release() }
            idMat.release()
        }
    }

    /**
     * ระยะจากกล้องถึง marker เป็นเมตร คำนวณจากมุมทั้งสี่กับความกว้างจริงที่พิมพ์ไว้
     *
     * ใช้ SOLVEPNP_IPPE_SQUARE ซึ่งเป็นวิธีเฉพาะของ marker สี่เหลี่ยมจัตุรัส แม่นกว่าการ
     * เดาจากขนาดบนภาพเมื่อ marker เอียง ถ้าแก้สมการไม่ได้ค่อยถอยไปใช้สูตรกล้องรูเข็ม
     *
     * คืน null เมื่อไม่ได้บอก [widthMeters] มา เพราะภาพเพียงอย่างเดียวบอกไม่ได้ว่า marker
     * เป็นใบเล็กที่อยู่ใกล้หรือใบใหญ่ที่อยู่ไกล
     */
    fun estimateDistanceM(
        corners: FloatArray,
        widthMeters: Float?,
        focalX: Float,
        focalY: Float,
        principalX: Float,
        principalY: Float,
    ): Float? {
        if (widthMeters == null || widthMeters <= 0f) return null

        val fallback = pinholeDistance(corners, widthMeters, focalX)
        if (!isReady) return fallback

        return try {
            val workspace = pose ?: PoseWorkspace().also { pose = it }
            val half = widthMeters / 2.0

            workspace.objectPoints.fromArray(
                Point3(-half, half, 0.0),
                Point3(half, half, 0.0),
                Point3(half, -half, 0.0),
                Point3(-half, -half, 0.0),
            )
            workspace.imagePoints.fromArray(
                Point(corners[0].toDouble(), corners[1].toDouble()),
                Point(corners[2].toDouble(), corners[3].toDouble()),
                Point(corners[4].toDouble(), corners[5].toDouble()),
                Point(corners[6].toDouble(), corners[7].toDouble()),
            )

            workspace.cameraMatrix.put(0, 0, focalX.toDouble(), 0.0, principalX.toDouble())
            workspace.cameraMatrix.put(1, 0, 0.0, focalY.toDouble(), principalY.toDouble())
            workspace.cameraMatrix.put(2, 0, 0.0, 0.0, 1.0)

            val solved = Calib3d.solvePnP(
                workspace.objectPoints,
                workspace.imagePoints,
                workspace.cameraMatrix,
                workspace.distCoeffs,
                workspace.rvec,
                workspace.tvec,
                false,
                Calib3d.SOLVEPNP_IPPE_SQUARE,
            )
            if (!solved) return fallback

            val distance = Core.norm(workspace.tvec).toFloat()
            if (distance.isFinite() && distance > 0f) distance else fallback
        } catch (error: Throwable) {
            Log.w(TAG, "solvePnP ไม่สำเร็จ ใช้ค่าประมาณจากขนาดบนภาพแทน", error)
            fallback
        }
    }

    fun release() {
        gray?.release()
        gray = null
        pose?.release()
        pose = null
    }

    /** กล้องรูเข็ม: ระยะ = ทางยาวโฟกัส x ความกว้างจริง / ความกว้างบนภาพ */
    private fun pinholeDistance(corners: FloatArray, widthMeters: Float, focalX: Float): Float {
        val top = hypot(corners[2] - corners[0], corners[3] - corners[1])
        val bottom = hypot(corners[4] - corners[6], corners[5] - corners[7])
        val widthPx = (top + bottom) / 2f
        if (widthPx <= 0.5f || focalX <= 0f) return 0f
        return focalX * widthMeters / widthPx
    }

    /**
     * คัดเฉพาะ plane ความสว่างออกมาเป็น Mat ขาวดำ
     *
     * กล้องบางรุ่นใส่ padding ท้ายแต่ละแถว (rowStride > width) จึงต้องก๊อปทีละแถว
     * ถ้าไม่มี padding ก็ก๊อปรวดเดียวจบ
     */
    private fun toGray(image: Image): Mat? = try {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val width = image.width
        val height = image.height
        val rowStride = plane.rowStride
        val needed = width * height

        if (pixels.size != needed) pixels = ByteArray(needed)

        val target = gray?.takeIf { it.rows() == height && it.cols() == width }
            ?: Mat(height, width, CvType.CV_8UC1).also {
                gray?.release()
                gray = it
            }

        buffer.rewind()
        if (rowStride == width) {
            buffer.get(pixels, 0, needed)
        } else {
            var offset = 0
            for (row in 0 until height) {
                buffer.position(row * rowStride)
                buffer.get(pixels, offset, width)
                offset += width
            }
        }
        target.put(0, 0, pixels)
        target
    } catch (error: Throwable) {
        Log.e(TAG, "อ่านภาพจากกล้องไม่ได้", error)
        null
    }

    private fun hypot(dx: Float, dy: Float): Float = sqrt(dx * dx + dy * dy)

    /** Mat ที่ solvePnP ใช้ซ้ำ รวมไว้ที่เดียวจะได้สร้าง/คืนหน่วยความจำพร้อมกัน */
    private class PoseWorkspace {
        val cameraMatrix: Mat = Mat.zeros(3, 3, CvType.CV_64F)
        val distCoeffs = MatOfDouble(0.0, 0.0, 0.0, 0.0, 0.0)
        val rvec = Mat()
        val tvec = Mat()
        val objectPoints = MatOfPoint3f()
        val imagePoints = MatOfPoint2f()

        fun release() {
            cameraMatrix.release()
            distCoeffs.release()
            rvec.release()
            tvec.release()
            objectPoints.release()
            imagePoints.release()
        }
    }

    companion object {
        private const val TAG = "ArucoScanner"

        /**
         * โหลด native library ของ OpenCV ครั้งเดียวทั้งแอป
         * ถ้าโหลดไม่ได้ (เช่น ABI ไม่ตรง) ให้แอปเดินต่อแบบไม่มี marker ดีกว่าพัง
         */
        val available: Boolean by lazy {
            runCatching { OpenCVLoader.initLocal() }
                .onFailure { Log.e(TAG, "โหลด OpenCV ไม่ได้", it) }
                .getOrDefault(false)
                .also { Log.i(TAG, if (it) "OpenCV พร้อมใช้งาน" else "ไม่มี OpenCV — ปิดการตรวจจับ marker") }
        }

        /** เรียกได้เฉพาะตอน [available] เป็น true เท่านั้น */
        private fun createDetector(): ArucoDetector? = runCatching {
            // พจนานุกรมต้องตรงกับ ar-markers/generate_markers.py
            ArucoDetector(Objdetect.getPredefinedDictionary(Objdetect.DICT_4X4_50), DetectorParameters())
        }.onFailure { Log.e(TAG, "สร้าง ArucoDetector ไม่สำเร็จ", it) }.getOrNull()
    }
}
