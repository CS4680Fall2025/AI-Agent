@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "CONFIG_DIR=%ROOT_DIR%config"
set "KEY_FILE=%CONFIG_DIR%\gemini_api_key.txt"
set "MODEL_FILE=%CONFIG_DIR%\gemini_model.txt"

if not exist "%CONFIG_DIR%" (
    mkdir "%CONFIG_DIR%"
)

:: Check if GEMINI_API_KEY is already set
if not "%GEMINI_API_KEY%"=="" goto :check_model

:: Check .env file
if exist "%ROOT_DIR%.env" (
    for /f "usebackq tokens=1* delims==" %%A in ("%ROOT_DIR%.env") do (
        if "%%A"=="GEMINI_API_KEY" set GEMINI_API_KEY=%%B
    )
)

:: Check if key was found in .env
if not "%GEMINI_API_KEY%"=="" goto :check_model

:: Prompt user skipped - using in-app settings

:check_model

if exist "%MODEL_FILE%" (
    set /p GEMINI_MODEL=<"%MODEL_FILE%"
)

if "%GEMINI_MODEL%"=="" (
    set "GEMINI_MODEL=gemini-flash-latest"
)

echo Using Gemini model: %GEMINI_MODEL%

echo Starting Gemini Git Agent Desktop App...

pushd "%ROOT_DIR%frontend"
npm run electron:dev
popd
pause
