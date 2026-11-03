package com.weatherdashboard.ar.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * ฉากหลังของแอปคือภาพจากกล้องเสมอ จึงใช้ชุดสีเข้มชุดเดียวทั้งโหมดสว่างและมืด
 * ป้ายข้อความบนภาพจริงต้องคอนทราสต์สูงพอจะอ่านได้ทั้งกลางแจ้งและในอาคาร
 */
object ArColors {
    val Accent = Color(0xFF38BDF8)
    val Alert = Color(0xFFF87171)
    val Ok = Color(0xFF4ADE80)
    val Warn = Color(0xFFFBBF24)
    /** ทึบเกือบเต็มเพราะข้างหลังเป็นภาพกล้องที่ลายและสว่างไม่แน่นอน */
    val Surface = Color(0xF70B1220)
    val SurfaceSoft = Color(0x24FFFFFF)
    val OnSurface = Color(0xFFF8FAFC)
    /**
     * ข้อความรองต้องสว่างกว่าที่ใช้บนจอปกติ เพราะอ่านกลางแดดผ่านกล้อง
     * ไม่ใช่นั่งอ่านในร่ม — เทาเข้มอ่านไม่ออกทันทีที่มีแสงสะท้อนบนจอ
     */
    val OnSurfaceMuted = Color(0xFFAFC0D0)
    /** พื้นของแถวที่ค่าหลุดเกณฑ์ ใช้คู่กับตัวหนังสือสีแดง ไม่ได้ใช้แทนกัน */
    val AlertSoft = Color(0x2EF87171)
    val Scrim = Color(0xCC0B1220)
}

private val colors = darkColorScheme(
    primary = ArColors.Accent,
    onPrimary = Color(0xFF04121C),
    surface = ArColors.Surface,
    onSurface = ArColors.OnSurface,
    surfaceVariant = Color(0xFF16233A),
    onSurfaceVariant = ArColors.OnSurfaceMuted,
    background = Color(0xFF060B14),
    onBackground = ArColors.OnSurface,
    error = ArColors.Alert,
)

/**
 * ขนาดตัวอักษรของแอปนี้ใหญ่กว่าแอปทั่วไปหนึ่งขั้น เพราะสถานการณ์การอ่านต่างกัน —
 * ผู้ใช้ยืนถือมือถือห่างจากตัวเกือบสุดแขนเพื่อเล็งกล้องไปที่ marker ไม่ได้ก้มอ่านใกล้ ๆ
 * และพื้นหลังเป็นภาพจริงที่สว่างไม่เท่ากันตลอดเวลา
 *
 * lineHeight ตั้งเองทุกตัวเพราะภาษาไทยมีสระบนกับวรรณยุกต์ซ้อนสองชั้น
 * ถ้าปล่อยตามค่าเริ่มต้นบรรทัดจะชิดกันจนหางสระไปชนบรรทัดบน
 */
private val typography = Typography(
    // ตัวเลขค่าวัด — ตัวเดียวในจอที่ต้องอ่านออกตั้งแต่ยังไม่ขยับเข้าไปใกล้
    headlineSmall = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 19.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 16.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold),
    bodyMedium = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontSize = 13.5.sp, lineHeight = 20.sp),
    labelSmall = TextStyle(fontSize = 12.5.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun SensorArTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
