# Data safety across updates (Stoic Ranger - Daily Thoughts)

Manuel's rule: an app update must never lose data on the phone.

- Data file: `files/db.json` (atomic write, previous version kept as `db.bak.json`). Holds only own data:
  favourites (`favs`: quote id + time saved) and settings. Quotes, authors and coins ship with the app.
- `db.schema` = data format. 0.1.0 writes schema **1**.
- Each new format adds `DT.MIGRATIONS[n]` in `js/core.js` that turns n-1 into n: add or convert only, never
  delete user entries or unknown fields. Before migrating, a copy is saved to `files/backups/`.
- Data from a newer app version opens read-only and is never overwritten.
- A damaged file falls back to `db.bak.json`.
- Web app (iPhone / iPad): the same data lives in the page's localStorage (`dt.db`, previous copy `dt.db.bak`)
  with the same schema, migrations and checks; a backup file moves favourites between Android and iPhone.
- Favourites point at quotes by permanent quote id (`content/quote-ids.json`); ids are never renumbered or reused.
  A favourite whose quote is missing from a version stays saved.
- `node tools/test-data-safety.js` must print only PASS before delivery.

| App | versionCode | schema | change |
|---|---|---|---|
| 0.1.0 | 1 | 1 | first version |
| 0.1.1 | 2 | 1 | web app for iPhone / iPad, no data change |
| 0.1.2 | 3 | 1 | web password (marker `dt.unlocked`, outside db), no data change |
| 0.2.0 | 4 | 1 | own app again after Stoic Ranger 1.0.x; More › Bring in favourites (Stoic Ranger files, merged, backup first); double Back on Today closes; no data change |
