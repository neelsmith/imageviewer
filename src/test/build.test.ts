// @vitest-environment node
import { describe, it, expect } from "vitest";
import { build } from "vite";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("production build", () => {
  it("emits exactly one self-contained index.html", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "iv-build-"));
    await build({
      root: resolve(__dirname, ".."),
      configFile: resolve(__dirname, "../vite.config.ts"),
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });
    expect(await readdir(outDir)).toEqual(["index.html"]);
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/);
    expect(html).not.toMatch(/<link\b[^>]*rel="stylesheet"/);
    expect(html).toMatch(/<script type="module">[\s\S]*Filter photos[\s\S]*<\/script>/);
    expect(html).toMatch(/<style>[\s\S]*\.lightbox/);
  }, 60_000);
});
