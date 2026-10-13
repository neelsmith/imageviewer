import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { inlineAll } from "./build/inline-all";
import { serveData } from "./build/serve-data";

// The app version lives in package.json ("version") and is baked into both pages.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Two single-file apps, built one at a time so each is fully self-contained:
//   vite build                → dist/index.html    (catalog chooser, cataloged images only)
//   vite build --mode private → dist/private.html  (all images, password screen)
// In `npm run dev` both are served: / and /private.html.
export default defineConfig(({ mode, command }) => {
  const isPrivate = mode === "private";
  return {
    plugins: [inlineAll(), serveData("../data")],
    define: {
      __APP_VERSION__: JSON.stringify(command === "serve" ? `${version}-dev` : version),
    },
    build: {
      outDir: "dist",
      emptyOutDir: !isPrivate, // second build must not delete index.html
      rollupOptions: { input: isPrivate ? "private.html" : "index.html" },
    },
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.ts"],
    },
  };
});
