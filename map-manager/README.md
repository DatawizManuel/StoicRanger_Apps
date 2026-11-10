# Stoic Ranger Map Manager (Windows) — 0.2.0

Small PC tool that makes the offline maps for **SR Field Kit** (remark #8) and plans routes for it (remark #10).
It downloads region maps in one fixed format (map + terrain with contour lines), keeps them organised and saves them
into your Nextcloud folder, so the phone can pull them from there.

## Install

1. Copy the whole folder (all `StoicRangerMaps-app.zip.0xx` parts, `install.ps1`, `uninstall.ps1`, `Install.cmd`) to
   the PC.
2. Double-click **Install.cmd**. It asks where to install (default `%LOCALAPPDATA%\Programs`, a folder
   "Stoic Ranger Map Manager" is made there), checks the file checksum, and adds a Start menu and desktop shortcut
   "Stoic Ranger Map Manager". No admin rights needed.
3. Updating: run the newer Install.cmd. Uninstall: Windows Settings › Apps, or `uninstall.ps1`. Neither ever touches
   your maps or routes; settings are in `%APPDATA%\Stoic Ranger Map Manager`.

## Use

- **Settings › Map folder**: the folder of the Nextcloud desktop client, for example
  `C:\Users\<you>\Nextcloud\StoicRanger_Maps` (default guess: `<home>\Nextcloud\StoicRanger_Maps`). The client
  uploads what the Map Manager writes there. Direct upload without the desktop client is not built yet.
- **Settings › Maximum file size** (100 / 250 / 500 / 1000 MB / no limit; default 250): bigger maps are saved in
  parts (`<file>.001`, `.002`, …) because the Nextcloud client has trouble with very large files. The phone
  (Field Kit 0.4.0) downloads all parts and joins them into one map. Changing the setting re-saves the maps already
  in the folder.
- **Settings › Design**: like Windows, light or dark.
- **Add a region**: all countries of the world in the left list (search finds countries and regions, e.g.
  "Scotland" finds United Kingdom › Scotland). Pick a country: the middle list shows *Whole country* and its regions
  (states, provinces, counties). Tick what you need, see the estimated size and number of files, tap *Download*. Per region two files: `<id>.pmtiles` (OpenStreetMap vector map, zoom 0–15, Protomaps layout) and
  `<id>-terrain.pmtiles` (Mapterhorn terrain, zoom 0–12, for hill shading and contour lines drawn on the phone).
  Files are written in a temporary folder outside the Nextcloud folder, checked (SHA-256), then moved in;
  `maps.json` is written last, so the phone never sees half a file.
- **Maps**: what is in the folder, date of the build, size, *Update* when a newer build exists, *Delete* (removes the
  files and the entry in `maps.json`, so the phone stops offering the map). Maps whose files you deleted by hand are
  taken out of `maps.json` automatically.
- **Routes**: the map of your regions with waypoints. Click to add, drag to move, right-click to remove; rename,
  reorder; legs show distance, magnetic bearing (declination from Settings) and mils. *Save* writes
  `Routes/<name>.gpx` into the map folder (the phone lists it under "Routes on Nextcloud"); Export / Import GPX.
- On the phone (SR Field Kit 0.4.0; 0.3.0 works only while no map is split): ⋯ › Where your data is stored (Nextcloud address, user, app password), then
  Navigate › Map & routes › Maps › *Check Nextcloud* (folder `/StoicRanger_Maps/` by default) › *Download*.

## Format FK-1 / FK-2 (what the phone reads)

`maps.json` = `{format: "FK-1", version: 1, updated, maps: [{id, name, bbox, date, downloaded, base: {file, bytes,
sha256, maxZoom}, terrain: {file, bytes, sha256, maxZoom}, attribution}]}`. FK-2 is the same, except that `base` or
`terrain` may carry `parts: [{file, bytes, sha256}]` (the whole file's `sha256` is checked after joining). FK-2 is
written only while a map is split. The phone refuses other formats.

## Sources and terms

- Map: OpenStreetMap data © OpenStreetMap contributors, ODbL, from the Protomaps daily planet build
  (`https://build.protomaps.com/YYYYMMDD.pmtiles`; the newest of the last 14 days is used). Only the region's tiles
  are read (HTTP range requests, like `pmtiles extract`); no OpenStreetMap tile servers are used.
- Terrain: Mapterhorn (`https://download.mapterhorn.com/planet.pmtiles`): Copernicus GLO-30 (© DLR e.V. 2010–2014
  and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the EU and ESA), BEV and the Austrian
  states, Bayerische Vermessungsverwaltung, swisstopo, ARSO, ČÚZK, Provinz Bozen and other open data (CC BY 4.0 /
  CC0 / open government licences). Attribution is shown in both apps.
- Country and region lists: Natural Earth 1:10m admin-0/admin-1 (public domain), made with
  `tools/make-regions.py`.
- Both addresses can be changed under Settings › Advanced (if a source moves).
- Libraries: Electron 33.2.1, maplibre-gl, pmtiles, maplibre-contour, @protomaps/basemaps (BSD / MIT, see
  `www/map/lib/THIRD-PARTY-LICENSES.txt`).

## Build and test (cloud or Linux)

    bash tools/build-win.sh                       # → dist/v0.2.0
    node tools/test-pmx.mjs && node tools/test-core.mjs
    node tools/test-ui.mjs <dir with test maps>   # test maps: tools/make-test-maps.mjs
    xvfb-run -a node tools/test-desktop.mjs

The tests use a local test server and small made-up test maps. The real download from Protomaps and Mapterhorn
could not be tried from the cloud (those servers are not reachable there); try one small region first
(e.g. Austria · Vorarlberg).
