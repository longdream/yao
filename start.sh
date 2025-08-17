#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "[OllamaChat] Installing dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
echo "[OllamaChat] Starting Tauri dev (no global install required)..."
npx --yes @tauri-apps/cli@latest dev | cat


