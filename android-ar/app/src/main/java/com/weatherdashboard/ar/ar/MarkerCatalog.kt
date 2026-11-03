package com.weatherdashboard.ar.ar

import android.content.res.AssetManager
import android.util.Log
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * ชนิดของ marker — กำหนดว่าจะขึ้นหน้าต่างแบบไหน
 *
 *   SENSOR  จุดติดตั้งเซนเซอร์ ขึ้นค่าวัดเรียลไทม์ + ข้อมูลจุด + คลิปปกติ
 *   HISTORY จุดเล่าประวัติพื้นที่ ไม่มีค่าเซนเซอร์ ขึ้นคลิป 360 องศา + ประวัติ
 *   QUIZ    จุดเล่นเกมตอบคำถาม ไม่มีค่าเซนเซอร์และไม่มีเนื้อหาประจำจุด
 *           คำถามขอจาก /api/quiz ของ dashboard ตอนกดเริ่มเล่น
 */
enum class MarkerKind {
    SENSOR,
    HISTORY,
    QUIZ;

    companion object {
        fun from(value: String?): MarkerKind = when (value?.trim()?.lowercase()) {
            "history" -> HISTORY
            "quiz" -> QUIZ
            else -> SENSOR
        }
    }
}

/** marker หนึ่งใบ — หมายเลข ArUco หนึ่งหมายเลขผูกกับอุปกรณ์หนึ่งตัว */
data class MarkerDef(
    /** หมายเลขในพจนานุกรม DICT_4X4_50 คือตัวตนจริงของ marker ที่กล้องอ่านได้ */
    val arucoId: Int,
    /** ไฟล์รูปที่เอาไว้พิมพ์ ใช้เป็น id ของ popup และรูปตัวอย่างในหน้า Settings */
    val image: String,
    val deviceId: String,
    val label: String,
    val location: String?,
    /** ความกว้างจริงของขอบดำหลังพิมพ์ (เมตร) — ใส่หรือไม่ใส่ก็ได้ ใส่แล้วถึงจะบอกระยะเป็นเมตรได้ */
    val widthMeters: Float?,
    val kind: MarkerKind = MarkerKind.SENSOR,
)

/** ผลการอ่าน markers.json */
data class MarkerCatalogResult(
    val accepted: List<MarkerDef>,
    /** รายการที่ใช้ไม่ได้ พร้อมเหตุผลสั้น ๆ ไว้โชว์ในหน้า Settings */
    val rejected: List<String>,
)

/**
 * อ่านรายการ marker จาก assets ซึ่งชี้ไปที่โฟลเดอร์ ar-markers/ ของโปรเจคหลัก
 * (ดู sourceSets ใน app/build.gradle.kts) — แก้ markers.json แล้ว build ใหม่ก็ใช้ได้เลย
 *
 * ตั้งแต่เปลี่ยนมาใช้ ArUco ตัวรูปไม่ได้ถูกเอาไปให้ ARCore จำอีกแล้ว รูปใน ar-markers/
 * เป็นแค่ไฟล์สำหรับพิมพ์ สิ่งที่กล้องอ่านคือหมายเลข arucoId เท่านั้น
 */
object MarkerCatalog {

    private const val TAG = "MarkerCatalog"
    private const val MANIFEST = "markers.json"

    /** ช่วงหมายเลขของ DICT_4X4_50 — ต้องตรงกับพจนานุกรมใน ArucoScanner */
    private val ID_RANGE = 0 until 50

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Serializable
    private data class Manifest(
        /** ใส่ไว้เมื่อพิมพ์ทุกใบขนาดเท่ากัน จะได้ไม่ต้องใส่ทีละรายการ */
        val defaultWidthMeters: Float? = null,
        val markers: List<Entry> = emptyList(),
    )

    @Serializable
    private data class Entry(
        val image: String? = null,
        val arucoId: Int? = null,
        val deviceId: String,
        val label: String? = null,
        val location: String? = null,
        val widthMeters: Float? = null,
        val kind: String? = null,
    )

    fun load(assets: AssetManager): MarkerCatalogResult {
        val manifest = runCatching {
            val text = assets.open(MANIFEST).bufferedReader().use { it.readText() }
            json.decodeFromString(Manifest.serializer(), text)
        }.getOrElse { error ->
            Log.e(TAG, "อ่าน $MANIFEST ไม่ได้", error)
            return MarkerCatalogResult(emptyList(), listOf("$MANIFEST: ${error.message}"))
        }

        val accepted = mutableListOf<MarkerDef>()
        val rejected = mutableListOf<String>()
        val usedIds = HashMap<Int, String>()

        manifest.markers.forEach { entry ->
            val id = entry.arucoId
            when {
                id == null ->
                    rejected += "${entry.deviceId}: ยังไม่ได้ใส่ arucoId"

                id !in ID_RANGE ->
                    rejected += "${entry.deviceId}: arucoId $id เกินช่วง ${ID_RANGE.first}-${ID_RANGE.last}"

                usedIds.containsKey(id) ->
                    rejected += "${entry.deviceId}: arucoId $id ซ้ำกับ ${usedIds[id]}"

                else -> {
                    usedIds[id] = entry.deviceId
                    accepted += MarkerDef(
                        arucoId = id,
                        image = entry.image ?: "${entry.deviceId}.png",
                        deviceId = entry.deviceId,
                        label = entry.label ?: entry.deviceId,
                        location = entry.location,
                        widthMeters = (entry.widthMeters ?: manifest.defaultWidthMeters)
                            ?.takeIf { it > 0f },
                        kind = MarkerKind.from(entry.kind),
                    )
                }
            }
        }

        if (rejected.isNotEmpty()) Log.w(TAG, "marker ที่ใช้ไม่ได้: ${rejected.joinToString()}")
        return MarkerCatalogResult(accepted, rejected)
    }
}
