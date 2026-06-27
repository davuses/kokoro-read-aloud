@echo off
REM One-time setup for the Kokoro TTS server, run on first launch (and safe to
REM re-run). Installs the uv toolchain if needed, lets you pick the CPU or GPU
REM build of PyTorch, and syncs all dependencies (including the tray app).

cd /d "%~dp0"
title Kokoro TTS Server - Setup

REM Keep uv's managed Python on a local, non-redirected path. Some Windows
REM profiles redirect/sync %APPDATA% (Roaming) to OneDrive or a network share,
REM which uv can't traverse ("untrusted mount point", os error 448).
set "UV_PYTHON_INSTALL_DIR=%LOCALAPPDATA%\uv\python"

echo Setting up the Kokoro TTS server.
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

REM Remove a stale/broken .venv (no Python executable) left by a failed run.
if exist ".venv" if not exist ".venv\Scripts\python.exe" rmdir /s /q ".venv"

echo Do you have an NVIDIA GPU and want GPU acceleration?
echo The GPU build downloads about 2.5 GB more. Most people are fine with CPU --
echo Kokoro generates speech faster than real time on a typical CPU.
set /p USEGPU="Install the GPU (CUDA) build? [y/N]: "
echo.

if /i "%USEGPU%"=="y" (
  echo Installing the GPU build. This downloads several GB and can take a while...
  type nul > gpu.flag
  uv sync --group tray --extra cuda
) else (
  if exist gpu.flag del gpu.flag
  echo Installing the CPU build. This downloads several hundred MB...
  uv sync --group tray
)

if %errorlevel% neq 0 (
  echo.
  echo Setup failed. Check your internet connection, then run setup again.
  pause
  exit /b 1
)

echo.
echo Setup complete.
exit /b 0
