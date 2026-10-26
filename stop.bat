@echo off
chcp 65001 >nul
title Workforce Pro - Dung he thong
echo ===================================================
echo   Workforce Pro - Dang dung cac tien trinh dang chay...
echo ===================================================

echo Dang giai phong cong 4000 (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Dang giai phong cong 5173 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Da dung tat ca tien trinh tren cong 4000 va 5173.
timeout /t 3 >nul
exit
