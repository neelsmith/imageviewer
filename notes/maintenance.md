# Routine maintenance

Neither task needs a rebuild or a release. The apps read `data/` from GitHub's `main` branch
(or `?branch=…`); changes appear within ~5 minutes of pushing. Preview locally with
`cd src && npm run dev`.

## Updating a catalog

1. Edit the `.cex` file in `data/`. `path` values are relative to the pCloud Public Folder,
   exactly as in `data/images.cex`.
2. New catalog file? Also add a row to `data/catalog_of_catalogs.cex` (`cex_file` relative to
   the repo root, e.g. `data/catalogs/new.cex`).
3. Commit and push to `main`.

## Adding images to pCloud

1. Copy the images into `~/pCloud Drive/Public Folder` and let them sync.
2. `cd utils && npm run images-index && npm run thumbnails`
3. Commit `data/images.cex` and `utils/geocache.json`, then push to `main`.
   (Thumbnails go to `Public Folder/_thumbs/` via pCloud sync — nothing to commit.)
4. Optionally catalog them (above). HEIC images won't display in Chrome or Firefox.

## Renaming or removing images

1. Rename/move/delete in `~/pCloud Drive/Public Folder` and let pCloud sync.
2. Update any catalog rows that use the old path (`path` must match `data/images.cex`).
3. `cd utils && npm run images-index && npm run thumbnails` (new names get thumbnails).
4. `npm run cull-thumbnails` lists thumbnails whose image is gone; check the list, then
   `npm run cull-thumbnails -- --delete` removes them (and any `_thumbs/` folders left empty).
   It refuses to delete anything if it finds no images at all (wrong `--root`, pCloud not mounted).
5. Commit `data/images.cex` (and catalog changes), push to `main`.
