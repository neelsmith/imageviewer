import { parseDelimited } from "./cex";
import type { CatalogEntry } from "./types";

export function splitTags(s: string): string[] {
  const seen = new Set<string>();
  for (const t of s.split(",")) {
    const tag = t.trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "");
}

export function parseCatalog(text: string): { entries: CatalogEntry[]; errors: string[] } {
  const table = parseDelimited(text);
  const errors = [...table.errors];
  if (table.headers.length && !table.headers.includes("path")) {
    errors.push('catalog has no "path" column');
    return { entries: [], errors };
  }
  const entries: CatalogEntry[] = [];
  for (const r of table.rows) {
    const path = normalizePath(r.path ?? "");
    if (!path) {
      errors.push("catalog row with empty path skipped");
      continue;
    }
    entries.push({
      path,
      caption: r.caption ?? "",
      credits: r.credits ?? "",
      license: r.license ?? "",
      tags: splitTags(r.tags ?? ""),
      // Optional columns.
      year: r.year ?? "",
      placeName: r.place ?? "",
      urn: (r.urn ?? "").trim(),
    });
  }
  return { entries, errors };
}
