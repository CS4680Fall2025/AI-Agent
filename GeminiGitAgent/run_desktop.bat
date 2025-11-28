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

:: Prompt user
echo.
echo GEMINI_API_KEY is not configured.
echo Please create a .env file in the root directory with GEMINI_API_KEY=your_key
echo Or set the GEMINI_API_KEY environment variable.
echo.
set /p GEMINI_API_KEY=Enter your Gemini API key (for this session only):

if "%GEMINI_API_KEY%"=="" (
    echo No API key provided. Exiting...
    pause
    exit /b 1
)

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
