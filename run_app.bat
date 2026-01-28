@echo off
:: Set code page to UTF-8
chcp 65001 >nul
setlocal
title MP4-NOICE Launcher

echo ======================================================
echo           MP4-NOICE - Signal Protection
echo ======================================================
echo.
echo  Contact: pqlpp@proton.me
echo  Repo: https://github.com/qawsedrftgyhujikolpa/mp4-noice
echo.
echo ======================================================
echo.

:: 0. Cleanup old processes
echo [STEP 0/3] Cleaning up old processes...
taskkill /F /IM python.exe /T >nul 2>nul
taskkill /F /IM py.exe /T >nul 2>nul

:: 1. Check Python
where py >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python.
    pause
    exit /b
)

:: 2. Check Requirements
echo [STEP 1/3] Checking libraries...
py -m pip install -r requirements.txt --quiet

:: 3. Start Server
echo [STEP 2/3] Starting MP4-NOICE Engine...
start "MP4-NOICE Server" /min py server.py

:: 4. Wait and Launch Browser
echo [STEP 3/3] Waiting for signal (7s)...
timeout /t 7 /nobreak >nul

echo SUCCESS! Launching browser...
start "" "http://127.0.0.1:8000"

echo.
echo ======================================================
echo   If browser did not open, visit:
echo   http://127.0.0.1:8000
echo ======================================================
echo.

pause
