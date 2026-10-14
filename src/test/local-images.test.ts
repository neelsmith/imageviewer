import { describe, it, expect, beforeEach, vi } from "vitest";
import { LocalImages } from "../ui/local/images";
import type { HeicDecoder, Decoded } from "../ui/local/heic";
import type { Photo } from "../lib/types";

let n = 0;
const revoked: string[] = [];
beforeEach(() => {
  n = 0; revoked.length = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++n}`);
  URL.revokeObjectURL = vi.fn((u: string) => { revoked.push(u); });
});

const photo = (path: string) => ({ path } as Photo);
function fakeDecoder() {
  const calls: string[] = [];
  const d = (file: File, mode: string): Promise<Decoded> => {
    calls.push(`${mode}:${file.name}`);
    return Promise.resolve(mode === "thumb"
      ? { blob: new Blob(["t"]), w: 240, h: 320, fullW: 3024, fullH: 4032, source: "embedded" }
      : { blob: new Blob(["f"]), w: 3024, h: 4032, fullW: 3024, fullH: 4032, source: "full" });
  };
  return { calls, decoder: { thumb: (f: File) => d(f, "thumb"), full: (f: File) => d(f, "full") } as unknown as HeicDecoder };
}
const files = () => new Map([
  ["a.jpg", new File(["j"], "a.jpg")], ["b.HEIC", new File(["h"], "b.HEIC")], ["c.heic", new File(["h"], "c.heic")],
]);

describe("LocalImages", () => {
  it("shows JPEGs straight from the file and decodes HEIC tiles once", async () => {
    const { calls, decoder } = fakeDecoder();
    const imgs = new LocalImages(files(), decoder, async () => false);
    const jpg = await imgs.tile(photo("a.jpg"));
    expect(await imgs.full(photo("a.jpg"))).toEqual({ url: jpg, size: null });
    const t1 = await imgs.tile(photo("b.HEIC"));
    expect(await imgs.tile(photo("b.HEIC"))).toBe(t1); // cached
    expect(calls).toEqual(["thumb:b.HEIC"]);
    expect(imgs.placeholder(photo("b.HEIC"))).toBe(t1);
    expect(imgs.size(photo("b.HEIC"))).toEqual({ w: 3024, h: 4032 });
  });

  it("decodes full HEIC in a worker when the browser can't, or uses the file when it can", async () => {
    const a = fakeDecoder();
    const sw = new LocalImages(files(), a.decoder, async () => false);
    expect((await sw.full(photo("b.HEIC"))).size).toEqual({ w: 3024, h: 4032 });
    expect(a.calls).toEqual(["full:b.HEIC"]);

    const b = fakeDecoder();
    let probes = 0;
    const native = new LocalImages(files(), b.decoder, async () => { probes++; return true; });
    const r = await native.full(photo("b.HEIC"));
    await native.full(photo("c.heic"));
    expect(b.calls).toEqual([]); // Safari: no software decoding for the photo view
    expect(probes).toBe(1); // probed once
    expect(r.url).toBe(native.originalUrl(photo("b.HEIC")));
  });

  it("keeps only the last few decoded full images and revokes everything on dispose", async () => {
    const { decoder } = fakeDecoder();
    const many = new Map(Array.from({ length: 5 }, (_, i) => [`${i}.heic`, new File(["h"], `${i}.heic`)] as const));
    const imgs = new LocalImages(many, decoder, async () => false, 2);
    const urls: string[] = [];
    for (let i = 0; i < 5; i++) urls.push((await imgs.full(photo(`${i}.heic`))).url);
    await Promise.resolve();
    expect(revoked).toEqual(urls.slice(0, 3));
    imgs.dispose();
    await Promise.resolve();
    expect(revoked).toEqual(expect.arrayContaining(urls));
  });

  it("rejects for a file it doesn't have", async () => {
    const imgs = new LocalImages(new Map(), fakeDecoder().decoder, async () => false);
    await expect(imgs.tile(photo("nope.heic"))).rejects.toThrow(/not found/);
  });
});
