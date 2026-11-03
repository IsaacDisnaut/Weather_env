@echo off
REM  build APK แล้วติดตั้งลงมือถือที่ต่อสาย USB อยู่
REM
REM    build-install.bat                          ใช้ที่อยู่ dashboard เดิมที่เคย build ไว้
REM    build-install.bat http://10.9.139.89:3000  กำหนดที่อยู่ dashboard ใหม่
REM
REM  ตั้ง GRADLE_USER_HOME ไว้ที่ D: เพราะไดรฟ์ C: เหลือพื้นที่น้อย
REM  ส่วน SDK อ่านจาก local.properties (D:\Android\sdk) อยู่แล้ว

setlocal
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
set "ANDROID_HOME=D:\Android\sdk"
set "ANDROID_SDK_ROOT=D:\Android\sdk"
set "GRADLE_USER_HOME=D:\Android\gradle-home"
set "ADB=D:\Android\sdk\platform-tools\adb.exe"

set "DASHBOARD_ARG="
if not "%~1"=="" set "DASHBOARD_ARG=-PdashboardUrl=%~1"

REM  token กันคนแปลกปลอมยิงข้อมูลเข้ามา อ่านจาก .env.local ของ dashboard ที่เดียว
REM  APK ต้อง build ด้วยค่าเดียวกัน ไม่งั้นเซิร์ฟเวอร์ตอบ 401 ทุกครั้งที่แอปส่ง
REM  สถิติการใช้งาน feedback หรือคะแนนเกม (ฝั่งอ่านค่าเซนเซอร์ไม่ต้องใช้ token)
set "AR_TOKEN="
if exist "%~dp0..\.env.local" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~dp0..\.env.local") do (
    if /i "%%A"=="AR_INGEST_TOKEN" set "AR_TOKEN=%%B"
  )
)

set "TOKEN_ARG="
if defined AR_TOKEN (
  set "TOKEN_ARG=-ParToken=%AR_TOKEN%"
  echo [build-install] ใส่ AR_INGEST_TOKEN จาก .env.local ลงใน APK
) else (
  echo [build-install] ไม่พบ AR_INGEST_TOKEN ใน .env.local - แอปจะไม่แนบ token
)

call "%~dp0gradlew.bat" -p "%~dp0." :app:assembleDebug %DASHBOARD_ARG% %TOKEN_ARG%
if errorlevel 1 (
  echo.
  echo [build-install] build ไม่สำเร็จ
  exit /b 1
)

"%ADB%" install -r "%~dp0app\build\outputs\apk\debug\app-debug.apk"
if errorlevel 1 (
  echo.
  echo [build-install] ติดตั้งไม่สำเร็จ - ตรวจว่าเสียบสาย USB และเปิด USB debugging แล้ว
  exit /b 1
)

REM  อุโมงค์ผ่าน USB: มือถือเรียก http://localhost:3000 แล้ววิ่งมาที่เครื่องนี้
REM  ใช้ตอนมือถืออยู่คนละวง Wi-Fi กับคอม
"%ADB%" reverse tcp:3000 tcp:3000

"%ADB%" shell am start -n com.weatherdashboard.ar/.MainActivity
echo.
echo [build-install] เรียบร้อย
endlocal
