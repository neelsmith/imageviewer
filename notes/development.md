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
npm run dev          # http://localhost:5173 (+ /private.html, /private-catalogs.html) — reads ../data/ from the local repo
npm test             # Vitest unit tests (lib/)
npm run typecheck
npm run build        # → src/dist/index.html, private.html, private-catalogs.html, each self-contained
```

URL options: `?branch=<name>` (data from that branch of the GitHub repo, default `main`),
`?data=<dir URL>`, `?images=<base URL>`, `#group=date|location|tag`.
Hash keys (combine with `&`): `catalog=<cex_file>` (index.html), `all=1` (private.html),
`photo=<path>` — opens that photo, e.g. `index.html#catalog=data%2Fcatalogs%2Fmss.cex&photo=leiden-pliny%2FIMG_1203.jpeg`.

Single-photo view zoom: `lib/zoom.ts` (pure math, tested) + `ui/zoom-viewer.ts` (wheel/trackpad
pinch incl. Safari gesture events, drag, touch pinch/swipe/double-tap, dblclick, +/−/0 keys,
on-screen controls). Zoom range: fit … 400% of natural size; resets on each new photo.

Code layout: `build/inline-all.ts` Vite plugin that inlines JS/CSS into index.html; `lib/` pure, tested data functions (cex parser, catalog, images index, merge,
grouping, config); `ui/` DOM code (`load.ts` fetches data, `app.ts` grid + lightbox).

## Two apps

| Page | Data | Password |
|---|---|---|
| `index.html` (source `src/index.html`, `main-catalogs.ts`) | menu from `data/catalog_of_catalogs.cex` → chosen catalog, cataloged images only | no |
| `private.html` (source `src/private.html`, `main-private.ts`) | `data/catalog.cex` + every image in `data/images.cex`; "Cataloged images only" toggle (default on; off = `#all=1`) | yes (if set) |
| `private-catalogs.html` (source `src/private-catalogs.html`, `main-private-catalogs.ts`) | menu from `data/catalog_of_private_catalogs.cex`; the chosen catalog's images (same view as index.html) | per catalog, from the list's optional `password` column |

Dev URLs: http://localhost:5173/, /private.html and /private-catalogs.html
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
cd ../src && npm run build              # the hash is baked into index.html
cd ../utils && npm run set-password -- --off   # remove it
```

It's a deterrent only: the data (GitHub) and images (pCloud) remain public.

## Releases

The app version is `"version"` in `src/package.json` (single source of truth). The build
bakes it into both pages, shown as a small "vX.Y.Z" link to the GitHub release; `npm run dev`
shows "vX.Y.Z-dev". Data updates (catalogs, images.cex) are not releases.

1. Bump `"version"` in `src/package.json`; add notes to `releases.md` (Neel's file).
2. `cd src && npm run build`, copy `dist/index.html`, `dist/private.html` and `dist/private-catalogs.html` to `docs/`.
3. `cd ../utils && npm run check-release` (tag defaults to v + package.json version) — checks tag format, match with
   package.json, tag not already used, and that docs/index.html embeds this version
   (private.html and private-catalogs.html aren't checked — they may live anywhere under docs/).
4. Commit, then `git tag -a vX.Y.Z -m "Release vX.Y.Z"` and `git push --follow-tags`.
5. Optional: GitHub → Releases → draft from the tag, attach the two HTML files.
