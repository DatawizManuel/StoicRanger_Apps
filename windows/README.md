# Stoic Ranger Shooting for Windows

The same Stoic Ranger Shooting as on Android and iPhone (Gun Database, Training Log, Shooting Drills) as a Windows program.
It works from and into your **database.xlsx**, the one file the phone, the iPhone web app, the PC dashboard and
Excel all use.

## Install or update (no admin rights needed)
1. Copy the whole folder `vX.Y.Z` to the PC (or send it as a zip and unpack it).
2. Double-click **Install.cmd**. It
   - asks **where to install** (an update offers the folder it is installed in now),
   - asks **where your database.xlsx is**. If the folder you pick has no database.xlsx yet, the empty
     `database.xlsx` from this package is copied there. An existing database.xlsx is **never overwritten**.
     An update offers the database.xlsx the app uses now.
   - puts a "Stoic Ranger Shooting" shortcut (an old "Stoic Ranger" shortcut is removed) on the desktop and in the Start menu and starts the app.
3. On its first start the app links that database.xlsx and brings its entries in (nothing in the app or in the file
   is lost; the file then also gets the app's entries).

Your settings and the app's own copy of the data stay in `%APPDATA%\Stoic Ranger` through every update.
Uninstall: Windows Settings › Apps › Stoic Ranger Shooting (or `uninstall.ps1` in the app folder); database.xlsx and the
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

## database.xlsx on Nextcloud (1.3.0)
- Home page › Data storage › "Synced to my Nextcloud": address (https://…), user name, an app password (Nextcloud ›
  Settings › Security › Devices & sessions) and the folder. The password is kept encrypted by Windows for this user
  only (never in a file you can read).
- The app keeps its own copy and works offline; it loads database.xlsx from Nextcloud and saves it back (same merge as
  above). If someone else saved in between, the app merges and tries again.
- Before each save the file on Nextcloud is copied to `<folder>/backups/` (newest 30 kept).
- Linked Stoic Ranger apps on a phone take over the same setting (each device still needs the app password once).

## Deleting and starting over (1.4.0)
- An entry you delete is deleted on every device that shares database.xlsx (the phone, this PC, Nextcloud): the
  next sync does not bring it back, even from an old Excel copy. Settings › **Recently deleted** keeps deletes for
  30 days with **Undo** (it comes back everywhere).
- Settings › "Something wrong with the data on this PC?" › **Replace this PC's data** with the Nextcloud copy (or the
  linked database.xlsx). A backup of the PC's data is made first.
- One shooter only: there is no shooter in the data any more. Entries of other shooters say "Shot by <name>" in
  their remarks and keep their rounds.
- The drop-down lists, column widths and frozen header rows you set in Excel stay when the app saves the file.

## Build (Claude, on Linux)
`windows/tools/build-win.sh` → `windows/dist/vX.Y.Z` (Electron 33.2.1 for Windows x64, the page code from
`stoic-ranger/app/src/main/assets/www`, icon and version set with resedit, app zip split into 20 MB parts, installer,
empty database.xlsx). Bump `version` in `windows/package.json` first. `node windows/tools/test-desktop.mjs` runs the
app (Linux Electron) against a test database.xlsx.
