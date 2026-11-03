plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.weatherdashboard.ar"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.weatherdashboard.ar"
        // ARCore ต้องใช้ Android 7.0 ขึ้นไป
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        // ค่าเริ่มต้นของ dashboard — 10.0.2.2 คือ localhost ของเครื่องโฮสต์เมื่อรันบน emulator
        // เปลี่ยนได้ในแอปที่หน้า Settings โดยไม่ต้อง build ใหม่
        buildConfigField(
            "String",
            "DEFAULT_DASHBOARD_URL",
            "\"${project.findProperty("dashboardUrl") ?: "http://10.0.2.2:3000"}\"",
        )

        // token ที่ต้องแนบไปกับ usage/feedback เมื่อ dashboard เปิดออกอินเทอร์เน็ต
        // ต้องตรงกับ AR_INGEST_TOKEN ฝั่งเซิร์ฟเวอร์ — ว่างไว้ = ไม่แนบ (โหมด LAN)
        buildConfigField(
            "String",
            "AR_INGEST_TOKEN",
            "\"${project.findProperty("arToken") ?: ""}\"",
        )

        // OpenCV มี native library ก้อนใหญ่ทุกสถาปัตยกรรม เอาเฉพาะที่เครื่องรองรับ ARCore ใช้จริง
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    // รูป marker กับเนื้อหาของแต่ละอุปกรณ์อยู่ในโปรเจคหลัก ใช้ร่วมกับเว็บโดยไม่ต้องคัดลอกไฟล์
    //   ../../ar-markers -> assets/<marker>.png
    //   ../../ar-content -> assets/info/<deviceId>.txt และ assets/video/<deviceId>/<คลิป>.mp4
    sourceSets.getByName("main").assets.srcDirs("../../ar-markers", "../../ar-content")

    androidResources {
        // ไฟล์เอกสารกับสคริปต์ในโฟลเดอร์เนื้อหาไม่ต้องเข้า APK
        // (ทั้งสองโฟลเดอร์มี README.md จะชนกันตอน merge assets ด้วย)
        ignoreAssetsPatterns += listOf("README.md", "*.py", ".gitkeep")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        // API ของ media3 ยังเป็น @UnstableApi ทั้งชุด เปิด opt-in ที่เดียวจบ
        freeCompilerArgs += "-opt-in=androidx.media3.common.util.UnstableApi"
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    // ARCore — ภาพจากกล้อง ค่าพารามิเตอร์เลนส์ และการแปลงพิกัดภาพ -> พิกัดจอ
    implementation("com.google.ar:core:1.47.0")

    // OpenCV — ถอดรหัส ArUco จากภาพกล้องแต่ละเฟรม (org.opencv.objdetect.ArucoDetector)
    implementation("org.opencv:opencv:4.11.0")

    // คุยกับ dashboard: REST snapshot + SSE stream (อ่าน SSE เองด้วย okhttp ธรรมดา)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // เล่นคลิปวิดีโอของแต่ละอุปกรณ์ใน popup (อ่านจาก assets ผ่าน asset:/// ได้เลย)
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.compose.ui:ui-tooling-preview")
}
