@echo off
title Cars x Aura - local game server
cd /d "%~dp0frontend"
echo.
echo   CARS x AURA  -  by Saif Ur Rehman
echo   Game running at http://localhost:8797   (close this window to stop)
echo.
start "" http://localhost:8797/index.html
python -m http.server 8797 || py -m http.server 8797
pause
