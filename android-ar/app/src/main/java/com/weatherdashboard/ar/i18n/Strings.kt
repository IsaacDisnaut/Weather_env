package com.weatherdashboard.ar.i18n

import androidx.compose.runtime.compositionLocalOf
import com.weatherdashboard.ar.data.Metric

/** ภาษาที่รองรับ — ตรงกับ LANGUAGES ใน src/i18n/dictionaries.ts ของ dashboard */
enum class Lang(val code: String, val label: String) {
    TH("th", "ไทย"),
    EN("en", "EN");

    companion object {
        fun from(code: String?): Lang = entries.firstOrNull { it.code == code } ?: TH
    }
}

/**
 * ข้อความทั้งหมดในแอป เก็บเป็นออบเจกต์เดียวแบบเดียวกับ dictionaries.ts ฝั่งเว็บ
 * เพื่อให้สลับภาษาได้ทันทีโดยไม่ต้องสร้าง Activity ใหม่
 */
data class Strings(
    val appName: String,
    val tagline: String,
    val scanHint: String,
    val scanHintSecondary: String,
    val tapHint: String,
    val markersFound: (Int) -> String,
    val connConnecting: String,
    val connOnline: String,
    val connOffline: String,
    val connError: String,
    val brokerOffline: String,
    val waitingData: String,
    val staleData: String,
    val justNow: String,
    val secondsAgo: (Long) -> String,
    val minutesAgo: (Long) -> String,
    val hoursAgo: (Long) -> String,
    val latest: String,
    val average: String,
    val min: String,
    val max: String,
    val samples: String,
    val normal: String,
    val outOfRange: String,
    val threshold: String,
    val alertsCount: (Int) -> String,
    val sensorsTitle: String,
    val infoTitle: String,
    val infoMissing: String,
    val videoTitle: String,
    val videoMissing: String,
    val videoError: String,
    val historyTitle: String,
    val historyMissing: String,
    val showHistory: String,
    val hideHistory: String,
    val video360Title: String,
    val dragToRotate: String,
    val muteOn: String,
    val muteOff: String,
    // เกมตอบคำถามที่เล่นจาก marker ชนิด quiz
    val quizTitle: String,
    val quizIntro: String,
    val quizStart: String,
    val quizLoading: String,
    val quizProgress: (Int, Int) -> String,
    val quizFinalQuestion: String,
    val quizScaleLow: String,
    val quizScaleHigh: String,
    val quizCorrect: String,
    val quizWrong: String,
    val quizNext: String,
    val quizFinish: String,
    val quizSubmit: String,
    val quizSending: String,
    val quizScore: (Int, Int) -> String,
    val quizPerfect: String,
    val quizAgain: String,
    val quizOffline: String,
    val quizError: String,
    val feedback: String,
    val feedbackTitle: String,
    val feedbackSubtitle: String,
    /** ป้ายกำกับของดาวแต่ละดวง 1-5 */
    val feedbackRating: (Int) -> String,
    val feedbackTagsTitle: String,
    /** ปัญหาที่เจอบ่อย ให้แตะเลือกแทนการพิมพ์ */
    val feedbackTags: List<String>,
    val feedbackMessage: String,
    val feedbackMessageHint: String,
    val feedbackContact: String,
    val feedbackContactHint: String,
    /** "สแกนมาแล้ว 4 จุด · ใช้งาน 3 นาที" — บริบทที่จะถูกแนบไปกับ feedback */
    val feedbackContext: (Int, Int) -> String,
    val feedbackAtPoint: String,
    val feedbackPrivacy: String,
    val feedbackSend: String,
    val feedbackSending: String,
    val feedbackLater: String,
    val feedbackThanks: String,
    val feedbackSentHint: String,
    val feedbackQueued: String,
    val settings: String,
    val serverUrl: String,
    val serverUrlHint: String,
    val save: String,
    val test: String,
    val testing: String,
    val testOk: (Int) -> String,
    val testFail: String,
    val language: String,
    val markerCatalog: String,
    val markerRejected: String,
    val markerRejectedHint: String,
    val markerLinked: String,
    val markerNoData: String,
    val reconnect: String,
    val close: String,
    val about: String,
    val aboutText: String,
    val needCamera: String,
    val grantCamera: String,
    val unsupported: String,
    val installRequired: String,
    val sessionError: String,
    val retry: String,
    val metric: (Metric) -> String,
) {
    /** "12 วินาทีที่แล้ว" — ใช้กับเวลาที่ได้ค่าล่าสุดของอุปกรณ์ */
    fun ago(millis: Long): String {
        val seconds = millis / 1000
        return when {
            seconds < 5 -> justNow
            seconds < 60 -> secondsAgo(seconds)
            seconds < 3600 -> minutesAgo(seconds / 60)
            else -> hoursAgo(seconds / 3600)
        }
    }
}

private val th = Strings(
    appName = "Sensor AR",
    tagline = "ส่องกล้องดูค่าเซนเซอร์แบบเรียลไทม์",
    scanHint = "เล็งกล้องไปที่ ArUco marker",
    scanHintSecondary = "ค่าเซนเซอร์ของอุปกรณ์นั้นจะเด้งขึ้นเป็นหน้าต่างบนรูป",
    tapHint = "แตะหน้าต่างเพื่อดูค่าทั้งหมด",
    markersFound = { count -> "เจอ $count จุด" },
    connConnecting = "กำลังเชื่อมต่อ",
    connOnline = "เชื่อมต่อแล้ว",
    connOffline = "ไม่ได้เชื่อมต่อ",
    connError = "เชื่อมต่อไม่สำเร็จ",
    brokerOffline = "broker ไม่ได้เชื่อมต่อ",
    waitingData = "ยังไม่มีข้อมูลจากอุปกรณ์นี้",
    staleData = "ข้อมูลค้าง",
    justNow = "เมื่อครู่นี้",
    secondsAgo = { n -> "$n วินาทีที่แล้ว" },
    minutesAgo = { n -> "$n นาทีที่แล้ว" },
    hoursAgo = { n -> "$n ชั่วโมงที่แล้ว" },
    latest = "ล่าสุด",
    average = "เฉลี่ย",
    min = "ต่ำสุด",
    max = "สูงสุด",
    samples = "ค่า",
    normal = "ปกติ",
    outOfRange = "เกินเกณฑ์",
    threshold = "เกณฑ์",
    alertsCount = { n -> "เกินเกณฑ์ $n รายการ" },
    sensorsTitle = "ค่าเซนเซอร์",
    infoTitle = "ภาพและข้อมูลจุดนี้",
    infoMissing = "ยังไม่ได้ใส่ข้อมูลของอุปกรณ์นี้",
    videoTitle = "วิดีโอ",
    videoMissing = "ยังไม่ได้ใส่คลิปของอุปกรณ์นี้",
    videoError = "เล่นคลิปนี้ไม่ได้ — ไฟล์อาจความละเอียดสูงเกินไปหรือรูปแบบไม่รองรับ",
    historyTitle = "ประวัติพื้นที่",
    historyMissing = "ยังไม่ได้ใส่ประวัติของจุดนี้",
    showHistory = "ดูประวัติ",
    hideHistory = "ย่อ",
    video360Title = "มุมมอง 360°",
    dragToRotate = "ลากนิ้วเพื่อหมุนดูรอบด้าน",
    muteOn = "เปิดเสียง",
    muteOff = "ปิดเสียง",
    quizTitle = "เกมตอบคำถาม",
    quizIntro = "คำถามสุ่มจากเรื่องราวของจิตรกรรมในนิทรรศการนี้ ลองดูว่าตอบได้กี่ข้อ",
    quizStart = "เริ่มเล่น",
    quizLoading = "กำลังสุ่มคำถาม…",
    quizProgress = { current, total -> "ข้อ $current จาก $total" },
    quizFinalQuestion = "คำถามสุดท้าย",
    quizScaleLow = "ไม่เลย",
    quizScaleHigh = "มากที่สุด",
    quizCorrect = "ถูกต้อง",
    quizWrong = "ยังไม่ใช่",
    quizNext = "ข้อถัดไป",
    quizFinish = "ดูคะแนน",
    quizSubmit = "ส่งคำตอบ",
    quizSending = "กำลังบันทึกคะแนน…",
    quizScore = { correct, total -> "ได้ $correct จาก $total ข้อ" },
    quizPerfect = "เต็ม! เก่งมาก",
    quizAgain = "เล่นอีกครั้ง",
    quizOffline = "ยังส่งคะแนนขึ้นระบบไม่ได้ ลองใหม่เมื่อต่อเน็ตได้",
    quizError = "ขอคำถามไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่",
    feedback = "ส่งความเห็น",
    feedbackTitle = "ใช้งานเป็นยังไงบ้าง?",
    feedbackSubtitle = "แตะดาวหรือเลือกหัวข้อที่ตรงกับที่เจอก็พอ ไม่ต้องพิมพ์ก็ส่งได้",
    feedbackRating = { stars ->
        when (stars) {
            1 -> "ใช้ไม่ได้เลย"
            2 -> "ติดขัดหลายอย่าง"
            3 -> "พอใช้ได้"
            4 -> "ดี"
            else -> "ดีมาก"
        }
    },
    feedbackTagsTitle = "เจออะไรบ้าง",
    feedbackTags = listOf(
        "ใช้ง่ายดี",
        "หน้าต่างไม่ขึ้น",
        "ข้อมูลไม่อัปเดต",
        "สแกน marker ยาก",
        "ตัวหนังสืออ่านยาก",
        "คลิปเล่นไม่ได้",
        "อยากได้ข้อมูลเพิ่ม",
    ),
    feedbackMessage = "เล่าเพิ่มเติม",
    feedbackMessageHint = "เช่น จุดไหนที่สแกนไม่ติด หรืออยากให้เพิ่มอะไร",
    feedbackContact = "ให้ติดต่อกลับได้ที่ (ไม่ใส่ก็ได้)",
    feedbackContactHint = "อีเมลหรือเบอร์ ใส่เมื่ออยากให้ตอบกลับเท่านั้น",
    feedbackContext = { scans, minutes -> "สแกนมาแล้ว $scans จุด · ใช้งาน $minutes นาที" },
    feedbackAtPoint = "กำลังดูจุด",
    feedbackPrivacy = "ส่งไปพร้อมข้อมูลด้านบนเท่านั้น ไม่มีการเก็บชื่อหรือข้อมูลส่วนตัว",
    feedbackSend = "ส่ง",
    feedbackSending = "กำลังส่ง…",
    feedbackLater = "ไว้ก่อน",
    feedbackThanks = "ขอบคุณมาก!",
    feedbackSentHint = "ส่งถึงทีมงานเรียบร้อยแล้ว",
    feedbackQueued = "ตอนนี้ต่อเซิร์ฟเวอร์ไม่ได้ เก็บไว้ในเครื่องแล้ว จะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์",
    settings = "ตั้งค่า",
    serverUrl = "ที่อยู่ Dashboard",
    serverUrlHint = "เช่น https://ชื่อที่ตั้งไว้.ngrok-free.app หรือ http://192.168.1.20:3000 ในวง Wi-Fi เดียวกัน",
    save = "บันทึก",
    test = "ทดสอบ",
    testing = "กำลังทดสอบ…",
    testOk = { n -> "เชื่อมต่อได้ พบอุปกรณ์ $n เครื่อง" },
    testFail = "เชื่อมต่อไม่ได้ ตรวจสอบที่อยู่และสัญญาณอินเทอร์เน็ต",
    language = "ภาษา",
    markerCatalog = "marker ที่ผูกไว้",
    markerRejected = "รายการที่ใช้ไม่ได้",
    markerRejectedHint = "แก้ markers.json ให้ทุกรายการมี arucoId ไม่ซ้ำกันและอยู่ในช่วง 0-49 (DICT_4X4_50)",
    markerLinked = "ผูกกับ",
    markerNoData = "ยังไม่มีข้อมูล",
    reconnect = "เชื่อมต่อใหม่",
    close = "ปิด",
    about = "เกี่ยวกับ",
    aboutText = "marker เป็นแบบ ArUco (DICT_4X4_50) อ่านด้วย OpenCV — รูปสำหรับพิมพ์อยู่ในโฟลเดอร์ " +
        "ar-markers/ ของโปรเจค Weather Dashboard เพิ่มรายการใน markers.json พร้อม arucoId " +
        "แล้วรัน generate_markers.py จากนั้น build แอปใหม่",
    needCamera = "แอปต้องใช้กล้องเพื่อแสดง AR",
    grantCamera = "อนุญาตให้ใช้กล้อง",
    unsupported = "เครื่องนี้ไม่รองรับ ARCore",
    installRequired = "ต้องติดตั้ง Google Play Services for AR ก่อน",
    sessionError = "เปิดกล้อง AR ไม่สำเร็จ",
    retry = "ลองใหม่",
    metric = { metric ->
        when (metric) {
            Metric.TEMPERATURE -> "อุณหภูมิ"
            Metric.HUMIDITY -> "ความชื้น"
            Metric.VIBRATION -> "แรงสั่นสะเทือน"
            Metric.LIGHT -> "ความสว่าง"
            Metric.UV -> "ดัชนี UV"
            Metric.CO2 -> "คาร์บอนไดออกไซด์"
        }
    },
)

private val en = Strings(
    appName = "Sensor AR",
    tagline = "Point the camera to read sensors live",
    scanHint = "Point the camera at an ArUco marker",
    scanHintSecondary = "The device readings pop up right on the image",
    tapHint = "Tap a popup for the full readout",
    markersFound = { count -> "$count in view" },
    connConnecting = "Connecting",
    connOnline = "Connected",
    connOffline = "Disconnected",
    connError = "Connection failed",
    brokerOffline = "broker disconnected",
    waitingData = "No data from this device yet",
    staleData = "Stale",
    justNow = "just now",
    secondsAgo = { n -> "${n}s ago" },
    minutesAgo = { n -> "${n}m ago" },
    hoursAgo = { n -> "${n}h ago" },
    latest = "Latest",
    average = "Avg",
    min = "Min",
    max = "Max",
    samples = "samples",
    normal = "Normal",
    outOfRange = "Out of range",
    threshold = "Threshold",
    alertsCount = { n -> "$n out of range" },
    sensorsTitle = "Sensors",
    infoTitle = "About this point",
    infoMissing = "No info added for this device yet",
    videoTitle = "Video",
    videoMissing = "No clip added for this device yet",
    videoError = "Cannot play this clip - the resolution may be too high or the format unsupported",
    historyTitle = "Site history",
    historyMissing = "No history added for this site yet",
    showHistory = "Read history",
    hideHistory = "Collapse",
    video360Title = "360° view",
    dragToRotate = "Drag to look around",
    muteOn = "Unmute",
    muteOff = "Mute",
    quizTitle = "Mural quiz",
    quizIntro = "Questions drawn at random from the murals in this exhibition. See how many you get.",
    quizStart = "Play",
    quizLoading = "Picking questions…",
    quizProgress = { current, total -> "Question $current of $total" },
    quizFinalQuestion = "Last question",
    quizScaleLow = "Not at all",
    quizScaleHigh = "Very much",
    quizCorrect = "Correct",
    quizWrong = "Not quite",
    quizNext = "Next",
    quizFinish = "See score",
    quizSubmit = "Submit",
    quizSending = "Saving your score…",
    quizScore = { correct, total -> "$correct out of $total" },
    quizPerfect = "Full marks!",
    quizAgain = "Play again",
    quizOffline = "Could not save your score - try again when you are back online",
    quizError = "Could not load questions. Check the connection and try again.",
    feedback = "Feedback",
    feedbackTitle = "How is it going?",
    feedbackSubtitle = "Tap a star or pick what you ran into - no typing needed",
    feedbackRating = { stars ->
        when (stars) {
            1 -> "Unusable"
            2 -> "Lots of problems"
            3 -> "Okay"
            4 -> "Good"
            else -> "Great"
        }
    },
    feedbackTagsTitle = "What happened",
    feedbackTags = listOf(
        "Easy to use",
        "Popup never appeared",
        "Readings out of date",
        "Hard to scan markers",
        "Text hard to read",
        "Video would not play",
        "Want more detail",
    ),
    feedbackMessage = "Tell us more",
    feedbackMessageHint = "e.g. which point would not scan, or what you would like added",
    feedbackContact = "Contact (optional)",
    feedbackContactHint = "Email or phone - only if you want a reply",
    feedbackContext = { scans, minutes -> "$scans points scanned - $minutes min in the app" },
    feedbackAtPoint = "Looking at",
    feedbackPrivacy = "Only the details above are sent. No name or personal data is collected.",
    feedbackSend = "Send",
    feedbackSending = "Sending…",
    feedbackLater = "Later",
    feedbackThanks = "Thank you!",
    feedbackSentHint = "Your feedback reached the team",
    feedbackQueued = "The dashboard is unreachable right now - saved on this phone and sent automatically once you are back online",
    settings = "Settings",
    serverUrl = "Dashboard address",
    serverUrlHint = "e.g. https://your-name.ngrok-free.app, or http://192.168.1.20:3000 on the same Wi-Fi",
    save = "Save",
    test = "Test",
    testing = "Testing…",
    testOk = { n -> "Connected — $n devices found" },
    testFail = "Cannot reach the dashboard. Check the address and your connection.",
    language = "Language",
    markerCatalog = "Linked markers",
    markerRejected = "Unusable entries",
    markerRejectedHint = "Fix markers.json so every entry has a unique arucoId in 0-49 (DICT_4X4_50)",
    markerLinked = "linked to",
    markerNoData = "no data",
    reconnect = "Reconnect",
    close = "Close",
    about = "About",
    aboutText = "Markers are ArUco (DICT_4X4_50), read with OpenCV. Printable images live in the " +
        "ar-markers/ folder of the Weather Dashboard project. Add an entry with its arucoId to " +
        "markers.json, run generate_markers.py, then rebuild the app.",
    needCamera = "The app needs the camera for AR",
    grantCamera = "Grant camera access",
    unsupported = "This device does not support ARCore",
    installRequired = "Google Play Services for AR must be installed",
    sessionError = "Could not start the AR camera",
    retry = "Retry",
    metric = { metric ->
        when (metric) {
            Metric.TEMPERATURE -> "Temperature"
            Metric.HUMIDITY -> "Humidity"
            Metric.VIBRATION -> "Vibration"
            Metric.LIGHT -> "Light"
            Metric.UV -> "UV index"
            Metric.CO2 -> "CO₂"
        }
    },
)

fun stringsFor(lang: Lang): Strings = if (lang == Lang.EN) en else th

val LocalStrings = compositionLocalOf { th }
