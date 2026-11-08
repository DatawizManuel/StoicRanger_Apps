# SR Field Kit (Android) — 0.3.0

"Stoic Ranger - Field Kit", launcher name **SR_Field Kit**, package `at.stoicranger.fieldkit`.
Android port of the web Field Kit (stoic-ranger.com, Release 1.5) plus the Shooting helpers spec, in the
Stoic Ranger app look. Works fully offline, no accounts, no tracking. Since 0.2.0 it has the INTERNET permission,
used only for the user's own Nextcloud (optional sync; since 0.3.0 also maps and routes), off until set up; the
WebView itself stays offline (other web requests are blocked, only the Java side talks to the Nextcloud).

## Versions

- **0.3.0** (versionCode 7, 2026-11-08): remarks #3 to #7 and #9.
  - **Navigate › Map & routes** (#7, #9): offline map (OpenStreetMap vector map by Protomaps, Mapterhorn terrain for
    hill shading and contour lines drawn on the phone; libraries in `www/map/lib`, shared with the Stoic Ranger Map
    Manager, see `map/lib/THIRD-PARTY-LICENSES.txt`). The map libraries load only when the Map tab opens.
    *Maps*: reads `<map folder>/maps.json` (format FK-1, default folder `/StoicRanger_Maps/`) from the Nextcloud set
    up under ⋯ › Where your data is stored, downloads map + terrain file per region into `files/maps/` (`.part`
    first, SHA-256 checked, old copy replaced only when the new one is complete, free space checked), Wi-Fi-only
    option (on by default), Update when Nextcloud has a newer build, Delete, Import a `.pmtiles` file by hand.
    *Route*: waypoints by tapping the map (Edit), by coordinates, from saved points or my position; rename,
    reorder, delete, reverse; legs with distance and magnetic bearing (degrees + NATO mils); **tick off** passed
    waypoints: bearing and distance run from the last ticked waypoint to the next, Undo, ticks kept in db.json;
    Follow GPS shows distance/bearing from you and can tick off automatically within 25 m (accuracy ≤ 30 m).
    GPX 1.1 import (file; tracks thinned to 50 points) and export, load from / save to `<map folder>/Routes/`.
    *Position from bearings*: two landmarks (tap on map or saved point) + compass bearings (degrees or mils
    magnetic, or degrees true) → your position, with angle of cut; use as my position or save as point.
    Declination field on the map is the same as in Position & grid (now kept in db.json).
  - **Navigate › Convert** (#3): MGRS (1 m, 8- and 6-figure), UTM, decimal degrees, degrees-minutes(-seconds) both
    ways; save as point, use as target, show on map, set as my position (`map/mgrs.js`, checked against pyproj).
  - **Drop & wind › Use sensors** (#4): barometer → pressure altitude (ICAO standard atmosphere, what the solver's
    air density needs), GPS altitude if there is no barometer; ambient temperature only where the phone has the
    sensor. Typed values are never changed without the tap.
  - **Shooting helpers › Level** (#5): flat (bubble, both axes) or upright (cant), set zero / clear zero.
  - **Night & signal** (#6, new home tile): dim red full screen with its own brightness (Back closes it and gives
    the brightness back to the phone), red night mode for the whole app, flashlight on/off, SOS, Morse message
    (4 to 12 words/min, repeat), strobe; screen white/red as light where there is no flashlight. The flashlight is
    switched off whenever the app goes to the background.
  - Android: `MapFiles.java`, `Sensors.java`, `NcClient.download` (streaming + SHA-256); bridge `mapList`,
    `mapRead`, `mapDelete`, `mapFree`, `mapDownload`/`mapCancel` (progress to `FKMapProgress`), `netState`,
    `pickFile`, `sensors`, `hasTorch`, `torch`, `setBrightness`; map files are read by the page at
    `/maps/<name>?o=&l=` (served by `shouldInterceptRequest`). New permission `ACCESS_NETWORK_STATE`. Still no
    lambdas (build check). Map files are not in the Android backup.
  - Not tested on a real phone or a real Nextcloud yet; the map tests use small made-up test maps.

- **0.2.0** (versionCode 6, 2026-11-07): **optional Nextcloud sync** (remark #2), following
  `00_docs/SHARED-DB-CONTRACT.md` v1. ⋯ › About › "Where your data is stored": on this phone only (default) or on
  this phone, synced to my Nextcloud (address, user name, app password, folder). Field Kit writes its own sheets
  (`FK_Points`, `FK_Breathing`, `FK_DropWind`, `FK_Settings`, hidden `_FK_Data`) into `fieldkit.xlsx`, or into the
  shared `database.xlsx` when linked with Stoic Ranger, and keeps every other sheet unchanged. Three-way merge,
  tombstones for points deleted on the phone, backup to `<folder>/backups/` before each upload (newest 30 kept),
  If-Match upload with retry on 412. App password encrypted with the Android Keystore (`SyncStore.java`).
  Linked apps share one storage setting through `LinkProvider` (`at.stoicranger.fieldkit.link`: `storage`,
  `setStorage`). Saved points now carry a permanent uid. SheetJS 0.18.5 (Apache 2.0, `js/SheetJS-LICENSE.txt`).
- **0.1.4** (versionCode 5, 2026-11-06): **the real cause of the Back problem.** The cloud build turns Java lambdas
  into `LambdaMetafactory` calls (dx instead of d8), which Android does not have, so the app crashed the moment Back
  ran its first lambda, and a crash looks like the app closing. The same crash hit printing, sharing, "keep screen
  on" and opening settings. Every lambda is now an anonymous class, and `tools/build-debug.sh` stops the build if
  `LambdaMetafactory` appears in classes.dex again. Daily Thoughts 0.2.0 has none, which is why its Back worked.
- **0.1.3** (versionCode 4, 2026-11-06): Back done exactly the way SR Daily Thoughts does it, the only Stoic Ranger
  app where Back works on Manuel's phone: the same `onBackPressed` as Daily Thoughts (0.1.2's key and dispatcher
  handling removed), and the whole Back logic in `js/fk.js`, loaded first and independent of every other script:
  close what is open → `history.back()` through the pages visited → home → "Press back again to close".
  ⋯ › About › "Back button log" shows each Back press and any script errors.
- **0.1.2** (versionCode 3, 2026-11-06): Back still closed the app on Manuel's phone with 0.1.1. Now the Back key is
  caught in `dispatchKeyEvent` before the system can act, the Android 13+ back callback is registered through the
  public interfaces (0.1.1's reflection call could fail silently), the page's Content-Security-Policy is gone (the
  other Stoic Ranger apps have none), and an unanswered Back never closes the app. Every Back press is logged to
  `files/back-log.txt`; ⋯ › About › "Back button log" shows it.
- **0.1.1** (versionCode 2, 2026-11-06): phone Back no longer closes the app (remark #1). Back closes an open
  overlay (About, wind sheet, card viewer), then goes to the last page visited, then home; on home the first Back
  shows "Press back again to close" and only a second Back within 2 s closes the app. Android also gets Back through
  the Android 13+ back dispatcher, and a minimal Back handler (`js/fk.js`) loads before everything else.
  Checked against Stoic Ranger Shooting 1.2.0's link provider (same interface).
- **0.1.0** (versionCode 1): first draft.

## Tools (home screen, in this order)

1. **Shooting helpers**: Drop & wind (Stoic Ranger solver: point mass, G1/G7 drag tables), Convert MIL/MOA,
   Scope clicks, Range (mil relation), Angle (rifleman's rule), Par timer for dry fire.
2. **Navigate**: position as MGRS/UTM (location only when "Use my position" is tapped), bearing to a point,
   saved points, sun and moon for any date.
3. **Breathe**: six patterns with sound cues, minutes per day and streak.
4. **Field cards**: 30 business-card references incl. the DOPE card built from Drop & wind; print on A4.
5. **Printables**: range card A4/A5/A6, training datasheet A4 (print or share the PDF), wind cheat sheet
   (generic, or generated for one gun and load).
6. "More to come".

Settings (⋯): look (phone / light / dark), units (metric default, imperial optional; MIL/MOA unchanged),
offer Stoic Ranger data in Drop & wind, delete all my data.

## Link with Stoic Ranger (consent, read-only)

When Stoic Ranger (`at.rangebook.app`) is installed, Drop & wind shows a box: *Use Stoic Ranger data* → Allow /
Not now, or *Dismiss* (bring back in Settings). After Allow, guns, ammunition and measured V0 are read through
`content://at.rangebook.app.link` (`call("ballistics")`), guarded by the signature permission
`at.stoicranger.permission.LINK` — both apps must be signed with the same key. The provider comes with
**Stoic Ranger Shooting 1.2.0**; with an older Stoic Ranger the box says it needs an update.

## Data

One file, `files/db.json` (see `www/js/store.js` and MIGRATIONS.md). Atomic write, previous copy `db.bak.json`,
backups in `files/backups/` (last 10) before a format change and before "Delete all my data". A file from a newer
version opens read-only; a damaged file is backed up and the previous copy is used.

## Layout

- `app/src/main/java/at/stoicranger/fieldkit/MainActivity.java` – WebView shell and the `FKNative` bridge
  (db, location prompt, keep screen on, print HTML/PDF, share PDF, Stoic Ranger status/link).
- `app/src/main/assets/www/` – the app: `index.html`, `css/kit.css` (web Field Kit), `css/app.css` (Stoic
  Ranger look), `js/kit.js` (the tools), `js/ballistics.js` (= Stoic Ranger `gun/js/ballistics.js`),
  `js/store.js`, `js/link.js`, `js/wsheet.js`, `js/app.js`, `printables/`.

## Build and test

```
node field-kit/tools/test-app.mjs          # 36 checks
node field-kit/tools/test-sync.mjs         # 20 checks against a fake Nextcloud (contract v1) in Chromium: routes, solver, MGRS, units, link, data safety
KEYSTORE=/path/to/debug.keystore VERSION_CODE=6 VERSION_NAME=0.2.0 field-kit/tools/build-debug.sh
```

The build needs no Gradle: aapt2, ecj, dalvik-exchange (or dx), apksigner (`apt install aapt apksigner
dalvik-exchange`). The Gradle files are there for Android Studio. Sign with the same debug key as Stoic Ranger
(never committed; `*.keystore` is ignored).

## Open points

- Tool colours are proposals: Shooting gunmetal, Navigate olive, Breathe bronze, Field cards coyote, Printables oxblood.
- The range card PDFs still carry "Manuel · Stoic Ranger" in the footer.
- Convert / Scope clicks / Range / Angle / Navigate follow the units switch; par timer has no units.
- Not tested on a real phone yet (printing, location prompt, share sheet).
