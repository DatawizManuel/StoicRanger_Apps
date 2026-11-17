# SR Physical Fitness: data format and migrations

The app keeps everything in one JSON file on the phone (`files/db.json`, previous copy `files/db.bak.json`).
`db.schema` is the data format version. `PF.SCHEMA` in `js/core.js` is the version this app writes.

Rules (Stoic Ranger standing rule 1, never lose device data):

1. A new app version reads every older format. Each step `PF.MIGRATIONS[n]` turns format n-1 into n and only
   adds or converts. It never deletes rows or fields it does not know.
2. Before a migration runs, the native side copies the file to `files/backups/db-schema<old>-<date>.json`
   (the newest 10 backups are kept).
3. A file with a newer format than the app (`schema > PF.SCHEMA`) opens read-only: the app shows it, never writes it,
   and shows a banner asking for an update. Excel files from a newer version are refused on import.
4. A damaged `db.json` falls back to `db.bak.json`; the damaged file is kept in `files/backups/`.
5. Every row has a permanent `id` and a change time `at`; deletions leave a tombstone in `deleted`, so an
   Excel import never brings a deleted row back.

## Format 1 (app 0.1.0)

| table | fields |
| --- | --- |
| settings | sessions, minutes, days[], eq {kb[], db[], sb[], bands[], bar, mini, bench, gripper, roller}, skip[] (0.2.0), theme, at |
| assessments | id, at, date, swingKg, gobletKg, pressKg, pullup, pushup, situp, hang, toe, squat, reachR, reachL, note |
| plans | id, at, block, start, status, prev, assessment, created, cfgHist [{from, cfg}], base {pattern: {kg, max, sec}}, swaps [{from, slot, ex}] |
| sessions | id, at, plan, week, sess, date, done, note |
| sets | id, at, plan, week, sess, slot, ex, set, reps, kg, sec, m, done, date |
| activities | id, at, date, type, name, min, km, m, elev, kg, hr, rpe, note |
| mobility | id, at, date, item |
| deleted | table, id, at |
| ui | small view state (not exported) |
| sync | (0.2.0) last Nextcloud sync: target, base (state of the last sync), last, msg (not exported) |
| history | migrations done on this file |

Exercise ids (`js/ex/*.js`) and mobility ids (`MOB` in `js/ex/mob.js`) are permanent: they are never renamed
or reused, so logged sets keep pointing at the right exercise.

## Format 2 (app 0.3.0)

Everything of format 1, plus:

| table | fields |
| --- | --- |
| settings.profile | startKg, startDate, heightCm, goalKg, drinkMl (metric) |
| settings.remind | (0.4.0, added by normalize with defaults, no format change) n reminders per day (0 = off), start, end (HH:MM) |
| drinks | id, at, date, time, ml |
| weights | id, at, date, kg, note (one per day; two phones logging the same day before a sync: the later change is shown, both rows are kept) |
| deleted | table, id, at, label (also written to the shared hidden `_Deleted` sheet, contract E; tombstones older than 365 days are dropped) |
| trash | (not exported) what this phone deleted, 30 days, for Undo: {table, row, at, label} |

## Migrations

- **1 → 2** (0.3.0): adds the empty tables `drinks` and `weights` and `settings.profile` with defaults (drinking goal
  2000 ml). Nothing existing is changed. A backup `db-schema1-<date>.json` is made first. The xlsx file says data
  format 2 in `_PF_Data`, so a 0.2.0 phone refuses to change a synced file (message: update the app).

- 0.1.1 (format 1): no data change.
- 0.2.0 (format 1): adds `settings.skip` (muscle groups not targeted; missing = all targeted) and `sync`. Both are
  filled in by `normalize` when missing, so no migration step is needed and 0.1.x data opens unchanged. The Excel
  sheets got the `PF_` prefix (shared contract v1); 0.1.x files (no prefix) are still read. The Nextcloud storage
  setting and password are not in db.json (Android SharedPreferences, password encrypted with the Keystore).
