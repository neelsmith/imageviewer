import { describe, it, expect } from "vitest";
import { parseDelimited } from "../lib/cex";

describe("parseDelimited", () => {
  it("reads header and rows, lower-casing headers", () => {
    const t = parseDelimited("Path|Caption\na.jpg|One\n");
    expect(t.headers).toEqual(["path", "caption"]);
    expect(t.rows).toEqual([{ path: "a.jpg", caption: "One" }]);
    expect(t.errors).toEqual([]);
  });

  it("skips blank lines, // comments, #! labels, BOM and CRLF", () => {
    const t = parseDelimited("﻿#!catalog\r\n// note\r\n\r\npath|x\r\na|1\r\n\r\n");
    expect(t.rows).toEqual([{ path: "a", x: "1" }]);
  });

  it("reports wrong field counts but keeps the row", () => {
    const t = parseDelimited("path|a|b\np1|1\n");
    expect(t.rows[0]).toEqual({ path: "p1", a: "1", b: "" });
    expect(t.errors[0]).toMatch(/line 2: expected 3 fields, found 2/);
  });

  it("normalizes header spaces to underscores", () => {
    expect(parseDelimited("Cex File|Label\na|b").headers).toEqual(["cex_file", "label"]);
  });

  it("handles empty input", () => {
    expect(parseDelimited("")).toEqual({ headers: [], rows: [], errors: [] });
  });
});
