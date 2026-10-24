@echo off
rem Starts Pianoverse in live mode: code changes in this folder appear in the open window.
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
call npm run tauri dev
pause
