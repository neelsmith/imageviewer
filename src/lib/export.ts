import type { Photo } from "./types";

/**
 * Catalog (.cex) text for a selection of photos, in the order given, one row per path
 * (a photo shown under several tags is written once). Uncataloged photos get a row with
 * just their path, so an export can start a new catalog. `year` and `place` columns are
 * added only when some photo has a value for them. "|" and line breaks inside values are
 * replaced by spaces so they can't break the format.
 */
export function photosToCex(photos: Photo[]): string {
  const seen = new Set<string>();
  const rows = photos.filter((p) => !seen.has(p.path) && seen.add(p.path));
  const cols: [string, (p: Photo) => string][] = [
    ["path", (p) => p.path],
    ["caption", (p) => p.caption],
    ["credits", (p) => p.credits],
    ["license", (p) => p.license],
    ["tags", (p) => p.tags.join(", ")],
  ];
  if (rows.some((p) => p.year)) cols.push(["year", (p) => p.year]);
  if (rows.some((p) => p.placeName)) cols.push(["place", (p) => p.placeName]);
  const clean = (v: string) => v.replace(/\s*[|\r\n]+\s*/g, " ").trim();
  return [cols.map(([h]) => h), ...rows.map((p) => cols.map(([, f]) => clean(f(p))))]
    .map((r) => r.join("|")).join("\n") + "\n";
}

/** "catalogs/mss.cex" → "mss-selection.cex"; "" → "selection.cex". */
export function exportFileName(base: string): string {
  const stem = base.split("/").pop()!.replace(/\.cex$/i, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return stem ? `${stem}-selection.cex` : "selection.cex";
}
