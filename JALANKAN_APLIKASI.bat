@echo off
title Tanpilan - Tracking Dua Device Realtime
color 0b
echo =================================================================
echo   APLIKASI TANPILAN: TRACKING DUA DEVICE TANPA BATAS JARAK
echo =================================================================
echo.
cd /d "%~dp0backend"
if not exist "node_modules" (
    echo Menginstal paket backend...
    call npm install
)

echo [1/2] Menyalakan Server Backend...
start /b node src/index.js

echo [2/2] Menyalakan HTTPS Tunnel Permanen untuk HP...
start "" "%~dp0backend\ngrok.exe" http --url=https://skinning-genre-repent.ngrok-free.dev 3000

echo.
echo Sedang mendeteksi status terhubung...
call node get-tunnel-url.js

echo.
echo =================================================================
echo   AKSES APLIKASI:
echo   - Link Tetap HP:      https://skinning-genre-repent.ngrok-free.dev
echo   - Local PC Browser:   http://localhost:3000/
echo   - Simulator Desktop:  http://localhost:3000/simulator/DualDeviceSimulator.html
echo =================================================================
echo.
echo Tekan tombol apa saja untuk menutup launcher ini...
pause
