@echo off
title ROYAL MASTER FOREX - Relay Gateway
cd /d "%~dp0"
chcp 65001 >nul
python relay_gateway.py
echo.
echo Gateway stopped. Press any key to close.
pause >nul
