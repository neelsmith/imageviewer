import { parseCatalog } from "../lib/catalog";
import { parseImagesIndex } from "../lib/images";
import { mergePhotos, type MergeResult } from "../lib/merge";
import type { AppConfig } from "../lib/config";

export interface LoadResult extends MergeResult {
  warnings: string[];
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

export function buildPhotos(
  catalogText: string | null,
  imagesText: string | null,
  imageBase: string,
): LoadResult {
  const warnings: string[] = [];
  const cat = catalogText ? parseCatalog(catalogText) : { entries: [], errors: [] };
  const idx = imagesText ? parseImagesIndex(imagesText) : { records: [], errors: [] };
  if (catalogText === null) warnings.push("catalog.cex could not be loaded.");
  if (imagesText === null)
    warnings.push("images.cex could not be loaded — showing cataloged images only, without dates or places.");
  warnings.push(...cat.errors.map((e) => `catalog.cex ${e}`), ...idx.errors.map((e) => `images.cex ${e}`));
  const merged = mergePhotos(idx.records, cat.entries, imageBase);
  if (merged.missingFiles.length)
    warnings.push(`${merged.missingFiles.length} cataloged image(s) not found in images.cex.`);
  return { ...merged, warnings };
}

export async function loadRemote(cfg: AppConfig): Promise<LoadResult> {
  const [catalogText, imagesText] = await Promise.all([
    fetchText(cfg.dataBase + "catalog.cex"),
    fetchText(cfg.dataBase + "images.cex"),
  ]);
  return buildPhotos(catalogText, imagesText, cfg.imageBase);
}
