@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ============================================================
REM  Weather ^& Sensor Dashboard - launcher
REM  Starts the MQTT broker (Mosquitto), Node-RED and the Next.js
REM  web server. Fake sensor data lives in simulator.py (run it in VS Code).
REM  NOTE: ASCII only. cmd.exe corrupts batch files that mix
REM        codepages, so no Thai text in here.
REM ============================================================

title Weather Dashboard - Launcher

echo ============================================================
echo   Weather ^& Sensor Dashboard
echo   Starting MQTT broker + Node-RED + web server
echo ============================================================
echo.

REM ---------- prerequisites ----------
set "MOSQUITTO=C:\Program Files\mosquitto\mosquitto.exe"
if not exist "%MOSQUITTO%" (
    echo [ERROR] Mosquitto not found at:
    echo         %MOSQUITTO%
    echo         Install it from https://mosquitto.org/download/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [ERROR] Web dependencies are not installed.
    echo         Run "npm install" once, then try again.
    echo.
    pause
    exit /b 1
)

REM ---------- 1) MQTT broker ----------
call :is_listening 1883
if !PORT_BUSY! equ 1 (
    echo [SKIP]  Port 1883 already in use - assuming broker is running
) else (
    echo [START] MQTT broker    - port 1883 ^(TCP^) and 9001 ^(WebSocket^)
    start "MQTT Broker (Mosquitto)" "%MOSQUITTO%" -c "%~dp0mosquitto\mosquitto.conf" -v
    call :sleep 2
)

REM ---------- 2) Node-RED (writes data/sensor-readings.csv) ----------
if not exist "nodered\node_modules\" (
    echo [SKIP]  Node-RED is not installed - run "cd nodered ^&^& npm install"
    echo         Readings will NOT be saved to data\sensor-readings.csv
) else (
    call :is_listening 1880
    if !PORT_BUSY! equ 1 (
        echo [SKIP]  Port 1880 already in use - assuming Node-RED is running
    ) else (
        echo [START] Node-RED      - http://localhost:1880
        start "Node-RED (CSV export)" cmd /k npm run nodered
    )
)

REM ---------- 3) web server ----------
call :is_listening 3000
if !PORT_BUSY! equ 1 (
    echo [SKIP]  Port 3000 already in use - assuming web server is running
) else (
    echo [START] Web server     - http://localhost:3000
    start "Weather Dashboard (Next.js)" cmd /k npm run dev
)

echo.
echo ------------------------------------------------------------
echo   Dashboard : http://localhost:3000/dashboard
echo   Node-RED  : http://localhost:1880
echo   MQTT      : port 1883 - point devices at this PC's IP
echo   CSV file  : data\sensor-readings.csv
echo.
echo   No hardware yet? Run simulator.py in VS Code for fake readings.
echo   To stop      : run stop-sensor.bat, or close the windows.
echo ------------------------------------------------------------
echo.
echo Waiting for the web server to come up...

set /a tries=0
:waitloop
set /a tries+=1
if !tries! gtr 60 (
    echo [WARN] Web server did not respond in time.
    echo        Open http://localhost:3000/dashboard manually.
    goto done
)
call :sleep 2
curl -s -o nul http://localhost:3000/api/sensors/snapshot 2>nul
if !errorlevel! neq 0 goto waitloop

echo Ready - opening the dashboard in your browser
start "" http://localhost:3000/dashboard

:done
echo.
echo This window can be closed.
pause
exit /b 0

REM ============================================================
REM  helpers
REM ============================================================

:is_listening
set PORT_BUSY=0
for /f "tokens=*" %%L in ('netstat -ano -p tcp ^| findstr /r /c:"LISTENING" ^| findstr /r /c:":%~1 "') do set PORT_BUSY=1
exit /b 0

:sleep
REM timeout.exe fails when stdin is redirected, ping is always safe
set /a _pings=%~1+1
ping -n !_pings! 127.0.0.1 >nul 2>&1
exit /b 0
