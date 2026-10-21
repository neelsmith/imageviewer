# Session log

## 2026-10-13 — planning session (Cowork)

- Read `CLAUDE.md`; repo is a fresh clone (one commit; `src/`, `notes/`, `touch/` empty).
- Neel decided: pCloud Public Folder hosting; catalog fetched from pCloud; Vite build
  bundled to one HTML; output to `src/dist/` only (not `docs/`).
- Wrote `notes/plan.md` (phased plan + open questions).
- No code written, nothing committed. Next step: Phase 0 spike once Neel supplies the
  Public Folder URL and a sample catalog.

- Neel supplied the Public Folder URL and catalog header/sample row (pipe-delimited:
  path|caption|credits|license|tags). Recorded in plan.md. Catalog has no date/location.
- Tried to fetch catalog.cex to test CORS: blocked by the network allowlist in both the
  cloud sandbox and the local VM. CORS still untested; Neel to test in his browser.

- GitHub console test inconclusive (blocked by github.com's own CSP, not pCloud).
  Added src/spike/cors-test.html to test from file:// and from a local server.

- CORS test: file:// OK in Safari, localhost blocked → pCloud sends no CORS header.
- Decisions: catalog lives in repo (data/catalog.cex), fetched via raw.githubusercontent.com
  (ACAO * verified); dates/locations from EXIF via local tool writing data/images.cex;
  tags comma-separated. plan.md updated with revised data flow + new open questions 6–8.

## 2026-10-13 — session 2: answers + start of build

- Neel: repo public, working on `dev`; pCloud folder `~/pCloud Drive/Public Folder`;
  reverse-geocode to city/region and cache; created `data/catalog.cex`; scripts go in `utils/`.
  (Neel removed the CORS spike page and old root catalog.cex himself.)
- Built first working version (nothing committed):
  - `src/`: Vite + vite-plugin-singlefile + TS + Vitest. `lib/` data layer (20 unit tests
    pass, typecheck clean). `ui/` first-cut immich-style UI: Date/Location/Tag switch,
    filter, sticky group headers, lazy grid, lightbox with metadata + arrow/Esc keys,
    warnings banner, local-file fallback when data can't be fetched.
  - `utils/make-images-index.mjs`: EXIF date/GPS/size (exifr + image-size), Nominatim
    reverse geocoding with cache, incremental reruns; 10 node:test tests pass with
    generated fixture images.
  - Smoke-tested built index.html in headless Chromium with fixture data: all flows OK.
- Couldn't run against real pCloud folder or Nominatim (not reachable from Claude's sandbox).
- Default data URL is `main` branch; data/ currently only on `dev` → use `?branch=dev`.
- Next: Neel runs images-index on his Mac and commits data/images.cex + utils/geocache.json;
  then Playwright tests and UI refinements (see notes/development.md).

## 2026-10-13 — session 3: images-index crash fix

- Neel's run crashed: `ERR_INVALID_STATE: A FileHandle object was closed during garbage
  collection` on `leiden-pliny/IMG_1200 (3).jpeg`. Cause: exifr opens its own file handle
  and doesn't close it if a read fails part-way (likely an I/O hiccup on pCloud Drive);
  Node 22+ makes that fatal. Couldn't reproduce the pCloud failure in the sandbox.
- Fix in `utils/make-images-index.mjs`: the tool now reads the first 512 KB itself
  (`readHead`, always closes the handle) and passes the bytes to exifr and image-size
  (whole file only for HEIC/AVIF/TIFF with no date in the head). A file that can't be read
  is logged, listed without metadata, and retried on the next run instead of aborting.
- 4 new tests (handle closed on read error, partial reads, unreadable-file handling,
  no handles left open); 14/14 pass.

## 2026-10-13 — session 4: npm audit

- Neel's images-index run succeeded after the fix.
- `npm install` in src/ reported 3 high-severity advisories: one unpatched advisory in
  `braces` (DoS via nested glob patterns), pulled in by vite-plugin-singlefile → micromatch.
  Build-time only; no fixed `braces` release exists.
- Replaced vite-plugin-singlefile with `src/build/inline-all.ts` (Vite plugin that inlines
  JS chunks and CSS into index.html). Added `@types/node` (dev) and `test/build.test.ts`,
  which builds and asserts a single self-contained index.html.
- npm audit: 0 vulnerabilities. 21/21 tests, typecheck clean, browser smoke test passes.

## 2026-10-13 — session 5: running the dev server

- Nothing is pushed yet (origin/dev = "Skeleton files"), so the GitHub data URL 404s.
- Added `src/build/serve-data.ts`: in `npm run dev` the repo's `data/` is served at
  `/data/`, and main.ts uses it as the default data source in dev (built file still uses
  GitHub). So http://localhost:5173/ works with local, uncommitted data.
- Noticed: catalog path `leiden-ply/IMG_1203.jpeg` doesn't match the folder
  `leiden-pliny/` in images.cex — told Neel (catalog is his file).

## 2026-10-13 — session 6: password screen (option 1)

- Neel chose a simple client-side password screen (a "keep out" sign; data and images
  stay public and dev tools can bypass it). Options 2 (encrypt data) and 3 (hosted auth)
  were described and declined.
- `src/auth.json` holds a salted PBKDF2-SHA256 hash (600k iterations); empty hash = no
  password screen. `utils/set-password.mjs` (`npm run set-password`, `--off`) writes it.
- `src/lib/auth.ts` (Web Crypto check + "remember on this device" in localStorage, keyed to
  the hash so a new password logs devices out), `src/ui/gate.ts` (form), Lock button in bar.
- Tests: 26 Vitest + 16 node:test pass (PBKDF2 cross-checked against Python). Browser
  smoke test with a throwaway password: wrong rejected, right unlocks (~0.3 s),
  remembered on reload, Lock relocks, works from file:// too.
- No password set yet — Neel runs set-password, then rebuilds.

## 2026-10-13 — session 7: second app, catalog chooser (catalogs.html)

- New entry `src/catalogs.html` + `main-catalogs.ts` + `ui/catalog-app.ts`: no password;
  reads `data/catalog_of_catalogs.cex` (columns `cex file`/`cex_file`, `label`), shows a
  menu of labels, loads the chosen catalog (path relative to data/), shows only cataloged
  images (still joined with images.cex for dates/places). Catalog switcher <select> in the
  bar; choice in URL hash (`#catalog=…&group=…`), back/forward works.
- Shared code: `startApp` now takes `load`, `toolbar`, `localFallback` options and returns
  `destroy()`; `buildPhotos(…, {catalogedOnly})`; new `lib/hash.ts`, `lib/catalogs.ts`;
  CEX headers now normalize spaces to `_`.
- Build: `npm run build` = two Vite builds → `dist/index.html` + `dist/catalogs.html`
  (each single-file). Dev: http://localhost:5173/catalogs.html.
- Tests: 36 Vitest pass (incl. both build outputs); browser smoke test of menu, view,
  switching, back, deep link, broken catalog path.
- (Correction) I had read catalog_of_catalogs.cex before Neel's edit and wrongly reported
  a path typo. His convention: `cex_file` paths are relative to the repo root
  (`data/catalogs/mss.cex`). `catalogUrl` now resolves against the parent of data/.
  Verified with his real files: menu → "Photograph of manuscripts" → 1 photo, March 2019,
  no warnings. 37 tests pass. Lesson: re-read Neel's files right before commenting on them.

- docs/ test of catalogs.html failed: built app reads data from GitHub `main`, and
  data/catalog_of_catalogs.cex was never committed (404 on main and dev). Neel to commit+push.
  Error messages now include the URL tried.

## 2026-10-13 — session 8: versioning + output names

- Output renamed: `index.html` = catalog chooser (no password), `private.html` = all images
  with password. Sources: src/index.html + main-catalogs.ts, src/private.html + main-private.ts.
  `npm run build` = `vite build && vite build --mode private`.
- Version 1.0.0 in src/package.json, injected via Vite `define` (__APP_VERSION__; "-dev" in
  dev server). `lib/version.ts` renders a muted "v1.0.0" link to the GitHub release in the
  top bar, catalog menu and password screen.
- `utils/check-release.mjs` (`npm run check-release -- v1.0.0`). Release steps in
  notes/development.md. Currently reports docs/ not yet rebuilt (expected).
- 40 Vitest + 20 node:test pass; browser check shows v1.0.0 on menu, bar and password screen.
- Removed stale src/dist/catalogs.html (gitignored build output).
- check-release: tag argument now optional (defaults to v<package.json version>); Neel hit 'Tag ""' running it without one.
- check-release no longer checks docs/private.html (Neel moves it around docs/); only docs/index.html.
- Wrote notes/maintenance.md (catalog updates; adding images).

## 2026-10-13 — session 9: "Cataloged images only" toggle (private.html)

- `startApp` option `catalogToggle` (used only by main-private.ts): checkbox in the bar,
  on by default; off shows all images and stores `all=1` in the URL hash. Count reads
  "N of M cataloged photos" when on. Pure helper `selectPhotos` in lib/group.ts.
- First UI flow tests (`test/app.test.ts`, jsdom): toggle default, untick/retick, hash
  restore, absent in index.html. 44 Vitest pass. Browser check with real data: 1 cataloged
  ↔ 685 total, state survives reload.
- Not released: app code changed since v1.0.0, so the next release needs a version bump
  (suggested 1.1.0) — Neel's call.

## 2026-10-13 — session 10: zoom in the single-photo view (both apps)

- Neel had released v1.1.0 (toggle). Added zoom/pan to the full-screen photo view:
  `lib/zoom.ts` (fit/clamp/zoom-around-point/toggle/wheel math; 7 tests) and
  `ui/zoom-viewer.ts`. Image is drawn at natural size with a CSS transform; uses
  images.cex width/height to lay out before load. Arrow keys still change photo; touch
  swipe changes photo only when not zoomed. Lightbox buttons now dark-translucent so they
  show on light photos.
- 51 Vitest pass. Headless Chromium check with a 4032×3024 test image: wheel zoom toward
  pointer, clamps (fit … 400%), dblclick fit↔100%, drag pan with edge clamp, +/−/0, buttons
  enable/disable, reset on next photo, refit on resize; mobile emulation: swipe → next,
  pinch zoom, double-tap → 100%. Works in index.html and private.html.
- Not tested: real Safari trackpad gestures, real iOS/Android devices. Next release: 1.2.0?

## 2026-10-13 — session 11: scaling assessment (no code changes)

Synthetic test in headless Chromium (images stubbed, so network excluded):

| photos | first render | filter keystroke | switch to Tag | DOM elements |
|---|---|---|---|---|
| 1,000 | 0.24 s | 0.37 s | 0.35 s | ~4k |
| 10,000 | 0.7 s | 13 s | 16 s | ~40k |

- Biggest real-world issue at any size: grid tiles load the full-size originals (~2–5 MB
  each); Chrome's lazy loading fetches ~100–200 of them on first open. Fix: thumbnails
  generated by the images-index tool (e.g. 400 px into a dot-folder in the Public Folder).
- For 10k: render only on-screen rows (windowed grid) + debounce the filter.
- Data files fine (10k-row images.cex ≈ 0.8 MB). Check pCloud Public Folder traffic limits.

## 2026-10-13 — session 12: thumbnails

- `utils/make-thumbnails.mjs` (`npm run thumbnails`, sharp 0.35): `_thumbs/<path>.jpg`,
  EXIF-rotated, short side 400 px, no enlargement, 4 parallel jobs, incremental by mtime,
  failures reported but non-fatal. `listImages` skips `_thumbs/`. 4 new tests; 24 pass.
- App: `Photo.thumb`; grid tiles load thumbnail → fall back to original → "Can't display".
  Photo view shows the thumbnail (sized to the full image) until the original loads; zoom
  done meanwhile is kept. ZoomViewer no longer resets the view when the image finishes
  loading unless the real size differs from images.cex. 53 Vitest pass.
- Browser check: thumbnail 24 KB vs original 765 KB; missing thumbnail falls back; placeholder
  then original swap with zoom preserved.
- Neel to run `npm install` in utils/ (adds sharp) then `npm run thumbnails`. Not released.

## 2026-10-13 — session 13: a URL for each photo (both apps)

- Open photo is kept in the hash as `photo=<path>` (alongside catalog/group/all). Opening
  from the grid pushes a history entry (Back closes the photo); prev/next/swipe replace it;
  Close/Esc steps back (or drops the key for a deep link). hashchange follows back/forward
  and edited URLs. A link opens its photo after loading; if the photo is hidden by
  "Cataloged images only" or missing, a notice explains and the key is dropped.
  Catalog switcher/menu clears `photo`. Changes in ui/app.ts, ui/catalog-app.ts.
- 4 new jsdom tests; 57 Vitest pass, typecheck clean. Headless Chromium on the built
  index.html with real data from GitHub main: deep link, close, tile, Back, Forward, Esc OK.
- Not committed or released (app change → next version bump).

## 2026-10-13 — session 14: cull obsolete thumbnails

- `utils/cull-thumbnails.mjs` (`npm run cull-thumbnails`, `--root`, `--delete`): lists
  `_thumbs/**/*.jpg` with no matching image (via listImages/thumbPath); dry run by default;
  `--delete` removes them plus emptied folders (dotfile-only folders count as empty).
  Non-.jpg files in _thumbs/ are reported and left alone. Refuses to delete when the root
  has no images. 4 node:test tests; 28 utils tests pass. maintenance.md: renaming section.
- Not committed.

## 2026-10-13 — session 15: optional `year` / `place` catalog columns

- Neel added `year|place` to data/catalog.cex (uncommitted). Parsed into CatalogEntry/Photo
  as `year` and `placeName` (not `place`, which is the EXIF Place object).
- Both apps: Year / Place <select>s in the bar (lib/group.ts facetValues + selectPhotos
  year/place), hidden when no photo has a value; numeric-aware sort; state in hash
  (`year=`, `place=`), unknown values from a URL dropped; catalog switch clears them.
  Text filter also searches year/place. Photo view shows Year and Place; the EXIF place row
  is labelled "Location" when the catalog also gives a place.
- 64 Vitest pass, typecheck clean. Neel's src/node_modules now has macOS binaries, so checks
  ran on a scratch copy outside the repo. Browser check (built index.html, real data/ files
  served locally): drop-downs, filtering, reload, catalog switch, photo info all OK.
- Open question for Neel: use catalog `year` for Date grouping when a photo has no EXIF date?
- Not committed; app change → version bump before release.

## 2026-10-13 — session 16: third app, private-catalogs.html (password per catalog)

- Neel chose the simple per-catalog "keep out" password (no encryption). New entry
  src/private-catalogs.html + main-private-catalogs.ts; build mode `private-catalogs`
  (`npm run build` now makes 3 pages). startCatalogApp takes `{ listFile }`.
- Catalog lists may have an optional `password` column: `pbkdf2-sha256:<iter>:<salt>:<hash>`
  (lib/auth.ts parseAuthSpec; malformed → catalog left out with a message). Choosing a
  locked catalog shows the gate (title = label, "Back to catalogs"); remembered per catalog
  under `imageviewer.unlocked.catalog:<file>`; Lock button forgets. Menu marks "password".
  Works in index.html too if its list ever gets the column.
- utils/catalog-password.mjs (`npm run catalog-password -- <cex_file> [--off] [--list f]`),
  reuses set-password's hash + hidden prompt (askHidden now exported).
- Tests: 73 Vitest (5 new UI flow in test/private-catalogs.test.ts, + auth/catalogs/build),
  33 utils node:test. Browser check of built page with a real 600k-iteration hash and
  data/private/brunswick.cex: menu, wrong/right password (~0.25 s), remember, Lock, Back.
- Neel's data/catalog_of_private_catalogs.cex and data/private/ are untracked — need commit
  + push before the built app (reads GitHub main) can see them. No password set on them yet.
- Not committed; app change → version bump before release.

## 2026-10-13 — session 17: manual data "last updated" date

- Neel wants a hand-set date for the data, separate from the app version (he declined
  tags/automation; first asked for a free-text version, then switched to a date mid-task).
- `data/last-updated.txt` (YYYY-MM-DD; first non-comment line) is fetched at startup by all
  three mains (ui/load.ts loadDataUpdated) and shown via lib/version.ts versionInfo() as
  "v1.5.0 · data updated Oct 13, 2026" in the bar, catalog menus and password screens.
  Invalid/missing → hidden (console warning if invalid). Labels created before it loads are
  updated in place.
- 77 Vitest pass, typecheck clean. Browser check of all three built pages: date shown;
  invalid text and missing file → app version only.
- No data/last-updated.txt created (Neel sets it). Not committed; app change → version bump.

## 2026-10-14 — session 18: configurable site settings

- (Sessions 13–17 happened elsewhere; re-read the repo first: 3 apps, cull-thumbnails,
  data/last-updated.txt, per-catalog passwords.)
- `src/site.config.json` (gitignored) + committed `src/site.config.example.json`. Keys:
  imageBase, dataBase, repoUrl (optional), localImageRoot (optional, utils only).
  `build/site-config.ts` validates (http(s) URLs, no YOUR- placeholders, every problem
  listed) and vite.config injects `__SITE_CONFIG__` (local path never baked in). Tests use
  the example file (process.env.VITEST).
- lib/config.ts: DEFAULTS from config; `withBranch()` swaps the branch only for
  raw.githubusercontent.com URLs. lib/version.ts: REPO_URL from config; no link if unset.
- utils: lib/site-config.mjs `defaultImageRoot()` for images-index, thumbnails,
  cull-thumbnails (--root still overrides).
- Created Neel's src/site.config.json with the previous hard-coded values, so builds are
  unchanged. Added main-private-catalogs.ts to tsconfig include (was not type-checked).
- 84 Vitest + 35 node:test pass; all 3 built pages contain the configured URLs, no
  placeholders, no local path. Not committed; app change → version bump.

## 2026-10-14 — session 19: catalog order in the grid

- Neel: "in the lightbox display, respect the order of images in the catalog" (he uses
  "lightbox" for the thumbnail grid). `Photo.catalogOrder` (first row wins for duplicate
  paths); `comparePhotos` puts cataloged photos in catalog order within each group, then
  uncataloged ones newest first. Group order unchanged. Photo-view previous/next follows.
- 86 Vitest pass; browser check with a catalog deliberately out of date order: grid and
  previous/next follow the catalog. Not committed; app change → version bump.

## 2026-10-14 — session 20: local.html plan + spike

- Planned a 4th app, local.html (opened from disk; browse a chosen folder tree; catalogs;
  browser-independent HEIC). Neel: no saved thumbnails; wants catalogs + HEIC everywhere.
- Spike results in notes/local-app-spike.md: libheif-js works in a Blob worker from file://
  in Chromium; 93/98 of Neel's HEIC have 240×320 embedded thumbnails (2–4 ms); full decode
  ~0.4–0.6 s on his Mac. Spike page scratch/local-spike.html for Safari/Firefox/Chrome runs.
- Safari 26.5 spike results recorded (native HEIC ~60 ms; tiles 5 ms; software 0.2–0.4 s; no folder picker, upload control fine).

## 2026-10-14 — session 21: local.html built

- New 4th app `local.html` (build mode `local-folders`; Vite reserves "local"). Details in
  notes/development.md "local.html". New code: lib/local/tree.ts, lib/local/meta.ts,
  ui/local/heic.ts + heic-worker.js, ui/local/images.ts, ui/local-app.ts, main-local.ts.
  startApp gained `images`, `banner`, `markUncataloged` options; ZoomViewer gained
  `preview()` (placeholder without the stale-size refit that made it show 100%).
- Deps (src devDependencies, bundled): libheif-js 1.23.5, exifr ^7.1.3.
- Tests: 101 Vitest (new: local-tree, local-meta, local-images, local-app UI flow; build test
  now builds 4 pages). Headless Chromium e2e from file:// with 4 of Neel's HEIC + a JPEG +
  catalog.cex: catalog default/order/missing warning, toggle, no-catalog, subfolder
  navigation, breadcrumb/Back, include subfolders, HEIC tiles 240×320, full HEIC decode in
  worker ~0.9 s (2 slow cores), zoom, next photo placeholder, Open another folder.
- Not tested: Safari/Firefox on the Mac, real folder picker click, large folders.
- Not committed; local.html not for docs/.
- Neel: local.html works well in Safari (his first real-browser test).
- Neel: local.html also excellent in Chrome (folder picker + software HEIC decode confirmed on his Mac).
- Fix: src/package-lock.json had never picked up exifr + libheif-js (my scratch copy was overwritten on each sync); regenerated and copied. Neel's build failed until 'npm install' in src/.

## 2026-10-19 — session 22: Location is the default grouping

- app.ts: DEFAULT_MODE = "location" (all four apps); #group= still overrides, unknown values
  fall back to Location. Button order unchanged (Date, Location, Tag).
- Tests: new 'default grouping' cases in app.test.ts; local-app test expectations updated
  for location-first order. 103 Vitest pass; all four pages rebuilt into src/dist/.
  App change → version bump before release.

## 2026-10-19 — session 23: private.html → family.html

- Output renamed: src/private.html → src/family.html, main-private.ts → main-family.ts, build
  mode private → family. Comments, tests (build, app, auth, check-release) and notes updated.
  Password memory unaffected (localStorage key doesn't depend on the file name).
- 103 Vitest + 35 utils tests pass; rebuilt src/dist/. Stale src/dist/private.html left (no delete permission) — Neel can delete it.
- Neel: replace docs/…/private.html with family.html; old links/bookmarks will break.
- Vite 'configLoader: native' warnings fixed: vite.config.ts imports ./build/*.ts with extensions; tsconfig allowImportingTsExtensions. Build and tests now warning-free (103 pass).

## 2026-10-20 — session 24: Export + Captions (grid, all four apps)

- Neel's terms: "light table"/"lightbox" = the thumbnail grid.
- Export button (bar): downloads a .cex of the photos currently shown (filters, toggle,
  year/place, group order; one row per path; uncataloged photos as path-only rows; year/place
  columns only if used; "|"/newlines → spaces). lib/export.ts photosToCex + exportFileName;
  name "<catalog or folder>-selection.cex" via startApp option `exportName`.
- Captions checkbox (bar), default off, hash `captions=1`: caption under each tile, max 3 lines.
- Tests: 108 Vitest (export round-trip, UI download honouring filter/order, captions toggle).
  Browser check: download z-selection.cex content correct; caption layout OK.
- App change → version bump before release.

## 2026-10-20 — session 25: browse.html (web server folder browser)

- Neel: nginx server, rerunning the index is fine, mostly JPEG/PNG + some HEIC; chose option A
  (index file; no server folder listings).
- Refactor: folder navigation moved from local-app.ts into ui/folder-browser.ts
  (browseFolder + PhotoSource); local.html behaviour unchanged (its tests pass).
  lib/local/tree.ts: dirFromPaths (dirFromFileList now uses it). ImageProvider gained
  tileFallback/originalUrl/dispose; app.ts tiles try tileFallback once on error.
- New: ui/browse-app.ts, ui/web/images.ts (WebImages), lib/web/paths.ts (safeRelPath,
  folderNameFromUrl), main-browse.ts, browse.html, build mode `browse` (5 pages now).
- utils: images-index `--catalogs` writes catalogs.cex (listCatalogs/catalogsText in index-lib).
- Tests: 116 Vitest (web-paths, web-images, browse-app UI flow incl. no-cache catalog refetch,
  unsafe paths ignored, thumb→original fallback; build test 5 pages); 36 utils tests.
  Headless Chromium against python http.server: thumbnails + fallback, HEIC tiles decoded,
  HEIC photo view (~1 s), catalog order, place groups from images.cex, deep link reopens photo.
- Not tested on nginx itself. App change → version bump.

## 2026-10-20 — session 26: region selections + CITE2 URNs

- Neel: plain x,y,w,h and CITE2 `urn@x,y,w,h`; optional `urn` catalog column; multiple boxes per
  photo; export a list of URNs; keep while the page is open + shareable link; rotation is the
  collection manager's concern.
- Built as in notes/development.md "Region selections". New: lib/roi.ts, ui/roi-layer.ts;
  urn in CatalogEntry/Photo/parseCatalog/merge/export; app.ts panel, hash roi=, session store,
  Export selections button, copyText helper.
- Tests: 127 Vitest (roi math round-trip at any zoom/pan, parse/format, URN; app flows: roi= link,
  remove updates URL, per-photo memory across next/prev, Export selections file, no-urn hint).
  Headless Chromium: Shift-drag top-left quarter → box stays on the same image region after zoom
  67% + pan; select-mode draw, move, resize to corner (0.5,0.5,0.5,0.5), Copy all URNs to
  clipboard, Delete, Esc, grid Export selections (1).
- App change → version bump.
- 'Copy all' button now sits next to 'Clear all' and works for every photo (URNs if it has a urn, else x,y,w,h), replacing 'Copy all URNs'. Shows 'Copied n'. 128 Vitest pass.

## 2026-10-21 — session 27: renames for 2.0.0

- Outputs renamed: index.html → catalogs.html (default build, empties dist/), family.html →
  private.html (mode `private`, main-private.ts), browse.html → www-browse.html (mode
  `www-browse`, main-www-browse.ts). Sources renamed to match; comments, tests, notes updated.
- check-release now checks docs/catalogs.html (docs/index.html is the Quarto site now).
- 128 Vitest + 36 utils tests pass; 5 pages built. Stale src/dist/index.html, family.html,
  browse.html can't be deleted from here (no permission) — Neel to delete.
- Dev server: no page at "/" any more; use /catalogs.html.
- src/local.html had been deleted (git showed ' D'); restored from HEAD with git show (no git index changes). Build passes again.

## 2026-10-21 — session 28: unfoldable list of missing catalog entries

- Notices can now carry a list (ui/load.ts `Notice`, `missingNotice`): the 'N … not found'
  warning (catalog apps: images.cex; local/www-browse: folder) is a folded <details>; 'Show list'
  unfolds each missing path with its caption. All five apps.
- 129 Vitest pass; browser check of catalogs.html folded/unfolded. App change (Neel already at 2.0.0).

## 2026-10-20 — session 29: region math from the shared cite-roi package

- `src/lib/roi.ts` and `src/test/roi.test.ts` moved to the new repo
  https://github.com/neelsmith/cite-roi (v1.0.0, identical code and tests), shared with iiif-cite.
  `src/package.json` now depends on `github:neelsmith/cite-roi#v1.0.0` (lock entry over https);
  `ui/app.ts` and `ui/roi-layer.ts` import from `cite-roi`. See development.md "Region selections".
- 123 Vitest pass (the 6 roi tests now run in cite-roi); typecheck clean. All five built pages are
  byte-identical to before the change, so this is not an app change (no version bump needed).
- Built and tested in a Linux scratch copy; `src/node_modules` reinstalled for the Mac with
  `npm ci --os=darwin --cpu=arm64`. Not committed.
