@echo off
title Zunox - AI Music Studio
echo.
echo  =============================================
echo   __ _   _ _ __   ___  __  __
echo  /  /  / / '_ \ / _ \/ \ /\ /
echo  \   \/  / | | | (_) \  V  V /
echo   \_/\_/|_| |_|\___/ \_/\_/
echo.
echo   AI Music Studio powered by Suno API
echo  =============================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.8+
    pause
    exit /b 1
)

:: Install dependencies
echo [*] Installing dependencies...
pip install -r requirements.txt --quiet

:: Set UTF-8 encoding to prevent UnicodeEncodeError on Windows
SET PYTHONIOENCODING=utf-8
SET PYTHONUTF8=1

:: Start app
echo [*] Starting Zunox server...
echo [*] Open your browser at: http://localhost:5000
echo.
echo  Press Ctrl+C to stop the server.
echo.
python app.py
pause
