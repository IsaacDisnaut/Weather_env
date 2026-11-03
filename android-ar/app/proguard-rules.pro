# ARCore โหลดคลาสผ่าน JNI จึงห้าม obfuscate
-keep class com.google.ar.core.** { *; }

# kotlinx.serialization ใช้ชื่อฟิลด์ตอน runtime
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.weatherdashboard.ar.data.** {
    *** Companion;
    <fields>;
}
-keepclasseswithmembers class com.weatherdashboard.ar.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}
