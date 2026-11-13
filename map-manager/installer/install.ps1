# Stoic Ranger Map Manager - install a new copy or update an installed one (no admin rights needed).
#  1. joins and checks the app parts next to this file,
#  2. asks where to install (an update offers the place it is installed now),
#  3. installs, keeps your settings (%APPDATA%\Stoic Ranger Map Manager), puts shortcuts on the desktop and in the Start menu.
# Maps and routes in your Nextcloud folder are never touched by this script.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression.FileSystem
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$version = '__VERSION__'
$sha     = '__SHA256__'
$title   = "Stoic Ranger Map Manager $version"
$key     = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\StoicRangerMaps'
function Ask($text, $buttons = 'YesNo', $icon = 'Question') { return [System.Windows.Forms.MessageBox]::Show($text, $title, $buttons, $icon) }
function PickFolder($text, $start) {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = $text; $d.ShowNewFolderButton = $true
  if ($start -and (Test-Path $start)) { $d.SelectedPath = $start }
  if ($d.ShowDialog() -ne 'OK') { return $null }
  return $d.SelectedPath
}
Write-Host "$title - install or update" -ForegroundColor Green
$zip = Join-Path $env:TEMP "StoicRangerMaps-$version.zip"
try {
  $parts = Get-ChildItem -Path $here -Filter 'StoicRangerMaps-app.zip.*' | Sort-Object Name
  if (-not $parts) { throw 'The app parts (StoicRangerMaps-app.zip.001 ...) are missing next to Install.cmd.' }
  $out = [System.IO.File]::Create($zip)
  foreach ($p in $parts) { $in = [System.IO.File]::OpenRead($p.FullName); $in.CopyTo($out); $in.Close() }
  $out.Close()
  if ((Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower() -ne $sha) { throw 'The app parts are incomplete or damaged (checksum differs). Copy the folder again.' }

  $old = $null
  if (Test-Path $key) { $old = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).InstallLocation }
  $dest = $null
  if ($old -and (Test-Path (Join-Path $old 'StoicRangerMaps.exe'))) {
    $a = Ask "Stoic Ranger Map Manager is installed in`n$old`n`nUpdate it there?`n(No = choose another folder)" 'YesNoCancel'
    if ($a -eq 'Cancel') { throw 'cancelled' }
    if ($a -eq 'Yes') { $dest = $old }
  }
  if (-not $dest) {
    $parent = PickFolder 'Where should Stoic Ranger Map Manager be installed? A folder "Stoic Ranger Map Manager" is made inside the folder you choose.' (Join-Path $env:LOCALAPPDATA 'Programs')
    if (-not $parent) { throw 'cancelled' }
    $dest = Join-Path $parent 'Stoic Ranger Map Manager'
  }
  if ((Test-Path $dest) -and -not (Test-Path (Join-Path $dest 'StoicRangerMaps.exe')) -and (Get-ChildItem $dest -Force | Select-Object -First 1)) {
    throw "The folder $dest already holds other files. Choose another place (nothing was changed)."
  }
  $running = Get-Process -Name 'StoicRangerMaps' -ErrorAction SilentlyContinue
  if ($running) {
    Write-Host 'Stoic Ranger Map Manager is open. It is closed for the update.' -ForegroundColor Yellow
    $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep -Seconds 4
    Get-Process -Name 'StoicRangerMaps' -ErrorAction SilentlyContinue | Stop-Process -Force
  }
  if (Test-Path (Join-Path $dest 'StoicRangerMaps.exe')) { Remove-Item -Recurse -Force $dest }   # only an app folder of ours
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)
  Remove-Item $zip -Force
  Copy-Item (Join-Path $here 'uninstall.ps1') $dest -Force
  $exe = Join-Path $dest 'StoicRangerMaps.exe'
  $sh  = New-Object -ComObject WScript.Shell
  foreach ($lnk in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Stoic Ranger Map Manager.lnk'),
                     (Join-Path ([Environment]::GetFolderPath('Programs')) 'Stoic Ranger Map Manager.lnk'))) {
    $s = $sh.CreateShortcut($lnk); $s.TargetPath = $exe; $s.WorkingDirectory = $dest
    $s.IconLocation = "$exe,0"; $s.Description = 'Stoic Ranger Map Manager'; $s.Save()
  }
  New-Item -Path $key -Force | Out-Null
  $u = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dest\uninstall.ps1`""
  @{ DisplayName = 'Stoic Ranger Map Manager'; DisplayVersion = $version; Publisher = 'Stoic Ranger'; DisplayIcon = "$exe,0";
     InstallLocation = $dest; UninstallString = $u; NoModify = 1; NoRepair = 1 }.GetEnumerator() | ForEach-Object {
    $t = if ($_.Value -is [int]) { 'DWord' } else { 'String' }
    New-ItemProperty -Path $key -Name $_.Key -Value $_.Value -PropertyType $t -Force | Out-Null }
  Write-Host "Installed to $dest" -ForegroundColor Green
  Start-Process $exe
  Start-Sleep -Seconds 2
} catch {
  if (Test-Path $zip) { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
  if ($_.Exception.Message -eq 'cancelled') { Write-Host 'Cancelled. Nothing was changed.' -ForegroundColor Yellow; Start-Sleep -Seconds 2; exit 0 }
  Write-Host ''
  Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
