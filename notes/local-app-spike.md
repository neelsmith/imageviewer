# local.html — feasibility spike (2026-10-14)

Goal: a single-file app opened from disk (not deployed) that browses a local folder tree in
the same grid + photo view, with catalog (.cex) support and browser-independent HEIC.

## Test material

`scratch/` (gitignored): 98 HEIC (avg 2.7 MB, iPhone, 3024×4032), 1 JPG, 5 MOV.

## Results so far

HEIC decoder: **libheif-js 1.23.5** (LGPL-3.0), `libheif-wasm/libheif-bundle.js` = libheif
compiled to WebAssembly with the binary inlined: 2.0 MB raw / 0.7 MB gzipped.

| Measurement | Where | Result |
|---|---|---|
| Embedded HEIC thumbnail present | Node, all 98 files | 93 of 98 (84 × 240×320, 9 × 320×240); missing on edited/cropped photos |
| Embedded thumbnail decode | Node on Neel's Mac (VM) | 2–4 ms each |
| Full 12 MP software decode | Node on Neel's Mac (VM) | 390–570 ms |
| Full 12 MP software decode | headless Chromium, 2 slow cloud cores | 630–1150 ms |
| Worker built from inline code + libheif, page opened from file:// | headless Chromium 141 | works; decoder start-up 42 ms |
| Grid tiles via embedded thumbnail (4 files, incl. reading files) | headless Chromium | 122 ms total, correctly oriented |
| Browser's own HEIC decode | headless Chromium | not supported (as expected) |
| file:// is a secure context; folder picker API present | headless Chromium | yes / yes |

Notes:
- libheif's bundle compiles WebAssembly synchronously; Chrome forbids that on the main
  thread for modules > 4 KB, so decoding **must** run in a worker (planned anyway).
- Embedded thumbnails are small (240×320): slightly soft on high-DPI tiles. Photos without
  one (edited/cropped) need a full decode + downscale (~0.5 s each, in background).
- Only Chromium is available here; Safari and Firefox need Neel's machine.

## Safari 26.5 on Neel's Mac (8 threads), 99 images in 7 folders

| Measurement | Result |
|---|---|
| Folder picker | not available (expected) |
| Upload-style folder control | works; listed 99 images / 7 folders in 1 ms |
| Worker + libheif from file:// | works; start-up 23 ms |
| Native HEIC (createImageBitmap) | yes: first 97 ms, then avg 61 ms per full 12 MP photo |
| Tiles via embedded thumbnail (24 files) | 139 ms total, avg 5 ms each |
| Full software decode | 220–440 ms |

Decisions this supports:
- Tiles: embedded HEIC thumbnail via libheif in every browser (fast, low memory); full decode
  + downscale in the worker for the few without one.
- Photo view: browser's own decoder when it supports HEIC (Safari, ~60 ms), else libheif in
  the worker (~0.2–0.5 s on this Mac).
- Folder access: picker where available (Chrome/Edge), upload-style control + drag-and-drop
  otherwise. Still to confirm: Chrome on the Mac (picker), Firefox.

## Spike page for Neel

`scratch/local-spike.html` (2 MB, generated; not in git). Open it from disk in Safari,
Chrome and Firefox; choose/drop a folder of HEIC photos; "Copy results"; paste back.
It reports: folder-access methods available, native HEIC support + speed, embedded-thumbnail
use + speed, full software decode speed, and shows the tiles.
