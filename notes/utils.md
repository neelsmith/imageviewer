# Utilities (`utils/`)

Node scripts run from `utils/` (`npm install` once; `npm test` runs their tests).
`--root` defaults to `localImageRoot` in `src/site.config.json` (the pCloud Public Folder).
Each script's header comment gives full usage.

| Command | Does |
|---|---|
| `npm run images-index` | Scans the image folder and writes `data/images.cex` (date, GPS, place names via Nominatim cached in `geocache.json`, size). Only new files are read unless `--refresh`. `--root/--out … --catalogs` makes `images.cex` + `catalogs.cex` for a www-browse folder. |
| `npm run thumbnails` | Writes ~400 px JPEG thumbnails to `<root>/_thumbs/`; skips up-to-date ones. |
| `npm run cull-thumbnails` | Lists thumbnails whose image is gone; `--delete` removes them. |
| `npm run merge-catalogs -- <root>` | Combines every `catalog.cex` below `<root>` into `<root>/catalog.cex`, paths made relative to `<root>` (`A/catalog.cex`'s `A1.jpg` → `A/A1.jpg`). Columns matched by name; duplicates and paths leaving their folder are skipped with a warning. Replaces its own earlier output; won't overwrite a hand-made root catalog without `--force`. `--out FILE`, `--dry-run`. The folder apps open the top folder's `catalog.cex` by default; for www-browse, rerun `images-index --catalogs` once so `catalogs.cex` lists it. |
| `npm run set-password` | Sets/removes the private.html password (`src/auth.json`); rebuild after. |
| `npm run catalog-password -- <cex_file>` | Sets/removes one catalog's password in `catalog_of_private_catalogs.cex` (`--list` for another list); no rebuild. |
| `npm run check-release` | Pre-tag check: version/tag match, tag unused, `docs/catalogs.html` built from that version. |
| `npm run icons` | Makes local-image-viewer.html's icons from `src/icons/imageviewer.png` into `src/icons/local/`. |
