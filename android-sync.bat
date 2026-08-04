@echo off
cd /d "%~dp0"
call npm run android:sync
echo.
echo 완료! Android Studio에서 Run(초록색 화살표) 눌러주세요.
pause
