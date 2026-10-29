# Stoic Ranger for Windows - install a new copy or update an installed one (no admin rights needed).
#  1. joins and checks the app parts next to this file,
#  2. asks where to install (an update offers the place it is installed now),
#  3. asks where database.xlsx is (an update offers the file the app uses now). If there is no database.xlsx in the
#     folder you pick, the empty one from this package is copied there; an existing database.xlsx is never overwritten,
#  4. installs, keeps your settings (%APPDATA%\Stoic Ranger) and puts shortcuts on the desktop and in the Start menu.
# The app's data and your database.xlsx are never deleted by this script.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression.FileSystem
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$version = '__VERSION__'
$sha     = '__SHA256__'
$title   = "Stoic Ranger $version"
$key     = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\StoicRanger'
$cfgDir  = Join-Path $env:APPDATA 'Stoic Ranger'
$cfgFile = Join-Path $cfgDir 'config.json'
$utf8    = New-Object System.Text.UTF8Encoding $false

function Ask($text, $buttons = 'YesNo', $icon = 'Question') {
  return [System.Windows.Forms.MessageBox]::Show($text, $title, $buttons, $icon)
}
function PickFolder($text, $start) {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = $text; $d.ShowNewFolderButton = $true
  if ($start -and (Test-Path $start)) { $d.SelectedPath = $start }
  if ($d.ShowDialog() -ne 'OK') { return $null }
  return $d.SelectedPath
}

Write-Host "$title - install or update" -ForegroundColor Green
$zip = Join-Path $env:TEMP "StoicRanger-$version.zip"
try {
  # 1. the app parts
  $parts = Get-ChildItem -Path $here -Filter 'StoicRanger-app.zip.*' | Sort-Object Name
  if (-not $parts) { throw 'The app parts (StoicRanger-app.zip.001 ...) are missing next to Install.cmd.' }
  $template = Join-Path $here 'database.xlsx'
  if (-not (Test-Path $template)) { throw 'database.xlsx (the empty database) is missing next to Install.cmd.' }
  $out = [System.IO.File]::Create($zip)
  foreach ($p in $parts) { $in = [System.IO.File]::OpenRead($p.FullName); $in.CopyTo($out); $in.Close() }
  $out.Close()
  if ((Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower() -ne $sha) { throw 'The app parts are incomplete or damaged (checksum differs). Copy the folder again.' }

  # 2. where to install
  $old = $null
  if (Test-Path $key) { $old = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).InstallLocation }
  $dest = $null
  if ($old -and (Test-Path (Join-Path $old 'StoicRanger.exe'))) {
    $a = Ask "Stoic Ranger is installed in`n$old`n`nUpdate it there?`n(No = choose another folder)" 'YesNoCancel'
    if ($a -eq 'Cancel') { throw 'cancelled' }
    if ($a -eq 'Yes') { $dest = $old }
  }
  if (-not $dest) {
    $parent = PickFolder 'Where should Stoic Ranger be installed? A folder "Stoic Ranger" is made inside the folder you choose.' (Join-Path $env:LOCALAPPDATA 'Programs')
    if (-not $parent) { throw 'cancelled' }
    $dest = Join-Path $parent 'Stoic Ranger'
  }
  if ((Test-Path $dest) -and -not (Test-Path (Join-Path $dest 'StoicRanger.exe')) -and (Get-ChildItem $dest -Force | Select-Object -First 1)) {
    throw "The folder $dest already holds other files. Choose another place (nothing was changed)."
  }

  # 3. where database.xlsx is
  $cfg = [ordered]@{}
  if (Test-Path $cfgFile) {
    try { $j = [System.IO.File]::ReadAllText($cfgFile).TrimStart([char]0xFEFF) | ConvertFrom-Json; $j.PSObject.Properties | ForEach-Object { $cfg[$_.Name] = $_.Value } } catch { }
  }
  $db = $null
  if ($cfg['xlsx'] -and (Test-Path $cfg['xlsx'])) {
    $a = Ask "The app works with`n$($cfg['xlsx'])`n`nKeep using this database.xlsx?`n(No = choose another folder)" 'YesNoCancel'
    if ($a -eq 'Cancel') { throw 'cancelled' }
    if ($a -eq 'Yes') { $db = $cfg['xlsx'] }
  }
  if (-not $db) {
    $guess = @()
    foreach ($b in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:USERPROFILE 'OneDrive\Desktop'), [Environment]::GetFolderPath('MyDocuments'))) {
      $guess += Join-Path $b 'Wichtig\Claude\12_Stoic Ranger Apps\02_shared\pc-dashboard\03_registry'
    }
    if ($cfg['folder']) { $guess += Join-Path $cfg['folder'] '03_registry' }
    $start = $guess | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $start) { $start = [Environment]::GetFolderPath('MyDocuments') }
    $dir = PickFolder 'Where is your database.xlsx? Choose its folder (for the PC dashboard: pc-dashboard\03_registry). If there is none, an empty one is put there; an existing database.xlsx is never overwritten.' $start
    if (-not $dir) { throw 'cancelled' }
    $db = Join-Path $dir 'database.xlsx'
    if (Test-Path $db) { Write-Host "Using the existing $db (not changed)." }
    else { Copy-Item $template $db; Write-Host "New empty database.xlsx: $db" }
  }

  # 4. install
  $running = Get-Process -Name 'StoicRanger' -ErrorAction SilentlyContinue
  if ($running) {
    Write-Host 'Stoic Ranger is open. It is closed for the update (it saves its data first).' -ForegroundColor Yellow
    $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep -Seconds 5
    Get-Process -Name 'StoicRanger' -ErrorAction SilentlyContinue | Stop-Process -Force
  }
  if (Test-Path (Join-Path $dest 'StoicRanger.exe')) { Remove-Item -Recurse -Force $dest }   # only an app folder of ours
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)
  Remove-Item $zip -Force
  Copy-Item (Join-Path $here 'uninstall.ps1') $dest -Force

  if ($cfg['xlsx'] -ne $db) { $cfg['pending'] = $db }       # the app links it at its next start (and merges, nothing lost)
  New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
  [System.IO.File]::WriteAllText($cfgFile, ($cfg | ConvertTo-Json -Depth 5), $utf8)

  $exe = Join-Path $dest 'StoicRanger.exe'
  $sh  = New-Object -ComObject WScript.Shell
  foreach ($lnk in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Stoic Ranger.lnk'),
                     (Join-Path ([Environment]::GetFolderPath('Programs')) 'Stoic Ranger.lnk'))) {
    $s = $sh.CreateShortcut($lnk); $s.TargetPath = $exe; $s.WorkingDirectory = $dest
    $s.IconLocation = "$exe,0"; $s.Description = 'Stoic Ranger'; $s.Save()
  }
  New-Item -Path $key -Force | Out-Null
  $u = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dest\uninstall.ps1`""
  @{ DisplayName = 'Stoic Ranger'; DisplayVersion = $version; Publisher = 'Stoic Ranger'; DisplayIcon = "$exe,0";
     InstallLocation = $dest; UninstallString = $u; NoModify = 1; NoRepair = 1 }.GetEnumerator() | ForEach-Object {
    $t = if ($_.Value -is [int]) { 'DWord' } else { 'String' }
    New-ItemProperty -Path $key -Name $_.Key -Value $_.Value -PropertyType $t -Force | Out-Null }
  Write-Host "Installed to $dest" -ForegroundColor Green
  Write-Host "database.xlsx: $db"
  Start-Process $exe
  Start-Sleep -Seconds 2
} catch {
  if (Test-Path $zip) { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
  if ($_.Exception.Message -eq 'cancelled') { Write-Host 'Cancelled. Nothing was changed.' -ForegroundColor Yellow; Start-Sleep -Seconds 2; exit 0 }
  Write-Host ''
  Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
