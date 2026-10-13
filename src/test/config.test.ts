import { describe, it, expect } from "vitest";
import { configFromSearch, DEFAULTS } from "../lib/config";

describe("configFromSearch", () => {
  it("returns defaults with no params", () => {
    expect(configFromSearch("")).toEqual(DEFAULTS);
  });
  it("switches data branch", () => {
    expect(configFromSearch("?branch=dev").dataBase)
      .toBe("https://raw.githubusercontent.com/neelsmith/imageviewer/dev/data/");
  });
  it("accepts explicit data and image URLs, adding trailing slash", () => {
    const c = configFromSearch("?data=http://localhost:5173/fixtures&images=http://x/img");
    expect(c).toEqual({ dataBase: "http://localhost:5173/fixtures/", imageBase: "http://x/img/" });
  });
});
