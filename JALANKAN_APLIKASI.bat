@echo off
title Tanpilan - Tracking Dua Device Realtime
color 0b
echo =================================================================
echo   APLIKASI TANPILAN: TRACKING DUA DEVICE TANPA BATAS JARAK
echo =================================================================
echo.
cd /d "%~dp0backend"
if not exist "node_modules" (
    echo Menginstal dependensi backend...
    call npm ci --omit=dev
)

rem Baca NGROK_DOMAIN dari environment variable jika ada
if defined NGROK_DOMAIN (
    set "TUNNEL_DOMAIN=%NGROK_DOMAIN%"
) else (
    set "TUNNEL_DOMAIN="
)

echo [1/2] Menyalakan Server Backend Tanpilan...
start /b node src/index.js

echo [2/2] Memeriksa Tunnel Eksternal...
where ngrok >nul 2>&1
if %ERRORLEVEL% equ 0 (
    if defined TUNNEL_DOMAIN (
        echo Menjalankan ngrok dengan domain: %TUNNEL_DOMAIN%
        start "" ngrok http --url=%TUNNEL_DOMAIN% 3000
    ) else (
        echo Menjalankan ngrok http 3000...
        start "" ngrok http 3000
    )
) else (
    echo [Info] ngrok CLI tidak ditemukan di PATH sistem.
    echo Anda dapat mengakses aplikasi langsung lewat jaringan lokal (Wi-Fi) atau unduh ngrok di https://ngrok.com/download
)

echo.
echo =================================================================
echo   AKSES APLIKASI:
echo   - Local PC Browser:   http://localhost:3000/
echo   - Simulator Desktop:  http://localhost:3000/simulator/DualDeviceSimulator.html
echo =================================================================
echo.
echo Tekan tombol apa saja untuk menutup launcher ini...
pause
