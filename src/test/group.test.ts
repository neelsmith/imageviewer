import { describe, it, expect } from "vitest";
import { groupPhotos, filterPhotos, selectPhotos, facetValues } from "../lib/group";
import type { Photo } from "../lib/types";

const photo = (path: string, extra: Partial<Photo> = {}): Photo => ({
  path, url: path, thumb: path, caption: "", credits: "", license: "", tags: [], year: "", placeName: "", date: "",
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

describe("selectPhotos", () => {
  const mixed = [photo("a.jpg", { cataloged: true, caption: "Pliny" }), photo("b.jpg"), photo("c.jpg", { cataloged: true })];
  it("keeps only cataloged photos when asked, then applies the filter", () => {
    expect(selectPhotos(mixed, { catalogedOnly: true, query: "" }).map((p) => p.path)).toEqual(["a.jpg", "c.jpg"]);
    expect(selectPhotos(mixed, { catalogedOnly: false, query: "" })).toHaveLength(3);
    expect(selectPhotos(mixed, { catalogedOnly: true, query: "pliny" }).map((p) => p.path)).toEqual(["a.jpg"]);
  });
});

describe("year / place drop-downs", () => {
  const ps = [
    photo("a.jpg", { cataloged: true, year: "1986", placeName: "Priene" }),
    photo("b.jpg", { cataloged: true, year: "2019", placeName: "Leiden" }),
    photo("c.jpg", { cataloged: true, year: "1986", placeName: "Miletus" }),
    photo("d.jpg", { cataloged: true, year: "987", placeName: "priene" }),
    photo("e.jpg"),
  ];
  it("lists distinct non-empty values, numbers in numeric order", () => {
    expect(facetValues(ps, "year")).toEqual(["987", "1986", "2019"]);
    expect(facetValues(ps, "placeName")).toEqual(["Leiden", "Miletus", "Priene", "priene"]);
    expect(facetValues([photo("x.jpg")], "year")).toEqual([]);
  });
  it("filters by exact year and place, combined with the other filters", () => {
    const sel = (o: object) => selectPhotos(ps, { catalogedOnly: false, query: "", ...o }).map((p) => p.path);
    expect(sel({ year: "1986" })).toEqual(["a.jpg", "c.jpg"]);
    expect(sel({ place: "Priene" })).toEqual(["a.jpg"]);
    expect(sel({ year: "1986", place: "Miletus" })).toEqual(["c.jpg"]);
    expect(sel({ year: "2019", place: "Priene" })).toEqual([]);
    expect(sel({ year: "", place: "" })).toHaveLength(5);
    expect(sel({ query: "1986" })).toEqual(["a.jpg", "c.jpg"]); // text filter sees them too
  });
});
