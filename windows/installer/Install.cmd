@echo off
rem Stoic Ranger for Windows - install or update. Double-click this file.
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 pause
