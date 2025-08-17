@echo off
echo [Yao] Building installer package...
echo.
echo [WARNING] This requires internet connection to download WiX toolkit.
echo Press Ctrl+C to cancel if you don't have stable internet connection.
echo.
pause

echo [Yao] Installing dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [Yao] Building frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build frontend
    pause
    exit /b 1
)

echo.
echo [Yao] Temporarily enabling bundle for installer build...
powershell -Command "(Get-Content 'src-tauri\tauri.conf.json') -replace '\"active\": false', '\"active\": true' -replace '\"icon\":', '\"targets\": [\"msi\"], \"publisher\": \"Yao Team\", \"icon\":' | Set-Content 'src-tauri\tauri.conf.json'"

echo.
echo [Yao] Building Tauri application with installer...
call npm run tauri:build
set BUILD_RESULT=%errorlevel%

echo.
echo [Yao] Restoring bundle configuration...
powershell -Command "(Get-Content 'src-tauri\tauri.conf.json') -replace '\"active\": true', '\"active\": false' -replace '\"targets\": \[\"msi\"\], \"publisher\": \"Yao Team\", \"icon\":', '\"icon\":' | Set-Content 'src-tauri\tauri.conf.json'"

if %BUILD_RESULT% neq 0 (
    echo [ERROR] Failed to build installer
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Installer build completed!
echo.
echo Files generated:
echo - Executable: src-tauri\target\release\yao.exe
echo - MSI Installer: src-tauri\target\release\bundle\msi\Yao_0.1.0_x64_en-US.msi
echo.

pause
