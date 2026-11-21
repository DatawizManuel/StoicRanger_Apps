# Stoic Ranger Dashboard 0.1.0 (Windows)

One overview of all your Stoic Ranger apps on the PC, from the shared **database.xlsx**:
SR Shooting, SR GunSafe, SR Field Kit, SR Physical Fitness and SR Daily Thoughts.

**The dashboard only reads database.xlsx. It never writes, moves or deletes it**, so it cannot damage your data.
To change something, use the app on the phone (or SR Shooting for Windows) or Excel.

## Install or update

1. Copy this whole folder to the PC (all `SRDashboard-app.zip.00x` parts must be there).
2. Double-click **Install.cmd**.
3. Choose where to install (an update offers the folder it is in now).
4. Choose which **database.xlsx** to show. The installer offers the one the dashboard or SR Shooting for Windows
   already uses. Cancel = choose it later in the app (File › Choose database.xlsx, or Data file › Choose another file).
5. The dashboard starts. Shortcuts: desktop and Start menu, "Stoic Ranger Dashboard".

No admin rights needed. Uninstall: Windows Settings › Apps › Stoic Ranger Dashboard (or `uninstall.ps1` in the
install folder). Your database.xlsx and the settings stay.

## What it shows

- **Overview**: one tile per app, rounds per month by gun (12 months), the latest entries of all apps,
  activity across apps (Week / Month / 3 months / 6 months / Year, by days, weeks or months), and all guns
  with total rounds, rounds since cleaning, ammo that fits and last shot. Click a gun for its **gun card**
  (build, barrels, rounds, drills, service log, ammunition).
- **Shooting**: rounds and trainings per period, rounds by gun, barrel life, drill results, groups from datasheets,
  all trainings (search, sort).
- **GunSafe**: guns with owners, rounds since cleaning, ammo stock by calibre and per gun, price per round, purchases.
- **Field Kit**: drop card from Drop & wind (same solver as the app), breathing minutes, saved points.
- **Physical Fitness**: plan block and week, sessions per week, weight, drinks today, last session, other activities.
- **Daily Thoughts**: the thought of the day (the same one as on the phone) and your favourites.
- **Data file**: which file, when it changed, every sheet found with its rows, and which apps have no sheets yet.
- **Settings**: which apps to show, theme (system / light / dark), units (metric; imperial only changes the display),
  start page, the file.

The period buttons (Week, Month, Year, 12 months, All) set the figures of the tiles and pages.

## When it reads the file

At start, by itself when the file changes (checked every 10 seconds, e.g. after the Nextcloud desktop client
brought a newer copy from the phones), when the window comes to the front, and with **Reload** / F5.
A file that is being saved or is damaged is refused; the last good figures stay and the status bar says so.

Entries deleted on a device (the hidden `_Deleted` sheet) are left out. An app without sheets in the file shows
"No … in this file yet": link it to the shared file on the phone (or sync it with Nextcloud) and it appears.

## Files

- Settings: `%APPDATA%\Stoic Ranger Dashboard\config.json` (the only file the dashboard writes).
- Install folder: holds `SRDashboard.exe` and `uninstall.ps1`.

## For the developer

- Page code: `www/` (`js/data.js` reads the sheets and works out the figures, `js/app.js` draws the pages).
  `js/quotes.js` is made from SR Daily Thoughts' content by `tools/make-quotes.mjs`; `js/ballistics.js` is SR Field Kit's solver.
- Tests: `node dashboard/tools/test-data.mjs` and `xvfb-run -a node dashboard/tools/test-desktop.mjs`.
- Example file with all five apps: `node dashboard/tools/make-example.mjs out.xlsx [real database.xlsx]`.
- Build: `dashboard/tools/build-win.sh` (runs the tests first).
