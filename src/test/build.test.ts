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
  it("emits three self-contained pages: index.html, private.html, private-catalogs.html", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "iv-build-"));
    const common = { root: resolve(__dirname, ".."), configFile: resolve(__dirname, "../vite.config.ts"),
      logLevel: "silent" as const };
    await build({ ...common, build: { outDir, emptyOutDir: true } });
    await build({ ...common, mode: "private", build: { outDir, emptyOutDir: false } });
    await build({ ...common, mode: "private-catalogs", build: { outDir, emptyOutDir: false } });
    expect((await readdir(outDir)).sort()).toEqual(["index.html", "private-catalogs.html", "private.html"]);

    const priv = await readFile(join(outDir, "private.html"), "utf8");
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

    // Release version (no "-dev") is baked into both pages.
    for (const html of [index, priv, pc]) {
      // The minifier may quote it with ", ' or `.
      expect(html).toMatch(new RegExp(`["'\`]${pkg.version.replace(/\./g, "\\.")}["'\`]`));
      expect(html).not.toContain(`${pkg.version}-dev`);
    }
  }, 60_000);
});
