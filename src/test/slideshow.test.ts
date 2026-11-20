import { describe, it, expect } from "vitest";
import { orderPhotos, parseOrder, parseSecs, wrap, DEFAULT_SECS, parseTransition, parseSpeed, effectiveTransition,
  transitionMs, transitionFrames, panFrames } from "../lib/slideshow";
import type { Photo } from "../lib/types";

const photo = (path: string, date = "", catalogOrder: number | null = null): Photo => ({
  path, url: path, thumb: "", caption: "", credits: "", license: "", tags: [], year: "", placeName: "", urn: "",
  date, lat: null, lon: null, place: null, width: null, height: null,
  cataloged: catalogOrder !== null, catalogOrder, indexed: true,
});
const paths = (ps: Photo[]) => ps.map((p) => p.path);

describe("slide show settings", () => {
  it("parses seconds per slide, clamped, with a default", () => {
    expect(parseSecs(undefined)).toBe(DEFAULT_SECS);
    expect(DEFAULT_SECS).toBe(4);
    expect(parseSecs("")).toBe(DEFAULT_SECS);
    expect(parseSecs("abc")).toBe(DEFAULT_SECS);
    expect(parseSecs("5")).toBe(5);
    expect(parseSecs("2.5")).toBe(2.5);
    expect(parseSecs("0")).toBe(1);
    expect(parseSecs("100000")).toBe(600);
  });

  it("parses the order, defaulting to catalog order", () => {
    expect(parseOrder("shuffle")).toBe("shuffle");
    expect(parseOrder("date")).toBe("date");
    expect(parseOrder("bogus")).toBe("catalog");
    expect(parseOrder(undefined)).toBe("catalog");
  });

  it("wraps indexes so the show loops", () => {
    expect(wrap(5, 5)).toBe(0);
    expect(wrap(-1, 5)).toBe(4);
    expect(wrap(7, 5)).toBe(2);
    expect(wrap(3, 0)).toBe(0);
  });
});

describe("orderPhotos", () => {
  const ps = [
    photo("b.jpg", "2020-01-01", 1), photo("a10.jpg", "2019-05-01"), photo("a2.jpg", ""),
    photo("c.jpg", "2021-01-01", 0), photo("d.jpg", "2018-01-01"),
  ];

  it("catalog order: cataloged photos first in catalog order, then newest first", () => {
    expect(paths(orderPhotos(ps, "catalog"))).toEqual(["c.jpg", "b.jpg", "a10.jpg", "d.jpg", "a2.jpg"]);
  });

  it("date: oldest first, undated last", () => {
    expect(paths(orderPhotos(ps, "date"))).toEqual(["d.jpg", "a10.jpg", "b.jpg", "c.jpg", "a2.jpg"]);
  });

  it("name: natural order of the paths", () => {
    expect(paths(orderPhotos(ps, "name"))).toEqual(["a2.jpg", "a10.jpg", "b.jpg", "c.jpg", "d.jpg"]);
  });

  it("shuffle: a permutation, driven by the random source; input untouched", () => {
    const before = paths(ps);
    const out = orderPhotos(ps, "shuffle", () => 0);
    expect(paths(ps)).toEqual(before);
    expect([...paths(out)].sort()).toEqual([...before].sort());
    expect(paths(out)).toEqual(["a10.jpg", "a2.jpg", "c.jpg", "d.jpg", "b.jpg"]);
  });
});

describe("transitions", () => {
  it("parses the transition and speed, defaulting to fade through black / slow", () => {
    expect(parseTransition(undefined)).toBe("black");
    expect(parseTransition("bogus")).toBe("black");
    expect(parseTransition("wipe")).toBe("wipe");
    expect(parseSpeed("quick")).toBe("quick");
    expect(parseSpeed(undefined)).toBe("slow");
  });

  it("reduced motion turns slide, wipe and zoom into a dissolve", () => {
    expect(effectiveTransition("slide", true)).toBe("dissolve");
    expect(effectiveTransition("zoom", true)).toBe("dissolve");
    expect(effectiveTransition("black", true)).toBe("black");
    expect(effectiveTransition("slide", false)).toBe("slide");
  });

  it("lasts the speed's time, at most half the time per slide; none takes no time", () => {
    expect(transitionMs("slide", "normal", 8)).toBe(800);
    expect(transitionMs("slide", "slow", 8)).toBe(1600);
    expect(transitionMs("slide", "slow", 2)).toBe(1000);
    expect(transitionMs("none", "slow", 8)).toBe(0);
  });

  it("slide and wipe run the other way when going back", () => {
    expect(transitionFrames("slide", 1).incoming![0]).toEqual({ transform: "translateX(100%)" });
    expect(transitionFrames("slide", -1).incoming![0]).toEqual({ transform: "translateX(-100%)" });
    expect(transitionFrames("slide", 1).outgoing![1]).toEqual({ transform: "translateX(-100%)" });
    expect(transitionFrames("wipe", 1).incoming![0]).toEqual({ clipPath: "inset(0 100% 0 0)" });
    expect(transitionFrames("wipe", -1).incoming![0]).toEqual({ clipPath: "inset(0 0 0 100%)" });
    expect(transitionFrames("black", 1).sequential).toBe(true);
    expect(transitionFrames("none", 1)).toEqual({ incoming: null, outgoing: null });
  });

  it("pan and zoom drifts toward a corner chosen at random", () => {
    expect(panFrames(() => 0)[1]).toEqual({ transform: "scale(1.08) translate(-2%, -2%)" });
    expect(panFrames(() => 0.9)[1]).toEqual({ transform: "scale(1.08) translate(2%, 2%)" });
  });
});
