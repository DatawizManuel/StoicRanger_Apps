# Stoic Ranger for Windows - uninstall. Removes the app and its shortcuts. Your database.xlsx and the app's data
# (%APPDATA%\Stoic Ranger) are not touched.
$dest = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $dest 'StoicRanger.exe'))) { Write-Host 'This is not a Stoic Ranger app folder.'; Start-Sleep -Seconds 3; exit 1 }
Get-Process -Name 'StoicRanger' -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 4
Get-Process -Name 'StoicRanger' -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($lnk in @('Stoic Ranger.lnk', 'Stoic Ranger Shooting.lnk')) { foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  Remove-Item (Join-Path $d $lnk) -Force -ErrorAction SilentlyContinue } }
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\StoicRanger' -Recurse -Force -ErrorAction SilentlyContinue
Set-Location $env:TEMP
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Stoic Ranger Shooting was removed. Your database.xlsx and the app data (%APPDATA%\Stoic Ranger) are unchanged.'
Start-Sleep -Seconds 3
