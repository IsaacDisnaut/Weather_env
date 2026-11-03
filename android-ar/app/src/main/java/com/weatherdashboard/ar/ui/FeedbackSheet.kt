package com.weatherdashboard.ar.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.rememberCoroutineScope
import com.weatherdashboard.ar.data.UsageStats
import com.weatherdashboard.ar.i18n.Strings
import kotlinx.coroutines.launch

/**
 * ฟอร์มส่ง feedback — เปิดจากปุ่มบนแถบด้านบน หรือแอปชวนเองหลังผู้ใช้เดินดูมาแล้วหลายจุด
 *
 * ตั้งใจให้ "แตะอย่างเดียวก็ส่งได้" คือให้ดาวหรือแตะแท็กที่ตรงกับปัญหาก็พอ
 * ไม่ต้องพิมพ์ เพราะคนที่ยืนถือมือถือส่องกล้องอยู่หน้างานแทบไม่พิมพ์ข้อความยาว ๆ
 * ส่วนบริบท (จุดที่กำลังดู เวลาใช้งาน จำนวนที่สแกน) แอปแนบไปให้เองและบอกให้เห็นตรง ๆ
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FeedbackSheet(
    strings: Strings,
    stats: UsageStats,
    /** ชื่อจุดที่กำลังส่องอยู่ตอนเปิดฟอร์ม — โชว์ให้เห็นว่าจะถูกแนบไปกับ feedback ด้วย */
    deviceLabel: String?,
    onSubmit: suspend (rating: Int?, tags: List<String>, message: String, contact: String?) -> Boolean,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    var rating by remember { mutableIntStateOf(0) }
    var tags by remember { mutableStateOf(setOf<String>()) }
    var message by remember { mutableStateOf("") }
    var contact by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }

    /** null = ยังไม่ได้ส่ง, true = ถึงเซิร์ฟเวอร์แล้ว, false = ออฟไลน์ เก็บไว้ส่งให้ทีหลัง */
    var sent by remember { mutableStateOf<Boolean?>(null) }

    val canSend = rating > 0 || tags.isNotEmpty() || message.isNotBlank()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (sent != null) {
                // ---------- ส่งแล้ว ----------
                Text(
                    text = strings.feedbackThanks,
                    style = MaterialTheme.typography.titleMedium,
                    color = ArColors.OnSurface,
                )
                Text(
                    text = if (sent == true) strings.feedbackSentHint else strings.feedbackQueued,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (sent == true) ArColors.OnSurfaceMuted else ArColors.Warn,
                )
                Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text(strings.close)
                }
                return@Column
            }

            Text(
                text = strings.feedbackTitle,
                style = MaterialTheme.typography.titleMedium,
                color = ArColors.OnSurface,
            )
            Text(
                text = strings.feedbackSubtitle,
                style = MaterialTheme.typography.bodySmall,
                color = ArColors.OnSurfaceMuted,
            )

            // ---------- ดาว ----------
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                (1..5).forEach { value ->
                    Icon(
                        imageVector = Icons.Rounded.Star,
                        contentDescription = strings.feedbackRating(value),
                        tint = if (value <= rating) ArColors.Warn else ArColors.SurfaceSoft,
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .clickable { rating = value }
                            .padding(3.dp),
                    )
                }
            }

            if (rating > 0) {
                Text(
                    text = strings.feedbackRating(rating),
                    style = MaterialTheme.typography.labelSmall,
                    color = ArColors.OnSurfaceMuted,
                )
            }

            // ---------- แท็กที่แตะเลือกได้ ----------
            Text(
                text = strings.feedbackTagsTitle,
                style = MaterialTheme.typography.titleSmall,
                color = ArColors.OnSurface,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                strings.feedbackTags.forEach { tag ->
                    FilterChip(
                        selected = tag in tags,
                        onClick = { tags = if (tag in tags) tags - tag else tags + tag },
                        label = { Text(tag) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = ArColors.Accent.copy(alpha = 0.22f),
                            selectedLabelColor = ArColors.Accent,
                        ),
                    )
                }
            }

            // ---------- ข้อความเพิ่มเติม ----------
            OutlinedTextField(
                value = message,
                onValueChange = { message = it },
                label = { Text(strings.feedbackMessage) },
                placeholder = { Text(strings.feedbackMessageHint) },
                minLines = 3,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = contact,
                onValueChange = { contact = it },
                label = { Text(strings.feedbackContact) },
                supportingText = { Text(strings.feedbackContactHint) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )

            // ---------- บริบทที่จะถูกแนบไปด้วย ----------
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ArColors.SurfaceSoft, RoundedCornerShape(10.dp))
                    .padding(12.dp),
            ) {
                Text(
                    text = strings.feedbackContext(
                        stats.scanCount,
                        (stats.sessionMs / 60_000).toInt(),
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = ArColors.OnSurfaceMuted,
                )
                if (deviceLabel != null) {
                    Text(
                        text = "${strings.feedbackAtPoint} $deviceLabel",
                        style = MaterialTheme.typography.labelSmall,
                        color = ArColors.OnSurfaceMuted,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                Text(
                    text = strings.feedbackPrivacy,
                    style = MaterialTheme.typography.labelSmall,
                    color = ArColors.OnSurfaceMuted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    enabled = canSend && !sending,
                    onClick = {
                        sending = true
                        scope.launch {
                            sent = onSubmit(
                                rating.takeIf { it > 0 },
                                tags.toList(),
                                message,
                                contact.takeIf { it.isNotBlank() },
                            )
                            sending = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (sending) strings.feedbackSending else strings.feedbackSend)
                }
                OutlinedButton(onClick = onDismiss) {
                    Text(strings.feedbackLater)
                }
            }
        }
    }
}
