# SR GunSafe 0.1.2 (Stoic Ranger Gun Safe)

## 0.1.2 (2026-11-14): delete on all devices (shared contract section E)
- A delete now reaches every device and the PC: it is written to the shared hidden `_Deleted` sheet of the database
  file (App GS, sheet, ID, label, time). An entry is gone everywhere when it was not changed after the delete; a
  later change wins. Other apps' deletes in that sheet are kept. A row deleted only in Excel still comes back.
- Every entry now carries its last change time (`Updated` column).
- Settings › **Recently deleted**: everything deleted in the last 30 days (also deletes that came from another
  device), with **Undo** (brings it back on all devices; a gun or ammunition comes back with its parts and log).
- Settings › **Replace this phone's data with the Nextcloud copy** (backup first, nothing merged).
- Data format 2 (backup before the change; the old local list of deleted IDs became tombstones).

## 0.1.1 (2026-11-14): sync fixes, tested against a real Nextcloud 30
- Rows typed in Excel without an ID come in once (matched by name, or date, gun and rounds …), never again at the
  next syncs. The same new ID made on two phones before a sync: both entries are kept, one gets a new ID.
- Every upload is read back and compared; if different it is sent once more, and if still wrong the previous file
  is put back. Only a valid xlsx (zip) is uploaded.
- A sync with no real change uploads nothing (empty fields no longer count as a change).
- Works with SR Shooting 1.3.x: barrel changes on its guns show at once (applied at SR Shooting's next start); when
  Nextcloud was chosen in SR Shooting, GunSafe asks for the app password once (apps never pass it on).
- Labelled "Settings" button, and the emblem says "Home" in every part.
- Checked: SR Shooting 1.3.1 reads the same data from a file GunSafe wrote, and keeps GunSafe's sheets when it writes.

## 0.1.0

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
    node gun-safe/tools/test-app.mjs          # 77 browser tests (Playwright/Chromium)
    bash gun-safe/tools/test-nextcloud.sh <database.xlsx>   # real Nextcloud 30 in Docker, the app's own WebDAV code
    KEYSTORE=/path/debug.keystore bash gun-safe/tools/build-debug.sh
    unzip -p gun-safe/build/outputs/*.apk classes.dex | strings | grep -c LambdaMetafactory   # must be 0
The build script needs `aapt aapt2 apksigner dalvik-exchange ecj android-sdk-platform-23` (Ubuntu) and fails if the
APK contains Java lambdas. The keystore is never in this repository.
