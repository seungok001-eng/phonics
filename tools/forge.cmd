@echo off
rem Pomi Phonics forge launcher: starts the local server (port 8766) and opens Chrome. Closing this window stops the server.
rem Comments are ASCII only: cmd reads this file in the system code page and Korean text here breaks parsing.
cd /d "%~dp0\.."
call "%~dp0forge-shortcut.cmd" quiet
chcp 65001 >nul
python tools\forge\server.py %*
pause
