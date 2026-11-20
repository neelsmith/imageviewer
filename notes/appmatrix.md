# Which apps work with which image sources

| App | pCloud Public Folder | Local file system | www server |
|---|:-:|:-:|:-:|
| `catalogs.html` | ✓ | – | ✓¹ |
| `private.html` | ✓ | – | ✓¹ |
| `private-catalogs.html` | ✓ | – | ✓¹ |
| `www-browse.html` | – | – | ✓² |
| `local-image-viewer.html` | ✓³ | ✓ | – |

1. Images come from one base URL (`imageBase`, default the pCloud Public Folder). Any static
   server works: set `imageBase` at build time, or add `?images=<base URL>` to the page URL.
   Catalogs and `images.cex` always come from `data/` in the repo (`dataBase`).
2. The page sits on the server above the image folders, with `images.cex` (and `catalogs.cex`)
   next to it, made by `npm run images-index -- … --catalogs`. Catalogs live in the image folders.
3. Via the locally synced `~/pCloud Drive/Public Folder`, opened like any local folder.

Each app's slide-show page (`*-slideshow.html`) works with the same sources as the app.
