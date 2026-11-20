// @vitest-environment node
import { describe, it, expect } from "vitest";
import { build } from "vite";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pkg from "../package.json";

const selfContained = (html: string) => {
  expect(html).not.toMatch(/<script\b[^>]*\bsrc=/);
  expect(html).not.toMatch(/<link\b[^>]*rel="stylesheet"/);
  expect(html).toMatch(/<script type="module">[\s\S]*Filter photos[\s\S]*<\/script>/);
  expect(html).toMatch(/<style>[\s\S]*\.lightbox/);
};

describe("production build", () => {
  it("emits ten self-contained pages: the five apps and a slide-show page for each", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "iv-build-"));
    const common = { root: resolve(__dirname, ".."), configFile: resolve(__dirname, "../vite.config.ts"),
      logLevel: "silent" as const };
    await build({ ...common, build: { outDir, emptyOutDir: true } });
    await build({ ...common, mode: "private", build: { outDir, emptyOutDir: false } });
    await build({ ...common, mode: "private-catalogs", build: { outDir, emptyOutDir: false } });
    await build({ ...common, mode: "www-browse", build: { outDir, emptyOutDir: false } });
    await build({ ...common, mode: "local-folders", build: { outDir, emptyOutDir: false } });
    for (const mode of ["slideshow-catalogs", "slideshow-private", "slideshow-private-catalogs", "slideshow-www-browse", "slideshow-local"])
      await build({ ...common, mode, build: { outDir, emptyOutDir: false } });
    expect((await readdir(outDir)).sort()).toEqual([
      "catalogs-slideshow.html", "catalogs.html", "local-image-viewer.html", "local-slideshow.html",
      "private-catalogs-slideshow.html", "private-catalogs.html", "private-slideshow.html", "private.html",
      "www-browse-slideshow.html", "www-browse.html"]);

    const priv = await readFile(join(outDir, "private.html"), "utf8");
    selfContained(priv);
    expect(priv).toContain("Remember on this device");
    expect(priv).not.toContain("catalog_of_catalogs.cex");

    const index = await readFile(join(outDir, "catalogs.html"), "utf8");
    selfContained(index);
    expect(index).toContain("catalog_of_catalogs.cex");
    expect(index).not.toContain("catalog_of_private_catalogs.cex");

    const pc = await readFile(join(outDir, "private-catalogs.html"), "utf8");
    selfContained(pc);
    expect(pc).toContain("catalog_of_private_catalogs.cex");

    const local = await readFile(join(outDir, "local-image-viewer.html"), "utf8");
    selfContained(local);
    expect(local).toContain("_heif_context_alloc"); // the HEIC decoder is inside
    expect(local).toContain("Choose a folder");
    // App icons (src/icons/local, made by utils/make-icons.mjs) are inlined into local-image-viewer.html only.
    for (const sizes of ["16x16", "32x32", "48x48", "192x192"])
      expect(local).toMatch(new RegExp(`<link[^>]*rel="icon"[^>]*sizes="${sizes}"[^>]*href="data:image/png;base64,`));
    expect(local).toMatch(/<link[^>]*rel="apple-touch-icon"[^>]*href="data:image\/png;base64,/);
    for (const html of [index, priv, pc]) expect(html).not.toContain('rel="apple-touch-icon"');
    // The decoder (~2 MB) is only in local-image-viewer.html.
    for (const html of [index, priv, pc]) expect(html).not.toContain("_heif_context_alloc");
    expect(local.length).toBeGreaterThan(1_500_000);

    const browse = await readFile(join(outDir, "www-browse.html"), "utf8");
    selfContained(browse);
    expect(browse).toContain("images.cex");
    expect(browse).toContain("_heif_context_alloc"); // decoder for HEIC in the photo view

    // Slide-show pages: the slide show inside, each with its app's data source.
    const show = async (name: string) => {
      const html = await readFile(join(outDir, name), "utf8");
      expect(html).not.toMatch(/<script\b[^>]*\bsrc=/);
      expect(html).toMatch(/<script type="module">[\s\S]*Seconds per slide[\s\S]*<\/script>/);
      expect(html).toMatch(/<style>[\s\S]*\.slide-stage/);
      return html;
    };
    const sCat = await show("catalogs-slideshow.html");
    expect(sCat).toContain("catalog_of_catalogs.cex");
    const sPriv = await show("private-slideshow.html");
    expect(sPriv).toContain("Remember on this device");
    const sPc = await show("private-catalogs-slideshow.html");
    expect(sPc).toContain("catalog_of_private_catalogs.cex");
    const sBrowse = await show("www-browse-slideshow.html");
    expect(sBrowse).toContain("images.cex");
    expect(sBrowse).toContain("_heif_context_alloc");
    const sLocal = await show("local-slideshow.html");
    expect(sLocal).toContain("_heif_context_alloc");
    expect(sLocal).toContain("Choose a folder");
    expect(sLocal).toMatch(/<link[^>]*rel="apple-touch-icon"[^>]*href="data:image\/png;base64,/);
    for (const html of [sCat, sPriv, sPc]) expect(html).not.toContain("_heif_context_alloc");

    // Release version (no "-dev") is baked into every page.
    for (const html of [index, priv, pc, local, browse, sCat, sPriv, sPc, sBrowse, sLocal]) {
      // The minifier may quote it with ", ' or `.
      expect(html).toMatch(new RegExp(`["'\`]${pkg.version.replace(/\./g, "\\.")}["'\`]`));
      expect(html).not.toContain(`${pkg.version}-dev`);
    }
  }, 180_000);
});
