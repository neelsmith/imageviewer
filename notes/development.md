# Development guide

## Site settings (`src/site.config.json`, gitignored)

```sh
cp src/site.config.example.json src/site.config.json   # once per clone/machine, then edit
```

| key | used by | |
|---|---|---|
| `imageBase` | apps (baked in at build) | pCloud Public Folder URL |
| `dataBase` | apps (baked in) | URL of `data/`; `?branch=` swaps the branch if it's raw.githubusercontent.com |
| `repoUrl` | apps (baked in) | version label links to `<repoUrl>/releases/tag/vX.Y.Z`; omit for no link |
| `localImageRoot` | utils/ scripts only | default `--root`; `~` allowed; falls back to `~/pCloud Drive/Public Folder` |

`npm run build`/`dev` stop with a clear message if the file is missing, invalid, or still has
`YOUR-…` placeholders. Tests always use the example file. Not a secret: the URLs are visible
in the published HTML.

## Web app (`src/`)

```sh
cd src
npm install
npm run dev          # http://localhost:5173/catalogs.html (+ /private.html, /private-catalogs.html, /www-browse.html, /local.html) — reads ../data/ from the local repo
npm test             # Vitest unit tests (lib/)
npm run typecheck
npm run build        # → src/dist/catalogs.html, private.html, private-catalogs.html, www-browse.html, local.html, each self-contained
```

URL options: `?branch=<name>` (data from that branch of the GitHub repo, default `main`),
`?data=<dir URL>`, `?images=<base URL>`, `#group=date|location|tag`.
Hash keys (combine with `&`): `catalog=<cex_file>` (catalogs.html), `all=1` (private.html),
`photo=<path>` — opens that photo, e.g. `catalogs.html#catalog=data%2Fcatalogs%2Fmss.cex&photo=leiden-pliny%2FIMG_1203.jpeg`.

Single-photo view zoom: `lib/zoom.ts` (pure math, tested) + `ui/zoom-viewer.ts` (wheel/trackpad
pinch incl. Safari gesture events, drag, touch pinch/swipe/double-tap, dblclick, +/−/0 keys,
on-screen controls). Zoom range: fit … 400% of natural size; resets on each new photo.

Code layout: `build/inline-all.ts` Vite plugin that inlines JS/CSS into each page; `lib/` pure, tested data functions (cex parser, catalog, images index, merge,
grouping, config); `ui/` DOM code (`load.ts` fetches data, `app.ts` grid + lightbox).

## Two apps

| Page | Data | Password |
|---|---|---|
| `catalogs.html` (source `src/catalogs.html`, `main-catalogs.ts`) | menu from `data/catalog_of_catalogs.cex` → chosen catalog, cataloged images only | no |
| `private.html` (source `src/private.html`, `main-private.ts`; build mode `private`) | `data/catalog.cex` + every image in `data/images.cex`; "Cataloged images only" toggle (default on; off = `#all=1`) | yes (if set) |
| `private-catalogs.html` (source `src/private-catalogs.html`, `main-private-catalogs.ts`) | menu from `data/catalog_of_private_catalogs.cex`; the chosen catalog's images (same view as catalogs.html) | per catalog, from the list's optional `password` column |
| `www-browse.html` (source `src/www-browse.html`, `main-www-browse.ts`; build mode `www-browse`) | the folder below the page on a web server, from its `images.cex` — see below | no |
| `local.html` (source `src/local.html`, `main-local.ts`; build mode `local-folders`) | a folder on this computer, opened from disk — see below | no |

Dev URLs: http://localhost:5173/catalogs.html, /private.html, /private-catalogs.html, /www-browse.html and /local.html
(`#catalog=<cex_file>` deep-links to a catalog). `cex_file` paths are relative to the repo
root, e.g. `data/catalogs/mss.cex`.

## Images index (`utils/`)

```sh
cd utils
npm install
npm run images-index                     # scans ~/pCloud Drive/Public Folder → ../data/images.cex
npm run images-index -- --dry-run        # print instead of writing
npm run images-index -- --refresh        # re-read every file
npm run images-index -- --no-geocode     # skip place lookups
npm test
```

Thumbnails: `npm run thumbnails` writes `<Public Folder>/_thumbs/<path>.jpg` (short side
400 px, ~25–50 KB; `--size`, `--jobs`, `--force`). Skips thumbnails newer than their source;
never deletes. The grid loads the thumbnail and falls back to the original if it's missing;
the photo view shows the thumbnail stretched as a placeholder until the original arrives.
HEIC sources may fail (sharp's prebuilt libvips lacks HEVC) — reported, run continues.

Only new files are read on reruns. Place names come from OpenStreetMap Nominatim
(≤1 request/s) and are cached in `utils/geocache.json` — commit it.

## Not yet done

- Playwright tests for UI flows (a manual Playwright smoke test passed on 2026-10-13:
  grouping, filter, lightbox keys, file:// error state).
- Justified rows using width/height, virtualised grid for large collections,
  date scrubber, deep link to a photo, nicer missing-image state in the lightbox.

## Password screen

```sh
cd utils && npm run set-password        # prompts; writes ../src/auth.json
cd ../src && npm run build              # the hash is baked into private.html
cd ../utils && npm run set-password -- --off   # remove it
```

It's a deterrent only: the data (GitHub) and images (pCloud) remain public.

## Releases

The app version is `"version"` in `src/package.json` (single source of truth). The build
bakes it into both pages, shown as a small "vX.Y.Z" link to the GitHub release; `npm run dev`
shows "vX.Y.Z-dev". Data updates (catalogs, images.cex) are not releases.

1. Bump `"version"` in `src/package.json`; add notes to `releases.md` (Neel's file).
2. `cd src && npm run build`, copy `dist/catalogs.html`, `dist/private.html` and `dist/private-catalogs.html` to `docs/` (www-browse.html goes to the nginx server; local.html is a release download).
3. `cd ../utils && npm run check-release` (tag defaults to v + package.json version) — checks tag format, match with
   package.json, tag not already used, and that docs/catalogs.html embeds this version
   (private.html and private-catalogs.html aren't checked — they may live anywhere under docs/).
4. Commit, then `git tag -a vX.Y.Z -m "Release vX.Y.Z"` and `git push --follow-tags`.
5. Optional: GitHub → Releases → draft from the tag, attach the two HTML files.

## local.html (local folders)

Opened from disk (double-click); **not** copied to `docs/` — attach it to GitHub releases.
~2.2 MB because it carries the HEIC decoder (libheif-js 1.23.5, LGPL-3.0, WebAssembly).

- Opening a folder: folder picker (Chrome/Edge) → `lib/local/tree.ts` dirFromHandle; otherwise
  upload-style control (Safari/Firefox) → dirFromFileList; drag-and-drop → dirFromEntry.
  Skips dotfiles, `_thumbs/`, `__MACOSX`.
- Hash state: `dir=<path>`, `sub=1` (include subfolders), `cat=<file.cex>|none`, plus the usual
  group/photo/all/year/place. Default catalog: `catalog.cex` if the folder has one. A catalog's
  paths are relative to its folder; with a catalog the whole tree is read.
- Metadata: exifr in the browser (date taken, GPS). No place names offline: Location groups by
  coordinates rounded to 0.01° ("39.28° N, 76.54° W").
- Images (`ui/local/images.ts`): JPEG/PNG/WebP straight from the file (full size). HEIC tiles =
  the thumbnail stored in the file (240×320), decoded by libheif in 1–4 Blob workers
  (`ui/local/heic.ts`, `heic-worker.js`); no stored thumbnail → full decode + downscale.
  Photo view: Safari's own HEIC decoder if available (probed once), else full decode in a
  worker; the tile is shown stretched meanwhile. Only the last 3 full decodes are kept.
- startApp hooks used: `images` (tile/full/placeholder/size/originalUrl), `banner`
  (subfolder buttons), `markUncataloged`, `toolbar`, `catalogToggle`.
- Not yet: drawing only on-screen rows (very large folders), recent folders, place names.

## www-browse.html (web server folder)

Put `www-browse.html` in a folder on any static web server (Neel: nginx), e.g. `WWW_ROOT/images/`.
It browses everything below that folder, using index files next to it:

```sh
cd utils
npm run images-index -- --root /path/to/WWW_ROOT/images --out /path/to/WWW_ROOT/images/images.cex --catalogs
npm run thumbnails   -- --root /path/to/WWW_ROOT/images
```

- `images.cex`: every image with date, GPS place names, size (same format as data/images.cex).
  `catalogs.cex` (from `--catalogs`): every `.cex` under the folder. Re-run after adding photos
  or catalog files; **edits to existing catalogs need nothing** — catalogs and both index files
  are fetched fresh (no-cache) on every load.
- Thumbnails `_thumbs/<path>.jpg`; missing → the original (JPEG/PNG) or, for HEIC, the thumbnail
  inside the file decoded in the browser (downloads the whole HEIC). sharp can't make HEIC
  thumbnails, so HEIC tiles always take that path for now.
- Navigation, catalogs, Export, Captions as in local.html (shared `ui/folder-browser.ts`); state in
  the hash, so links to a folder/photo work for anyone. Paths are checked (`lib/web/paths.ts`):
  no `..`, absolute or scheme paths; only images and listed catalogs are reachable.
- Can run the tools on the server (needs Node + `npm install` in utils/, network for place names)
  or on a Mac against a copy, then rsync. ~2.1 MB page (HEIC decoder); nginx `gzip` brings it to ~0.7 MB.

## Region selections (photo view, all apps)

- Catalog column `urn` (optional): the image's CITE2 URN; shown in Export (.cex) when used.
- Select button in the zoom bar (or Shift-drag anytime) draws boxes; in select mode click a box
  to make it current, drag to move, corner handles to resize, Delete removes, Esc leaves select
  mode. Boxes are fractions of the full image (`lib/roi.ts`), redrawn on every zoom/pan
  (`ui/roi-layer.ts`, ZoomViewer `onViewChange`/`claimPointer`/`state`/`localPoint`).
- Info panel lists `x,y,w,h` (4 decimals) and `<urn>@x,y,w,h` (existing `@…` replaced), with
  Copy, Download (.txt, URNs), Copy all (URNs if the photo has a urn, else x,y,w,h; one per line), Clear all.
- Kept while the page is open (module-level map keyed by urn/url/path, across catalogs);
  the open photo's boxes are in the hash as `roi=x,y,w,h;x,y,w,h` (shareable). Grid button
  "Export selections (n)" downloads every URN from this session (photos without a urn as
  `// path@x,y,w,h` comments). Not saved in the browser, by design.
