@echo off
title Win Researcher to Pyidaungsu Font Converter
cd /d "%~dp0"

echo ======================================================================
echo    Win Researcher (TrueType) ^<---^> Pyidaungsu (Unicode) Converter
echo                  Smart English Preservation System
echo ======================================================================
echo.
echo [1] Checking environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [Notice] Python not found in PATH. Opening standalone index.html directly...
    start "" "index.html"
    exit /b
)

echo [2] Starting Converter Web Server...
echo Server running at: http://localhost:5000
echo.

start "" "http://localhost:5000"
python app.py

pause
