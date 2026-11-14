# Stoic Ranger - Daily Thoughts (Android)

Shown as **SR_Daily Thoughts** under the launcher icon (Stoic Ranger emblem in ranger green on tan; Gun Database
black, Training Log olive, Shooting Drills coyote brown). Package id `at.stoicranger.dailythoughts`. Offline; the
data stays on the phone unless you choose to sync it with your own Nextcloud (0.3.0, the only use of the internet). Same look and architecture as the other Stoic Ranger apps, in the
Stoic Ranger Web V1.0 colours (stone and ranger green in light, charcoal and tan in dark, seal watermark).

- **Today**: the Quote of the day as a one-pager: the quote, author (tap for the author page) and source,
  *Favourite*, the round challenge coin beside the context and a historical event where there is one, *Carry it
  through the day*, a short author card, source and translation note, *Share* and *Print / PDF*. Below it the
  **Authors** (all 24 coins), the quotes of the last six days and *Another thought* (random).
- **Quote of the day**: changes at local midnight and stays the same all day. All 411 quotes come round once before
  any repeats, in a fixed order mixed across the authors (`content/day-order.json`).
- **Authors**: coin grid, Stoics and other authors, plus a search over all quotes (text, source, context, author).
- **Author page**: big coin, school, dates, origin, summary, facts (born, died, from, school), the life story in
  sections, all quotes (each opens its one-pager), image credit for the coin portrait.
- **One-pager**: as on Today, with *Previous / Next* through the author's quotes.
- **Favourites**: newest first, share the list as text, your own **note** under each saved quote (0.3.0). Favourites of a quote that a later version drops stay saved.
- **More**: backup save / share / restore, **bring in favourites** from Stoic Ranger (0.2.0: the favourites file
  Stoic Ranger 1.1.0 saves, or a Stoic Ranger 1.0.x backup; added to yours, nothing replaced), light / dark / follow
  phone, about (translations, image credits, fonts).
- **Where your data lives** (0.3.0, shared contract v1 `00_docs/SHARED-DB-CONTRACT.md`): *This phone only* (the
  default) or *Synced to Nextcloud* (address, user name, app password, folder `/Stoic Ranger/`, file). Works offline,
  syncs on open, after each change and with *Sync now*; a status line shows the last sync. Before each upload a copy
  goes to `<folder>/backups/<file>-YYYYMMDD-HHMMSS.xlsx` (newest 30 kept). Upload with `If-Match` on the ETag; on 412
  download, merge, retry (3 tries). The app password is encrypted with the Android Keystore and never leaves the phone
  except to a linked Stoic Ranger app (same signing key, after consent).
  - Workbook: Daily Thoughts writes only `DT_Favourites` (Quote ID, Author, Quote, Saved at, Note) and the hidden
    `_DT_Data` (settings and app deletions as JSON) and keeps every other sheet. Linked apps share `database.xlsx`,
    alone it is `dailythoughts.xlsx`. 0.3.1: an existing file is changed inside its zip, only the parts of these two
    sheets are replaced or added; every other part stays byte for byte (other apps' sheets, drop-down lists, formats).
  - Uploads (0.3.1, as SR Shooting 1.3.1): only an xlsx is sent; after each upload the file is read back and must be
    byte-identical, else it is sent once more, and if still wrong the backup made just before is put back.
  - Merge: three-way against the last sync. A favourite on either side is kept; a row missing in the file (deleted in
    Excel) is not a deletion. Only a removal in the app (a tombstone, synced so every phone learns of it) removes a
    favourite saved before that time. Notes and settings: the side that changed wins.
  - **Linked apps**: tick SR Shooting / Gun Safe / Physical Fitness / Field Kit to share the storage setting
    (provider `at.stoicranger.dailythoughts.link`: `status`, `storage`, `setStorage`; newest `changed` wins).
    Switching here switches the linked apps; back to *This phone only* deletes nothing.
  - **Excel file by hand** (also the iPhone / iPad way, Nextcloud blocks web apps): *Update an Excel file* opens
    database.xlsx or dailythoughts.xlsx, merges both ways and saves it with every other sheet kept;
    *Save as a new Excel file*.

## Install the test build

1. Copy `sr-daily-thoughts-0.3.1-debug.apk` to the phone and open it in the Files app; allow installs from that app.
2. Play Protect may warn about an unknown app: *Install anyway* (debug build signed with the test key).
3. Open **SR_Daily Thoughts** and tap *Read today's thought*.

## iPhone / iPad (web app)

The same app, built from the same `assets/www`, as a web app for Safari. Open its web address on the iPhone, tap
**Share → Add to Home Screen**: it gets the SR_Daily Thoughts icon, opens full-screen, works offline (a service
worker keeps every file on the device) and keeps the favourites in the app's own storage (home-screen web apps are
not cleared by Safari). Backup, share (iOS share sheet) and print / PDF work as on Android.
**Password (web only):** the web app asks once per device for a password; after that the device stays unlocked,
also after updates (marker `dt.unlocked` in the page storage, separate from favourites and the offline cache). Only
the SHA-256 of the password is in `js/app.js` (`DT.PASS_SHA256`); the password itself is in `tools/.web-password`
(gitignored, kept in the source zips on Manuel's PC). To change it: new hash in `DT.PASS_SHA256` and the new
password in `tools/.web-password`; devices already unlocked stay unlocked. It keeps casual visitors out; the files
stay publicly readable on GitHub Pages.
Web address: **https://datawizmanuel.github.io/daily_thoughts/** (GitHub Pages, from `docs/` on `main` of
DatawizManuel/daily_thoughts). Build: `bash tools/make-web.sh` → `build/web/` (with `PUBLISH=1` also `docs/`) and
`build/outputs/sr-daily-thoughts-<version>-web.zip`; commit and push `docs/` to publish. `web/` holds the manifest, the service worker template and the icons.

**Standing rule: every update ships to both versions.** Bump `versionCode`/`versionName` in `app/build.gradle` and
`DT.VERSION` in `js/core.js` together, then run the test, `tools/build-debug.sh` and `tools/make-web.sh`.

Updating: install a newer APK over the old one; the favourites are kept (see `MIGRATIONS.md`).
Signed with the same key as the other Stoic Ranger test builds (cert SHA-256 0C:F0:92:51:…).

## Content

App content, not user data, generated by `python3 tools/make_content.py` from `content/` (a copy of the Authors
artifact build kit: `authors.json`, `bios/<slug>.md`, `quotes/<slug>.txt`, `coins.json`, `coins.py`):
`app/src/main/assets/www/js/content.js`, `js/sprite.js` and `coins/<slug>.svg` (coin portraits reduced to 480 px).

**Quote ids (`q-marcus-aurelius-01` …) are permanent**: favourites refer to them. `content/quote-ids.json` keeps
the id of every quote (key: author | source | first line). Never edit or reuse an id; a new quote gets the next free
number of its author, also when it is inserted in the middle of a quotes file. Changing the source or first line of
an existing quote makes it a new quote: edit `quote-ids.json` by hand to keep the old id.

Adding an author (standing rule: every author gets a coin and an author page): build the coin and life story with
the build kit (see its README), copy `authors.json`, `bios/`, `quotes/` and `coins.json` into `content/`, run
`tools/make_content.py` (it stops if a coin or life story is missing), test, build.

## Build

**Android Studio / Gradle:** open this folder, `./gradlew assembleDebug`. No AndroidX or third-party Android dependencies.

**Without the SDK manager (cloud):** `tools/build-debug.sh` (aapt2, ecj, d8 or dx, apksigner against an API 34
`android.jar` in `$TOOLS`; on Ubuntu `apt install aapt apksigner dalvik-exchange` gives the tools). Keep
`debug.keystore` (not in the GitHub repo; it is in the source zip on Manuel's PC): it is the same key as the other
Stoic Ranger test builds.

Before each release, all must print only PASS: `DT_PASS=… node tools/test-data-safety.js`, `node tools/test-sync.js`
(sync and Excel file against an in-page Nextcloud stand-in) and `tools/test-nc.sh` (WebDav.java + NcFile.java on the
JVM against `tools/webdav-mock.js`). Against a real Nextcloud 30 in Docker: `tools/test-nextcloud.sh [database.xlsx]`
(the Android WebDAV code on the JVM behind `tools/nc-test/NcBridge.java`, the page's sync through it, two phones,
the PC's database.xlsx checked part by part with `tools/check-xlsx-parts.py`). The build stops if `classes.dex` references `LambdaMetafactory` (the cloud dx
build has no lambda support: use anonymous classes).

## Changes

- **0.3.1** (2026-11-14): sync fixes after the first real Nextcloud test of SR Shooting
  (00_docs/SYNC-FIXES-2026-11-14.md). The WebDAV calls now go as plain HTTPS requests (no reflection trick that may
  fail on a phone); every upload is read back and checked, a broken one is sent again or the backup is put back; only
  Daily Thoughts' own two sheets are changed inside database.xlsx, everything else stays byte for byte (Excel's
  drop-down lists included). Tested against a real Nextcloud 30. No data change.

- **0.3.0** (2026-11-07): optional Nextcloud sync of favourites, notes and settings (shared contract v1), link
  consent and the shared storage setting with the other Stoic Ranger apps, Excel file update / save (web too), notes
  on favourites. Back button: the last Java lambda replaced (it crashed with the dx build); the build checks for it.

- **0.1.2** (2026-10-28): password screen for the web app, asked once per device and remembered across updates.
  Android unchanged apart from the version.
- **0.1.1** (2026-10-28): web app for iPhone / iPad (Add to Home Screen, offline, share sheet for backups).
  Android unchanged apart from the version.
- **0.1.0** (2026-10-27): first version. Quote of the day, 24 authors with coins and life stories, 411 quote
  one-pagers, search, favourites, share and print, backup, light / dark.
