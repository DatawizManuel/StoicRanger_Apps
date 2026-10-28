# Stoic Ranger - Training Log (Android)

Shown as **SR_Training Log** under the launcher icon (Stoic Ranger emblem on olive; the Gun Database uses black).
Package id `at.stoicranger.traininglog`. Offline, metric, data stays on the phone.

- **Trainings**: shooter, date, start time, duration [h], short description, one or more weapons with rounds per
  weapon, trainer / organizer, remarks. Search by text, grouped by year with totals.
- **Database**: shooters, guns (type, caliber, make, model, zero distance, serial, status) and trainers / organizers (contact
  person, phone, e-mail, website; tap to call, write or open). Add them from the Database tab or with "+" right in
  the training form. Entries used in trainings cannot be deleted; set them Inactive / Sold / Retired instead.
- **Dashboard**: filters Shooter, Year, Weapon, Trainer (remembered). Totals: trainings, training time, rounds
  (per weapon), last training, training time per month (year chosen) or per year, the matching trainings.
- **Print sheet**: from the current filter, A4: header with the filter, summary (trainings, total time, total rounds,
  period, rounds per weapon), table of all trainings (oldest first, optional remarks), trainer contacts, signature
  line. Android print dialog → *Save as PDF* gives the PDF. Also *Share as CSV* (semicolon, opens in Excel).
- **More**: backup file save / share / restore, one-off import of shooters and weapons from a Stoic Ranger - Gun
  Database backup, light / dark / follow phone. database.xlsx export / import (same columns as the registry / dashboard).

## Install the test build

1. Copy `sr-training-log-0.4.0-debug.apk` to the phone and open it in the Files app; allow installs from that app.
2. Play Protect may warn about an unknown app: *Install anyway* (debug build signed with the test key).
3. Open **SR_Training Log** and tap *Start* (or restore a backup / import database.xlsx).

Updating: install a newer APK over the old one; the data is kept (see `MIGRATIONS.md`).

## Link with Stoic Ranger - Gun Database (from 0.2.0; Gun Database 0.5.0 or newer, trainers from 0.6.0)

Switch on in **both** apps: here *More › Link with Gun Database*, there *More › Stoic Ranger apps*.

- Shooters, guns and (Gun Database 0.6.0+) trainers come from the Gun Database (enter them once, there). The first sync matches existing
  entries by name; after that by the Gun Database id (`source: {app:'gundb', id}`). The fields the Gun Database sends
  (name, type, make, model, caliber, zero distance, serial, status; trainer contact data) are edited there; notes stay local.
- The rounds of each training (per linked weapon) go to the Gun Database's rounds log and count towards the barrel
  fitted on that date. Per training you can untick *Count these rounds in the Gun Database* (e.g. when the same
  rounds are already on a datasheet there). Changed or deleted trainings update or remove their entries there.
- Sync runs at start, when the app comes back to the front, after saving a training and with *Sync now*.
- Switching off in either app keeps every entry in both apps as a local copy. Without the Gun Database or without
  consent, this app works on its own as before.
- How: both apps are signed with the same key and declare the signature permission
  `at.stoicranger.permission.LINK`; the Gun Database's `LinkProvider` answers only apps holding it and only while
  linking is on there. Nothing leaves the phone.
- Every record has a permanent `uid` (UUID) that never changes, also not through backup / restore.

## Link with Stoic Ranger - Shooting Drills (from 0.4.0; Shooting Drills 0.2.0 or newer)

1. Install both apps (same signing key). In the Training Log: More › Stoic Ranger apps › **Link with Shooting Drills**.
2. Switch linking on in Shooting Drills too (More › Stoic Ranger apps).
3. Shooting Drills then uses the shooters and guns of the Training Log, and a drill result logged on the day of a
   training is linked to that training. Results Shooting Drills sends back (`putResults`) show on the training page.

Provider `at.stoicranger.traininglog.link` (signature permission `at.stoicranger.permission.LINK`, `ContentResolver.call`),
answers only while the switch is on: `status` → {app, version, schema, enabled}; `shared` → {shooters, weapons};
`trainings` {date} or {from, to} → {trainings:[{id, uid, date, start, durationH, fire, shooterId, desc, weaponIds,
weapons, trainerId, trainer}]}; `putResults` {results:[{uid, trainingUid, date, drill, result, time, note, gun}]}.

## Build

**Android Studio / Gradle:** open this folder, *Build › Generate Signed App Bundle* or `./gradlew assembleDebug`.
No AndroidX or third-party Android dependencies.

**Without the SDK manager (cloud):** `tools/build-debug.sh` (aapt2, ecj, d8, apksigner against an API 34
`android.jar` in `$TOOLS`). Keep `debug.keystore`: it is the same key as the Gun Database test builds.

Web app: `app/src/main/assets/www/` (plain HTML/CSS/JS, no build step). Open `www/index.html` through any local web
server to develop in a desktop browser (data then goes to localStorage).

Before each release: `node tools/test-data-safety.js` must print only PASS (`tools/test-link.js` checks the link in the browser).

## Changes

- **0.4.0** (data format 3): trainings are **live fire** or **dry fire** (existing ones become live fire). Dry fire
  never counts as rounds (dashboard, record sheet, Gun Database); its count is kept as dry-fire reps. Dashboard:
  Live + dry / Live fire / Dry fire filter, trainings and training time split live / dry, time chart stacked in two
  colours, rounds-per-gun bars all start on the left with the count in its own column, **Last 5 remarks** (2 lines
  each, tap opens the training; the remarks box grows to show the whole text). Record sheet, CSV and database.xlsx
  get a Type column. Link with Shooting Drills (see above).

- **0.3.0**: "Gun" instead of "weapon/rifle" in all labels (table key stays `weapons`); gun type has no forced
  default. Zero distance (m) on guns. Central **New** opens *Create new training dataset / Add new shooter / gun /
  trainer*; every database list has its "Add new …" button. database.xlsx export / import with the registry and
  dashboard columns (Shooters, Weapons, Trainers, Trainings with Weapon 1..N / Rounds 1..N and Source uid; merge,
  never deletes). No example data: data format 2 removes entries flagged as examples (examples used by own
  trainings become own entries; a copy of the old file is kept). With Gun Database 0.6.0 the link also brings
  trainers, gun type and zero distance.
- **0.2.0**: link with Stoic Ranger - Gun Database (shooters and weapons from there, training rounds counted for
  barrel use, switch in both apps, local copies kept when unlinked). Data format unchanged (1); new optional fields
  `settings.link.*`, `source`, `sendRounds`.
- **0.1.0**: first test build.

## Known limits

- Not yet tested on a real phone (phone-sized Chromium only).
- No cloud sync; move data with the backup file.
