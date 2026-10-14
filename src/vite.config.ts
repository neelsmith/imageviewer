import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { inlineAll } from "./build/inline-all";
import { serveData } from "./build/serve-data";
import { loadSiteConfig, publicSiteConfig } from "./build/site-config";

// The app version lives in package.json ("version") and is baked into both pages.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Three single-file apps, built one at a time so each is fully self-contained:
//   vite build                         → dist/index.html            (catalog chooser, cataloged images only)
//   vite build --mode private          → dist/private.html          (all images, password screen)
//   vite build --mode private-catalogs → dist/private-catalogs.html (chooser for
//                                         catalog_of_private_catalogs.cex, password per catalog)
// In `npm run dev` all are served: /, /private.html and /private-catalogs.html.
const ENTRIES: Record<string, string> = { private: "private.html", "private-catalogs": "private-catalogs.html" };

export default defineConfig(({ mode, command }) => {
  const entry = ENTRIES[mode] ?? "index.html";
  // Site URLs come from site.config.json (gitignored). Tests use the committed example.
  const testing = !!process.env.VITEST;
  const site = loadSiteConfig(
    fileURLToPath(new URL(testing ? "./site.config.example.json" : "./site.config.json", import.meta.url)),
    { allowPlaceholders: testing },
  );
  return {
    plugins: [inlineAll(), serveData("../data")],
    define: {
      __APP_VERSION__: JSON.stringify(command === "serve" ? `${version}-dev` : version),
      __SITE_CONFIG__: JSON.stringify(publicSiteConfig(site)),
    },
    build: {
      outDir: "dist",
      emptyOutDir: entry === "index.html", // later builds must not delete earlier pages
      rollupOptions: { input: entry },
    },
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.ts"],
    },
  };
});
