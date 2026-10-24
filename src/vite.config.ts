import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { inlineAll } from "./build/inline-all.ts";
import { serveData } from "./build/serve-data.ts";
import { loadSiteConfig, publicSiteConfig } from "./build/site-config.ts";
import { appIcons } from "./build/icons.ts";

// The app version lives in package.json ("version") and is baked into both pages.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Five single-file apps, built one at a time so each is fully self-contained:
//   vite build                         → dist/catalogs.html         (catalog chooser, cataloged images only)
//   vite build --mode private          → dist/private.html          (all images, password screen)
//   vite build --mode private-catalogs → dist/private-catalogs.html (chooser for
//                                         catalog_of_private_catalogs.cex, password per catalog)
//   vite build --mode www-browse       → dist/www-browse.html       (web server: folder below the page)
//   vite build --mode local-folders    → dist/local-image-viewer.html (local folders; open from disk)
// In `npm run dev` all are served: /catalogs.html, /private.html, /private-catalogs.html,
// /www-browse.html and /local-image-viewer.html.
const FIRST = "catalogs.html"; // built first, so it empties dist/
const ENTRIES: Record<string, string> = {
  private: "private.html", "private-catalogs": "private-catalogs.html",
  "www-browse": "www-browse.html", // web server: browse the folder below the page (needs images.cex)
  "local-folders": "local-image-viewer.html", // opened from disk only ("local" is reserved by Vite); carries the HEIC decoder (~2 MB)
};

export default defineConfig(({ mode, command }) => {
  const entry = ENTRIES[mode] ?? FIRST;
  // Site URLs come from site.config.json (gitignored). Tests use the committed example.
  const testing = !!process.env.VITEST;
  const site = loadSiteConfig(
    fileURLToPath(new URL(testing ? "./site.config.example.json" : "./site.config.json", import.meta.url)),
    { allowPlaceholders: testing },
  );
  return {
    plugins: [inlineAll(), serveData("../data"),
      appIcons("local-image-viewer.html", fileURLToPath(new URL("./icons/local", import.meta.url)))],
    define: {
      __APP_VERSION__: JSON.stringify(command === "serve" ? `${version}-dev` : version),
      __SITE_CONFIG__: JSON.stringify(publicSiteConfig(site)),
    },
    build: {
      outDir: "dist",
      emptyOutDir: entry === FIRST, // later builds must not delete earlier pages
      rollupOptions: { input: entry },
    },
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.ts"],
    },
  };
});
