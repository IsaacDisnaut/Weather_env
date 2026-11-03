package com.weatherdashboard.ar.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.weatherdashboard.ar.ar.MarkerKind
import com.weatherdashboard.ar.ar.TrackedMarker
import com.weatherdashboard.ar.data.DashboardState
import com.weatherdashboard.ar.data.DeviceContent
import com.weatherdashboard.ar.data.DeviceSnapshot
import com.weatherdashboard.ar.data.InfoLine
import com.weatherdashboard.ar.data.Metric
import com.weatherdashboard.ar.i18n.Strings

/** ถือว่าข้อมูลค้างเมื่อไม่มีค่าใหม่เกินหนึ่งนาที */
private const val STALE_AFTER_MS = 60_000L

/** หน้าต่างข้อมูลยาวได้ไม่เกินนี้ ที่เหลือเลื่อนอ่านในหน้าต่างเอง */
private val INFO_MAX_HEIGHT = 220.dp

/** หน้าต่างค่าเซนเซอร์ตอนกางรายละเอียด */
private val SENSOR_MAX_HEIGHT = 330.dp

/** หน้าต่างประวัติตอนกาง — ยาวกว่าหน้าต่างอื่นเพราะมีรูปประกอบ */
private val HISTORY_MAX_HEIGHT = 360.dp

/**
 * ชุดหน้าต่างที่ลอยเหนือรูป marker หนึ่งใบ — หน้าตาขึ้นกับชนิดของ marker
 *
 *   SENSOR   วิดีโอ -> ข้อมูลจุดติดตั้ง -> ค่าเซนเซอร์ (ใบล่างสุดมีลูกศรชี้ลงไปที่รูป)
 *   HISTORY  คลิป 360 องศา -> ประวัติพื้นที่ ซึ่งกดกางออกไปอยู่ข้าง ๆ คลิปได้
 *   QUIZ     หน้าต่างเกมตอบคำถามใบเดียว ไม่มีค่าเซนเซอร์และไม่มีคลิป
 *
 * ใบที่ต้องอ่านบ่อยที่สุดถูกวางไว้ล่างสุดเสมอ เพราะอยู่ใกล้รูปจริงและอ่านได้โดยไม่ต้องเงยสายตา
 */
@Composable
fun MarkerWindows(
    marker: TrackedMarker,
    device: DeviceSnapshot?,
    state: DashboardState,
    strings: Strings,
    content: DeviceContent?,
    nowMs: Long,
    detailed: Boolean,
    onToggleDetail: () -> Unit,
    historyExpanded: Boolean,
    onToggleHistory: () -> Unit,
    videoSlot: (@Composable () -> Unit)?,
    video360Slot: (@Composable () -> Unit)?,
    quizSlot: (@Composable () -> Unit)?,
    modifier: Modifier = Modifier,
) {
    when (marker.kind) {
        MarkerKind.HISTORY -> HistoryMarkerWindows(
            marker = marker,
            strings = strings,
            content = content,
            historyExpanded = historyExpanded,
            onToggleHistory = onToggleHistory,
            video360Slot = video360Slot,
            modifier = modifier,
        )

        MarkerKind.QUIZ -> QuizMarkerWindows(
            quizSlot = quizSlot,
            modifier = modifier,
        )

        MarkerKind.SENSOR -> SensorMarkerWindows(
            marker = marker,
            device = device,
            state = state,
            strings = strings,
            content = content,
            nowMs = nowMs,
            detailed = detailed,
            onToggleDetail = onToggleDetail,
            videoSlot = videoSlot,
            modifier = modifier,
        )
    }
}

@Composable
private fun SensorMarkerWindows(
    marker: TrackedMarker,
    device: DeviceSnapshot?,
    state: DashboardState,
    strings: Strings,
    content: DeviceContent?,
    nowMs: Long,
    detailed: Boolean,
    onToggleDetail: () -> Unit,
    videoSlot: (@Composable () -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (videoSlot != null) {
            WindowCard(title = strings.videoTitle, deviceLabel = marker.label) {
                videoSlot()
            }
        }

        if (content?.hasInfo == true) {
            WindowCard(title = strings.infoTitle, deviceLabel = marker.label) {
                ContentBody(content.info, INFO_MAX_HEIGHT)
            }
        }

        SensorWindow(
            marker = marker,
            device = device,
            state = state,
            strings = strings,
            content = content,
            nowMs = nowMs,
            detailed = detailed,
            showPointer = true,
            onClick = onToggleDetail,
        )
    }
}

/**
 * marker เล่าประวัติ — ไม่มีค่าเซนเซอร์
 *
 * ย่อไว้จะเรียงบนล่าง พอกดปุ่มดูประวัติแล้วจะสลับเป็นวางคู่กันซ้าย-ขวา
 * เพื่อให้อ่านประวัติไปพร้อมกับหมุนดูคลิป 360 องศาได้ในคราวเดียว
 */
/** marker ชนิดเกม — มีหน้าต่างใบเดียว เนื้อในมาจาก QuizWindow ที่ ArScreen ส่งเข้ามา */
@Composable
private fun QuizMarkerWindows(
    quizSlot: (@Composable () -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        quizSlot?.invoke()
        Pointer()
    }
}

@Composable
private fun HistoryMarkerWindows(
    marker: TrackedMarker,
    strings: Strings,
    content: DeviceContent?,
    historyExpanded: Boolean,
    onToggleHistory: () -> Unit,
    video360Slot: (@Composable () -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (historyExpanded && video360Slot != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(modifier = Modifier.weight(1f)) {
                    WindowCard(title = strings.video360Title, deviceLabel = marker.label) {
                        video360Slot()
                    }
                }
                Box(modifier = Modifier.weight(1f)) {
                    HistoryWindow(marker, strings, content, expanded = true, onToggle = onToggleHistory)
                }
            }
        } else {
            if (video360Slot != null) {
                WindowCard(title = strings.video360Title, deviceLabel = marker.label) {
                    video360Slot()
                }
            }
            HistoryWindow(marker, strings, content, historyExpanded, onToggleHistory)
        }

        Pointer()
    }
}

/** หน้าต่างประวัติ — หัวเรื่องกับปุ่มกางอยู่เสมอ ส่วนเนื้อหาโผล่เมื่อกางแล้ว */
@Composable
private fun HistoryWindow(
    marker: TrackedMarker,
    strings: Strings,
    content: DeviceContent?,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ArColors.Surface)
            .border(1.dp, ArColors.Accent.copy(alpha = 0.4f), RoundedCornerShape(16.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onToggle)
                .padding(vertical = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = strings.historyTitle,
                    style = MaterialTheme.typography.titleSmall,
                    color = ArColors.OnSurface,
                )
                val subtitle = listOfNotNull(
                    marker.location ?: marker.label,
                    marker.distanceM?.let { "%.1f m".format(it) },
                ).joinToString(" · ")
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = ArColors.OnSurfaceMuted,
                )
            }

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(ArColors.Accent.copy(alpha = 0.18f))
                    .padding(start = 10.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (expanded) strings.hideHistory else strings.showHistory,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = ArColors.Accent,
                )
                Icon(
                    imageVector = if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,
                    contentDescription = null,
                    tint = ArColors.Accent,
                    modifier = Modifier.size(16.dp),
                )
            }
        }

        AnimatedVisibility(visible = expanded) {
            Box(modifier = Modifier.padding(top = 10.dp)) {
                if (content?.hasHistory == true) {
                    ContentBody(content.history, HISTORY_MAX_HEIGHT)
                } else {
                    Text(
                        text = strings.historyMissing,
                        style = MaterialTheme.typography.bodySmall,
                        color = ArColors.OnSurfaceMuted,
                    )
                }
            }
        }
    }
}

/** ลูกศรชี้ลงไปที่รูป marker ให้รู้ว่าชุดหน้าต่างนี้เป็นของจุดไหน */
@Composable
private fun Pointer() {
    Canvas(modifier = Modifier.size(width = 18.dp, height = 9.dp)) {
        val path = Path().apply {
            moveTo(0f, 0f)
            lineTo(size.width, 0f)
            lineTo(size.width / 2f, size.height)
            close()
        }
        drawPath(path, ArColors.Surface)
    }
}

/**
 * หน้าต่างค่าเซนเซอร์ — ใช้ทั้งเป็นใบล่างของชุดสามหน้าต่าง
 * และเป็นหน้าต่างเดี่ยวของ marker ที่ไม่ได้โฟกัสอยู่
 */
@Composable
fun SensorWindow(
    marker: TrackedMarker,
    device: DeviceSnapshot?,
    state: DashboardState,
    strings: Strings,
    content: DeviceContent?,
    nowMs: Long,
    detailed: Boolean,
    showPointer: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val alerts = device?.let { state.alertCount(it) } ?: 0
    val stale = device != null && device.lastUpdate > 0 && nowMs - device.lastUpdate > STALE_AFTER_MS
    val accent = when {
        alerts > 0 -> ArColors.Alert
        stale -> ArColors.Warn
        device?.readings?.isNotEmpty() == true -> ArColors.Ok
        else -> ArColors.OnSurfaceMuted
    }
    val readyDevice = device?.takeIf { it.readings.isNotEmpty() }

    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(ArColors.Surface)
                .border(1.5.dp, accent.copy(alpha = 0.85f), RoundedCornerShape(18.dp))
                .clickable(onClick = onClick)
                .then(
                    if (detailed) {
                        Modifier
                            .heightIn(max = SENSOR_MAX_HEIGHT)
                            .verticalScroll(rememberScrollState())
                    } else {
                        Modifier
                    },
                )
                .padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            SensorHeader(marker, accent, alerts, strings, content, detailed)

            if (readyDevice == null) {
                Text(
                    text = strings.waitingData,
                    style = MaterialTheme.typography.bodySmall,
                    color = ArColors.OnSurfaceMuted,
                    modifier = Modifier.padding(top = 8.dp),
                )
            } else {
                Column(
                    modifier = Modifier.padding(top = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(if (detailed) 12.dp else 8.dp),
                ) {
                    visibleMetrics(readyDevice, state, detailed).forEach { metric ->
                        MetricRow(metric, readyDevice, state, strings, detailed)
                    }
                }
                SensorFooter(readyDevice, state, strings, stale, detailed, nowMs)
            }
        }

        if (showPointer) {
            Pointer()
        }
    }
}

/** กรอบหน้าต่างของวิดีโอกับข้อมูล — หัวเรื่องเล็ก ๆ บอกว่าเป็นของอุปกรณ์ไหน */
@Composable
private fun WindowCard(
    title: String,
    deviceLabel: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ArColors.Surface)
            .border(1.dp, ArColors.SurfaceSoft, RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = ArColors.Accent,
            )
            Text(
                text = deviceLabel,
                style = MaterialTheme.typography.labelSmall,
                color = ArColors.OnSurfaceMuted,
            )
        }
        content()
    }
}

/**
 * วาดเนื้อหาจากไฟล์ข้อความ ใช้ร่วมกันทั้งข้อมูลจุดติดตั้งและประวัติ
 * เนื้อหายาวเกิน [maxHeight] จะเลื่อนอ่านในหน้าต่างเอง ไม่ดันหน้าต่างให้ยาวจนบังภาพจริง
 */
@Composable
private fun ContentBody(lines: List<InfoLine>, maxHeight: Dp) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = maxHeight)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        lines.forEach { line ->
            when (line) {
                is InfoLine.Heading -> Text(
                    text = line.text,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = ArColors.Accent,
                    modifier = Modifier.padding(top = 2.dp),
                )

                is InfoLine.Field -> Row(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = line.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = ArColors.OnSurfaceMuted,
                        modifier = Modifier.weight(0.42f),
                    )
                    Text(
                        text = line.value,
                        style = MaterialTheme.typography.bodySmall,
                        color = ArColors.OnSurface,
                        modifier = Modifier.weight(0.58f),
                    )
                }

                is InfoLine.Paragraph -> Text(
                    text = line.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = ArColors.OnSurface,
                )

                is InfoLine.Image -> AssetImage(
                    path = line.assetPath,
                    caption = line.caption,
                    modifier = Modifier.padding(vertical = 3.dp),
                )

                InfoLine.Blank -> Spacer(modifier = Modifier.height(4.dp))
            }
        }
    }
}

@Composable
private fun SensorHeader(
    marker: TrackedMarker,
    accent: Color,
    alerts: Int,
    strings: Strings,
    content: DeviceContent?,
    detailed: Boolean,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(12.dp)
                .clip(CircleShape)
                .background(accent),
        )
        Column(modifier = Modifier.padding(start = 8.dp)) {
            Text(
                text = marker.label,
                style = MaterialTheme.typography.titleSmall,
                color = ArColors.OnSurface,
            )
            val subtitle = listOfNotNull(
                marker.location,
                marker.distanceM?.let { "%.1f m".format(it) },
                if (!marker.fullTracking) strings.staleData else null,
            ).joinToString(" · ")
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = ArColors.OnSurfaceMuted,
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        // marker ที่ไม่ได้โฟกัสจะเห็นแค่ใบนี้ ไอคอนบอกว่ามีคลิป/มีข้อมูลรออยู่
        if (!detailed && content != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (content.hasVideo) {
                    Icon(
                        imageVector = Icons.Rounded.PlayCircle,
                        contentDescription = strings.videoTitle,
                        tint = ArColors.Accent,
                        modifier = Modifier.size(18.dp),
                    )
                }
                if (content.hasInfo) {
                    Icon(
                        imageVector = Icons.Rounded.Description,
                        contentDescription = strings.infoTitle,
                        tint = ArColors.OnSurfaceMuted,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }

        if (alerts > 0) {
            Box(
                modifier = Modifier
                    .padding(start = 8.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(ArColors.Alert.copy(alpha = 0.28f))
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            ) {
                Text(
                    text = strings.alertsCount(alerts),
                    style = MaterialTheme.typography.labelSmall,
                    color = ArColors.Alert,
                )
            }
        }
    }
}

@Composable
private fun MetricRow(
    metric: Metric,
    device: DeviceSnapshot,
    state: DashboardState,
    strings: Strings,
    detailed: Boolean,
) {
    val reading = device.readings[metric] ?: return
    val threshold = state.thresholdFor(metric)
    val outOfRange = threshold.isOutOfRange(reading.value)
    val valueColor = if (outOfRange) ArColors.Alert else ArColors.OnSurface

    Column(
        // ค่าที่หลุดเกณฑ์ย้อมพื้นทั้งแถว จะได้สะดุดตาตั้งแต่ยังไม่ทันอ่านตัวเลข
        // ไม่ได้พึ่งสีตัวหนังสืออย่างเดียว เพราะแดงบนพื้นเข้มอ่านยากกลางแดด
        modifier = if (outOfRange) {
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(ArColors.AlertSoft)
                .padding(horizontal = 8.dp, vertical = 5.dp)
        } else {
            Modifier.fillMaxWidth()
        },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // ชื่อค่ารับพื้นที่ที่เหลือทั้งหมด ชื่อยาวอย่าง "คาร์บอนไดออกไซด์" จึงตัดบรรทัด
            // อยู่ในฝั่งตัวเอง ไม่ไปดันตัวเลขให้หลุดขอบการ์ดหรือถูกบีบจนอ่านไม่ออก
            Text(
                text = strings.metric(metric),
                style = MaterialTheme.typography.bodyMedium,
                color = if (outOfRange) ArColors.OnSurface else ArColors.OnSurfaceMuted,
                modifier = Modifier.weight(1f),
            )
            Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(start = 12.dp)) {
                Text(
                    text = metric.format(reading.value),
                    style = MaterialTheme.typography.headlineSmall,
                    color = valueColor,
                )
                Text(
                    text = " ${metric.unit}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = ArColors.OnSurfaceMuted,
                    modifier = Modifier.padding(bottom = 2.dp),
                )
            }
        }

        AnimatedVisibility(visible = detailed) {
            Column {
                device.series[metric]?.let { series ->
                    Sparkline(
                        values = series,
                        color = if (outOfRange) ArColors.Alert else ArColors.Accent,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(32.dp)
                            .padding(top = 6.dp),
                    )
                }

                val stats = device.stats[metric]
                val parts = buildList {
                    if (stats != null && stats.count > 0) {
                        add("${strings.average} ${metric.format(stats.avg)}")
                        add("${strings.min} ${metric.format(stats.min)}")
                        add("${strings.max} ${metric.format(stats.max)}")
                    }
                    threshold.max?.let { add("${strings.threshold} ≤ ${metric.format(it)}") }
                }
                if (parts.isNotEmpty()) {
                    Text(
                        text = parts.joinToString("  ·  "),
                        style = MaterialTheme.typography.labelSmall,
                        color = ArColors.OnSurfaceMuted,
                        modifier = Modifier.padding(top = 5.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun SensorFooter(
    device: DeviceSnapshot,
    state: DashboardState,
    strings: Strings,
    stale: Boolean,
    detailed: Boolean,
    nowMs: Long,
) {
    val hiddenCount = device.readings.size - visibleMetrics(device, state, detailed).size
    val updated = if (device.lastUpdate > 0) {
        strings.ago((nowMs - device.lastUpdate).coerceAtLeast(0))
    } else {
        strings.markerNoData
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "${strings.latest} · $updated",
            style = MaterialTheme.typography.labelSmall,
            color = if (stale) ArColors.Warn else ArColors.OnSurfaceMuted,
        )
        if (!detailed && hiddenCount > 0) {
            Text(
                text = "+$hiddenCount",
                style = MaterialTheme.typography.labelSmall,
                color = ArColors.Accent,
            )
        }
    }
}

/** กราฟเส้นจิ๋วของค่าย้อนหลัง ไม่มีแกน ไม่มีตัวเลข — ดูแค่แนวโน้ม */
@Composable
private fun Sparkline(values: List<Double>, color: Color, modifier: Modifier = Modifier) {
    if (values.size < 2) return

    Canvas(modifier = modifier.background(ArColors.SurfaceSoft, RoundedCornerShape(6.dp))) {
        val min = values.min()
        val max = values.max()
        val span = (max - min).takeIf { it > 1e-9 } ?: 1.0
        val stepX = size.width / (values.size - 1)
        val insetY = 4f

        val path = Path()
        values.forEachIndexed { index, value ->
            val x = index * stepX
            val ratio = ((value - min) / span).toFloat()
            val y = size.height - insetY - ratio * (size.height - insetY * 2)
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }

        drawPath(path, color, style = Stroke(width = 3f, cap = StrokeCap.Round))

        val lastRatio = ((values.last() - min) / span).toFloat()
        drawCircle(
            color = color,
            radius = 4.5f,
            center = Offset(size.width, size.height - insetY - lastRatio * (size.height - insetY * 2)),
        )
    }
}

/** ใบเล็กจะแสดงแค่ 3 ค่า โดยเอาค่าที่เกินเกณฑ์ขึ้นก่อน กางแล้วจึงเห็นครบ */
private fun visibleMetrics(
    device: DeviceSnapshot,
    state: DashboardState,
    detailed: Boolean,
): List<Metric> {
    val available = Metric.entries.filter { device.readings.containsKey(it) }
    if (detailed) return available

    val alerting = available.filter { metric ->
        val value = device.readings[metric]?.value ?: return@filter false
        state.thresholdFor(metric).isOutOfRange(value)
    }
    return (alerting + available).distinct().take(3)
}
