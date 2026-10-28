# Keeping data safe across app updates

Rule for every release: **an update must never lose entries on the phone.** If the stored data does not fit the
new version, it is migrated, not dropped.

## How it works

- All data is one file, `files/db.json`, with a `schema` number (`RB.SCHEMA` in `www/js/core.js`).
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
   (see `tools/test-migration.js`).
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
