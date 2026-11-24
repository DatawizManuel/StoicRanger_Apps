# Stoic Ranger Map Manager — data and migrations

Standing rule: data is never lost. The Map Manager only adds, replaces (after the new file is complete and checked)
or removes map files when the user says so; it never touches routes it did not write unless the user deletes them.

## 0.2.0

- Settings: two new keys, added with defaults when missing: `maxPart` (MB, 100/250/500/1000, 0 = no limit;
  default 250) and `theme` (`system`/`light`/`dark`; empty = system). Nothing else changes; the file is
  `%APPDATA%\Stoic Ranger Map Manager\config.json`.
- Map folder: a map file bigger than `maxPart` is saved as parts `<file>.001`, `<file>.002`, … and its entry in
  `maps.json` gets `parts: [{file, bytes, sha256}]` (`file`, `bytes`, `sha256` still describe the whole joined file).
  `maps.json` says `format: "FK-2"` only while at least one map is split; otherwise it stays `FK-1`, so phones with
  Field Kit 0.3.0 keep working until a map is split (then they need 0.4.0).
- Changing the maximum file size re-splits or joins the maps already in the folder (checked against `maps.json`'s
  SHA-256 first; nothing is downloaded again and nothing is deleted before the new files are in place).
- Existing 0.1.0 maps and region ids (e.g. `at-tirol`, `de-bayern`, `it-suedtirol`) are kept; the new region list only
  adds countries and regions.
- On start (and each refresh) entries whose files are missing from the folder are taken out of `maps.json` (#12); the
  files of other maps and all routes are not touched. Delete removes the entry first, then its files (all parts).
- A `maps.json` with an unknown format (FK-3 or later) or a newer version is still never overwritten.

## 0.1.0 (first version)

- Settings: `%APPDATA%\Stoic Ranger Map Manager\config.json` (`folder`, `baseUrl`, `terrainUrl`, `checkUpdates`,
  `keepOld`, `decl`). Unknown keys are kept.
- Map folder (e.g. `Nextcloud\StoicRanger_Maps`): `<id>.pmtiles`, `<id>-terrain.pmtiles`, `maps.json` (format
  `FK-1`, version 1, read by SR Field Kit 0.3.0+), `Routes\*.gpx` (GPX 1.1). With "keep old" on, a replaced map is
  kept as `<file>.bak`.
- A future format (FK-2) will be written next to FK-1 or only after the phone app can read it; an older Map Manager
  must not overwrite a newer `maps.json` (it checks `format`/`version` and refuses).
