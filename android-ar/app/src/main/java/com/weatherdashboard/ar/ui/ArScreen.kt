package com.weatherdashboard.ar.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.opengl.GLSurfaceView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.RateReview
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.weatherdashboard.ar.ar.ArSessionController
import com.weatherdashboard.ar.ar.ArStatus
import com.weatherdashboard.ar.ar.MarkerKind
import com.weatherdashboard.ar.ar.TrackedMarker
import com.weatherdashboard.ar.data.ConnectionState
import com.weatherdashboard.ar.data.DeviceContentStore
import com.weatherdashboard.ar.data.Prefs
import com.weatherdashboard.ar.data.QuizSession
import com.weatherdashboard.ar.data.SensorRepository
import com.weatherdashboard.ar.data.UsageTracker
import com.weatherdashboard.ar.i18n.Lang
import com.weatherdashboard.ar.i18n.Strings
import com.weatherdashboard.ar.i18n.stringsFor
import kotlinx.coroutines.delay
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * หน้าหลักของแอป: ภาพกล้อง AR เต็มจอ แล้ววาง popup ค่าเซนเซอร์ทับตรงตำแหน่งรูป marker
 * ที่ ARCore ตรวจเจอ พร้อมแถบสถานะด้านบนและแผงตั้งค่า
 */
@Composable
fun ArScreen(
    controller: ArSessionController,
    repository: SensorRepository,
    prefs: Prefs,
    contentStore: DeviceContentStore,
    tracker: UsageTracker,
    quiz: QuizSession,
) {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }

    val lang by prefs.lang.collectAsStateWithLifecycle()
    val strings = remember(lang) { stringsFor(lang) }
    val baseUrl by prefs.baseUrl.collectAsStateWithLifecycle()

    val state by repository.state.collectAsStateWithLifecycle()
    val markers by controller.trackedMarkers.collectAsStateWithLifecycle()
    val arStatus by controller.status.collectAsStateWithLifecycle()
    val loadedMarkers by controller.loadedMarkers.collectAsStateWithLifecycle()
    val rejectedMarkers by controller.rejectedMarkers.collectAsStateWithLifecycle()
    val deviceContent by contentStore.content.collectAsStateWithLifecycle()

    // อ่านข้อความกับหาไฟล์วิดีโอของทุกอุปกรณ์รอบเดียว แล้วอ่านใหม่เมื่อสลับภาษา
    LaunchedEffect(loadedMarkers, lang) {
        contentStore.load(loadedMarkers.map { it.deviceId }, lang)
    }

    val quizState by quiz.state.collectAsStateWithLifecycle()

    val usageStats by tracker.stats.collectAsStateWithLifecycle()
    val showFeedback by tracker.promptFeedback.collectAsStateWithLifecycle()

    var hasPermission by remember { mutableStateOf(context.hasCameraPermission()) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasPermission = granted
        if (granted && activity != null) controller.resume(activity, true)
    }

    LaunchedEffect(Unit) {
        if (!hasPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    // GLSurfaceView ต้องถูกปลุก/หยุดคู่กับ ARCore session เสมอ ไม่งั้นกล้องจะค้าง
    var glView by remember { mutableStateOf<GLSurfaceView?>(null) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, hasPermission, glView, activity) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> {
                    activity?.let { controller.resume(it, hasPermission) }
                    glView?.onResume()
                    tracker.start()
                }

                Lifecycle.Event.ON_PAUSE -> {
                    glView?.onPause()
                    controller.pause()
                    tracker.stop()
                }

                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)

        // เข้ามาตอนหน้าจอ resume อยู่แล้ว (เช่นเพิ่งกดอนุญาตกล้อง) ต้องเริ่มเองรอบหนึ่ง
        if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            activity?.let { controller.resume(it, hasPermission) }
            glView?.onResume()
            tracker.start()
        }

        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // ใช้เดินเวลา "อัปเดตเมื่อ … ที่แล้ว" ใน popup
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            nowMs = System.currentTimeMillis()
            delay(1_000)
        }
    }

    /*
     * ตัวนับการสแกนสนใจแค่ "ชุดจุดที่เห็นอยู่" ไม่ใช่ตำแหน่งที่ขยับทุกเฟรม
     * จึงผูก effect ไว้กับรายชื่อ deviceId ที่เรียงแล้ว — ยืนดูจุดเดิมนิ่ง ๆ จะไม่ยิงซ้ำเลย
     */
    val visibleKey = remember(markers) { markers.map { it.deviceId }.sorted().joinToString() }
    LaunchedEffect(visibleKey, loadedMarkers) {
        tracker.onVisible(
            markers.map { marker ->
                UsageTracker.Target(
                    deviceId = marker.deviceId,
                    arucoId = loadedMarkers.firstOrNull { it.deviceId == marker.deviceId }?.arucoId,
                    label = marker.label,
                    location = marker.location,
                )
            },
        )
    }

    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var popupSizes by remember { mutableStateOf(mapOf<String, IntSize>()) }
    var showSettings by remember { mutableStateOf(false) }
    var muted by remember { mutableStateOf(true) }

    /** marker ที่กางครบสามหน้าต่างอยู่ — ปกติคือใบที่ใกล้ที่สุด แตะใบอื่นเพื่อย้ายโฟกัส */
    var focusOverrideId by remember { mutableStateOf<String?>(null) }

    /** หน้าต่างค่าเซนเซอร์ของ marker ที่โฟกัสอยู่ กางดูกราฟกับสถิติหรือยัง */
    var detailed by remember { mutableStateOf(false) }

    /** marker ชนิดประวัติ กางหน้าต่างประวัติออกมาข้างคลิป 360 หรือยัง */
    var historyExpanded by remember { mutableStateOf(false) }

    // เล่นวิดีโอได้ทีละจุด จึงใช้ player ตัวเดียวทั้งหน้าจอ
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            repeatMode = Player.REPEAT_MODE_ONE
            volume = 0f
        }
    }
    var videoFailed by remember { mutableStateOf(false) }
    DisposableEffect(player) {
        // คลิปมาจากผู้ใช้ จึงมีโอกาสที่เครื่องถอดรหัสไม่ไหว ต้องบอกให้รู้แทนที่จะขึ้นจอดำ
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Log.w("ArScreen", "เล่นคลิปไม่สำเร็จ", error)
                videoFailed = true
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }
    DisposableEffect(lifecycleOwner, player) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> player.pause()
                Lifecycle.Event.ON_RESUME -> if (player.mediaItemCount > 0) player.play()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(muted) {
        player.volume = if (muted) 0f else 1f
    }

    // ใบที่ใกล้ที่สุดได้โฟกัส เว้นแต่ผู้ใช้จะแตะเลือกใบอื่นเอง
    // (และใบที่เลือกไว้ต้องยังอยู่ในเฟรม ไม่งั้นกลับไปใช้ใบที่ใกล้ที่สุด)
    val focusedId = focusOverrideId?.takeIf { id -> markers.any { it.id == id } }
        ?: markers.minByOrNull { it.nearness }?.id

    LaunchedEffect(focusedId) {
        detailed = false
        historyExpanded = false
    }

    // ใช้ loadedMarkers (คงที่) หาว่าใบที่โฟกัสเป็นของอุปกรณ์ไหน
    // ถ้าไปอ่านจาก markers ที่ขยับทุกเฟรม วิดีโอจะถูกสั่งเล่นใหม่ไม่หยุด
    val focusedDef = remember(focusedId, loadedMarkers) {
        loadedMarkers.firstOrNull { it.image == focusedId }
    }
    val focusedContent = focusedDef?.let { deviceContent[it.deviceId] }

    // marker ประวัติเล่นคลิป 360 ส่วน marker เซนเซอร์เล่นคลิปปกติ
    val focusedVideo = if (focusedDef?.kind == MarkerKind.HISTORY) {
        focusedContent?.video360Asset
    } else {
        focusedContent?.videoAsset
    }

    LaunchedEffect(focusedVideo) {
        videoFailed = false
        if (focusedVideo == null) {
            player.stop()
            player.clearMediaItems()
        } else {
            player.setMediaItem(MediaItem.fromUri("asset:///$focusedVideo"))
            player.prepare()
            player.play()
        }
    }

    val density = LocalDensity.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .onSizeChanged { containerSize = it },
    ) {
        ArCameraView(
            controller = controller,
            onViewCreated = { glView = it },
            modifier = Modifier.fillMaxSize(),
        )

        // จุดที่อยู่ไกลวาดก่อน จุดใกล้จึงทับอยู่ด้านบน
        markers.sortedByDescending { it.nearness }.forEach { marker ->
            key(marker.id) {
                val measured = popupSizes[marker.id]
                val focused = marker.id == focusedId
                val markerContent = deviceContent[marker.deviceId]

                // ใบที่โฟกัสกว้างกว่าเพราะต้องใส่วิดีโอกับตารางข้อมูล
                // และตอนกางประวัติต้องกว้างพอวางคลิป 360 กับประวัติคู่กันได้
                val sideBySide = focused &&
                    marker.kind == MarkerKind.HISTORY &&
                    historyExpanded
                val windowWidth = if (sideBySide) {
                    with(density) { (containerSize.width - 24).coerceAtLeast(1).toDp() }
                        .coerceAtMost(460.dp)
                } else {
                    with(density) { marker.widthPx.toDp() }.coerceIn(
                        if (focused) 270.dp else 200.dp,
                        if (focused) 330.dp else 260.dp,
                    )
                }

                Box(
                    modifier = Modifier
                        .width(windowWidth)
                        .offset { markerOffset(marker, measured, containerSize) }
                        .onSizeChanged { size -> popupSizes = popupSizes + (marker.id to size) }
                        // ยังไม่รู้ขนาดจริงก็ยังวางตำแหน่งไม่ได้ ซ่อนไว้หนึ่งเฟรมกันกระพริบ
                        .alpha(
                            when {
                                measured == null -> 0f
                                marker.fullTracking -> 1f
                                else -> 0.72f
                            },
                        ),
                ) {
                    if (focused) {
                        MarkerWindows(
                            marker = marker,
                            device = state.device(marker.deviceId),
                            state = state,
                            strings = strings,
                            content = markerContent,
                            nowMs = nowMs,
                            detailed = detailed,
                            onToggleDetail = { detailed = !detailed },
                            historyExpanded = historyExpanded,
                            onToggleHistory = { historyExpanded = !historyExpanded },
                            videoSlot = if (marker.kind == MarkerKind.SENSOR &&
                                markerContent?.hasVideo == true
                            ) {
                                {
                                    if (videoFailed) {
                                        VideoUnavailable(strings.videoError)
                                    } else {
                                        DeviceVideo(
                                            player = player,
                                            muted = muted,
                                            muteLabel = if (muted) strings.muteOn else strings.muteOff,
                                            onToggleMute = { muted = !muted },
                                        )
                                    }
                                }
                            } else {
                                null
                            },
                            quizSlot = if (marker.kind == MarkerKind.QUIZ) {
                                {
                                    QuizWindow(
                                        state = quizState,
                                        strings = strings,
                                        onStart = { quiz.start(lang) },
                                        onChoose = { choice -> quiz.choose(choice) },
                                        onNext = { quiz.next(lang) },
                                        onAgain = { quiz.reset() },
                                    )
                                }
                            } else {
                                null
                            },
                            video360Slot = if (marker.kind == MarkerKind.HISTORY &&
                                markerContent?.hasVideo360 == true
                            ) {
                                {
                                    if (videoFailed) {
                                        VideoUnavailable(strings.videoError)
                                    } else {
                                        DeviceVideo360(
                                            player = player,
                                            muted = muted,
                                            muteLabel = if (muted) strings.muteOn else strings.muteOff,
                                            hint = strings.dragToRotate,
                                            onToggleMute = { muted = !muted },
                                        )
                                    }
                                }
                            } else {
                                null
                            },
                        )
                    } else if (marker.kind == MarkerKind.QUIZ) {
                        QuizTeaser(
                            strings = strings,
                            onClick = { focusOverrideId = marker.id },
                        )
                    } else {
                        // จุดอื่นที่เห็นพร้อมกันเหลือใบเดียวกันจอรก แตะเพื่อย้ายโฟกัสมาที่จุดนี้
                        SensorWindow(
                            marker = marker,
                            device = state.device(marker.deviceId),
                            state = state,
                            strings = strings,
                            content = markerContent,
                            nowMs = nowMs,
                            detailed = false,
                            showPointer = true,
                            onClick = { focusOverrideId = marker.id },
                        )
                    }
                }
            }
        }

        TopBar(
            strings = strings,
            connection = state.connection,
            brokerOnline = state.brokerOnline,
            markerCount = markers.size,
            lang = lang,
            onReconnect = { repository.connect(baseUrl) },
            onOpenFeedback = tracker::openFeedback,
            onOpenSettings = { showSettings = true },
            onLangChange = prefs::setLang,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        if (arStatus is ArStatus.Ready) {
            HintBar(
                strings = strings,
                hasMarkers = markers.isNotEmpty(),
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        } else {
            StatusOverlay(
                status = arStatus,
                strings = strings,
                onGrantCamera = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                onRetry = { activity?.let { controller.resume(it, hasPermission) } },
                modifier = Modifier.align(Alignment.Center),
            )
        }
    }

    if (showFeedback) {
        FeedbackSheet(
            strings = strings,
            stats = usageStats,
            deviceLabel = focusedDef?.label,
            onSubmit = { rating, tags, message, contact ->
                tracker.submitFeedback(
                    rating = rating,
                    tags = tags,
                    message = message,
                    contact = contact,
                    deviceId = focusedDef?.deviceId,
                    deviceLabel = focusedDef?.label,
                )
            },
            onDismiss = tracker::dismissPrompt,
        )
    }

    if (showSettings) {
        SettingsSheet(
            strings = strings,
            lang = lang,
            baseUrl = baseUrl,
            state = state,
            loadedMarkers = loadedMarkers,
            rejectedMarkers = rejectedMarkers,
            onLangChange = prefs::setLang,
            onSaveUrl = prefs::setBaseUrl,
            onTest = { url -> repository.testConnection(Prefs.normalizeUrl(url)) },
            onDismiss = { showSettings = false },
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TopBar(
    strings: Strings,
    connection: ConnectionState,
    brokerOnline: Boolean,
    markerCount: Int,
    lang: Lang,
    onReconnect: () -> Unit,
    onOpenFeedback: () -> Unit,
    onOpenSettings: () -> Unit,
    onLangChange: (Lang) -> Unit,
    modifier: Modifier = Modifier,
) {
    val (label, color) = when (connection) {
        ConnectionState.CONNECTING -> strings.connConnecting to ArColors.Warn
        ConnectionState.ONLINE -> (if (brokerOnline) strings.connOnline else strings.brokerOffline) to
            (if (brokerOnline) ArColors.Ok else ArColors.Warn)
        ConnectionState.OFFLINE -> strings.connOffline to ArColors.OnSurfaceMuted
        ConnectionState.ERROR -> strings.connError to ArColors.Alert
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .systemBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // แตะ = ต่อใหม่ · กดค้าง = เปิดหน้าตั้งค่า
        //
        // ปุ่มตั้งค่าไม่ได้อยู่บนแถบแล้ว เพราะที่หน้างานมีคนทั่วไปหยิบเครื่องไปส่องเอง
        // ถ้ามีปุ่มเฟืองโผล่อยู่ก็มีคนกดเข้าไปแก้ที่อยู่เซิร์ฟเวอร์จนแอปใช้ไม่ได้
        // ท่ากดค้างยังเหลือไว้ให้เจ้าหน้าที่เข้าไปแก้หน้างานได้โดยไม่ต้อง build ใหม่
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(ArColors.Scrim)
                .combinedClickable(
                    onClick = onReconnect,
                    onLongClick = onOpenSettings,
                )
                .padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(color),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = ArColors.OnSurface,
                modifier = Modifier.padding(start = 7.dp),
            )
        }

        if (markerCount > 0) {
            Text(
                text = strings.markersFound(markerCount),
                style = MaterialTheme.typography.labelSmall,
                color = ArColors.OnSurface,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(ArColors.Scrim)
                    .padding(horizontal = 10.dp, vertical = 7.dp),
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        // อยู่คู่กับปุ่มตั้งค่าตลอดเวลา ผู้ใช้จะได้บอกปัญหาได้ทันทีที่เจอ ไม่ต้องหาที่ส่งทีหลัง
        IconButton(
            onClick = onOpenFeedback,
            modifier = Modifier
                .clip(CircleShape)
                .background(ArColors.Scrim),
        ) {
            Icon(
                imageVector = Icons.Rounded.RateReview,
                contentDescription = strings.feedback,
                tint = ArColors.OnSurface,
            )
        }

        Spacer(modifier = Modifier.width(8.dp))

        LanguageToggle(lang = lang, onLangChange = onLangChange)
    }
}

/**
 * ปุ่มสลับภาษาสองช่องติดกัน ช่องที่ใช้อยู่เป็นพื้นทึบ อีกช่องเป็นตัวหนังสือจาง
 *
 * ทำเป็นสองช่องแทนปุ่มสลับช่องเดียว เพราะผู้ชมที่เดินมาเจอเครื่องกลางนิทรรศการ
 * ต้องเห็นได้ทันทีว่ามีภาษาอะไรให้เลือกบ้าง ไม่ใช่ต้องกดดูก่อนถึงจะรู้
 */
@Composable
private fun LanguageToggle(lang: Lang, onLangChange: (Lang) -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(ArColors.Scrim)
            .padding(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Lang.entries.forEach { option ->
            val active = option == lang
            Text(
                text = option.label,
                style = MaterialTheme.typography.labelSmall,
                color = if (active) ArColors.OnSurface else ArColors.OnSurfaceMuted,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (active) ArColors.Accent.copy(alpha = 0.28f) else Color.Transparent)
                    .clickable(enabled = !active) { onLangChange(option) }
                    .padding(horizontal = 11.dp, vertical = 5.dp),
            )
        }
    }
}

@Composable
private fun HintBar(strings: Strings, hasMarkers: Boolean, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .systemBarsPadding()
            .padding(horizontal = 24.dp, vertical = 20.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(ArColors.Scrim)
            .padding(horizontal = 18.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = if (hasMarkers) strings.tapHint else strings.scanHint,
            style = MaterialTheme.typography.bodyMedium,
            color = ArColors.OnSurface,
            textAlign = TextAlign.Center,
        )
        if (!hasMarkers) {
            Text(
                text = strings.scanHintSecondary,
                style = MaterialTheme.typography.bodySmall,
                color = ArColors.OnSurfaceMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
}

@Composable
private fun StatusOverlay(
    status: ArStatus,
    strings: Strings,
    onGrantCamera: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val message = when (status) {
        ArStatus.Initializing -> return
        ArStatus.NeedsCameraPermission -> strings.needCamera
        ArStatus.Installing -> strings.installRequired
        ArStatus.Unsupported -> strings.unsupported
        ArStatus.Ready -> return
        is ArStatus.Failed -> "${strings.sessionError}\n${status.message}"
    }

    Column(
        modifier = modifier
            .padding(32.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(ArColors.Surface)
            .padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = ArColors.OnSurface,
            textAlign = TextAlign.Center,
        )

        when (status) {
            ArStatus.NeedsCameraPermission -> Button(onClick = onGrantCamera) {
                Text(strings.grantCamera)
            }

            is ArStatus.Failed -> Button(onClick = onRetry) { Text(strings.retry) }

            else -> Unit
        }
    }
}

/**
 * วาง popup ให้ "ลอยเหนือ" รูป marker โดยปลายลูกศรชี้ลงมาที่จุดกึ่งกลางรูป
 * เว้นระยะตามขนาดรูปบนจอ — ยิ่งเข้าใกล้ หน้าต่างยิ่งถอยขึ้นไม่ให้บังรูป
 */
private fun markerOffset(marker: TrackedMarker, size: IntSize?, container: IntSize): IntOffset {
    if (size == null) return IntOffset(marker.xPx.roundToInt(), marker.yPx.roundToInt())

    val gap = (marker.widthPx * 0.30f).coerceIn(14f, 140f)
    val maxX = max(8f, container.width - size.width - 8f)
    val x = (marker.xPx - size.width / 2f).coerceIn(8f, maxX)
    val y = (marker.yPx - gap - size.height).coerceAtLeast(8f)

    return IntOffset(x.roundToInt(), y.roundToInt())
}

private fun Context.hasCameraPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED

/** Compose ให้มาแค่ Context — ต้องไล่ขึ้นไปหา Activity เองเพื่อส่งให้ ARCore ตอนขอติดตั้ง */
private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
