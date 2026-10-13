// @vitest-environment node
import { describe, it, expect } from "vitest";
import { build } from "vite";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const selfContained = (html: string) => {
  expect(html).not.toMatch(/<script\b[^>]*\bsrc=/);
  expect(html).not.toMatch(/<link\b[^>]*rel="stylesheet"/);
  expect(html).toMatch(/<script type="module">[\s\S]*Filter photos[\s\S]*<\/script>/);
  expect(html).toMatch(/<style>[\s\S]*\.lightbox/);
};

describe("production build", () => {
  it("emits two self-contained pages: index.html (password) and catalogs.html (no password)", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "iv-build-"));
    const common = { root: resolve(__dirname, ".."), configFile: resolve(__dirname, "../vite.config.ts"),
      logLevel: "silent" as const };
    await build({ ...common, build: { outDir, emptyOutDir: true } });
    await build({ ...common, mode: "catalogs", build: { outDir, emptyOutDir: false } });
    expect((await readdir(outDir)).sort()).toEqual(["catalogs.html", "index.html"]);

    const index = await readFile(join(outDir, "index.html"), "utf8");
    selfContained(index);
    expect(index).toContain("Remember on this device");
    expect(index).not.toContain("catalog_of_catalogs.cex");

    const catalogs = await readFile(join(outDir, "catalogs.html"), "utf8");
    selfContained(catalogs);
    expect(catalogs).toContain("catalog_of_catalogs.cex");
    expect(catalogs).not.toContain("Remember on this device");
  }, 60_000);
});
