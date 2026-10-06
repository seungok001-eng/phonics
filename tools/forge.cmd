@echo off
rem 교재 공방 실행: 로컬 서버(포트 8766)를 띄우고 크롬을 연다. 이 창을 닫으면 서버도 꺼진다.
rem 바탕화면에 바로가기가 없으면 만들어 둔다 (다른 PC에서 처음 실행할 때).
cd /d "%~dp0\.."
call "%~dp0forge-shortcut.cmd" quiet
chcp 65001 >nul
python tools\forge\server.py %*
pause
