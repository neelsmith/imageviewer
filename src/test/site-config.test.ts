// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSiteConfig, loadSiteConfig, publicSiteConfig } from "../build/site-config";

const good = {
  imageBase: "https://filedn.com/abc", dataBase: "https://raw.githubusercontent.com/u/r/main/data",
  repoUrl: "https://github.com/u/r/", localImageRoot: "~/pCloud Drive/Public Folder",
};

describe("site config", () => {
  it("normalizes slashes and keeps optional fields", () => {
    expect(parseSiteConfig(JSON.stringify(good), "x")).toEqual({
      imageBase: "https://filedn.com/abc/", dataBase: "https://raw.githubusercontent.com/u/r/main/data/",
      repoUrl: "https://github.com/u/r", localImageRoot: "~/pCloud Drive/Public Folder",
    });
  });
  it("repoUrl and localImageRoot are optional", () => {
    const c = parseSiteConfig(JSON.stringify({ imageBase: good.imageBase, dataBase: good.dataBase }), "x");
    expect(c.repoUrl).toBeUndefined();
    expect(publicSiteConfig(c)).toEqual({ imageBase: "https://filedn.com/abc/", dataBase: good.dataBase + "/" });
  });
  it("never bakes the local path into the pages", () => {
    expect(publicSiteConfig(parseSiteConfig(JSON.stringify(good), "x"))).not.toHaveProperty("localImageRoot");
  });
  it("reports every problem at once", () => {
    expect(() => parseSiteConfig(JSON.stringify({ imageBase: "filedn.com", repoUrl: 3 }), "site.config.json"))
      .toThrow(/"imageBase" must be an http\(s\) URL; "dataBase" must be an http\(s\) URL; "repoUrl"/);
    expect(() => parseSiteConfig("{ nope", "site.config.json")).toThrow(/not valid JSON/);
  });
  it("rejects leftover placeholders unless allowed (tests)", () => {
    const text = JSON.stringify({ ...good, imageBase: "https://filedn.com/YOUR-PUBLIC-FOLDER-ID/" });
    expect(() => parseSiteConfig(text, "x")).toThrow(/placeholder/);
    expect(parseSiteConfig(text, "x", { allowPlaceholders: true }).imageBase).toContain("YOUR-");
  });
  it("explains how to create a missing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "iv-site-"));
    expect(() => loadSiteConfig(join(dir, "site.config.json"))).toThrow(/Copy src\/site.config.example.json/);
    writeFileSync(join(dir, "site.config.json"), JSON.stringify(good));
    expect(loadSiteConfig(join(dir, "site.config.json")).imageBase).toBe("https://filedn.com/abc/");
  });
});
