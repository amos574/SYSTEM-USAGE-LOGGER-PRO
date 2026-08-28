@echo off
setlocal enabledelayedexpansion

title System Usage Logger Pro — Python Desktop Client
color 0B

echo ======================================================================
echo   SYSTEM USAGE LOGGER PRO — NATIVE PYTHON DESKTOP CLIENT
echo ======================================================================
echo.

:: 1. Check for Python 3 installation
set "PY_CMD="

where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=python"
) else (
    where py >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set "PY_CMD=py -3"
    )
)

if "%PY_CMD%"=="" (
    color 0C
    echo [ERROR] Python 3 was not found in your system PATH.
    echo Please install Python 3.9+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo [OK] Detected Python environment:
%PY_CMD% --version
echo.

:: 2. Setup or activate virtual environment
cd /d "%~dp0"

if not exist ".venv" (
    echo [INFO] Creating Python virtual environment (.venv)...
    %PY_CMD% -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [WARN] Virtual environment creation failed. Using system Python directly.
        set "RUN_PY=%PY_CMD%"
    ) else (
        echo [OK] Virtual environment created.
        set "RUN_PY=.venv\Scripts\python.exe"
    )
) else (
    set "RUN_PY=.venv\Scripts\python.exe"
)

if not exist "%RUN_PY%" (
    set "RUN_PY=%PY_CMD%"
)

:: 3. Install or update dependencies
echo [INFO] Verifying requirements (requests, customtkinter)...
"%RUN_PY%" -m pip install --quiet --upgrade pip >nul 2>&1
"%RUN_PY%" -m pip install --quiet -r requirements.txt

if %ERRORLEVEL% neq 0 (
    echo [WARN] Pip install returned warnings, attempting to launch application anyway...
)

:: 4. Launch Desktop Application
echo [INFO] Launching System Usage Logger Pro Desktop Client...
echo.
"%RUN_PY%" app.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [NOTE] Application exited with code %ERRORLEVEL%.
    pause
)

exit /b 0
