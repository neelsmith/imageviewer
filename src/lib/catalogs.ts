import { parseDelimited } from "./cex";
import { parseAuthSpec, type AuthConfig } from "./auth";

export interface CatalogChoice {
  /** Path of the catalog file, relative to the repo root (e.g. data/catalogs/mss.cex). */
  file: string;
  label: string;
  /** From the optional `password` column; null = no password. */
  auth: AuthConfig | null;
}

/**
 * Parse a catalog list (data/catalog_of_catalogs.cex, data/catalog_of_private_catalogs.cex):
 * columns `cex_file` / "cex file", `label`, and optionally `password`.
 */
export function parseCatalogList(text: string): { catalogs: CatalogChoice[]; errors: string[] } {
  const table = parseDelimited(text);
  const errors = [...table.errors];
  if (table.headers.length && !table.headers.includes("cex_file")) {
    errors.push('catalog list has no "cex_file" column');
    return { catalogs: [], errors };
  }
  const catalogs: CatalogChoice[] = [];
  for (const r of table.rows) {
    const file = (r.cex_file ?? "").trim().replace(/^\.?\/+/, "");
    if (!file) continue;
    const label = (r.label ?? "").trim() || file;
    let auth: AuthConfig | null;
    try {
      auth = parseAuthSpec(r.password ?? "");
    } catch (e) {
      // Never show a catalog whose password can't be checked.
      errors.push(`${label}: ${(e as Error).message}; catalog left out.`);
      continue;
    }
    catalogs.push({ file, label, auth });
  }
  return { catalogs, errors };
}

/**
 * Resolve a catalog path. Paths in catalog_of_catalogs.cex are relative to the
 * repo root, i.e. the parent of the data directory (dataBase ends in ".../data/").
 */
export function catalogUrl(dataBase: string, file: string): string {
  return new URL(file, new URL("../", dataBase)).href;
}
