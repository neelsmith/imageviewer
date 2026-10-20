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
  it("emits four self-contained pages: index.html, family.html, private-catalogs.html, local.html", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "iv-build-"));
    const common = { root: resolve(__dirname, ".."), configFile: resolve(__dirname, "../vite.config.ts"),
      logLevel: "silent" as const };
    await build({ ...common, build: { outDir, emptyOutDir: true } });
    await build({ ...common, mode: "family", build: { outDir, emptyOutDir: false } });
    await build({ ...common, mode: "private-catalogs", build: { outDir, emptyOutDir: false } });
    await build({ ...common, mode: "local-folders", build: { outDir, emptyOutDir: false } });
    expect((await readdir(outDir)).sort()).toEqual(["family.html", "index.html", "local.html", "private-catalogs.html"]);

    const priv = await readFile(join(outDir, "family.html"), "utf8");
    selfContained(priv);
    expect(priv).toContain("Remember on this device");
    expect(priv).not.toContain("catalog_of_catalogs.cex");

    const index = await readFile(join(outDir, "index.html"), "utf8");
    selfContained(index);
    expect(index).toContain("catalog_of_catalogs.cex");
    expect(index).not.toContain("catalog_of_private_catalogs.cex");

    const pc = await readFile(join(outDir, "private-catalogs.html"), "utf8");
    selfContained(pc);
    expect(pc).toContain("catalog_of_private_catalogs.cex");

    const local = await readFile(join(outDir, "local.html"), "utf8");
    selfContained(local);
    expect(local).toContain("_heif_context_alloc"); // the HEIC decoder is inside
    expect(local).toContain("Choose a folder");
    // The decoder (~2 MB) is only in local.html.
    for (const html of [index, priv, pc]) expect(html).not.toContain("_heif_context_alloc");
    expect(local.length).toBeGreaterThan(1_500_000);

    // Release version (no "-dev") is baked into every page.
    for (const html of [index, priv, pc, local]) {
      // The minifier may quote it with ", ' or `.
      expect(html).toMatch(new RegExp(`["'\`]${pkg.version.replace(/\./g, "\\.")}["'\`]`));
      expect(html).not.toContain(`${pkg.version}-dev`);
    }
  }, 120_000);
});
