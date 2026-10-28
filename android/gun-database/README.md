# Stoic Ranger - Gun Database (Android)

(Shown as "Stoic Ranger" under the launcher icon; called Range Logbook up to 0.2.1. Package id unchanged.)

Training log for long-range / precision rifle shooting, built from the training datasheet, the
database.xlsx registry and the "Rifle performance log" dashboard. Metric by default, imperial display optional.

- **Dashboard**: rounds on the fitted barrel, barrel life used, wear trend from Test sheets, V0 vs barrel rounds,
  ammo comparison, all test shots centred on their group, load-development ladder, shooter progress, avg ring.
- **Datasheets**: the A4 training datasheet as a form, linked to the database (weapon → barrel, ammo, shooter),
  shot velocities from the Garmin Xero C1 Pro (paste or CSV, fps converted), GPS coordinates, live A4 preview,
  print or "Save as PDF", blank sheets for the range.
- **Analyse**: score a target photo (on-phone hole finder, manual taps, optional Claude auto-detect), read a
  hand-filled sheet photo with Claude (fields, shot table, marked hits).
- **Database**: weapons (rounds before log), barrels (barrel changes, expected life), ammunition (pooled Xero V0
  and SD, precision from Test sheets), shooters, rounds log (rounds without a sheet). Names on sheets are matched
  by Name + Aliases; unknown names are flagged and only added when you choose to.
- **Exchange**: JSON backup/restore, database.xlsx export/import (same sheets and columns as
  `03_registry/database.xlsx`), import of `02_archive` datasheet records.

Data stays on the phone (`files/db.json`, written atomically with one previous copy kept). Android's own device
backup includes it; the Claude key is excluded.

## Install the test build on a phone

1. Copy `stoic-ranger-0.3.0-debug.apk` to the phone (USB, Google Drive, e-mail to yourself …).
2. Open it in the Files app. Android asks to allow installs from that app once: allow it.
3. Play Protect may warn that the app is unknown: choose *Install anyway* (it is a debug build signed with a
   test key, not from the Play Store).
4. Open **Stoic Ranger**. To load your own registry, pick *Import* and choose `range-logbook-start.json`
   (or your `database.xlsx`).

Updating: install a newer APK over the old one; your data is kept. If a new version stores data differently, the
app first saves a copy of the old file and then converts it (see `MIGRATIONS.md`); a short notice confirms it. A Play Store build uses a different key, so moving
from the test build to the Play build means: *More › Save a backup*, uninstall, install from Play, import.

## Build

**Android Studio / Gradle (normal way, needed for Play):** open this folder, let it sync, then
*Build › Generate Signed App Bundle* (release) or `./gradlew assembleDebug`. The project has no AndroidX or
third-party Android dependencies.

**Without the Android SDK manager** (how the test APK was made in the cloud): `tools/build-debug.sh` runs aapt2,
ecj, d8 and apksigner directly against an API 34 `android.jar`. Debug use only.

App files: `app/src/main/assets/www/` (plain HTML/CSS/JS, no build step; open `www/index.html` through any local
web server to develop in a desktop browser, data then goes to localStorage).
`tools/make_seed.py` builds the demo data and a backup file from `database.xlsx`.

## Before publishing on Google Play

1. **Package name** `at.rangebook.app` (in `app/build.gradle`) is permanent after the first upload. Change it now
   if you want another one (ideally a domain you own, reversed).
2. **Developer account**: one-time fee. New *personal* accounts must run a **closed test with at least 12 testers
   for 14 days** before production access. Your friends can be those testers (they install via a Play link).
3. **Signing**: create an upload key (`keytool -genkeypair -keystore upload.jks …`), keep it and its passwords
   safe and out of any repo, enable Play App Signing. Pass it via `~/.gradle/gradle.properties`
   (`RB_UPLOAD_STORE`, `RB_UPLOAD_STORE_PASSWORD`, `RB_UPLOAD_KEY_ALIAS`, `RB_UPLOAD_KEY_PASSWORD`). Upload an AAB.
4. **Target SDK**: `targetSdk 35` is set for Gradle builds. Android 15 draws apps edge to edge: check the top bar
   and bottom navigation on an Android 15/16 phone, or add `android:windowOptOutEdgeToEdgeEnforcement` to the
   theme in a `values-v35` folder. Raise to the level Play requires at the time of upload.
5. **Claude photo reading**: today each user enters their own Anthropic API key. For a paid app, move the call
   to a small server of yours (the key stays there, users don't need one) and charge for it (subscription or
   credits via Play Billing), or ship without it (on-phone hole finder and manual marks work offline).
6. **Store listing**: privacy policy URL (required: say data stays on the device; photos go to Anthropic only
   when Claude reading is used; location only when "Use my location" is tapped), Data safety form (location
   and photos accessed, not collected by you unless a server is added), content rating, screenshots,
   512 px icon (`store/icon-512.png`, Stoic Ranger emblem), feature graphic 1024×500. Firearms: the app is a training log, it sells and
   advertises nothing; describe it that way.
7. **Libraries**: SheetJS 0.18.5 (npm build, Apache-2.0) has known issues when opening untrusted spreadsheets; it
   only reads files the user picks. Swap in the current SheetJS CE build from cdn.sheetjs.com before release.
   Fonts: SIL OFL 1.1 (bundled licence files).

## Changes

- **0.6.0**: "Rifle" is now "Gun" everywhere (rifles and pistols); guns get a type (Rifle / Pistol / Shotgun / Other),
  zero distance is on the gun. New Trainers table. Dashboard front and the New button: *Create new training dataset*
  and *Add new shooter / gun / barrel / ammunition / trainer*; every database list has its *Add new …* button; a barrel
  can only be added to an existing gun. No example data any more: leftovers are removed, own entries stay; the app
  starts with an empty database. Dope cards have their own button (dashboard ⌖ and *Dope cards*) and Download prints
  one dope card per gun + ammo of the current selection as a single PDF in A6, A5 or A4. Import accepts the dashboard's
  "Export Data for App" file (any subset of tables). Linked Training Log gets trainers, gun type and zero distance.
  Data format 5, migrated automatically.
- **0.5.0**: link with **SR_Training Log** (More › Stoic Ranger apps, switch on in both apps). The Training Log then
  uses the shooters and weapons from here, and the rounds of each training land in the rounds log (marked
  *Training Log*, read-only here) and count towards the barrel fitted on that date. Changed or deleted trainings
  follow; switching off keeps everything received. Signature permission `at.stoicranger.permission.LINK`, provider
  `LinkProvider` (answers only while linking is on). Data format unchanged (4); new optional `settings.link`,
  `roundsLog[].link`.

- **0.4.0**: Settings › Units: metric (default) or imperial (yd, MOA, fps, mph, °F, inHg, in, gr) everywhere on screen,
  on the A4 sheet, the report and the dope cards; data stays stored metric. "Follow phone" theme now follows the
  phone's dark mode (night theme + live push from Android). Colours of the datasheet artifact, Stoic Ranger logo on
  the dashboard, datasheet, report and dope cards. Home-screen name *SR_Database*. Dashboard and report: most precise
  ammo per barrel (ranking, 3×10 rule per pair). Targets database with 11 built-in targets (ISSF rifle/pistol,
  sight-in 0.1 mrad / ½ MOA, steel plates), selectable on sheets; rings and plates drawn to scale. Online search
  (Claude web search, own API key) fills new targets, rifles and ammo; all fields stay editable, source kept.
  Ammo: manufacturer V0 (+ test barrel) and measured V0 side by side, also in Excel and the report. Analyse › Dope
  cards: point-mass G1/G7 solver, MV from your Xero data, atmosphere from your sheets, truing with long-range
  groups, print A6/A5/A4. Data format 4, migrated automatically.
- **0.3.0**: renamed to *Stoic Ranger - Gun Database*. Example data now sits in the database, marked as example,
  and the first own entry in a category removes that category's examples. Nothing is evaluated before 3 sets of
  10 rounds per ammo / barrel / shooter group ("Not enough data to evaluate – need X more sets …"). Dashboard
  selection Shooter → Rifle → Ammunition (each list narrowed by the one before) with a Clear selection button.
  New Download section: analysis report (all or by selection), every datasheet as A4, all sheets of a selection in
  one PDF, blank sheets. Purposes: Training, Test, Competition, Load development, Zeroing, Hunting and your own,
  each evaluated as rifle/ammo, shooter or rounds only (More › Purposes). Data format 3, migrated automatically.
- **0.2.1**: new app icon (Stoic Ranger emblem, adaptive + themed icon on Android 13+, Play icon in `store/icon-512.png`,
  sources in `store/icon-source/`). Data format unchanged (2).
- **0.2.0**: *New* button in the bottom bar (new datasheet, score a target photo, read a sheet photo, Xero
  velocities, rounds without a sheet, import a file). Dashboard: optional Rifle / Ammunition / Shooter selection
  under the header, remembered between starts; ammo figures are recalculated for the selection. Safe updates: data
  format 2, automatic migration with a backup copy, recovery from a damaged file, read-only when the data comes from
  a newer app version; old backup files are converted on import.
- **0.1.0**: first test build.

## Known limits

- No cloud sync between phones yet (backup file / xlsx only).
- The hole finder works best on a straight, even-lit photo; check its marks.
- Only tested in a phone-sized Chromium so far, not yet on a real Android phone.
