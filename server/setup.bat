@echo off
REM One-time setup for the Kokoro TTS server, run by the installer (safe to
REM re-run). Installs the uv toolchain if needed and syncs all dependencies,
REM including the tray app. The model weights download on first server start.

cd /d "%~dp0"
title Kokoro TTS Server - Setup

echo Setting up the Kokoro TTS server.
echo This downloads several hundred MB and can take a few minutes...
echo.

where uv >nul 2>nul
if %errorlevel% neq 0 (
  if exist "%USERPROFILE%\.local\bin\uv.exe" (
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
  ) else (
    echo Installing uv...
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
  )
)

uv sync --group tray
if %errorlevel% neq 0 (
  echo.
  echo Setup failed. Check your internet connection, then run setup.bat again.
  pause
  exit /b 1
)

echo.
echo Setup complete.
exit /b 0
