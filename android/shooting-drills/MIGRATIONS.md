# Data safety across updates (Stoic Ranger - Shooting Drills)

Manuel's rule: an app update must never lose data on the phone.

- Data file: `files/db.json` (atomic write, previous version kept as `db.bak.json`). Holds only own data:
  shooters, guns (`weapons`), results, favourites (`favs`), settings. The drill library ships with the app.
- `db.schema` = data format. 0.1.0 writes schema **1**.
- Each new format adds `SD.MIGRATIONS[n]` in `js/core.js` that turns n-1 into n: add or convert only, never
  delete user entries or unknown fields. Before migrating, a copy is saved to `files/backups/`.
- Data from a newer app version opens read-only and is never overwritten.
- A damaged file falls back to `db.bak.json`.
- Results point at drills by permanent drill id; drill ids are never renumbered or reused.
- `node tools/test-data-safety.js` must print only PASS before delivery.

| App | versionCode | schema | change |
|---|---|---|---|
| 0.1.0 | 1 | 1 | first version |
| 0.2.0 | 2 | 1 | no format change: optional `result.training` and `source` on linked shooters/guns are new fields (older versions keep them untouched); drill ids unchanged, 6 drills renamed, 13 added |
