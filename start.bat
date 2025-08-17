@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
echo [OllamaChat] Installing dependencies...
:: 解决 npm 依赖冲突并确保 vite 可用
call npm install --no-audit --no-fund --legacy-peer-deps
echo [Yao] Starting Tauri dev (no global install required)...
:: 清除可能干扰 cargo 的代理环境变量，避免访问 crates.io 失败
set HTTP_PROXY=
set HTTPS_PROXY=
set ALL_PROXY=
set NO_PROXY=*
set http_proxy=
set https_proxy=
set all_proxy=
set no_proxy=*
npx --yes @tauri-apps/cli@latest dev
endlocal


