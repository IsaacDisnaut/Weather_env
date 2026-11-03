package com.weatherdashboard.ar.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** ความสูงของช่องว่างระหว่างรอโหลดรูป กันเลย์เอาต์กระโดด */
private val PLACEHOLDER_HEIGHT = 90.dp

/**
 * รูปที่แทรกอยู่ในไฟล์เนื้อหา อ่านจาก assets
 *
 * ถอดรหัสบน IO thread เพราะรูปประวัติอาจใหญ่กว่าไอคอนทั่วไปมาก
 * ถ้าเปิดไฟล์ไม่ได้ (พิมพ์ชื่อผิด) จะเหลือกรอบว่างกับคำบรรยาย ไม่ทำให้แอปพัง
 */
@Composable
fun AssetImage(path: String, caption: String?, modifier: Modifier = Modifier) {
    val context = LocalContext.current

    val bitmap by produceState<ImageBitmap?>(initialValue = null, path) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                context.assets.open(path).use { BitmapFactory.decodeStream(it) }?.asImageBitmap()
            }.getOrNull()
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(ArColors.SurfaceSoft),
        ) {
            val image = bitmap
            if (image == null) {
                Box(modifier = Modifier
                    .fillMaxWidth()
                    .height(PLACEHOLDER_HEIGHT))
            } else {
                Image(
                    bitmap = image,
                    contentDescription = caption,
                    modifier = Modifier.fillMaxWidth(),
                    contentScale = ContentScale.FillWidth,
                )
            }
        }

        if (caption != null) {
            Text(
                text = caption,
                style = MaterialTheme.typography.labelSmall,
                color = ArColors.OnSurfaceMuted,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
}
