# Stoic Ranger for Windows

The same Stoic Ranger as on Android and iPhone (Gun Database, Training Log, Shooting Drills) as a Windows program.
It works from and into your **database.xlsx**, the one file the phone, the iPhone web app, the PC dashboard and
Excel all use.

## Install or update (no admin rights needed)
1. Copy the whole folder `vX.Y.Z` to the PC (or send it as a zip and unpack it).
2. Double-click **Install.cmd**. It
   - asks **where to install** (an update offers the folder it is installed in now),
   - asks **where your database.xlsx is**. If the folder you pick has no database.xlsx yet, the empty
     `database.xlsx` from this package is copied there. An existing database.xlsx is **never overwritten**.
     An update offers the database.xlsx the app uses now.
   - puts a "Stoic Ranger" shortcut on the desktop and in the Start menu and starts the app.
3. On its first start the app links that database.xlsx and brings its entries in (nothing in the app or in the file
   is lost; the file then also gets the app's entries).

Your settings and the app's own copy of the data stay in `%APPDATA%\Stoic Ranger` through every update.
Uninstall: Windows Settings › Apps › Stoic Ranger (or `uninstall.ps1` in the app folder); database.xlsx and the
app data are not removed.

## How the database.xlsx is kept in step
- Changes made in the file (Excel, the PC dashboard, a phone that saved it) come in when the app starts or its
  window comes back to the front.
- The app's changes go out when you leave a part, switch to another window or close the app. A copy of the previous
  file goes to `backups\` next to database.xlsx first.
- If Excel has the file open, the app waits and saves again later (close the file in Excel).
- Both sides' changes are kept: a field changed in the file wins over the app only if it was changed there since the
  last sync. Rows deleted in Excel are kept; delete entries in the app.
- File menu: open database.xlsx in Excel, show it in Explorer, open the PC dashboard (if it sits next to the data),
  Data and database.xlsx (link another file, create a new one, unlink).
- Mouse back button or Alt+Left = the phone's Back button.

## Build (Claude, on Linux)
`windows/tools/build-win.sh` → `windows/dist/vX.Y.Z` (Electron 33.2.1 for Windows x64, the page code from
`stoic-ranger/app/src/main/assets/www`, icon and version set with resedit, app zip split into 20 MB parts, installer,
empty database.xlsx). Bump `version` in `windows/package.json` first. `node windows/tools/test-desktop.mjs` runs the
app (Linux Electron) against a test database.xlsx.
