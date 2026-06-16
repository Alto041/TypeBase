@echo off
cd /d "%~dp0"
call adb reverse tcp:8081 tcp:8081
if errorlevel 1 (
  echo.
  echo adb reverse failed. Connect your phone with USB debugging enabled.
  echo.
  pause
  exit /b 1
)
call npx expo run:android %*
