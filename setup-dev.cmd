@echo off
rem One-time setup: Rust, C++ build tools and app packages.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-dev.ps1"
pause
