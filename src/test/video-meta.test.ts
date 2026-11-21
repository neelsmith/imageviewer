import { describe, it, expect } from "vitest";
import { formatDuration, isoLocal, parseIso6709, parseMoov, readVideoMeta, blobReader, NO_VIDEO_META } from "../lib/video-meta";

// Build a minimal QuickTime file the way an iPhone writes one: ftyp, mdat, then moov with
// mvhd, a video trak (tkhd + mdia/hdlr "vide"), Apple keys/ilst metadata and udta.
const enc = new TextEncoder();
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const i32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n); return b; };
const u16 = (n: number) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return b; };
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const box = (type: string, ...body: Uint8Array[]) => { const b = cat(...body); return cat(u32(b.length + 8), latin1(type), b); };
const zeros = (n: number) => new Uint8Array(n);

const mvhd = (timescale: number, duration: number, created1904: number) =>
  box("mvhd", zeros(4), u32(created1904), u32(created1904), u32(timescale), u32(duration), zeros(80));
const tkhd = (w: number, h: number, rotate90: boolean) => box("tkhd", zeros(4), zeros(20), zeros(8), zeros(8),
  // matrix a b u c d v x y w
  ...(rotate90 ? [i32(0), i32(65536), i32(0), i32(-65536), i32(0), i32(0)] : [i32(65536), i32(0), i32(0), i32(0), i32(65536), i32(0)]),
  i32(0), i32(0), i32(1 << 30), u32(w * 65536), u32(h * 65536));
const trak = (handler: string, ...extra: Uint8Array[]) =>
  box("trak", ...extra, box("mdia", box("hdlr", zeros(4), zeros(4), latin1(handler), zeros(12))));
const appleMeta = (pairs: [string, string][]) => box("meta",
  box("hdlr", zeros(4), zeros(4), latin1("mdta"), zeros(12)),
  box("keys", zeros(4), u32(pairs.length), ...pairs.map(([k]) => cat(u32(k.length + 8), latin1("mdta"), enc.encode(k)))),
  box("ilst", ...pairs.map(([, v], i) => cat(u32(8 + 16 + enc.encode(v).length), u32(i + 1),
    box("data", u32(1), zeros(4), enc.encode(v))))));
const udtaStr = (type: string, v: string) => box(type, u16(enc.encode(v).length), u16(0), enc.encode(v));

// 2025-09-29T15:40:07Z in seconds since 1904.
const CREATED = Date.UTC(2025, 8, 29, 15, 40, 7) / 1000 + 2082844800;

const iphone = () => cat(box("ftyp", latin1("qt  "), zeros(4)), box("mdat", zeros(64)), box("moov",
  mvhd(600, 9006, CREATED), trak("soun"), trak("vide", tkhd(1920, 1080, true)),
  appleMeta([["com.apple.quicktime.location.ISO6709", "+39.2816-076.5428+024.167/"],
    ["com.apple.quicktime.creationdate", "2025-09-29T11:40:07-0400"]])));

describe("video metadata", () => {
  it("reads date (local), GPS, rotated size and length from an iPhone-style .MOV", async () => {
    const f = new Blob([iphone()]);
    expect(await readVideoMeta(blobReader(f), f.size)).toEqual({
      date: "2025-09-29T11:40:07", lat: 39.2816, lon: -76.5428, width: 1080, height: 1920, duration: 15.01,
    });
  });

  it("falls back to udta ©xyz / ©day, then the header's UTC time", () => {
    const moov = (...extra: Uint8Array[]) => box("moov", mvhd(1000, 2000, CREATED), trak("vide", tkhd(640, 480, false)), ...extra);
    expect(parseMoov(moov(box("udta", udtaStr("©xyz", "+52.1601+004.4835/"), udtaStr("©day", "2019-06-12T14:03:22+0200")))))
      .toEqual({ date: "2019-06-12T14:03:22", lat: 52.1601, lon: 4.4835, width: 640, height: 480, duration: 2 });
    expect(parseMoov(moov()).date).toBe("2025-09-29T15:40:07");
  });

  it("gives empty metadata for files that aren't QuickTime/MP4", async () => {
    const f = new Blob([enc.encode("not a video at all")]);
    expect(await readVideoMeta(blobReader(f), f.size)).toEqual(NO_VIDEO_META);
  });

  it("parses ISO 6709 positions and local date strings", () => {
    expect(parseIso6709("+39.2816-076.5428+024.167/")).toEqual([39.2816, -76.5428]);
    expect(parseIso6709("+00.0000+000.0000/")).toBeNull();
    expect(parseIso6709("garbage")).toBeNull();
    expect(isoLocal("2023-07-15T14:03:22+0200")).toBe("2023-07-15T14:03:22");
    expect(isoLocal("0000-00-00T00:00:00")).toBe("");
  });

  it("formats lengths", () => {
    expect(formatDuration(42.4)).toBe("0:42");
    expect(formatDuration(185)).toBe("3:05");
    expect(formatDuration(3729)).toBe("1:02:09");
    expect(formatDuration(null)).toBe("");
  });
});
