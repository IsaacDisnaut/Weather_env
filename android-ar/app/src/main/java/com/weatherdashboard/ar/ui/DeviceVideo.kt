package com.weatherdashboard.ar.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import android.view.LayoutInflater
import android.view.SurfaceView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.VolumeOff
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.weatherdashboard.ar.R

/**
 * ช่องเล่นวิดีโอใน popup
 *
 * ตัว [ExoPlayer] ถูกสร้างและถือไว้ที่ ArScreen เพียงตัวเดียว แล้วส่งเข้ามาที่นี่
 * เพราะ popup ที่กางได้มีทีละอันเท่านั้น จึงไม่ต้องเปลืองหลาย instance
 * ปุ่มควบคุมมาตรฐานถูกปิดไว้ (คลิปสั้นและเล่นวนอยู่แล้ว) เหลือแค่ปุ่มเปิด/ปิดเสียง
 */
@Composable
fun DeviceVideo(
    player: ExoPlayer,
    muted: Boolean,
    muteLabel: String,
    onToggleMute: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(10.dp))
            .background(Color.Black),
    ) {
        AndroidView(
            modifier = Modifier.matchParentSize(),
            factory = { context ->
                PlayerView(context).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    this.player = player
                }
            },
            // คืน surface ให้ player ก่อนที่ view จะถูกทิ้ง ไม่งั้นภาพค้างตอนกางอันใหม่
            onRelease = { view -> view.player = null },
        )

        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(6.dp)
                .clip(CircleShape)
                .background(ArColors.Scrim)
                .clickable(onClick = onToggleMute)
                .padding(5.dp),
        ) {
            Icon(
                imageVector = if (muted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp,
                contentDescription = muteLabel,
                tint = ArColors.OnSurface,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/**
 * แทนที่ช่องวิดีโอเมื่อเล่นไม่ได้ — คลิปที่ผู้ใช้ใส่เองอาจความละเอียดสูงเกินกว่าที่
 * ตัวถอดรหัสของเครื่องรับไหว หรือเป็นรูปแบบที่ Android ไม่รองรับ
 */
@Composable
fun VideoUnavailable(message: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(ArColors.SurfaceSoft)
            .padding(horizontal = 12.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.labelSmall,
            color = ArColors.Warn,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * คลิป 360 องศา — ลากนิ้วบนภาพเพื่อหันมองรอบตัว
 *
 * ใช้ PlayerView ที่ตั้ง surface_type เป็น spherical_gl_surface_view ซึ่งฉายภาพ
 * equirectangular ลงทรงกลมแล้วรับทั้งการลากนิ้วและการหมุนเครื่องให้เอง
 * ค่านี้ตั้งได้จาก XML เท่านั้น จึงต้อง inflate เลย์เอาต์แทนการ new ใน Kotlin
 */
@Composable
fun DeviceVideo360(
    player: ExoPlayer,
    muted: Boolean,
    muteLabel: String,
    hint: String,
    onToggleMute: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(4f / 3f)
            .clip(RoundedCornerShape(10.dp))
            .background(Color.Black),
    ) {
        AndroidView(
            modifier = Modifier.matchParentSize(),
            factory = { context ->
                val view = LayoutInflater.from(context)
                    .inflate(R.layout.view_spherical_player, null) as PlayerView
                // SurfaceView ปกติถูกวางไว้หลังหน้าต่าง ต้องยกขึ้นมาไม่ให้จมอยู่ใต้ภาพกล้อง
                (view.videoSurfaceView as? SurfaceView)?.setZOrderMediaOverlay(true)
                view.player = player
                view
            },
            onRelease = { view -> view.player = null },
        )

        // บอกวิธีใช้ เพราะภาพนิ่ง ๆ ไม่มีอะไรบอกว่าลากได้
        Text(
            text = hint,
            style = MaterialTheme.typography.labelSmall,
            color = ArColors.OnSurface,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(6.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(ArColors.Scrim)
                .padding(horizontal = 7.dp, vertical = 4.dp),
        )

        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(6.dp)
                .clip(CircleShape)
                .background(ArColors.Scrim)
                .clickable(onClick = onToggleMute)
                .padding(5.dp),
        ) {
            Icon(
                imageVector = if (muted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp,
                contentDescription = muteLabel,
                tint = ArColors.OnSurface,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}
