# Stoic Ranger apps

Source of the three Stoic Ranger apps, and their web versions for iPhone, iPad and any browser.

| App | Home screen name | Android package | Web address (GitHub Pages) |
|---|---|---|---|
| Stoic Ranger - Gun Database | SR_Database | `at.rangebook.app` | `/database/` |
| Stoic Ranger - Training Log | SR_Training Log | `at.stoicranger.traininglog` | `/training-log/` |
| Stoic Ranger - Shooting Drills | SR_Shooting Drills | `at.stoicranger.shootingdrills` | `/shooting-drills/` |

Site: https://datawizmanuel.github.io/StoicRanger_Apps/ (start page with the three apps and install steps).

## Layout

- `android/<app>/` – the Android projects (Java WebView shell + the app itself as offline web code in
  `app/src/main/assets/www`). Their READMEs and MIGRATIONS.md describe build, data format and migrations.
- `web/shell/native-web.js` – stands in for the Android shell in a browser: the app code calls
  `RBNative` / `TLNative` / `SDNative` exactly as on Android and gets IndexedDB storage, the share sheet,
  the file picker, printing and the app links.
- `web/shell/sw.js` – offline cache per app. `web/icons/` – home screen icons (from `android/<app>/store/icon-512.png`).
- `web/landing/index.html` – start page.
- `tools/build-web.mjs` – builds `dist/` from the Android sources. `tools/test-web.mjs` – data-safety tests.
- `.github/workflows/pages.yml` – on every push to `main`: build, test, publish on GitHub Pages.

There is one copy of the app code: the web apps are built from `android/<app>/app/src/main/assets/www`, so a
new Android version gives the matching web version. `build-web.mjs` rewords a few Android-only sentences
(`PATCHES`); the build stops when one of those sentences is no longer found.

## Build and test locally

```
node tools/build-web.mjs          # → dist/
node tools/test-web.mjs           # needs playwright (npm i playwright && npx playwright install chromium)
npx http-server dist              # then open http://localhost:8080/
```

## Data in the web apps

- Each app keeps its data in the browser's IndexedDB for the site (`stoic-ranger` → `files`, keys
  `gundb/…`, `training-log/…`, `shooting-drills/…`): `db.json`, the previous copy `db.bak.json`,
  `backups/` (before every schema migration, newest 10), link inboxes. A copy of `db.json` is mirrored to
  localStorage while it fits, in case iOS stops a write half way.
- The migrations are the Android ones (same code), so the rules hold here too: updates never delete
  entries, data from a newer version opens read-only. `tools/test-web.mjs` must pass before a release.
- The data is tied to the web address. Moving the site to another address means backup and restore in each app.
- Linking works through the shared site storage, with the same consent rule as on Android (nothing but the
  status is shared until linking is switched on in both apps).

## One-time password

Each app asks for a password on its first start on a device and then remembers it (localStorage + IndexedDB).
Only a PBKDF2-SHA-256 hash is stored (`LOCK` in `tools/build-web.mjs`); the password is never written into this
repository. Changing `LOCK` makes every device ask once more. It keeps strangers out of the apps; the code itself
is public and holds no personal data. To test the right password: `SR_PASSWORD='…' node tools/test-web.mjs`.

## Android signing key

`debug.keystore` is not in this repository (it is public). Keep it with the Android project on the PC
(`10_long range shooting\…`). Without the same key, Android refuses app updates and the apps cannot link;
`tools/build-debug.sh` would quietly make a new key if it is missing.
