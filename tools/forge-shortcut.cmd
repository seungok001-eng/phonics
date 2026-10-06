@echo off
rem 바탕화면에 "교재 공방" 바로가기를 만든다. 저장소가 어느 폴더에 있든 이 파일 위치 기준으로 잡는다.
rem 다른 PC에서: git pull 뒤 이 파일을 더블클릭 (forge.cmd를 실행할 때도 없으면 자동으로 만든다)
rem 이름(교재 공방)은 cmd 인코딩 문제를 피하려고 파워셸 안에서 유니코드 코드로 만든다. 교=U+AD50 재=U+C7AC 공=U+ACF5 방=U+BC29
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$name = [string]::Join('', [char[]](0xAD50,0xC7AC,0x20,0xACF5,0xBC29));" ^
  "$lnk = [IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), $name + '.lnk');" ^
  "if ((Test-Path $lnk) -and ('%1' -eq 'quiet')) { exit 0 }" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk);" ^
  "$s.TargetPath = '%ROOT%\tools\forge.cmd'; $s.WorkingDirectory = '%ROOT%'; $s.IconLocation = '%ROOT%\tools\forge\icon.ico,0';" ^
  "$s.Save(); Write-Host ('shortcut: ' + $lnk)"
if not "%1"=="quiet" pause
