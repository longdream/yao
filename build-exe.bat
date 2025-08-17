@echo off
echo [Yao] Building standalone executable...
echo.

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
echo [Yao] Building Tauri application (exe only)...
call npx tauri build --no-bundle
if errorlevel 1 (
    echo [ERROR] Failed to build Tauri application
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Standalone executable built successfully!
echo.
echo The executable file is located at:
echo src-tauri\target\release\yao.exe
echo.
echo File size:
dir "src-tauri\target\release\yao.exe" | findstr yao.exe
echo.

pause
