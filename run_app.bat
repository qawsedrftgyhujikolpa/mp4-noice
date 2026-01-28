@echo off
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

:: Pythonの存在確認
where py >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Pythonが見つかりません。
    pause
    exit /b
)

echo [1/3] ライブラリを確認中...
py -m pip install -r requirements.txt --quiet

echo [2/3] MP4-NOICE エンジンを起動中...
start "MP4-NOICE Server" /min py server.py

echo [3/3] 信号待機中...
timeout /t 5 /nobreak >nul

echo 完了！ブラウザを起動します。
start http://127.0.0.1:8000

echo.
pause
