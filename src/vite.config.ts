import { defineConfig } from "vitest/config";
import { inlineAll } from "./build/inline-all";
import { serveData } from "./build/serve-data";

// Everything (JS + CSS) is inlined into dist/index.html so the app is one file
// that works from file:// or any static web server.
export default defineConfig({
  plugins: [inlineAll(), serveData("../data")],
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
