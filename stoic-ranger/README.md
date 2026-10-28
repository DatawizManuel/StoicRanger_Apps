# Stoic Ranger (Android)

One app with four parts: **Gun Database**, **Training Log** and **Shooting Drills** share one database on the
phone; **Daily Thoughts** keeps its own file (from 1.0.1). Launcher name "Stoic Ranger", package id
`at.rangebook.app` (the SR_Database id, so 1.0.0 is an update of SR_Database 0.6.0 and keeps its data).
Version 1.0.1, versionCode 9.

## How it fits together

- `MainActivity.java` is a WebView shell serving `app/src/main/assets/www` from
  `https://appassets.androidplatform.net/www/`. Its JS bridge `SRNative` stores `files/db.json` (atomic, with
  `db.bak.json` and `files/backups/`) and `files/thoughts.json` for Daily Thoughts (same rules, `thoughts.bak.json`,
  `files/backups-thoughts/`), saves, opens and shares files, shares text and prints.
- `www/index.html` is the home page: today's thought, quick "+" buttons, the four parts with their key figures,
  the year at a glance, and Data (backup of everything, restore, bring in old backups, theme, about).
- Each part is its own page with its code taken over from the separate app (`www/gun/`, `training/`, `drills/`,
  `thoughts/`). `www/sr/hub.js` runs first on every page and gives the part the bridge it expects
  (`RBNative`, `TLNative`, `SDNative`, `DTNative`): `loadDb` returns the part's view of the one database in its
  old shape, `saveDb` merges the part's tables back. Shooters, guns and trainers exist once and are merged by
  `uid`; a part never deletes a record another part still uses. The emblem in each part's header goes home;
  the back button walks back in the part, then goes home.
- What the separate apps used to send each other is now read straight from the one file: rounds of live-fire
  trainings in the Gun Database rounds log, the trainings of a day in Shooting Drills, drill results in the
  Training Log.

See MIGRATIONS.md for the database format and how SR_Database data is converted.

## Build the APK

On a PC: Android Studio / `./gradlew assembleDebug`. In an environment without the Android SDK:
`tools/build-debug.sh` (aapt2, android.jar, d8, apksigner, ecj in `$TOOLS`, see the script). Sign with the same
`debug.keystore` as SR_Database (kept on the PC, never in the repository).

## Tests

`node tools/test-one-app.mjs [db.json]` runs the app in headless Chromium with a fake bridge: converts an
SR_Database file (the built-in demo data if none is given), opens every part, brings in Training Log, Shooting
Drills and Daily Thoughts backups (twice, nothing doubles), checks the parts see each other's data and that data
from a newer version is never written. Must pass before a release.

## Install

1. Copy `stoic-ranger-1.0.1-debug.apk` to the phone and open it. Android shows it as an **update** of
   SR_Database: install. Your Gun Database data moves into Stoic Ranger on the first start (a copy of the old
   file is kept in the app's backups).
2. Training Log, Shooting Drills, Daily Thoughts: in the old app, More › Save a backup file. Then in Stoic Ranger,
   ⋯ (top right) › Choose a backup file. Entries are merged (same-name shooters and guns are used once);
   bringing the same file in twice adds nothing.
3. When everything is in, the three old apps can be uninstalled.

## Versions

- **1.0.1** (versionCode 9): Daily Thoughts gets its own file `thoughts.json` (its favourites are copied over from
  `db.json` on the first start, `db.json` is backed up and left as it was); the old Daily Thoughts password screen
  is gone, the web app asks for one password for the whole app. Installs over 1.0.0.
- **1.0.0** (versionCode 8): the four apps in one. Earlier versions: SR_Database 0.1.0–0.6.0 (this project),
  SR_Training Log 0.1.0–0.4.0, SR_Shooting Drills 0.1.0–0.2.0, SR_Daily Thoughts 0.1.0–0.1.2.
