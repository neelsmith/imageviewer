import { describe, it, expect } from "vitest";
import { exportFileName, photosToCex } from "../lib/export";
import { parseCatalog } from "../lib/catalog";
import type { Photo } from "../lib/types";

const photo = (path: string, extra: Partial<Photo> = {}): Photo => ({
  path, url: path, thumb: path, caption: "", credits: "", license: "", tags: [], year: "", placeName: "", urn: "", date: "",
  lat: null, lon: null, place: null, width: null, height: null,
  cataloged: false, catalogOrder: null, indexed: true, ...extra,
});

describe("export", () => {
  it("writes catalog rows in the order shown, once per path, and round-trips", () => {
    const a = photo("x/a.jpg", { caption: "A | with bar", credits: "N.S.", license: "CC0", tags: ["Pliny", "Leiden"], cataloged: true });
    const b = photo("b.heic"); // uncataloged: path only
    const text = photosToCex([a, b, a]);
    expect(text).toBe("path|caption|credits|license|tags\nx/a.jpg|A with bar|N.S.|CC0|Pliny, Leiden\nb.heic||||\n");
    const back = parseCatalog(text);
    expect(back.errors).toEqual([]);
    expect(back.entries.map((e) => [e.path, e.tags])).toEqual([["x/a.jpg", ["Pliny", "Leiden"]], ["b.heic", []]]);
  });

  it("adds year/place columns only when used", () => {
    const text = photosToCex([photo("a.jpg", { year: "1986" }), photo("b.jpg", { placeName: "Priene" })]);
    expect(text.split("\n")[0]).toBe("path|caption|credits|license|tags|year|place");
    expect(text.split("\n")[1]).toBe("a.jpg|||||1986|");
  });

  it("names the download after the catalog or folder", () => {
    expect(exportFileName("data/catalogs/mss.cex")).toBe("mss-selection.cex");
    expect(exportFileName("Family photos")).toBe("Family-photos-selection.cex");
    expect(exportFileName("")).toBe("selection.cex");
  });
});

describe("export with urn and selections text", () => {
  it("adds a urn column when used", () => {
    const text = photosToCex([photo("a.jpg", { urn: "urn:cite2:x:y.v1:a" }), photo("b.jpg")]);
    expect(text.split("\n")[0]).toBe("path|caption|credits|license|tags|urn");
  });
});
