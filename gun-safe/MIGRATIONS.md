# SR GunSafe data migrations

| Data format | App version | Change |
|---|---|---|
| 2 | 0.1.2 | Adds tombs (shared _Deleted list), trash (Recently deleted, 30 days) and `updated` on rows. Format 1's local `deleted` [IDs] becomes tombstones (time = moment of the update). Backup `before-format-2-…json` first. 0.1.0/0.1.1 open format-2 data read-only. |
| 1 | 0.1.1 | No change to the data format. |
| 1 | 0.1.0 | First version: `files/db.json` {app: "sr-gunsafe", format: 1, data: {owners, guns, gunInfo, barrels, components, service, munitions, moves, rounds, settings, link, srCache, deleted}}. |

Rules (standing rule 1): migrations only add or convert, a backup is made in `files/backups/` before each one, and
data saved by a newer format opens read-only and is never written. The Nextcloud setting lives in the app's private
preferences, not in db.json.
