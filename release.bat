@echo off
echo [Yao] Starting release build (exe only)...
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
call npm run tauri:build
if errorlevel 1 (
    echo [ERROR] Failed to build Tauri application
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Build completed successfully!
echo.
echo The executable file is located at:
echo src-tauri\target\release\yao.exe
echo.
echo File information:
if exist "src-tauri\target\release\yao.exe" (
    dir "src-tauri\target\release\yao.exe" | findstr yao.exe
    echo.
    echo File is ready for distribution!
) else (
    echo [WARNING] Executable file not found!
)
echo.

pause
