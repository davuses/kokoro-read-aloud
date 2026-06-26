@echo off
REM Kokoro TTS server - easy start (Windows).
REM
REM Double-click this file to start the server. The first run installs the "uv"
REM toolchain and downloads the speech model (a few hundred MB), so it can take
REM several minutes; later runs start quickly.
REM
REM Keep this window open while you use the extension. Close it to stop the server.

cd /d "%~dp0"
title Kokoro TTS Server

echo Starting Kokoro TTS server setup...
echo.

REM Make sure uv (the Python toolchain manager) is available. It manages its own
REM Python and dependencies, so nothing else needs to be installed first.
where uv >nul 2>nul
if %errorlevel% neq 0 (
  if exist "%USERPROFILE%\.local\bin\uv.exe" (
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
  ) else (
    echo Installing uv ^(one-time setup^)...
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
  )
)

echo Installing dependencies ^(first run can take several minutes^)...
uv sync
if %errorlevel% neq 0 (
  echo.
  echo Could not install dependencies. Check your internet connection and try again.
  pause
  exit /b 1
)

echo.
echo Server is starting. Keep this window open while you use the extension.
echo When you see "Application startup complete", it's ready to use.
echo Close this window to stop the server.
echo.
REM Run uvicorn as a module (python -m) rather than via uv's console-script
REM trampoline (uv run uvicorn), which can fail to canonicalize its path when the
REM project lives under a folder with non-ASCII characters (e.g. a Chinese
REM username on Windows).
uv run python -m uvicorn server:app --host 127.0.0.1 --port 18001

echo.
echo The server has stopped.
pause
