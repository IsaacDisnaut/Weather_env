@echo off
setlocal enabledelayedexpansion

REM Stops the web server, Node-RED, MQTT broker and ngrok tunnel started by
REM start-sensor.bat.
REM Kills by listening port so unrelated node.exe processes are left alone.
REM ASCII only - see the note in start-sensor.bat.

title Weather Dashboard - Stop

echo Stopping Weather Dashboard
echo.

for %%P in (3000 1880 1883 9001 4040) do (
    set "FOUND="
    for /f "tokens=5" %%A in ('netstat -ano -p tcp ^| findstr /r /c:"LISTENING" ^| findstr /r /c:":%%P "') do (
        if not "%%A"=="0" (
            echo   killing PID %%A ^(port %%P^)
            taskkill /f /pid %%A >nul 2>&1
            set "FOUND=1"
        )
    )
    if not defined FOUND echo   port %%P - nothing running
)

echo.
echo Done.
ping -n 3 127.0.0.1 >nul 2>&1
