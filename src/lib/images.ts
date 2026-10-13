import { parseDelimited } from "./cex";
import { normalizePath } from "./catalog";
import type { ImageRecord } from "./types";

/** Column order of data/images.cex. Keep in sync with utils/make-images-index.mjs. */
export const IMAGE_COLUMNS = [
  "path", "date", "lat", "lon", "city", "region", "country", "width", "height",
] as const;

function num(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseImagesIndex(text: string): { records: ImageRecord[]; errors: string[] } {
  const table = parseDelimited(text);
  const errors = [...table.errors];
  const records: ImageRecord[] = [];
  for (const r of table.rows) {
    const path = normalizePath(r.path ?? "");
    if (!path) continue;
    const city = r.city ?? "", region = r.region ?? "", country = r.country ?? "";
    records.push({
      path,
      date: (r.date ?? "").trim(),
      lat: num(r.lat),
      lon: num(r.lon),
      place: city || region || country ? { city, region, country } : null,
      width: num(r.width),
      height: num(r.height),
    });
  }
  return { records, errors };
}
