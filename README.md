# Stoic Ranger

Source of the **Stoic Ranger** app (from 1.0.0 one app, one database) and its web version for iPhone, iPad and
any browser.

| Part | Was (up to 0.x) | What it does |
|---|---|---|
| Gun Database | SR_Database (`at.rangebook.app`) | Guns, barrels, ammunition, datasheets, analyse, dope cards |
| Training Log | SR_Training Log (`at.stoicranger.traininglog`) | Trainings (live and dry fire), trainers, record sheet |
| Shooting Drills | SR_Shooting Drills (`at.stoicranger.shootingdrills`) | Drill library, results, printable targets |

Daily Thoughts (SR_Daily Thoughts, `at.stoicranger.dailythoughts`) was a part of 1.0.x and is its own app again
from Stoic Ranger 1.1.0: source in `daily-thoughts/` (0.2.0 on). All platforms (Android, iPhone web app,
Windows) work from and into one shared **database.xlsx** (see `stoic-ranger/MIGRATIONS.md`).

The Android app keeps the package id `at.rangebook.app`, so 1.0.0 installs over SR_Database 0.6.0 and converts
its data in place. Web address: https://datawizmanuel.github.io/StoicRanger_Apps/

## Layout

- `stoic-ranger/` – the Android project (Java WebView shell + the app as offline web code in
  `app/src/main/assets/www`). Its README and MIGRATIONS.md describe the one database, the build and the migrations.
  - `www/index.html` + `www/sr/` – home page and the hub (`sr/hub.js`) that gives every part its view of the one database.
  - `www/gun/`, `www/training/`, `www/drills/` – the three parts, their code nearly unchanged.
  - `www/sr/xlsxdb.js` – the shared database.xlsx (write, read, three-way merge).
  - `web/native-web.js` – stands in for the Android shell in a browser (IndexedDB, share sheet, file picker, printing, password).
- `web/shell/sw.js` – offline cache. `web/icons/stoic-ranger/` – home screen icons.
- `tools/build-web.mjs` – builds `dist/` from the Android sources. `tools/test-web.mjs` – web data-safety tests.
- `stoic-ranger/tools/test-one-app.mjs` – Android-path tests (SR_Database conversion, imports, links between the parts).
- `windows/` – Stoic Ranger for Windows (Electron shell for the same `www`, installer, desktop test).
- `daily-thoughts/` – SR_Daily Thoughts, its own app again (Android + web), with its own README and tests.
- `android/` – the separate apps up to 0.x, frozen (kept for reference and for their data formats).
- `.github/workflows/pages.yml` – on every push to `main`: build, test, publish on GitHub Pages.

## Build and test locally

```
node tools/build-web.mjs                    # → dist/
node tools/test-web.mjs                     # needs playwright (npm i playwright && npx playwright install chromium)
node stoic-ranger/tools/test-one-app.mjs    # Android path
stoic-ranger/tools/build-debug.sh           # APK without Gradle (see stoic-ranger/README.md)
xvfb-run -a node windows/tools/test-desktop.mjs   # Windows shell (Linux Electron)
windows/tools/build-win.sh                  # Windows package → windows/dist/vX.Y.Z
```

## Data in the web version

- One database in the browser's IndexedDB for the site (`stoic-ranger` → `files`, keys `sr/db.json`,
  the previous copy `sr/db.bak.json`, `sr/backups/` newest 10), mirrored to localStorage while it fits, in case
  iOS stops a write half way. Daily Thoughts has its own file next to it (from 1.0.1): `sr/thoughts.json`,
  `sr/thoughts.bak.json`, `sr/backups-thoughts/`.
- Same code as Android, so the same rules: updates never delete entries, data from a newer version opens read-only.
- The data is tied to the web address. Moving the site means backup and restore.

## One-time password

The web app asks for a password on its first start on a device and then remembers it (localStorage + IndexedDB).
Only a PBKDF2-SHA-256 hash is stored (`LOCK` in `tools/build-web.mjs`); the password is never written into this
repository. Changing `LOCK` makes every device ask once more. The Android app has no password.
To test the right password: `SR_PASSWORD='…' node tools/test-web.mjs`.

## Android signing key

`debug.keystore` is not in this repository (it is public). Keep it with the Android project on the PC. It must be
the key SR_Database was signed with, or Android refuses the update (and would only install after uninstalling,
which deletes the data). `tools/build-debug.sh` would quietly make a new key if it is missing.
