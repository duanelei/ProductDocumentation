@echo off
cd /d %~dp0
echo Starting HTTP server on port 8000...
python -m http.server 8000 --directory frontend
pause
