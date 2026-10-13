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
