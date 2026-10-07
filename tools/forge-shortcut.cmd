@echo off
rem Creates the desktop shortcut "phonics forge" (Korean name) pointing at tools\forge.cmd. Works from any checkout location.
rem The Korean name is built from Unicode code points in PowerShell so this file stays ASCII-only (cmd cannot parse Korean here).
rem Usage: forge-shortcut.cmd [quiet]   - "quiet" skips the pause and does nothing if the shortcut already exists.
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
