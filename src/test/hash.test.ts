import { describe, it, expect } from "vitest";
import { readHash, withHash } from "../lib/hash";

describe("hash state", () => {
  it("reads key/value pairs, with or without #", () => {
    expect(readHash("#group=tag&catalog=catalogs%2Fmss.cex")).toEqual({ group: "tag", catalog: "catalogs/mss.cex" });
    expect(readHash("")).toEqual({});
  });
  it("updates one key and keeps the others", () => {
    expect(withHash("#catalog=a.cex", { group: "tag" })).toBe("#catalog=a.cex&group=tag");
    expect(withHash("#catalog=a.cex&group=tag", { catalog: null })).toBe("#group=tag");
    expect(withHash("#group=tag", { group: null })).toBe("");
  });
});
