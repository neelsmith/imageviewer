import { describe, it, expect } from "vitest";
import { folderNameFromUrl, safeRelPath } from "../lib/web/paths";

describe("web paths", () => {
  it("accepts plain relative paths and rejects anything that could escape the folder", () => {
    expect(safeRelPath(" trips/2019/a.jpg ")).toBe("trips/2019/a.jpg");
    for (const bad of ["", "../a.jpg", "a/../../b.jpg", "/etc/passwd", "a//b.jpg", "./a.jpg",
      "https://evil.example/x.jpg", "javascript:alert(1)", "a\\b.jpg", "a/\u0000.jpg"])
      expect(safeRelPath(bad), bad).toBeNull();
  });
  it("names the top folder after the page's folder", () => {
    expect(folderNameFromUrl("https://ex.org/images/www-browse.html#dir=a")).toBe("images");
    expect(folderNameFromUrl("https://ex.org/family%20photos/")).toBe("family photos");
    expect(folderNameFromUrl("https://ex.org/www-browse.html")).toBe("Photos");
  });
});
