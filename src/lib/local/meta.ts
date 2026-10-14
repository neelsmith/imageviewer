import type { Place } from "../types";

export interface PhotoMeta {
  /** "YYYY-MM-DDTHH:MM:SS" local time taken, or "". */
  date: string;
  lat: number | null;
  lon: number | null;
}

export const NO_META: PhotoMeta = { date: "", lat: null, lon: null };

/** EXIF "2019:06:12 14:03:22" (or ISO) → "2019-06-12T14:03:22"; "" if unusable. */
export function exifDateToIso(v: unknown): string {
  if (typeof v !== "string") return "";
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v.trim());
  if (!m || m[1] === "0000") return "";
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
}

/** Turn raw exifr output (reviveValues: false) into PhotoMeta. */
export function metaFromExif(x: Record<string, unknown> | undefined | null): PhotoMeta {
  if (!x) return NO_META;
  const date = exifDateToIso(x.DateTimeOriginal ?? x.CreateDate ?? x.DateTimeDigitized ?? x.ModifyDate);
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const gps = ok(x.latitude) && ok(x.longitude) && !(x.latitude === 0 && x.longitude === 0);
  return { date, lat: gps ? (x.latitude as number) : null, lon: gps ? (x.longitude as number) : null };
}

/**
 * Without an internet lookup there are no place names, so local photos are grouped by
 * position rounded to 2 decimals (about 1 km), labelled like "52.16° N, 4.48° E".
 */
export function coordPlace(lat: number | null, lon: number | null): Place | null {
  if (lat === null || lon === null) return null;
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
  return { city: `${f(lat, "N", "S")}, ${f(lon, "E", "W")}`, region: "", country: "" };
}

/** Run fn over items with at most `limit` in flight; results in input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>,
  onProgress?: (done: number) => void): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      onProgress?.(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
