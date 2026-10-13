# Development guide

## Web app (`src/`)

```sh
cd src
npm install
npm run dev          # http://localhost:5173 — reads ../data/ from the local repo
npm test             # Vitest unit tests (lib/)
npm run typecheck
npm run build        # → src/dist/index.html, one self-contained file
```

URL options: `?branch=<name>` (data from that branch of the GitHub repo, default `main`),
`?data=<dir URL>`, `?images=<base URL>`, `#group=date|location|tag`.

Code layout: `build/inline-all.ts` Vite plugin that inlines JS/CSS into index.html; `lib/` pure, tested data functions (cex parser, catalog, images index, merge,
grouping, config); `ui/` DOM code (`load.ts` fetches data, `app.ts` grid + lightbox).

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

Only new files are read on reruns. Place names come from OpenStreetMap Nominatim
(≤1 request/s) and are cached in `utils/geocache.json` — commit it.

## Not yet done

- Playwright tests for UI flows (a manual Playwright smoke test passed on 2026-10-13:
  grouping, filter, lightbox keys, file:// error state).
- Justified rows using width/height, virtualised grid for large collections,
  date scrubber, deep link to a photo, nicer missing-image state in the lightbox.
