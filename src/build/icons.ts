import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin, HtmlTagDescriptor } from "vite";

/** Icons inlined into the page as data: URLs (made by `npm run icons` in utils/). */
const ICONS: { file: string; rel: string; sizes: string }[] = [
  { file: "icon-16.png", rel: "icon", sizes: "16x16" },
  { file: "icon-32.png", rel: "icon", sizes: "32x32" },
  { file: "icon-48.png", rel: "icon", sizes: "48x48" },
  { file: "icon-192.png", rel: "icon", sizes: "192x192" },
  { file: "apple-touch-icon-180.png", rel: "apple-touch-icon", sizes: "180x180" },
];

/**
 * Add icon <link>s with the PNGs inlined (so the single-file page keeps working from disk)
 * to one page, e.g. local-image-viewer.html. Missing files are skipped with a warning.
 */
export function appIcons(page: string, dir: string): Plugin {
  return {
    name: "imageviewer:app-icons",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.filename.endsWith(page)) return;
        const tags: HtmlTagDescriptor[] = [];
        for (const icon of ICONS) {
          const f = join(dir, icon.file);
          if (!existsSync(f)) { console.warn(`[app-icons] missing ${f} — run "npm run icons" in utils/`); continue; }
          const href = `data:image/png;base64,${readFileSync(f).toString("base64")}`;
          tags.push({ tag: "link", attrs: { rel: icon.rel, type: "image/png", sizes: icon.sizes, href }, injectTo: "head" });
        }
        return tags;
      },
    },
  };
}
