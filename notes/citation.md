# Citing images by URN

1. **Name the image.** Give it a CITE2 URN, e.g. `urn:cite2:ns:img.v1:IMG_0042`
   (namespace, collection and version, then an object id unique within the collection).
   Treat it as permanent: the URN stays the same if the file moves.
2. **Record it.** Put the URN in the optional `urn` column of the catalog `.cex`:
   `path|caption|credits|license|tags|year|place|urn`. If a file moves, update its
   `path`; the URN doesn't change.
3. **Cite a region.** Add `@x,y,w,h` (fractions of the full image, 0–1), e.g.
   `urn:cite2:ns:img.v1:IMG_0042@0.1,0.2,0.3,0.25`. In photo view, Select (or Shift-drag)
   draws a box; the info panel's Copy/Download/Copy all, or Export selections, give the URNs.
4. **Link to it.** `<app page>#urn=<urn>[@x,y,w,h]` opens the image and draws the region in
   any app (catalogs.html, private*.html, www-browse.html, local-image-viewer.html).
   The info panel's "Copy link" and each selection's "Link" build these for you.
   The app searches the catalogs for the URN when opened, so there's no index to rebuild.

A citation is just the URN. The `#urn=` link is a convenience for resolving it, and it
depends on where the page is hosted.
