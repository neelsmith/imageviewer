import type { Plugin } from "vite";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/**
 * Dev server only: serve the repo's data/ directory at /data/ so `npm run dev`
 * shows local, uncommitted edits to catalog.cex and images.cex.
 */
export function serveData(dataDir: string): Plugin {
  const root = resolve(dataDir);
  return {
    name: "imageviewer:serve-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", async (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
        const file = resolve(join(root, name));
        if (!name || !file.startsWith(root + sep)) return next();
        try {
          const body = await readFile(file);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end("not found");
        }
      });
    },
  };
}
