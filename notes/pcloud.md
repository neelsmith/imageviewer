# Sharing images from pCloud

- Put files in `~/pCloud Drive/Public Folder` and let pCloud sync them.
- Each file then has a static public URL:
  `https://filedn.com/ldIRRzyYNhLyfSxf2i1xC0B/<path within Public Folder>`
  e.g. `Public Folder/trips/rome/IMG_1.jpg` → `…/trips/rome/IMG_1.jpg`.
  URL-encode spaces and special characters (`%20` etc.).
- Use these URLs directly in `<img src>`, Markdown or links. Ordinary pCloud
  "share links" open a download page, not the image, so don't use them for embedding.
- Anyone with a URL can open the file: there is no access control.
- filedn.com sends no CORS header, so browser `fetch()` of image bytes from
  another origin fails (`<img>` is fine). EXIF etc. is read locally by `utils/`.
- Moving or renaming a file changes its URL; update the catalogs (see `maintenance.md`).
