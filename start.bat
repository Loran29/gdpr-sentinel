@echo off
echo Starting GDPR Sentinel...

:: Start backend in a new window
start "GDPR Backend" cmd /k "cd /d %~dp0 && .venv\Scripts\activate && python -m uvicorn main:app --reload --port 8000"

:: Wait 3 seconds for backend to boot
timeout /t 3 /nobreak >nul

:: Start frontend in a new window
start "GDPR Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers starting...
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo Docs:     http://localhost:8000/docs
echo.
echo Close the two terminal windows to stop the servers.
pause
