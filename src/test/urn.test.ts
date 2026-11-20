import { describe, it, expect } from "vitest";
import { findUrnInCatalog, sameImage, splitUrn, urnLink } from "../lib/urn";

describe("CITE2 URNs", () => {
  it("splits an image URN from its region", () => {
    expect(splitUrn(" urn:cite2:ns:img.v1:X ")).toEqual({ base: "urn:cite2:ns:img.v1:X", roi: null });
    expect(splitUrn("urn:cite2:ns:img.v1:X@0.1,0.2,0.3,0.4")).toEqual({ base: "urn:cite2:ns:img.v1:X", roi: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
    expect(splitUrn("urn:cite2:ns:img.v1:X@junk").roi).toBeNull();
  });
  it("matches catalog URNs to an image, ignoring regions", () => {
    expect(sameImage("urn:cite2:ns:img.v1:X", "urn:cite2:ns:img.v1:X")).toBe(true);
    expect(sameImage("urn:cite2:ns:img.v1:X@0,0,1,1", "urn:cite2:ns:img.v1:X")).toBe(true);
    expect(sameImage("urn:cite2:ns:img.v1:XY", "urn:cite2:ns:img.v1:X")).toBe(false);
    expect(sameImage("", "")).toBe(false);
  });
  it("finds the entry in a catalog", () => {
    const cat = "path|caption|credits|license|tags|urn\na.jpg|A|||t|urn:cite2:ns:img.v1:A\nb.jpg|B|||t|urn:cite2:ns:img.v1:B\n";
    expect(findUrnInCatalog(cat, "urn:cite2:ns:img.v1:B")).toBe("b.jpg");
    expect(findUrnInCatalog(cat, "urn:cite2:ns:img.v1:C")).toBeNull();
  });
  it("makes a link on the current page, encoding the URN", () => {
    expect(urnLink("https://ex.org/images/www-browse.html#dir=a&photo=b.jpg", "urn:cite2:ns:img.v1:B@0.1000,0.2000,0.3000,0.4000"))
      .toBe("https://ex.org/images/www-browse.html#urn=urn%3Acite2%3Ans%3Aimg.v1%3AB%400.1000%2C0.2000%2C0.3000%2C0.4000");
  });
});
