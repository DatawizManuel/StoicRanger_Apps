# Stoic Ranger Map Manager — data and migrations

Standing rule: data is never lost. The Map Manager only adds, replaces (after the new file is complete and checked)
or removes map files when the user says so; it never touches routes it did not write unless the user deletes them.

## 0.1.0 (first version)

- Settings: `%APPDATA%\Stoic Ranger Map Manager\settings.json` (`folder`, `baseUrl`, `terrainUrl`, `checkUpdates`,
  `keepOld`, `decl`). Unknown keys are kept.
- Map folder (e.g. `Nextcloud\StoicRanger_Maps`): `<id>.pmtiles`, `<id>-terrain.pmtiles`, `maps.json` (format
  `FK-1`, version 1, read by SR Field Kit 0.3.0+), `Routes\*.gpx` (GPX 1.1). With "keep old" on, a replaced map is
  kept as `<file>.bak`.
- A future format (FK-2) will be written next to FK-1 or only after the phone app can read it; an older Map Manager
  must not overwrite a newer `maps.json` (it checks `format`/`version` and refuses).
