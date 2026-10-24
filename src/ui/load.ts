import { parseCatalog } from "../lib/catalog";
import { parseImagesIndex } from "../lib/images";
import { mergePhotos, type MergeResult } from "../lib/merge";
import type { AppConfig } from "../lib/config";
import type { Photo } from "../lib/types";
import { parseDataUpdated, setDataUpdated } from "../lib/version";

/**
 * A notice shown above the grid: plain text, or text with a list that the viewer can
 * unfold (e.g. the catalog entries whose image is missing).
 */
export type Notice = string | { text: string; items: string[] };

export interface LoadResult extends MergeResult {
  warnings: Notice[];
}

/** "N … not found" notice listing each missing path (with its caption, if any). */
export function missingNotice(text: string, missing: string[], photos: Photo[]): Notice {
  const caption = new Map(photos.map((p) => [p.path, p.caption]));
  return { text, items: missing.map((m) => (caption.get(m) ? `${m} — ${caption.get(m)}` : m)) };
}

export async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

export interface BuildOptions {
  /** Keep only photos listed in the catalog (the catalog-chooser app). */
  catalogedOnly?: boolean;
  /** Name used for the catalog in warnings. */
  catalogName?: string;
}

export function buildPhotos(
  catalogText: string | null,
  imagesText: string | null,
  imageBase: string,
  opts: BuildOptions = {},
): LoadResult {
  const warnings: Notice[] = [];
  const catName = opts.catalogName ?? "catalog.cex";
  const cat = catalogText ? parseCatalog(catalogText) : { entries: [], errors: [] };
  const idx = imagesText ? parseImagesIndex(imagesText) : { records: [], errors: [] };
  if (catalogText === null) warnings.push(`${catName} could not be loaded.`);
  if (imagesText === null)
    warnings.push(opts.catalogedOnly
      ? "images.cex could not be loaded — dates and places are unavailable."
      : "images.cex could not be loaded — showing cataloged images only, without dates or places.");
  warnings.push(...cat.errors.map((e) => `${catName} ${e}`), ...idx.errors.map((e) => `images.cex ${e}`));
  const merged = mergePhotos(idx.records, cat.entries, imageBase);
  if (opts.catalogedOnly) merged.photos = merged.photos.filter((p) => p.cataloged);
  if (merged.missingFiles.length)
    warnings.push(missingNotice(`${merged.missingFiles.length} cataloged image(s) not found in images.cex.`,
      merged.missingFiles, merged.photos));
  return { ...merged, warnings };
}

/** Read data/last-updated.txt (optional) and show the date beside the app version. */
export async function loadDataUpdated(cfg: AppConfig): Promise<void> {
  const text = await fetchText(cfg.dataBase + "last-updated.txt");
  if (text === null) return;
  const date = parseDataUpdated(text);
  if (!date) console.warn("data/last-updated.txt should hold a date like 2026-10-13");
  setDataUpdated(date);
}

export async function loadRemote(cfg: AppConfig): Promise<LoadResult> {
  const [catalogText, imagesText] = await Promise.all([
    fetchText(cfg.dataBase + "catalog.cex"),
    fetchText(cfg.dataBase + "images.cex"),
  ]);
  return buildPhotos(catalogText, imagesText, cfg.imageBase);
}

/** Catalog-chooser app: one chosen catalog, joined with images.cex, cataloged photos only. */
export async function loadCatalog(cfg: AppConfig, catalogFile: string, catalogUrl: string): Promise<LoadResult> {
  const [catalogText, imagesText] = await Promise.all([
    fetchText(catalogUrl),
    fetchText(cfg.dataBase + "images.cex"),
  ]);
  const r = buildPhotos(catalogText, imagesText, cfg.imageBase, { catalogedOnly: true, catalogName: catalogFile });
  if (catalogText === null) r.warnings[0] = `${catalogFile} could not be loaded from ${catalogUrl}`;
  return r;
}
