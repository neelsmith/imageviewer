import { describe, it, expect } from "vitest";
import { configFromSearch, withBranch, DEFAULTS } from "../lib/config";
import example from "../site.config.example.json";

describe("configFromSearch", () => {
  it("defaults come from the site config (tests use site.config.example.json)", () => {
    expect(DEFAULTS).toEqual({ imageBase: example.imageBase, dataBase: example.dataBase });
    expect(configFromSearch("")).toEqual(DEFAULTS);
  });
  it("switches data branch", () => {
    expect(configFromSearch("?branch=dev").dataBase)
      .toBe("https://raw.githubusercontent.com/YOUR-GITHUB-USER/imageviewer/dev/data/");
  });
  it("withBranch swaps only the branch of a raw.githubusercontent.com URL", () => {
    expect(withBranch("https://raw.githubusercontent.com/a/b/main/data/", "feature/x"))
      .toBe("https://raw.githubusercontent.com/a/b/feature%2Fx/data/");
    expect(withBranch("https://example.org/data/", "dev")).toBe("https://example.org/data/");
  });
  it("accepts explicit data and image URLs, adding trailing slash", () => {
    const c = configFromSearch("?data=http://localhost:5173/fixtures&images=http://x/img");
    expect(c).toEqual({ dataBase: "http://localhost:5173/fixtures/", imageBase: "http://x/img/" });
  });
});
