#!/bin/sh
# 1) npm run dist   (or: npx electron-builder --win dir --x64)  produces dist/win-unpacked
# 2) this script wraps it in a Windows installer using the NSIS compiler that electron-builder downloads.
set -e
cd "$(dirname "$0")/.."
N="${NSIS_DIR:-$HOME/.cache/electron-builder/nsis/nsis-3.0.4.1}"
cd tools && NSISDIR="$N" "$N/linux/makensis" -V2 installer.nsi
