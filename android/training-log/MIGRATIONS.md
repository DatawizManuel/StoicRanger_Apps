# Keeping data safe across app updates

Rule for every release: **an update must never lose entries on the phone.** If the stored data does not fit the new
version, it is migrated, not dropped. Same scheme as Stoic Ranger - Gun Database.

- All data is one file, `files/db.json`, with `app: "sr-training-log"` and a `schema` number (`TL.SCHEMA` in
  `www/js/core.js`). Written atomically; the previous version is kept as `db.bak.json`.
- Android keeps app data when an APK is installed over an older one with the same package id and signing key
  (`debug.keystore` for test builds, the upload key for Play builds).
- On start: damaged `db.json` → previous copy (the damaged file is kept in `files/backups/`).
  Older `schema` → copy to `files/backups/db-schema<old>-<date>.json`, then `TL.MIGRATIONS[n]` step by step, saved,
  noted in `db.history`, short notice. Newer `schema` → shown read-only, never written.
- `TL.normalize` fills ids, permanent `uid`s and numbers on every load; it never removes anything.

## Rules for a new schema version

1. Bump `TL.SCHEMA` and add `TL.MIGRATIONS[<new>] = db => { … }`.
2. Only add or convert fields. Never delete entries or tables; never change a `uid`.
3. Make each step safe to run on partly migrated data.
4. Update `TL.emptyDb()` for new installs.
5. Run `node tools/test-data-safety.js` (all PASS) and add a case for the new step.
6. Backup files go through the same `TL.migrate`, so old backups keep working.

## History

| Schema | App   | Change |
|-------:|-------|--------|
| 3      | 0.4.0 | Trainings get `fire: 'live' \| 'dry'`; every existing training becomes `live` (nothing removed). Dry fire: `weapons[].rounds` hold dry-fire reps and never count as rounds. New optional: `settings.dashFilter.fire`, `settings.lastFire`, `settings.link.apps.shootingDrills` (`enabled`, `at`), `linked` (`drillResults`, `sdReceived`, `sdVersion`: read-only copy of results sent by Shooting Drills). |
| 2      | 0.3.0 | No example data any more: entries flagged `example: true` are removed; an example shooter / gun / trainer used by an own training is kept as an own entry (flag removed). `weapons[].zeroM` (number) added as optional field; `source.keys` on linked entries lists the fields the Gun Database manages. |
| 1      | 0.2.0 | No format change. New optional fields, no migration needed: `settings.link` (`enabled`, `status`, `counts`, `sentEntries`, `sentRounds`), `source` on shooters/weapons linked with the Gun Database (`{app:'gundb', id, missing?}`), `sendRounds: false` on trainings whose rounds are not sent. |
| 1      | 0.1.0 | First version: shooters, weapons, trainers, trainings (weapons with rounds per weapon), settings incl. dashboard filter and reserved `link`. |
