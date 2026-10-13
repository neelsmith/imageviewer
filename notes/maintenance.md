# Routine maintenance

None of these tasks needs a rebuild or a release, except changing the `private.html` password. The apps read `data/` from GitHub's `main` branch
(or `?branch=…`); changes appear within ~5 minutes of pushing. Preview locally with
`cd src && npm run dev`.

**Data "last updated" date:** when you update catalogs or images, set the date in
`data/last-updated.txt` by hand (one line, `YYYY-MM-DD`, e.g. `2026-10-13`; `//` or `#` lines
are ignored) and commit it with the data. All three apps show it next to the app version as
"v1.5.0 · data updated Oct 13, 2026". No file, or not a valid date → only the app version shows.

## Updating a catalog

1. Edit the `.cex` file in `data/`. `path` values are relative to the pCloud Public Folder,
   exactly as in `data/images.cex`.
   Columns: `path|caption|credits|license|tags`, plus optional `year` and `place` (any order;
   tags comma-separated). When a catalog has `year`/`place` values, both apps show Year and
   Place drop-downs (exact match; choice kept in the URL as `year=` / `place=`).
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

## Private catalogs (private-catalogs.html)

1. Put the catalog file anywhere under `data/` (e.g. `data/private/brunswick.cex`, same format
   as other catalogs) and add a row to `data/catalog_of_private_catalogs.cex`: `cex_file|label`.
2. Password: `cd utils && npm run catalog-password -- data/private/brunswick.cex`
   (prompts twice; writes a salted hash into the list's `password` column, adding the column
   if needed). `-- <cex_file> --off` removes it. A blank cell = no password.
3. Commit and push the list (and the catalog). No rebuild or release needed.
   Changing a password logs out devices that remembered the old one; "Lock" in the app
   forgets it on that device.
4. A "keep out" sign only: the catalog files and images are public (anyone can read them on
   GitHub), so don't put anything here that must stay secret.

## Changing the private.html password

`cd utils && npm run set-password` (prompts twice; `-- --off` removes the password screen), then
rebuild (`cd ../src && npm run build`) and replace your copy of `private.html` under `docs/`
with `dist/private.html`. The hash is baked into the page, so commit `src/auth.json` and the new page,
and push. Devices that remembered the old password are logged out.
