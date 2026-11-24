# Stoic Ranger Map Manager - uninstall. Removes the app and its shortcuts. Your maps and routes in the Nextcloud folder
# and the settings (%APPDATA%\Stoic Ranger Map Manager) are not touched.
$dest = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $dest 'StoicRangerMaps.exe'))) { Write-Host 'This is not a Stoic Ranger Map Manager folder.'; Start-Sleep -Seconds 3; exit 1 }
Get-Process -Name 'StoicRangerMaps' -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 3
Get-Process -Name 'StoicRangerMaps' -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { Remove-Item (Join-Path $d 'Stoic Ranger Map Manager.lnk') -Force -ErrorAction SilentlyContinue }
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\StoicRangerMaps' -Recurse -Force -ErrorAction SilentlyContinue
Set-Location $env:TEMP
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Stoic Ranger Map Manager was removed. Your maps, routes and settings are unchanged.'
Start-Sleep -Seconds 3
