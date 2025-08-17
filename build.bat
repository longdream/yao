@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
echo [OllamaChat] Installing dependencies...
call npm install --no-audit --no-fund --legacy-peer-deps
echo [Yao] Building Tauri app...
:: 清除可能干扰 cargo 的代理环境变量
set HTTP_PROXY=
set HTTPS_PROXY=
set ALL_PROXY=
set NO_PROXY=*
set http_proxy=
set https_proxy=
set all_proxy=
set no_proxy=*
npx --yes @tauri-apps/cli@latest build
if not exist dist mkdir dist
echo [Yao] Collecting installers to dist/ ...
for /r src-tauri\target\release\bundle %%F in (*.exe *.msi *.dmg *.AppImage) do copy /Y "%%F" dist\ >nul 2>&1
echo [Yao] Done. See dist/ directory.
endlocal


