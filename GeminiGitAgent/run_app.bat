@echo off
echo Starting Gemini Git Agent...

echo Starting Backend...
start "Gemini Backend" cmd /k "cd backend && run_server.bat"

echo Starting Frontend...
start "Gemini Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Application launching!
echo Backend will be at: http://localhost:5000
echo Frontend will be at: http://localhost:5173
echo.
pause
