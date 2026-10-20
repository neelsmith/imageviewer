import { describe, it, expect } from "vitest";
import {
  formatRoi, formatRois, moveRoi, parseRoi, parseRois, resizeRoi, roiFromCorners, roiToScreen, roiUrn, screenToFrac,
} from "../lib/roi";

const img = { w: 4000, h: 3000 };

describe("selections (regions of interest)", () => {
  it("screen ↔ fractions round-trip at any zoom and pan", () => {
    for (const view of [{ scale: 0.25, x: 0, y: 25 }, { scale: 1, x: -1200, y: -800 }, { scale: 3.7, x: -9000, y: -4321 }]) {
      const r = { x: 0.125, y: 0.25, w: 0.5, h: 0.333 };
      const s = roiToScreen(view, img, r);
      const a = screenToFrac(view, img, s.left, s.top);
      const b = screenToFrac(view, img, s.left + s.width, s.top + s.height);
      expect(a.fx).toBeCloseTo(0.125); expect(a.fy).toBeCloseTo(0.25);
      expect(b.fx).toBeCloseTo(0.625); expect(b.fy).toBeCloseTo(0.583);
    }
  });

  it("the top-left quarter is 0,0,0.5,0.5 whatever the zoom", () => {
    const view = { scale: 0.2, x: 100, y: 50 };
    const r = roiFromCorners(screenToFrac(view, img, 100, 50), screenToFrac(view, img, 100 + 400, 50 + 300))!;
    expect(formatRoi(r)).toBe("0.0000,0.0000,0.5000,0.5000");
  });

  it("clamps to the photo; ignores tiny drags", () => {
    const view = { scale: 0.1, x: 0, y: 0 };
    expect(screenToFrac(view, img, -50, 9999)).toEqual({ fx: 0, fy: 1 });
    expect(roiFromCorners({ fx: 0.5, fy: 0.5 }, { fx: 0.5005, fy: 0.9 })).toBeNull();
    const r = roiFromCorners({ fx: 0.6, fy: 0.9 }, { fx: 0.2, fy: 0.1 })!;
    expect([r.x, r.y, r.w, r.h].map((v) => +v.toFixed(6))).toEqual([0.2, 0.1, 0.4, 0.8]);
  });

  it("move and resize stay inside the photo", () => {
    const r = { x: 0.7, y: 0.1, w: 0.2, h: 0.2 };
    expect(moveRoi(r, 0.5, -0.5)).toEqual({ x: 0.8, y: 0, w: 0.2, h: 0.2 });
    const big = resizeRoi(r, "se", 1.4, 0.5);
    expect(big.x).toBeCloseTo(0.7); expect(big.y).toBeCloseTo(0.1);
    expect(big.w).toBeCloseTo(0.3); expect(big.h).toBeCloseTo(0.4);
    const flipped = resizeRoi(r, "nw", 0.95, 0.4); // dragged past the opposite corner
    expect(flipped.x).toBeCloseTo(0.9); expect(flipped.y).toBeCloseTo(0.3);
    expect(flipped.w).toBeCloseTo(0.05); expect(flipped.h).toBeCloseTo(0.1);
  });

  it("formats and parses for the URL hash, rejecting bad values", () => {
    const rs = [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.25, y: 0.125, w: 0.5, h: 0.25 }];
    expect(formatRois(rs)).toBe("0.0000,0.0000,0.5000,0.5000;0.2500,0.1250,0.5000,0.2500");
    expect(parseRois(formatRois(rs))).toEqual(rs);
    for (const bad of ["1,2,3", "0.5,0.5,0.6,0.1", "-0.1,0,0.2,0.2", "0,0,0,0.2", "a,b,c,d"]) expect(parseRoi(bad), bad).toBeNull();
    expect(parseRois("0,0,0.5,0.5;junk;")).toEqual([{ x: 0, y: 0, w: 0.5, h: 0.5 }]);
  });

  it("CITE2 URNs append @x,y,w,h, replacing any existing region", () => {
    const r = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(roiUrn("urn:cite2:hmt:vaimg.2017a:VA012RN_0013", r)).toBe("urn:cite2:hmt:vaimg.2017a:VA012RN_0013@0.1000,0.2000,0.3000,0.4000");
    expect(roiUrn("urn:cite2:hmt:vaimg.2017a:VA012RN_0013@0.5,0.5,0.1,0.1", r)).toBe("urn:cite2:hmt:vaimg.2017a:VA012RN_0013@0.1000,0.2000,0.3000,0.4000");
  });
});
