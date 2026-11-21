/**
 * Metadata from QuickTime (.mov) and MP4 (.mp4, .m4v) files: date recorded, GPS position,
 * display size and length. Reads only the `moov` box (wherever it is in the file), through a
 * random-access reader, so it works on a File in the browser and on a file handle in Node.
 *
 * Sources, in order of preference:
 * - date: Apple `com.apple.quicktime.creationdate` (local time, as the camera recorded it),
 *   else `©day`, else the movie header's creation time (UTC; shown as UTC).
 * - position: Apple `com.apple.quicktime.location.ISO6709`, else `©xyz` (both "+52.1601+004.4835/").
 * - size: the video track's width × height, swapped when the track is rotated 90°/270°.
 * - length: movie header duration ÷ timescale.
 */

export interface VideoMeta {
  /** "YYYY-MM-DDTHH:MM:SS", or "". */
  date: string;
  lat: number | null;
  lon: number | null;
  width: number | null;
  height: number | null;
  /** Seconds, or null. */
  duration: number | null;
}

export const NO_VIDEO_META: VideoMeta = { date: "", lat: null, lon: null, width: null, height: null, duration: null };

/** Read `length` bytes at `offset` (fewer at the end of the file). */
export type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;

/** The moov box can be large for long videos; beyond this we give up rather than read it all. */
const MAX_MOOV = 32 * 1024 * 1024;
/** Seconds from 1904-01-01 (QuickTime epoch) to 1970-01-01. */
const EPOCH_1904 = 2082844800;

interface Box { type: string; start: number; size: number; header: number }

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Child boxes in b[from, to). */
function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  const dv = view(b);
  let at = from;
  while (at + 8 <= to) {
    let size = dv.getUint32(at);
    const type = ascii(b, at + 4, 4);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = Number(dv.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) size = to - at;
    if (size < header || at + size > to) break;
    out.push({ type, start: at, size, header });
    at += size;
  }
  return out;
}

const child = (b: Uint8Array, parent: Box, type: string, skip = 0) =>
  boxes(b, parent.start + parent.header + skip, parent.start + parent.size).find((x) => x.type === type);

/** Find the top-level moov box and return its bytes (null if there is none). */
async function readMoov(read: ReadAt, fileSize: number): Promise<Uint8Array | null> {
  let at = 0;
  while (at + 8 <= fileSize) {
    const h = await read(at, 16);
    if (h.length < 8) return null;
    const dv = view(h);
    let size = dv.getUint32(0);
    const type = ascii(h, 4, 4);
    if (size === 1) size = h.length >= 16 ? Number(dv.getBigUint64(8)) : 0;
    else if (size === 0) size = fileSize - at;
    if (size < 8) return null;
    if (type === "moov") return size > MAX_MOOV ? null : await read(at, size);
    at += size;
  }
  return null;
}

/** "+52.1601+004.4835+012.345/" → [lat, lon]; null if unreadable or 0,0. */
export function parseIso6709(s: string): [number, number] | null {
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(s.trim());
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return [lat, lon];
}

/** "2023-07-15T14:03:22+0200" (local time with offset) → "2023-07-15T14:03:22"; "" if unusable. */
export function isoLocal(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim());
  return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}` : "";
}

function utcIso(secs1904: number): string {
  if (!secs1904) return "";
  const d = new Date((secs1904 - EPOCH_1904) * 1000);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1990 ? "" : d.toISOString().slice(0, 19);
}

/** Apple metadata (moov/meta with an mdta handler): key name → string value. */
function appleKeys(b: Uint8Array, meta: Box): Map<string, string> {
  const out = new Map<string, string>();
  const dv = view(b);
  // QuickTime's meta isn't a full box, MP4's is: try both.
  for (const skip of [0, 4]) {
    const keys = child(b, meta, "keys", skip), ilst = child(b, meta, "ilst", skip);
    if (!keys || !ilst) continue;
    const names: string[] = [];
    let at = keys.start + keys.header + 4;
    const n = dv.getUint32(at); at += 4;
    for (let i = 0; i < n && at + 8 <= keys.start + keys.size; i++) {
      const size = dv.getUint32(at);
      if (size < 8) break;
      names.push(ascii(b, at + 8, size - 8));
      at += size;
    }
    for (const item of boxes(b, ilst.start + ilst.header, ilst.start + ilst.size)) {
      const idx = dv.getUint32(item.start + 4) - 1; // item "type" is the 1-based key index
      const data = child(b, item, "data");
      if (!data || idx < 0 || idx >= names.length) continue;
      const v = b.subarray(data.start + data.header + 8, data.start + data.size);
      out.set(names[idx], new TextDecoder().decode(v));
    }
    return out;
  }
  return out;
}

/** udta string items (©xyz, ©day): 2-byte length, 2-byte language, text. */
function udtaString(b: Uint8Array, udta: Box, type: string): string {
  const box = child(b, udta, type);
  if (!box) return "";
  const at = box.start + box.header;
  const len = view(b).getUint16(at);
  return new TextDecoder().decode(b.subarray(at + 4, Math.min(at + 4 + len, box.start + box.size)));
}

/** Parse the bytes of a moov box. */
export function parseMoov(b: Uint8Array): VideoMeta {
  const dv = view(b);
  const moov = boxes(b, 0, b.length).find((x) => x.type === "moov");
  if (!moov) return NO_VIDEO_META;
  const meta: VideoMeta = { ...NO_VIDEO_META };

  let created = "";
  const mvhd = child(b, moov, "mvhd");
  if (mvhd) {
    const at = mvhd.start + mvhd.header;
    const v1 = b[at] === 1;
    const creation = v1 ? Number(dv.getBigUint64(at + 4)) : dv.getUint32(at + 4);
    const scale = dv.getUint32(at + (v1 ? 20 : 12));
    const dur = v1 ? Number(dv.getBigUint64(at + 24)) : dv.getUint32(at + 16);
    if (scale && dur) meta.duration = Math.round((dur / scale) * 100) / 100;
    created = utcIso(creation);
  }

  // Size and rotation from the first video track.
  for (const trak of boxes(b, moov.start + moov.header, moov.start + moov.size).filter((x) => x.type === "trak")) {
    const mdia = child(b, trak, "mdia");
    const hdlr = mdia && child(b, mdia, "hdlr");
    if (!hdlr || ascii(b, hdlr.start + hdlr.header + 8, 4) !== "vide") continue;
    const tkhd = child(b, trak, "tkhd");
    if (!tkhd) break;
    const at = tkhd.start + tkhd.header;
    const m = at + (b[at] === 1 ? 52 : 40); // the 3×3 matrix
    const w = Math.round(dv.getUint32(m + 36) / 65536), h = Math.round(dv.getUint32(m + 40) / 65536);
    const a = dv.getInt32(m), c = dv.getInt32(m + 4);
    const quarterTurn = a === 0 && Math.abs(c) === 65536;
    if (w && h) [meta.width, meta.height] = quarterTurn ? [h, w] : [w, h];
    break;
  }

  const udta = child(b, moov, "udta");
  // Apple keys live in moov/meta (iPhone); some tools (ffmpeg) put them in moov/udta/meta.
  const metaBox = child(b, moov, "meta") ?? (udta && child(b, udta, "meta"));
  const apple = metaBox ? appleKeys(b, metaBox) : new Map<string, string>();
  const day = udta ? udtaString(b, udta, "©day") : "";
  meta.date = isoLocal(apple.get("com.apple.quicktime.creationdate") ?? "") || isoLocal(day) || created;
  const pos = parseIso6709(apple.get("com.apple.quicktime.location.ISO6709") ?? "")
    ?? (udta ? parseIso6709(udtaString(b, udta, "©xyz")) : null);
  if (pos) [meta.lat, meta.lon] = pos;
  return meta;
}

/** Read a video file's metadata. Never throws: unreadable files give NO_VIDEO_META. */
export async function readVideoMeta(read: ReadAt, fileSize: number): Promise<VideoMeta> {
  try {
    const moov = await readMoov(read, fileSize);
    return moov ? parseMoov(moov) : NO_VIDEO_META;
  } catch {
    return NO_VIDEO_META;
  }
}

/** A ReadAt for a browser File / Blob. */
export const blobReader = (f: Blob): ReadAt => async (offset, length) =>
  new Uint8Array(await f.slice(offset, offset + length).arrayBuffer());

/** "0:42", "3:05", "1:02:09". */
export function formatDuration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || !Number.isFinite(secs) || secs < 0) return "";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}
