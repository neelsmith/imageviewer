import { describe, it, expect } from "vitest";
import { parseCatalogList, catalogUrl } from "../lib/catalogs";

describe("catalog_of_catalogs.cex", () => {
  it("reads Neel's file: cex_file header, repo-root path, no trailing newline", () => {
    const { catalogs, errors } = parseCatalogList("cex_file|label\ndata/catalogs/mss.cex|Photograph of manuscripts");
    expect(errors).toEqual([]);
    expect(catalogs).toEqual([{ file: "data/catalogs/mss.cex", label: "Photograph of manuscripts", auth: null }]);
  });

  it("accepts a 'cex file' header too", () => {
    const { catalogs, errors } = parseCatalogList("cex file|label\ncatalog/mss.cex|Photograph of manuscripts");
    expect(errors).toEqual([]);
    expect(catalogs).toEqual([{ file: "catalog/mss.cex", label: "Photograph of manuscripts", auth: null }]);
  });
  it("accepts cex_file, strips leading ./, falls back to file name for a missing label, skips blanks", () => {
    const { catalogs } = parseCatalogList("cex_file|label\n./a.cex|\n|orphan\nb.cex|B\n");
    expect(catalogs).toEqual([{ file: "a.cex", label: "a.cex", auth: null }, { file: "b.cex", label: "B", auth: null }]);
  });
  it("reports a missing cex_file column", () => {
    expect(parseCatalogList("file|label\na|b\n").errors).toContain('catalog list has no "cex_file" column');
  });
  it("resolves catalog paths from the repo root (parent of data/)", () => {
    expect(catalogUrl("https://raw.githubusercontent.com/u/r/main/data/", "data/catalogs/mss.cex"))
      .toBe("https://raw.githubusercontent.com/u/r/main/data/catalogs/mss.cex");
    expect(catalogUrl("http://localhost:5173/data/", "data/catalogs/mss.cex"))
      .toBe("http://localhost:5173/data/catalogs/mss.cex");
  });
});

describe("catalog_of_private_catalogs.cex password column", () => {
  const SPEC = "pbkdf2-sha256:1000:c2FsdHNhbHRzYWx0c2FsdA==:GDAYJJtfElk+xpdigX69OXyhgz3//WebdzIiNpVdWzI=";
  it("reads per-catalog password hashes; blank means none", () => {
    const { catalogs, errors } = parseCatalogList(
      `cex_file|label|password\ndata/private/brunswick.cex|Brunswick, ME|${SPEC}\ndata/private/open.cex|Open|\n`);
    expect(errors).toEqual([]);
    expect(catalogs[0].auth).toEqual({ algorithm: "PBKDF2-SHA256", iterations: 1000,
      salt: "c2FsdHNhbHRzYWx0c2FsdA==", hash: "GDAYJJtfElk+xpdigX69OXyhgz3//WebdzIiNpVdWzI=" });
    expect(catalogs[1].auth).toBeNull();
  });
  it("leaves out a catalog whose password value is malformed (e.g. a plain-text password)", () => {
    const { catalogs, errors } = parseCatalogList("cex_file|label|password\na.cex|A|hunter2\nb.cex|B|\n");
    expect(catalogs.map((c) => c.file)).toEqual(["b.cex"]);
    expect(errors[0]).toMatch(/^A: .*npm run catalog-password.*left out/);
  });
});
