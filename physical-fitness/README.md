# Stoic Ranger - Physical Fitness (Android) 0.2.0

Shown as **SR_Physical Fitness** under the launcher icon (Stoic Ranger emblem on steel blue #3E5765). Package id
`at.stoicranger.fitness`, signed with the same key as the other Stoic Ranger apps. Works offline; all data stays on the
phone unless you switch on the optional Nextcloud sync (the only use of the internet permission).

Functional fitness on a time budget: whole body, stronger, more flexible, healthy.

- **0.2.0** (versionCode 3, 2026-11-07):
  - **Muscle groups to target**: at the start of a block (New plan, Next block) tap groups to leave out (chest, back,
    shoulders, arms, forearms & grip, core, glutes & hips, thighs, calves & shins, neck & traps). Exercises that mainly
    work them are left out, the time goes to the others. Changed in Setup during a block: the app asks *current
    block from this week* or *only new blocks*.
  - **Optional Nextcloud sync** (Setup › Where your data lives): *this phone only* (default) or *synced to my
    Nextcloud* (address, user, app password, folder, file). Works offline, syncs on start, after each change and with
    *Sync now*. Three-way merge (never overwrites, never deletes because a row is missing), upload with If-Match on the
    ETag (412: merge and retry, 3 tries), a backup copy in `<folder>/backups/` before each upload (newest 30). The app
    password is encrypted with the Android Keystore on the phone only. Linking with other Stoic Ranger apps is
    consent only; linked apps share `database.xlsx` and one storage setting (shared contract v1,
    `00_docs/SHARED-DB-CONTRACT.md`). Same Java as SR Daily Thoughts 0.3.0.
  - **Excel file** now `fitness.xlsx` with sheets `PF_…` and a hidden `_PF_Data`; other sheets in the file are kept.
    0.1.x files still import.
- **0.1.1** (versionCode 2, 2026-11-06): the phone's Back button closed the app. Cause: the cloud build tool (dx)
  turns Java lambdas into calls to `LambdaMetafactory`, which Android does not have, so the app crashed the first
  time one ran: on Back, and also on Excel export/import, share, print and the backup before a migration. The Java
  code now uses plain classes, and the build refuses an APK that still has such calls. No change to data or screens.
- **0.1.0** (versionCode 1, 2026-11-03): first version.

- **Setup**: sessions per week, minutes per session, training days; equipment on/off: kettlebells, dumbbells and
  sandbags by weight, long loop bands by strength, pull-up bar, mini band, bench/box/chair, hand gripper, wrist roller.
  Saving changes while a plan runs asks: *current plan from this week on* or *only new plans*. Light / dark / like the phone.
- **Assessment training** instead of beginner/intermediate/advanced: 7 strength tests (swing, goblet squat, press,
  pull-ups, push-ups, sit-ups, dead hang) and 4 mobility checks set the starting level of every movement.
- **12-week plan**: pick the start date (default Monday next week). Phases Foundation (1–4), Build (5–8),
  Strength (9–11), Test (12); weeks 4 and 8 lighter. Sessions A / B / C fill movement slots (hinge, squat, push,
  pull, single leg, core, rotation, carry, power, grip, neck, feet, shoulder health) with exercises your equipment
  allows, as many as fit the minutes (warm-up and cool-down included). *Swap* changes an exercise from that week on.
- **Session log**: per set reps / seconds / metres and kg, tick a set (empty fields take the target), add sets,
  note, *Finish session*.
- **Next block**: proposed from what you logged (sessions done per week, share of planned work hit per movement):
  schedule and starting level per movement (easier / same / harder), every value can be changed; start date.
- **Exercises**: 125 exercises with an animated drawing (red muscles, worked muscles blue), front/back muscle map,
  steps, cues, common mistakes, easier/harder version, your history. Groups: bodyweight, kettlebell, bands, sandbag,
  dumbbells, grip, loaded carries, feet/ankles/shins, neck, power & speed, mobility.
- **Daily mobility block**: one drill per area (hips, hamstrings & back, shoulders, feet & ankles, neck) plus one
  from the assessment's tight spot; tick what you did, *Suggest another*. Optional: never changes the plan.
- **Other training**: walking, hiking, rucking, running, cycling, swimming, ski touring, rowing, climbing, martial
  arts, yoga, other; duration, distance, elevation, pack weight, heart rate, effort 1–10.
- **Dashboard**: sessions, sets, weight moved, other training (h, km), mobility days, minutes per week (plan +
  other), adherence, strength trend per exercise, assessment history.

## Data (on the phone; optionally synced to your Nextcloud)

`files/db.json` in the app's private storage, written atomically, previous copy `db.bak.json`. Every row has a
permanent id and a change time. App updates keep the data; a new data format is converted step by step and a copy
of the old file is kept first (`files/backups/`). Data from a newer app version opens read-only. See MIGRATIONS.md.

**Excel** (Setup → Data): *Export* / *Share* writes `fitness-YYYY-MM-DD.xlsx` with one sheet per table
(PF_Settings, PF_Assessments, PF_Plans, PF_Sessions, PF_Sets, PF_Activities, PF_Mobility, PF_Deleted) plus PF_Exercises,
PF_README and the hidden _PF_Data (full copy for the apps). It opens and can be edited in Excel without the app. *Import* merges a file into the phone (another phone,
or your Excel edits): rows are matched by id, the newer change wins, rows without id are added, nothing on the
phone is deleted unless it is on the Deleted sheet. A copy of the phone's data is kept before every import.

## Install the test build

1. Copy `sr-physical-fitness-0.2.0-debug.apk` to the phone and open it in the Files app; allow installs from that app.
2. Play Protect may warn about an unknown app: *Install anyway* (debug build, Stoic Ranger test key).
3. Open **SR_Physical Fitness**: Setup → Assessment → Create plan.

## Build

- Normal PC: Android Studio, or `./gradlew assembleDebug`.
- Without the Android SDK manager (cloud): `KEYSTORE=<path to debug.keystore> tools/build-debug.sh`
  (Ubuntu: `apt install aapt apksigner dalvik-exchange android-sdk-platform-23 ecj`).
  The keystore is never committed.

## Tests

- `node tools/test-app.mjs [screenshot dir]`: whole flow in light and dark (setup, assessment, plan, session log,
  swap, mobility, activity, settings change on a running plan, every view and every exercise page, Excel round trip
  and Excel edit, reload).
- `node tools/test-data-safety.mjs`: fake Android bridge: save, keep unknown fields, backup + migration, newer data
  read-only, damaged file → previous copy, foreign file refused, all drawings without errors, plans fit time and
  equipment for many settings.
- `node tools/test-sync.mjs`: Nextcloud sync with two fake phones and one fake file (first sync into another app's
  workbook, second phone, deletions, edits on both sides, Excel edits, 412 retry, offline, settings, switching off).
- `tools/test-nc.sh`: WebDav.java + NcFile.java on the JVM against `tools/webdav-mock.js` (401, 404, If-None-Match,
  If-Match, 412, backups, keep newest 30).
- `node tools/sheet.mjs out.png [regex|group] [both|0|1|map] [cols]`: contact sheet of the drawings.

## Drawings

All drawings are vector graphics generated by code (`js/figure.js`): a posed anatomical figure with muscle shapes,
equipment and the worked muscles in blue, animated between start and end position. Poses are in `js/ex/*.js`.
Fonts: Barlow (SIL OFL). Excel: SheetJS Community Edition (Apache 2.0).
