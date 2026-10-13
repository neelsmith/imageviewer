import type { CatalogEntry, ImageRecord, Photo } from "./types";

export interface MergeResult {
  photos: Photo[];
  /** Catalog paths with no matching file in images.cex (only reported when an index was loaded). */
  missingFiles: string[];
}

export function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base : base + "/";
  return b + path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Union of images.cex and catalog.cex keyed by path. Photos listed only in the
 * catalog are kept (the index may be stale) but flagged `indexed: false`.
 */
export function mergePhotos(
  records: ImageRecord[],
  entries: CatalogEntry[],
  imageBase: string,
): MergeResult {
  const byPath = new Map<string, Photo>();
  const blank = (path: string): Photo => ({
    path, url: joinUrl(imageBase, path), caption: "", credits: "", license: "",
    tags: [], date: "", lat: null, lon: null, place: null, width: null, height: null,
    cataloged: false, indexed: false,
  });

  for (const r of records) {
    byPath.set(r.path, { ...blank(r.path), ...r, url: joinUrl(imageBase, r.path), indexed: true });
  }
  const missingFiles: string[] = [];
  for (const e of entries) {
    const existing = byPath.get(e.path);
    if (!existing && records.length) missingFiles.push(e.path);
    byPath.set(e.path, { ...(existing ?? blank(e.path)), ...e, cataloged: true });
  }
  return { photos: [...byPath.values()], missingFiles };
}
