package com.weatherdashboard.ar.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import com.weatherdashboard.ar.ar.MarkerDef
import com.weatherdashboard.ar.data.DashboardState
import com.weatherdashboard.ar.i18n.Lang
import com.weatherdashboard.ar.i18n.Strings
import kotlinx.coroutines.launch

/**
 * แผงตั้งค่า: ที่อยู่ dashboard, ภาษา และรายการ marker ที่โหลดได้จริง
 * รายการ marker ช่วยตอบคำถามที่เจอบ่อยที่สุดเวลา popup ไม่ขึ้น — รูปถูกโหลดไหม
 * และอุปกรณ์ที่ผูกไว้มีข้อมูลส่งเข้ามาหรือยัง
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    strings: Strings,
    lang: Lang,
    baseUrl: String,
    state: DashboardState,
    loadedMarkers: List<MarkerDef>,
    rejectedMarkers: List<String>,
    onLangChange: (Lang) -> Unit,
    onSaveUrl: (String) -> Unit,
    onTest: suspend (String) -> Result<Int>,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    var urlInput by remember(baseUrl) { mutableStateOf(baseUrl) }
    var testMessage by remember { mutableStateOf<String?>(null) }
    var testing by remember { mutableStateOf(false) }

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
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = strings.settings,
                style = MaterialTheme.typography.titleMedium,
                color = ArColors.OnSurface,
            )

            // ---------- ที่อยู่เซิร์ฟเวอร์ ----------
            OutlinedTextField(
                value = urlInput,
                onValueChange = {
                    urlInput = it
                    testMessage = null
                },
                label = { Text(strings.serverUrl) },
                supportingText = { Text(strings.serverUrlHint) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Done,
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = {
                        onSaveUrl(urlInput)
                        testMessage = null
                    },
                ) {
                    Text(strings.save)
                }
                OutlinedButton(
                    enabled = !testing,
                    onClick = {
                        scope.launch {
                            testing = true
                            testMessage = strings.testing
                            val result = onTest(urlInput)
                            testMessage = result.fold(
                                onSuccess = { count -> strings.testOk(count) },
                                onFailure = { strings.testFail },
                            )
                            testing = false
                        }
                    },
                ) {
                    Text(strings.test)
                }
            }

            testMessage?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = ArColors.OnSurfaceMuted,
                )
            }

            HorizontalDivider(color = ArColors.SurfaceSoft)

            // ---------- ภาษา ----------
            Text(
                text = strings.language,
                style = MaterialTheme.typography.titleSmall,
                color = ArColors.OnSurface,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Lang.entries.forEach { option ->
                    FilterChip(
                        selected = option == lang,
                        onClick = { onLangChange(option) },
                        label = { Text(option.label) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = ArColors.Accent.copy(alpha = 0.22f),
                            selectedLabelColor = ArColors.Accent,
                        ),
                    )
                }
            }

            HorizontalDivider(color = ArColors.SurfaceSoft)

            // ---------- รายการ marker ----------
            Text(
                text = "${strings.markerCatalog} (${loadedMarkers.size})",
                style = MaterialTheme.typography.titleSmall,
                color = ArColors.OnSurface,
            )

            loadedMarkers.forEach { marker ->
                val device = state.device(marker.deviceId)
                val hasData = device != null && device.readings.isNotEmpty()
                val summary = if (hasData) {
                    "${device?.readings?.size ?: 0} ${strings.samples}"
                } else {
                    strings.markerNoData
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(ArColors.SurfaceSoft, RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "ArUco #${marker.arucoId}  ·  ${marker.image}",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            color = ArColors.OnSurface,
                        )
                        Text(
                            text = "${strings.markerLinked} ${marker.deviceId}",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArColors.OnSurfaceMuted,
                        )
                    }
                    Text(
                        text = summary,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (hasData) ArColors.Ok else ArColors.OnSurfaceMuted,
                    )
                }
            }

            if (rejectedMarkers.isNotEmpty()) {
                Text(
                    text = "${strings.markerRejected} (${rejectedMarkers.size})",
                    style = MaterialTheme.typography.titleSmall,
                    color = ArColors.Warn,
                )
                Text(
                    text = rejectedMarkers.joinToString("\n"),
                    style = MaterialTheme.typography.bodySmall,
                    color = ArColors.OnSurface,
                )
                Text(
                    text = strings.markerRejectedHint,
                    style = MaterialTheme.typography.labelSmall,
                    color = ArColors.OnSurfaceMuted,
                )
            }

            HorizontalDivider(color = ArColors.SurfaceSoft)

            // ---------- เกี่ยวกับ ----------
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ArColors.SurfaceSoft, RoundedCornerShape(10.dp))
                    .padding(12.dp),
            ) {
                Column {
                    Text(
                        text = strings.about,
                        style = MaterialTheme.typography.titleSmall,
                        color = ArColors.OnSurface,
                    )
                    Text(
                        text = strings.aboutText,
                        style = MaterialTheme.typography.bodySmall,
                        color = ArColors.OnSurfaceMuted,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }

            OutlinedButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text(strings.close)
            }
        }
    }
}
