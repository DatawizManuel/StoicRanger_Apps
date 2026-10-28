# Keeping data safe across app updates

Rule for every release: **an update must never lose entries on the phone.** If the stored data does not fit the
new version, it is migrated, not dropped.

## Stoic Ranger 1.0: one database

From 1.0.0 `files/db.json` holds all four parts:
`{ app: 'stoic-ranger', format: 1, schemas: { gundb, tl, sd, dt }, settings: { common: { theme }, gundb, tl, sd, dt },
history, shooters, weapons, trainers, barrels, munitions, targets, roundsLog, sheets, trainings, results, favs,
thoughtFavs, resultsChanged }`.

- `format` is the version of this envelope (`FORMAT` in `www/sr/hub.js`). A file with a higher `format` opens
  read-only in every part and is never written.
- `schemas.<part>` is the part's own data version; each part still migrates its own tables with its own
  `MIGRATIONS` (Gun Database `RB.SCHEMA`, Training Log `TL.SCHEMA`, Shooting Drills `SD.SCHEMA`, Daily Thoughts
  `DT.SCHEMA`), with a backup first. The sections below are the Gun Database's history.
- **Conversion from SR_Database 0.x:** on the first start of 1.0.0 the old file (`schema` 1–5, no `app`) is
  copied to `files/backups/db-before-stoic-ranger-1.0-<date>.json`, then turned into the envelope above with every
  table unchanged (`schemas.gundb` = its old schema, so the Gun Database migrations still run).
- **Old Training Log / Shooting Drills / Daily Thoughts backups** are brought in, not restored: a backup is taken
  first; shooters, guns and trainers are matched by `uid`, link source, then name, otherwise added with a new id;
  trainings and results get the matching ids; entries already there (same `uid`, or same content for entries
  without one) are skipped; favourite quotes are a union. The part's schema is set to the lower of the two, so
  its migrations run again on the merged data (they are safe to repeat).
- **Restore** of a Stoic Ranger backup replaces the file, again with a copy kept first.

## Stoic Ranger 1.0.1: Daily Thoughts in its own file

Daily Thoughts is not part of the shooting database (Manuel 2026-10-28). From 1.0.1 it lives in
`files/thoughts.json` (web: `sr/thoughts.json`):
`{ app: 'stoic-ranger-thoughts', format: 1, created, updated, schema, settings, favs, history }`.

- `schema` is the Daily Thoughts data version (`DT.SCHEMA`), `format` the version of this file (`TFORMAT` in
  `www/sr/hub.js`). A `thoughts.json` with a higher `format` makes the app read-only, like a newer `db.json`.
- **First start of 1.0.1:** if there is no `thoughts.json` yet and `db.json` holds Daily Thoughts data
  (`thoughtFavs`, `settings.dt`, `schemas.dt`), `db.json` is copied to `files/backups/db-before-thoughts-file-<date>.json`,
  then the favourites, settings, schema and the Daily Thoughts history entries are copied into `thoughts.json`.
  **`db.json` is not changed**: the old fields stay as they were (add-only), nothing in 1.0.1 reads them again.
- Same safety as `db.json`: atomic write with `thoughts.bak.json`, a damaged file falls back to it (the damaged
  one is kept in `files/backups-thoughts/`), backups before an import or restore, newest 10 kept.
- **Backup of everything** (home › Data): the `db.json` content plus `thoughts` (the whole `thoughts.json`), and
  `thoughtFavs` filled with the current favourites so Stoic Ranger 1.0.0 can still restore it.
- **Restore:** a 1.0.1 backup restores both files; a 1.0.0 backup restores `db.json` and rebuilds `thoughts.json`
  from its `thoughtFavs` / `settings.dt`. Old SR_Daily Thoughts backups are merged into `thoughts.json`.
- Tests: `node tools/test-web.mjs` (part 6) and `node stoic-ranger/tools/test-one-app.mjs` (part 6).

## Gun Database (up to SR_Database 0.6.0)

- All data is one file, `files/db.json`, with a `schema` number (`RB.SCHEMA` in `www/gun/js/core.js`).
- Android keeps app data when an APK is installed over an older one with the same package id and signing key.
  The test builds are all signed with `debug.keystore` (keep it!), Play builds with the upload key.
- On start the app reads `db.json` (falls back to `db.bak.json` if the file is damaged; the damaged file is kept
  in `files/backups/`).
- If `schema` is older than `RB.SCHEMA`:
  1. a copy is written to `files/backups/db-schema<old>-<date>.json` (newest 10 kept),
  2. `RB.MIGRATIONS[n]` runs for every step from old+1 up to the current schema,
  3. the migrated file is saved at once and an entry is added to `db.history`,
  4. a short notice tells the user that the data was updated.
- If `schema` is newer than the app (someone installed an older APK): the data is shown read-only and never
  written, so nothing gets downgraded.

## Rules for a new schema version

1. Bump `RB.SCHEMA` and add `RB.MIGRATIONS[<new>] = db => { … }`.
2. Migrations only add or convert fields. Never delete entries or tables; rename by copying, and keep old
   fields if anything might still read them.
3. Make each step safe to run on partly-migrated data (check before converting).
4. Update `RB.emptyDb()` for new installs.
5. Test: load a backup of the previous version in the browser build and check counts before/after
   (`node tools/test-one-app.mjs <old db.json>` converts and migrates it and compares counts).
6. Imports (`.json` backups, xlsx) go through the same `RB.migrate`, so old backup files keep working.

## History

| Schema | App   | Change |
|-------:|-------|--------|
| 1      | 0.1.0 | First version. |
| 2      | 0.2.0 | `settings.dashFilter` (rifle/ammo/shooter selection on the dashboard), `history`; sheet ids ensured, decimal commas in number fields converted to dots, hits made numeric, ids ensured on all tables. |
| 3      | 0.3.0 | `settings.purposes` (built-in + own purposes, each with *evaluated as*); sheet purposes matched to ids, unknown ones become own purposes (rounds only); `example` flag on example entries; dashboard selection order shooter → rifle → ammo. |
| 4      | 0.5.0 | No format change. New optional fields, no migration: `settings.link` (`enabled`, `lastInbox`, `lastRounds`; default from `emptyDb()` merged into existing settings), `roundsLog[].link = {app:'training-log', uid, trainingId}` on entries sent by SR_Training Log. |
| 4      | 0.4.0 | `targets` table with 11 built-in targets (`builtin: true`, never purged); sheet and default presets `issf300`/`issf50` become target ids `T-ISSF300`/`T-ISSF50` (custom stays custom); `settings.units` = `metric` (values stay stored metric, imperial is display only). New optional fields need no migration: weapons `sightHeightMm`, `zeroM`, `scopeUnit`, `clickValue`; ammo `bcG1`, `bcG7`, `bulletDiaMm`, `bulletLengthMm`, `mfrBarrelMm`; `settings.dope`. |
| 5      | 0.6.0 | `trainers` table (`T-###`, `uid`, name, contact, phone, email, website, notes; same keys as SR_Training Log and the dashboard); `weapons.type` (Rifle/Pistol/Shotgun/Other, existing guns become Rifle); entries flagged `example: true` are removed for good (own entries untouched). New user targets get IDs `TG-###` (existing target IDs unchanged). LinkProvider `shared` now also sends `weapons.type`, `weapons.zeroM` and `trainers`. |
