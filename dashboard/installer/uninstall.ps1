# Stoic Ranger Dashboard - uninstall. Removes the app and its shortcuts. Your database.xlsx and the dashboard's
# settings (%APPDATA%\Stoic Ranger Dashboard) are not touched.
$dest = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $dest 'SRDashboard.exe'))) { Write-Host 'This is not a Stoic Ranger Dashboard folder.'; Start-Sleep -Seconds 3; exit 1 }
Get-Process -Name 'SRDashboard' -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 3
Get-Process -Name 'SRDashboard' -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { Remove-Item (Join-Path $d 'Stoic Ranger Dashboard.lnk') -Force -ErrorAction SilentlyContinue }
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\StoicRangerDashboard' -Recurse -Force -ErrorAction SilentlyContinue
Set-Location $env:TEMP
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Stoic Ranger Dashboard was removed. Your database.xlsx and the settings (%APPDATA%\Stoic Ranger Dashboard) are unchanged.'
Start-Sleep -Seconds 3
