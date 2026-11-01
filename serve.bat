@echo off
rem Double-click to start the dev server and open the game in your browser.
cd /d "%~dp0"
python serve.py %*
pause
