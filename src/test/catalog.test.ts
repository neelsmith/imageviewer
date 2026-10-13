import { describe, it, expect } from "vitest";
import { parseCatalog, splitTags, normalizePath } from "../lib/catalog";

const SAMPLE = `path|caption|credits|license|tags
leiden-ply/IMG_1203.jpeg|MS Lips 7, signout card.|Photograph Neel Smith, 2019|Public domain (CC0)|Pliny, Leiden
`;

describe("catalog", () => {
  it("parses Neel's sample row", () => {
    const { entries, errors } = parseCatalog(SAMPLE);
    expect(errors).toEqual([]);
    expect(entries).toEqual([{
      path: "leiden-ply/IMG_1203.jpeg",
      caption: "MS Lips 7, signout card.",
      credits: "Photograph Neel Smith, 2019",
      license: "Public domain (CC0)",
      tags: ["Pliny", "Leiden"],
      year: "",
      placeName: "",
    }]);
  });

  it("reads the optional year and place columns (Neel's data/catalog.cex sample)", () => {
    const { entries, errors } = parseCatalog(
      "path|caption|credits|license|tags|year|place\n" +
      "slides/Box 3/Box 3_172.JPG|At the Priene Saloon of Roast and Liver|Photo Candace Smith|CC BY|Turkey,Priene,Candace,Neel|1986|Priene\n");
    expect(errors).toEqual([]);
    expect(entries[0]).toMatchObject({
      path: "slides/Box 3/Box 3_172.JPG", tags: ["Turkey", "Priene", "Candace", "Neel"],
      year: "1986", placeName: "Priene",
    });
  });

  it("splits comma tags, trimming and de-duplicating", () => {
    expect(splitTags(" a, b ,, a,c ")).toEqual(["a", "b", "c"]);
    expect(splitTags("")).toEqual([]);
  });

  it("normalizes paths", () => {
    expect(normalizePath("./x/y.jpg")).toBe("x/y.jpg");
    expect(normalizePath("/x\\y.jpg")).toBe("x/y.jpg");
  });

  it("skips rows without a path and rejects a file with no path column", () => {
    expect(parseCatalog("path|caption\n|orphan\n").entries).toEqual([]);
    expect(parseCatalog("file|caption\na|b\n").errors).toContain('catalog has no "path" column');
  });
});
