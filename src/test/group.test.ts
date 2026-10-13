import { describe, it, expect } from "vitest";
import { groupPhotos, filterPhotos } from "../lib/group";
import type { Photo } from "../lib/types";

const photo = (path: string, extra: Partial<Photo> = {}): Photo => ({
  path, url: path, caption: "", credits: "", license: "", tags: [], date: "",
  lat: null, lon: null, place: null, width: null, height: null,
  cataloged: false, indexed: true, ...extra,
});

const leiden = { city: "Leiden", region: "South Holland", country: "Netherlands" };
const PHOTOS = [
  photo("a.jpg", { date: "2019-06-12T10:00:00", tags: ["Pliny", "Leiden"], place: leiden }),
  photo("b.jpg", { date: "2019-06-13T10:00:00", tags: ["Pliny"] }),
  photo("c.jpg", { date: "2021-01-02T00:00:00", place: leiden }),
  photo("d.jpg"),
];
const summary = (gs: ReturnType<typeof groupPhotos>) =>
  gs.map((g) => [g.label, g.photos.map((p) => p.path)]);

describe("groupPhotos", () => {
  it("by date: months newest first, photos newest first, No date last", () => {
    expect(summary(groupPhotos(PHOTOS, "date"))).toEqual([
      ["January 2021", ["c.jpg"]],
      ["June 2019", ["b.jpg", "a.jpg"]],
      ["No date", ["d.jpg"]],
    ]);
  });

  it("by location: alphabetical, No location last", () => {
    expect(summary(groupPhotos(PHOTOS, "location"))).toEqual([
      ["Leiden, South Holland, Netherlands", ["c.jpg", "a.jpg"]],
      ["No location", ["b.jpg", "d.jpg"]],
    ]);
  });

  it("by tag: photo appears under every tag, Untagged last", () => {
    expect(summary(groupPhotos(PHOTOS, "tag"))).toEqual([
      ["Leiden", ["a.jpg"]],
      ["Pliny", ["b.jpg", "a.jpg"]],
      ["Untagged", ["c.jpg", "d.jpg"]],
    ]);
  });

  it("returns no groups for no photos", () => {
    expect(groupPhotos([], "tag")).toEqual([]);
  });
});

describe("filterPhotos", () => {
  it("matches all terms across fields, case-insensitively", () => {
    expect(filterPhotos(PHOTOS, "pliny leiden").map((p) => p.path)).toEqual(["a.jpg"]);
    expect(filterPhotos(PHOTOS, "NETHERLANDS").map((p) => p.path)).toEqual(["a.jpg", "c.jpg"]);
    expect(filterPhotos(PHOTOS, "  ")).toHaveLength(4);
  });
});
