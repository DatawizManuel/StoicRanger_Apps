# SR Field Kit — data file and migrations

Standing rule: device data is never lost. Migrations only add or convert, after a backup; a file written by a newer
app version opens read-only and is never written.

## db.json, format 1 (0.1.0)

```
{ "app": "sr-field-kit", "format": 1, "created": ISO, "updated": ISO, "data": { … } }
```

| key | content |
|---|---|
| `sr-breath` | seconds breathed per day, `{ "YYYY-MM-DD": seconds }` |
| `sr-custom` | custom breathing pattern timings |
| `sr-ball` | Drop & wind inputs, always metric (`bMV` m/s, `bMass` g, `bSH` cm, `bZero` m, `bWind` km/h, `bAlt` m, `bTemp` °C, `bMove` km/h) |
| `sr-pos` | last position `{lat, lon, src, acc, alt, t}` |
| `sr-points` | saved points `[{name, lat, lon}]` |
| `settings` | `{units: "metric"|"imp", theme: ""|"light"|"dark"}` |
| `link` | Stoic Ranger link `{linked, dismissed, w, m}`; since 0.6.0 also `mode`: `"db"` (From my database, default) or `"own"` (Own load) |
| `sr-vault` | since 0.7.0: vault settings `{lockMin: 1|5|15, page: decrypt page address}`; since 0.8.0 also `folder` (vault folder on Nextcloud, `""` = default `<data folder>/vault/`) (nothing secret; vault keys and files live only on Nextcloud, encrypted) |
| `dw-paper` | since 0.6.0: paper size last used for the Drop & wind PDF, `"A4"`, `"A5"` or `"A6"` |

Unknown keys are kept unchanged.

## Changes

- 0.8.0 (format 1, add-only): `sr-vault.folder` is new (missing = default, so 0.7.0 vaults open unchanged). Fingerprint
  unlock keeps its encrypted copy of the vault key in the app's private preferences `fk-vault-bio` (not in db.json,
  never synced), locked by the Keystore key `fk-vault-bio`. On Nextcloud a moved vault leaves `moved.json`
  `{movedTo, at}` in its old folder. Nothing is converted.
- 0.7.0 (format 1, add-only): `sr-vault` is new; `sr-ball.bMax` may now be any typed number (was 300/500/800/1000).
  Nothing is converted. The vault's own files are on Nextcloud in `<folder>/vault/` (keys.json, index.bin, <id>.bin,
  shared/), all written by the vault itself; nothing in db.json or database.xlsx changes.

- 0.6.0 (format 1, add-only): `link.mode` and `dw-paper` are new; nothing is converted. `sr-ball` keeps meaning
  "the Drop & wind inputs"; while "From my database" fills and locks the load fields, their saved part stays the
  user's own load (only the conditions are saved), so "Own load" comes back with its own values. A db.json from 0.6.0
  opens fine in 0.5.0 (unknown keys are kept).
- 0.5.0 (format 1): no db.json change. A running map download is kept outside db.json (SharedPreferences
  `fk-mapdl`, with the files in `Android/data/at.stoicranger.fieldkit/files/mapdl/` until they are checked and moved
  into `files/maps/`). The page uses sessionStorage `fk-place` / `fk-sync-reload` only across a sync reload.
- 0.4.0 (format 1): no data change. The phone keeps one file per map in `files/maps/`, also when the map is split
  into parts on Nextcloud (format FK-2): the parts are joined while downloading.
- 0.3.0 (format 1, add-only): new keys `sr-routes` (`[{id, name, wps:[{lat, lon, name}], ticked, file, updated}]`),
  `sr-route-cur`, `sr-route-auto`, `sr-maps` (maps on the phone: `[{id, name, date, bbox, base:{file, bytes,
  sha256, date}, terrain:{…}}]`), `sr-maps-nc` (last Nextcloud catalog), `sr-maps-cfg` (`{folder, wifi}`),
  `sr-map-view`, `sr-decl` (declination), `sr-level` (level zero offsets), `sr-night` (red screen, Morse settings).
  The map files themselves are in `files/maps/` (not in db.json, not in the Android backup). Nothing is converted
  or removed; 0.2.0 ignores and keeps the new keys.

- 0.2.0 (format 1, add-only): new keys `sync-base`, `sync-state`, `sr-points-deleted`; saved points get a `uid`
  on the first sync (or when saved). The storage setting and the encrypted app password are not in db.json
  (SharedPreferences `fk-sync`, excluded from Android backups). Nothing is converted or removed.
- 0.1.4 (format 1): no data change.
- 0.1.3 (format 1): no data change.
- 0.1.2 (format 1): no data change (new file back-log.txt, diagnostics only).
- 0.1.1 (format 1): no data change.
- 0.1.0 (format 1): first version, nothing to migrate.
