import { describe, it, expect } from "vitest";
import { mergePhotos, joinUrl } from "../lib/merge";
import type { CatalogEntry, ImageRecord } from "../lib/types";

const rec = (path: string, extra: Partial<ImageRecord> = {}): ImageRecord => ({
  path, date: "", lat: null, lon: null, place: null, width: null, height: null, ...extra,
});
const cat = (path: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  path, caption: "", credits: "", license: "", tags: [], ...extra,
});

describe("mergePhotos", () => {
  it("joins index and catalog by path", () => {
    const { photos, missingFiles } = mergePhotos(
      [rec("a.jpg", { date: "2020-01-01T00:00:00" }), rec("b.jpg")],
      [cat("a.jpg", { caption: "A", tags: ["x"] }), cat("gone.jpg")],
      "https://h/base",
    );
    const a = photos.find((p) => p.path === "a.jpg")!;
    expect(a).toMatchObject({ caption: "A", tags: ["x"], date: "2020-01-01T00:00:00",
      cataloged: true, indexed: true, url: "https://h/base/a.jpg" });
    expect(photos.find((p) => p.path === "b.jpg")).toMatchObject({ cataloged: false, indexed: true });
    expect(photos.find((p) => p.path === "gone.jpg")).toMatchObject({ cataloged: true, indexed: false });
    expect(missingFiles).toEqual(["gone.jpg"]);
  });

  it("does not report missing files when no index was loaded", () => {
    expect(mergePhotos([], [cat("a.jpg")], "https://h/").missingFiles).toEqual([]);
  });

  it("URL-encodes each path segment", () => {
    expect(joinUrl("https://h/", "my dir/é #1.jpg")).toBe("https://h/my%20dir/%C3%A9%20%231.jpg");
  });
});
