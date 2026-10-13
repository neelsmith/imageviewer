import { defineConfig } from "vitest/config";
import { inlineAll } from "./build/inline-all";
import { serveData } from "./build/serve-data";

// Two single-file apps, built one at a time so each is fully self-contained:
//   vite build                 → dist/index.html     (all images, password screen)
//   vite build --mode catalogs → dist/catalogs.html  (catalog chooser, cataloged images only)
// In `npm run dev` both are served: /index.html and /catalogs.html.
export default defineConfig(({ mode }) => {
  const catalogs = mode === "catalogs";
  return {
    plugins: [inlineAll(), serveData("../data")],
    build: {
      outDir: "dist",
      emptyOutDir: !catalogs, // second build must not delete index.html
      rollupOptions: { input: catalogs ? "catalogs.html" : "index.html" },
    },
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.ts"],
    },
  };
});
