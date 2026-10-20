import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebImages } from "../ui/web/images";
import type { HeicDecoder, Decoded } from "../ui/local/heic";
import type { Photo } from "../lib/types";

let n = 0;
beforeEach(() => {
  n = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++n}`);
  URL.revokeObjectURL = vi.fn();
});
const BASE = "https://ex.org/images/";
const photo = (path: string) => ({ path } as Photo);
const paths = new Map([["a.jpg", "sub/a.jpg"], ["b.HEIC", "sub/b.HEIC"]]);
const sizes = new Map([["a.jpg", { w: 400, h: 300 }]]);
function deps() {
  const fetched: string[] = [];
  const fetchImpl = (async (u: string) => { fetched.push(String(u)); return new Response("img"); }) as unknown as typeof fetch;
  const calls: string[] = [];
  const decoder = {
    thumb: async (f: File): Promise<Decoded> => { calls.push(`thumb:${f.name}`); return { blob: new Blob(["t"]), w: 240, h: 320, fullW: 3024, fullH: 4032, source: "embedded" }; },
    full: async (f: File): Promise<Decoded> => { calls.push(`full:${f.name}`); return { blob: new Blob(["f"]), w: 3024, h: 4032, fullW: 3024, fullH: 4032, source: "full" }; },
  } as unknown as HeicDecoder;
  return { fetched, fetchImpl, calls, decoder };
}

describe("WebImages", () => {
  it("tiles use _thumbs/<path>.jpg; fallback is the original, or a decoded HEIC thumbnail", async () => {
    const d = deps();
    const w = new WebImages(BASE, paths, sizes, d.decoder, async () => false, d.fetchImpl);
    expect(await w.tile(photo("a.jpg"))).toBe("https://ex.org/images/_thumbs/sub/a.jpg.jpg");
    expect(w.placeholder(photo("a.jpg"))).toBe("https://ex.org/images/_thumbs/sub/a.jpg.jpg");
    expect(await w.tileFallback(photo("a.jpg"))).toBe("https://ex.org/images/sub/a.jpg");
    expect(await w.tileFallback(photo("b.HEIC"))).toBe("blob:1");
    expect(d.calls).toEqual(["thumb:b.HEIC"]);
    expect(w.size(photo("b.HEIC"))).toEqual({ w: 3024, h: 4032 });
    expect(w.size(photo("a.jpg"))).toEqual({ w: 400, h: 300 });
  });

  it("photo view: originals for JPEG; HEIC decoded unless the browser shows HEIC itself", async () => {
    const d = deps();
    const sw = new WebImages(BASE, paths, sizes, d.decoder, async () => false, d.fetchImpl);
    expect(await sw.full(photo("a.jpg"))).toEqual({ url: "https://ex.org/images/sub/a.jpg", size: { w: 400, h: 300 } });
    expect((await sw.full(photo("b.HEIC"))).url).toBe("blob:1");
    expect(d.calls).toEqual(["full:b.HEIC"]);

    const e = deps();
    const native = new WebImages(BASE, paths, sizes, e.decoder, async () => true, e.fetchImpl);
    expect((await native.full(photo("b.HEIC"))).url).toBe("https://ex.org/images/sub/b.HEIC");
    expect(e.calls).toEqual([]);

    const f = deps();
    const noDecoder = new WebImages(BASE, paths, sizes, null, async () => false, f.fetchImpl);
    expect((await noDecoder.full(photo("b.HEIC"))).url).toBe("https://ex.org/images/sub/b.HEIC");
    expect(await noDecoder.tileFallback(photo("b.HEIC"))).toBe("https://ex.org/images/sub/b.HEIC");
  });

  it("rejects photos that aren't in the index", async () => {
    const d = deps();
    const w = new WebImages(BASE, paths, sizes, d.decoder, async () => false, d.fetchImpl);
    await expect(w.tile(photo("nope.jpg"))).rejects.toThrow(/not in the index/);
    expect(w.originalUrl(photo("nope.jpg"))).toBe("");
  });
});
