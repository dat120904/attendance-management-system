@echo off
chcp 65001 >nul
title Workforce Pro - Khoi dong he thong
echo ===================================================
echo   Workforce Pro - Dang khoi dong Backend va Frontend...
echo ===================================================

cd /d "%~dp0"

echo [1/3] Kiem tra va build Backend...
call npm --prefix backend run build

echo [2/3] Dang khoi dong Backend tai http://localhost:4000 ...
start "Workforce Pro - Backend (Port 4000)" cmd /k "cd /d %~dp0backend && npm run dev"

echo [3/3] Dang khoi dong Frontend tai http://localhost:5173 ...
start "Workforce Pro - Frontend (Port 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 /nobreak >nul
echo Dang mo trinh duyet tai http://localhost:5173 ...
start http://localhost:5173

echo.
echo ===================================================
echo   Khoi dong hoan tat!
echo   - Frontend: http://localhost:5173
echo   - Backend API: http://localhost:4000
echo   - API Health: http://localhost:4000/api/health
echo ===================================================
timeout /t 5 >nul
exit
