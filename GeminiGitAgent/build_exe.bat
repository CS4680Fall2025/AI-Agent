@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Building Gemini Git Agent
echo ========================================
echo.

:: Check if we're in the right directory
if not exist "backend\server.py" (
    echo Error: Must run from GeminiGitAgent directory
    echo Current directory: %CD%
    pause
    exit /b 1
)

:: Step 1: Install Python dependencies
echo [1/4] Installing Python dependencies...
cd backend
pip install -r requirements.txt >nul 2>&1
if errorlevel 1 (
    echo Error: Failed to install Python dependencies
    pause
    exit /b 1
)

pip install pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Error: Failed to install PyInstaller
    pause
    exit /b 1
)
echo ✓ Python dependencies installed

:: Step 2: Build backend EXE
echo.
echo [2/4] Building backend EXE with PyInstaller...
pyinstaller gemini-git-agent-server.spec --clean
if errorlevel 1 (
    echo Error: PyInstaller build failed
    pause
    exit /b 1
)
echo ✓ Backend EXE built

:: Step 3: Copy EXE to frontend
echo.
echo [3/4] Copying backend EXE to frontend...
if not exist "..\frontend\backend-dist" (
    mkdir "..\frontend\backend-dist"
)
copy /Y "dist\gemini-git-agent-server.exe" "..\frontend\backend-dist\gemini-git-agent-server.exe" >nul
if errorlevel 1 (
    echo Error: Failed to copy EXE to frontend
    pause
    exit /b 1
)
echo ✓ Backend EXE copied to frontend

:: Step 4: Build frontend and package
echo.
echo [4/4] Building frontend and packaging with Electron...
cd ..\frontend

:: Install npm dependencies if needed
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
    if errorlevel 1 (
        echo Error: Failed to install npm dependencies
        pause
        exit /b 1
    )
)

:: Build frontend
echo Building frontend assets...
call npm run build
if errorlevel 1 (
    echo Error: Frontend build failed
    pause
    exit /b 1
)
echo ✓ Frontend built

:: Package with Electron Builder
echo Packaging application...
call npm run dist
if errorlevel 1 (
    echo Error: Electron packaging failed
    pause
    exit /b 1
)
echo ✓ Application packaged

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Installer location: frontend\release\
echo.
echo You can find:
echo   - Installer: frontend\release\Gemini Git Agent Setup *.exe
echo   - Unpacked: frontend\release\win-unpacked\
echo.
pause

