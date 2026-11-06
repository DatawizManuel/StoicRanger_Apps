# SR Field Kit (Android) — 0.1.3

"Stoic Ranger - Field Kit", launcher name **SR_Field Kit**, package `at.stoicranger.fieldkit`.
Android port of the web Field Kit (stoic-ranger.com, Release 1.5) plus the Shooting helpers spec, in the
Stoic Ranger app look. Works fully offline: **no INTERNET permission**, no accounts, no tracking.

## Versions

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
node field-kit/tools/test-app.mjs          # 36 checks in Chromium: routes, solver, MGRS, units, link, data safety
KEYSTORE=/path/to/debug.keystore VERSION_CODE=4 VERSION_NAME=0.1.3 field-kit/tools/build-debug.sh
```

The build needs no Gradle: aapt2, ecj, dalvik-exchange (or dx), apksigner (`apt install aapt apksigner
dalvik-exchange`). The Gradle files are there for Android Studio. Sign with the same debug key as Stoic Ranger
(never committed; `*.keystore` is ignored).

## Open points

- Tool colours are proposals: Shooting gunmetal, Navigate olive, Breathe bronze, Field cards coyote, Printables oxblood.
- The range card PDFs still carry "Manuel · Stoic Ranger" in the footer.
- Convert / Scope clicks / Range / Angle / Navigate follow the units switch; par timer has no units.
- Not tested on a real phone yet (printing, location prompt, share sheet).
