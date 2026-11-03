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

REM ngrok publishes the local web server on a public URL so phones on other
REM networks (mobile data included) can reach it. Set NGROK_ENABLED=0 to skip.
REM Leave NGROK_DOMAIN empty and the reserved name is read from Auth.txt.
set "NGROK_ENABLED=1"
set "NGROK_DOMAIN="
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
REM ---------- 4) ngrok tunnel ----------
REM Opened only after the web server answers (or the wait gave up), otherwise
REM anyone hitting the public URL during Next.js startup gets ERR_NGROK_8012.
call :start_ngrok
if defined NGROK_DOMAIN echo   Public       : https://!NGROK_DOMAIN!/dashboard
if defined NGROK_RUNNING echo   Tunnel log   : http://127.0.0.1:4040 lists every request ngrok forwards.
echo.
echo This window can be closed.
pause
exit /b 0

REM ============================================================
REM  helpers
REM ============================================================

REM Opens the public tunnel. Skips quietly whenever it cannot run, because a
REM missing tunnel only costs off-network access - everything else still works.
:start_ngrok
if "%NGROK_ENABLED%"=="0" (
    echo [SKIP]  ngrok disabled - set NGROK_ENABLED=1 in this file to publish a URL
    exit /b 0
)

where ngrok >nul 2>&1
if errorlevel 1 (
    echo [SKIP]  ngrok not found - install it from https://ngrok.com/download
    exit /b 0
)

REM The reserved domain lives in Auth.txt next to the authtoken, so the name is
REM written down in one place only. No "Domain:" line means a random URL, which
REM still works in a browser but will not match the URL baked into the APK.
if not defined NGROK_DOMAIN (
    if exist "%~dp0Auth.txt" (
        for /f "tokens=2" %%D in ('findstr /b /i /c:"Domain:" "%~dp0Auth.txt"') do set "NGROK_DOMAIN=%%D"
    )
)

call :is_listening 4040
if !PORT_BUSY! equ 1 (
    echo [SKIP]  Port 4040 already in use - assuming ngrok is running
    set "NGROK_RUNNING=1"
    exit /b 0
)

if defined NGROK_DOMAIN (
    echo [START] ngrok tunnel  - https://!NGROK_DOMAIN!
    start "ngrok tunnel" ngrok http 3000 --domain !NGROK_DOMAIN!
) else (
    echo [START] ngrok tunnel  - random URL, no "Domain:" line found in Auth.txt
    start "ngrok tunnel" ngrok http 3000
)
set "NGROK_RUNNING=1"
call :sleep 2
exit /b 0

:is_listening
set PORT_BUSY=0
for /f "tokens=*" %%L in ('netstat -ano -p tcp ^| findstr /r /c:"LISTENING" ^| findstr /r /c:":%~1 "') do set PORT_BUSY=1
exit /b 0

:sleep
REM timeout.exe fails when stdin is redirected, ping is always safe
set /a _pings=%~1+1
ping -n !_pings! 127.0.0.1 >nul 2>&1
exit /b 0
