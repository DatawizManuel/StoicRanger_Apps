# SR Field Kit (Android) — 0.1.0, first draft

"Stoic Ranger - Field Kit", launcher name **SR_Field Kit**, package `at.stoicranger.fieldkit`.
Android port of the web Field Kit (stoic-ranger.com, Release 1.5) plus the Shooting helpers spec, in the
Stoic Ranger app look. Works fully offline: **no INTERNET permission**, no accounts, no tracking.

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
`at.stoicranger.permission.LINK` — both apps must be signed with the same key. **Stoic Ranger 1.1.0 has no link
provider yet**: the box then says Stoic Ranger needs an update (remark #11 in `00_docs/REMARKS.md`).

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
node field-kit/tools/test-app.mjs          # 31 checks in Chromium: routes, solver, MGRS, units, link, data safety
KEYSTORE=/path/to/debug.keystore VERSION_CODE=1 VERSION_NAME=0.1.0 field-kit/tools/build-debug.sh
```

The build needs no Gradle: aapt2, ecj, dalvik-exchange (or dx), apksigner (`apt install aapt apksigner
dalvik-exchange`). The Gradle files are there for Android Studio. Sign with the same debug key as Stoic Ranger
(never committed; `*.keystore` is ignored).

## Open points

- Tool colours are proposals: Shooting gunmetal, Navigate olive, Breathe bronze, Field cards coyote, Printables oxblood.
- The range card PDFs still carry "Manuel · Stoic Ranger" in the footer.
- Convert / Scope clicks / Range / Angle / Navigate follow the units switch; par timer has no units.
- Not tested on a real phone yet (printing, location prompt, share sheet).
