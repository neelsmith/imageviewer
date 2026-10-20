import { describe, it, expect } from "vitest";
import { buildPhotos } from "../ui/load";

const CAT = "path|caption|credits|license|tags\nx/1.jpg|One|||A\nx/9.jpg|Missing|||A\n";
const IDX = "path|date|lat|lon|city|region|country|width|height\nx/1.jpg|2019-03-05T13:27:41||||||4|3\nx/2.jpg|||||||4|3\n";

describe("buildPhotos", () => {
  it("shows all indexed images by default", () => {
    const r = buildPhotos(CAT, IDX, "https://h/");
    expect(r.photos.map((p) => p.path).sort()).toEqual(["x/1.jpg", "x/2.jpg", "x/9.jpg"]);
  });
  it("catalogedOnly keeps only cataloged photos, still enriched from images.cex", () => {
    const r = buildPhotos(CAT, IDX, "https://h/", { catalogedOnly: true, catalogName: "catalogs/mss.cex" });
    expect(r.photos.map((p) => p.path).sort()).toEqual(["x/1.jpg", "x/9.jpg"]);
    expect(r.photos.find((p) => p.path === "x/1.jpg")?.date).toBe("2019-03-05T13:27:41");
    expect(r.warnings).toContainEqual({ text: "1 cataloged image(s) not found in images.cex.", items: ["x/9.jpg — Missing"] });
  });
  it("names the chosen catalog when it can't be loaded", () => {
    const r = buildPhotos(null, IDX, "https://h/", { catalogedOnly: true, catalogName: "catalogs/mss.cex" });
    expect(r.photos).toEqual([]);
    expect(r.warnings[0]).toBe("catalogs/mss.cex could not be loaded.");
  });
});
