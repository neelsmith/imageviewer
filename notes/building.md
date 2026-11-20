# Building the apps

```sh
cd src
cp site.config.example.json site.config.json   # once per machine; fill in the URLs
npm install
npm test && npm run typecheck                  # optional checks
npm run build
```

`npm run build` makes ten self-contained pages in `src/dist/` (each app, plus a
`*-slideshow.html` slide-show version of it that goes in the same place):

| Page | Goes to |
|---|---|
| `catalogs.html`, `private.html`, `private-catalogs.html` (+ their `-slideshow` pages) | `docs/` (GitHub Pages) |
| `www-browse.html`, `www-browse-slideshow.html` | the web server, next to the images and their `images.cex` |
| `local-image-viewer.html`, `local-slideshow.html` | release downloads; opened from disk |

- Each page is a separate Vite build (`--mode private`, `private-catalogs`, `www-browse`,
  `local-folders`, `slideshow-catalogs`, `slideshow-private`, `slideshow-private-catalogs`,
  `slideshow-www-browse`, `slideshow-local`); the plain `vite build` (catalogs.html) runs first
  and empties `dist/`.
- URLs from `site.config.json` and the version from `package.json` are baked in, so
  rebuild after changing either. Data changes need no rebuild.
- `npm run dev` serves all five at http://localhost:5173/ using the local `../data/`.
- Releasing (version bump, `check-release`, tag): see `development.md` → Releases.
