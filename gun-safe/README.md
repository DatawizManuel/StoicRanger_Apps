# SR GunSafe 0.1.0 (Stoic Ranger Gun Safe)

Android app (package `at.stoicranger.gunsafe`, versionCode 1) for the guns in your safe:

- **Inventory**: every gun with its owners (a separate owners list, several owners per gun), total rounds,
  rounds since the last cleaning and the cleaning date. Filter by owner.
- **Service & cleaning**: a cleaning records the date and sets rounds since cleaning back to 0. A service can add
  or remove parts, keep the barrel, switch to a barrel you already have or fit a new one (added to the database),
  and has a **Cleaning done** checkbox.
- **Ammo stock**: stock per ammunition and per gun (all ammo of the gun's calibres, plus extra calibres per gun).
  Purchases with rounds, total price (EUR) and shop give the cost per round and a price chart. Take-outs need a
  date and a purpose ("handed over to Ines for training xy").
- **Link with SR Shooting** (only after "Allow"): its guns, barrels, ammunition and rounds fired are shown, and the
  rounds fired there reduce the stock (from the first purchase of that ammo on). A barrel change on an SR Shooting
  gun is saved in SR Shooting. Both apps then share one `database.xlsx`.
- **Storage**: on this phone only, or on this phone and synced to your Nextcloud (WebDAV, app password kept
  encrypted with the Android Keystore, never shown to the page). Syncs on open, a few seconds after each change and
  with "Sync now"; three-way merge, ETag checks, a backup of the file in `backups/` (newest 30) before each upload.
  One storage setting for all linked apps: switching here (Nextcloud or phone only) switches SR Shooting too.
- **Database file**: `gunsafe.xlsx` (or the shared `database.xlsx` when linked) with GS_ sheets that can be edited
  in Excel; all other sheets in the file are kept. Save it or open one (merged in, nothing deleted).

Phone Back: closes a confirm box first, then goes back through the pages, then home; on home press Back twice.

Not in this version (decided later, together for all apps): app lock, serial numbers and purchase details.

## Needs from SR Shooting (next SR Shooting version)
Provider `content://at.rangebook.app.link` calls `gunsafe` and `putBarrels`, a `Munition ID` column in the
rounds log, keeping other apps' sheets in database.xlsx, and the storage calls of contract v1. Until then GunSafe
works on its own and says "SR Shooting needs an update". Contract: `00_docs/SHARED-DB-CONTRACT.md`.

## Build and test
    node gun-safe/tools/test-app.mjs          # 59 browser tests (Playwright/Chromium)
    KEYSTORE=/path/debug.keystore bash gun-safe/tools/build-debug.sh
    unzip -p gun-safe/build/outputs/*.apk classes.dex | strings | grep -c LambdaMetafactory   # must be 0
The build script needs `aapt aapt2 apksigner dalvik-exchange ecj android-sdk-platform-23` (Ubuntu) and fails if the
APK contains Java lambdas. The keystore is never in this repository.
