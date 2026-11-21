# Stoic Ranger Dashboard for Windows - install a new copy or update an installed one (no admin rights needed).
#  1. joins and checks the app parts next to this file,
#  2. asks where to install (an update offers the place it is installed now),
#  3. asks which database.xlsx to show (offers the one the dashboard or SR Shooting for Windows already uses).
#     The dashboard only READS that file; it never creates, copies over or changes a database.xlsx,
#  4. installs, keeps your settings (%APPDATA%\Stoic Ranger Dashboard) and puts shortcuts on the desktop and in the Start menu.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression.FileSystem
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$version = '__VERSION__'
$sha     = '__SHA256__'
$title   = "Stoic Ranger Dashboard $version"
$key     = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\StoicRangerDashboard'
$cfgDir  = Join-Path $env:APPDATA 'Stoic Ranger Dashboard'
$cfgFile = Join-Path $cfgDir 'config.json'
$srCfg   = Join-Path $env:APPDATA 'Stoic Ranger\config.json'
$utf8    = New-Object System.Text.UTF8Encoding $false

function Ask($text, $buttons = 'YesNo', $icon = 'Question') { return [System.Windows.Forms.MessageBox]::Show($text, $title, $buttons, $icon) }
function PickFolder($text, $start) {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = $text; $d.ShowNewFolderButton = $true
  if ($start -and (Test-Path $start)) { $d.SelectedPath = $start }
  if ($d.ShowDialog() -ne 'OK') { return $null }
  return $d.SelectedPath
}
function PickFile($text, $start) {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Title = $text; $d.Filter = 'Excel workbook (*.xlsx)|*.xlsx'; $d.CheckFileExists = $true
  if ($start -and (Test-Path $start)) { $d.InitialDirectory = $start }
  if ($d.ShowDialog() -ne 'OK') { return $null }
  return $d.FileName
}
function ReadJson($f) {
  $o = [ordered]@{}
  if (Test-Path $f) { try { $j = [System.IO.File]::ReadAllText($f).TrimStart([char]0xFEFF) | ConvertFrom-Json; $j.PSObject.Properties | ForEach-Object { $o[$_.Name] = $_.Value } } catch { } }
  return $o
}

Write-Host "$title - install or update" -ForegroundColor Green
$zip = Join-Path $env:TEMP "SRDashboard-$version.zip"
try {
  # 1. the app parts
  $parts = Get-ChildItem -Path $here -Filter 'SRDashboard-app.zip.*' | Sort-Object Name
  if (-not $parts) { throw 'The app parts (SRDashboard-app.zip.001 ...) are missing next to Install.cmd.' }
  $out = [System.IO.File]::Create($zip)
  foreach ($p in $parts) { $in = [System.IO.File]::OpenRead($p.FullName); $in.CopyTo($out); $in.Close() }
  $out.Close()
  if ((Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower() -ne $sha) { throw 'The app parts are incomplete or damaged (checksum differs). Copy the folder again.' }

  # 2. where to install
  $old = $null
  if (Test-Path $key) { $old = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).InstallLocation }
  $dest = $null
  if ($old -and (Test-Path (Join-Path $old 'SRDashboard.exe'))) {
    $a = Ask "Stoic Ranger Dashboard is installed in`n$old`n`nUpdate it there?`n(No = choose another folder)" 'YesNoCancel'
    if ($a -eq 'Cancel') { throw 'cancelled' }
    if ($a -eq 'Yes') { $dest = $old }
  }
  if (-not $dest) {
    $parent = PickFolder 'Where should Stoic Ranger Dashboard be installed? A folder "Stoic Ranger Dashboard" is made inside the folder you choose.' (Join-Path $env:LOCALAPPDATA 'Programs')
    if (-not $parent) { throw 'cancelled' }
    $dest = Join-Path $parent 'Stoic Ranger Dashboard'
  }
  if ((Test-Path $dest) -and -not (Test-Path (Join-Path $dest 'SRDashboard.exe')) -and (Get-ChildItem $dest -Force | Select-Object -First 1)) {
    throw "The folder $dest already holds other files. Choose another place (nothing was changed)."
  }

  # 3. which database.xlsx (only read by the dashboard)
  $cfg = ReadJson $cfgFile
  $db = $null
  if ($cfg['xlsx'] -and (Test-Path $cfg['xlsx'])) {
    $a = Ask "The dashboard shows`n$($cfg['xlsx'])`n`nKeep this database.xlsx?`n(No = choose another one)" 'YesNoCancel'
    if ($a -eq 'Cancel') { throw 'cancelled' }
    if ($a -eq 'Yes') { $db = $cfg['xlsx'] }
  }
  if (-not $db) {
    $sr = ReadJson $srCfg
    if ($sr['xlsx'] -and (Test-Path $sr['xlsx'])) {
      $a = Ask "Stoic Ranger Shooting for Windows uses`n$($sr['xlsx'])`n`nShow this database.xlsx in the dashboard?`n(No = choose another one)" 'YesNoCancel'
      if ($a -eq 'Cancel') { throw 'cancelled' }
      if ($a -eq 'Yes') { $db = $sr['xlsx'] }
    }
  }
  if (-not $db) {
    $start = @((Join-Path $env:USERPROFILE 'Nextcloud'), 'D:\Claude\12_Stoic Ranger Apps', [Environment]::GetFolderPath('MyDocuments')) | Where-Object { Test-Path $_ } | Select-Object -First 1
    $db = PickFile 'Which database.xlsx should the dashboard show? (It is only read, never changed. Cancel = choose later in the app.)' $start
    if ($db) { Write-Host "database.xlsx: $db" } else { Write-Host 'No database.xlsx chosen: the dashboard asks for it at the first start.' }
  }

  # 4. install
  $running = Get-Process -Name 'SRDashboard' -ErrorAction SilentlyContinue
  if ($running) {
    Write-Host 'Stoic Ranger Dashboard is open. It is closed for the update.' -ForegroundColor Yellow
    $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep -Seconds 3
    Get-Process -Name 'SRDashboard' -ErrorAction SilentlyContinue | Stop-Process -Force
  }
  if (Test-Path (Join-Path $dest 'SRDashboard.exe')) { Remove-Item -Recurse -Force $dest }   # only an app folder of ours
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)
  Remove-Item $zip -Force
  Copy-Item (Join-Path $here 'uninstall.ps1') $dest -Force

  if ($db -and $cfg['xlsx'] -ne $db) { $cfg['xlsx'] = $db }
  New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
  [System.IO.File]::WriteAllText($cfgFile, ($cfg | ConvertTo-Json -Depth 5), $utf8)

  $exe = Join-Path $dest 'SRDashboard.exe'
  $sh  = New-Object -ComObject WScript.Shell
  foreach ($lnk in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Stoic Ranger Dashboard.lnk'),
                     (Join-Path ([Environment]::GetFolderPath('Programs')) 'Stoic Ranger Dashboard.lnk'))) {
    $s = $sh.CreateShortcut($lnk); $s.TargetPath = $exe; $s.WorkingDirectory = $dest
    $s.IconLocation = "$exe,0"; $s.Description = 'Stoic Ranger Dashboard'; $s.Save()
  }
  New-Item -Path $key -Force | Out-Null
  $u = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dest\uninstall.ps1`""
  @{ DisplayName = 'Stoic Ranger Dashboard'; DisplayVersion = $version; Publisher = 'Stoic Ranger'; DisplayIcon = "$exe,0";
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
