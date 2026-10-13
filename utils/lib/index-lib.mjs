// Pure helpers for make-images-index.mjs (unit-tested in test/).
import { readdir } from "node:fs/promises";
import { join, relative, sep, extname } from "node:path";

export const COLUMNS = ["path", "date", "lat", "lon", "city", "region", "country", "width", "height"];
export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".tif", ".tiff"]);

/** Recursively list image files under root as forward-slash relative paths, sorted. Skips dotfiles. */
export async function listImages(root) {
  const out = [];
  async function walk(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile() && IMAGE_EXTS.has(extname(ent.name).toLowerCase()))
        out.push(relative(root, full).split(sep).join("/"));
    }
  }
  await walk(root);
  return out.sort();
}

/** "2019:06:12 14:03:22" (EXIF) → "2019-06-12T14:03:22"; "" if unusable. */
export function exifDateToIso(v) {
  if (v instanceof Date && !isNaN(v)) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  if (typeof v !== "string") return "";
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v.trim());
  if (!m || m[1] === "0000") return "";
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
}

/** EXIF orientations 5–8 rotate by 90°, so displayed width/height swap. */
export function displaySize(width, height, orientation) {
  if (width == null || height == null) return { width: null, height: null };
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

/** Cache key: ~100 m precision, so nearby photos share one lookup. */
export function geoKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/** Pick city / region / country from a Nominatim reverse-geocoding response. */
export function placeFromNominatim(json) {
  const a = json?.address ?? {};
  return {
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? a.suburb ?? a.county ?? "",
    region: a.state ?? a.province ?? a.region ?? a.state_district ?? "",
    country: a.country ?? "",
  };
}

const clean = (v) => String(v ?? "").replace(/[|\r\n]+/g, " ").trim();

export function serialize(rows) {
  const lines = [COLUMNS.join("|")];
  for (const r of [...rows].sort((a, b) => a.path.localeCompare(b.path)))
    lines.push(COLUMNS.map((c) => clean(r[c])).join("|"));
  return lines.join("\n") + "\n";
}

/** Parse an existing images.cex so unchanged files needn't be re-read. */
export function parseExisting(text) {
  const rows = new Map();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("//") && !l.startsWith("#!"));
  if (!lines.length) return rows;
  const head = lines[0].split("|").map((h) => h.trim().toLowerCase());
  for (const line of lines.slice(1)) {
    const cells = line.split("|");
    const r = Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
    if (r.path) rows.set(r.path, r);
  }
  return rows;
}
