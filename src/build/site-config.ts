import { existsSync, readFileSync } from "node:fs";

/**
 * Per-site settings, read at build time from src/site.config.json (gitignored;
 * copy site.config.example.json to start). Only imageBase, dataBase and repoUrl
 * are baked into the pages — localImageRoot is used by the utils/ scripts only.
 */
export interface SiteConfig {
  /** Root URL of the pCloud Public Folder (image paths are relative to it). */
  imageBase: string;
  /** URL of the data/ directory (catalogs, images.cex). */
  dataBase: string;
  /** GitHub repo page; the version label links to its releases. Optional. */
  repoUrl?: string;
  /** Local path of the pCloud Public Folder for utils/ scripts. Optional. */
  localImageRoot?: string;
}

export type PublicSiteConfig = Pick<SiteConfig, "imageBase" | "dataBase" | "repoUrl">;

const isHttpUrl = (s: unknown): s is string => {
  if (typeof s !== "string") return false;
  try { return /^https?:$/.test(new URL(s).protocol); } catch { return false; }
};
const slash = (u: string) => (u.endsWith("/") ? u : u + "/");

/** Validate and normalize. Throws an Error listing every problem. */
export function parseSiteConfig(text: string, source: string, { allowPlaceholders = false } = {}): SiteConfig {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`${source} is not valid JSON: ${(e as Error).message}`); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${source} must be a JSON object.`);
  const problems: string[] = [];
  for (const key of ["imageBase", "dataBase"] as const)
    if (!isHttpUrl(raw[key])) problems.push(`"${key}" must be an http(s) URL`);
  if (raw.repoUrl !== undefined && raw.repoUrl !== "" && !isHttpUrl(raw.repoUrl))
    problems.push(`"repoUrl" must be an http(s) URL (or left out)`);
  if (raw.localImageRoot !== undefined && typeof raw.localImageRoot !== "string")
    problems.push(`"localImageRoot" must be a path string (or left out)`);
  if (!allowPlaceholders && /YOUR-/.test(text)) problems.push(`replace the YOUR-… placeholder values`);
  if (problems.length) throw new Error(`${source}: ${problems.join("; ")}.`);
  return {
    imageBase: slash(raw.imageBase as string),
    dataBase: slash(raw.dataBase as string),
    ...(raw.repoUrl ? { repoUrl: (raw.repoUrl as string).replace(/\/+$/, "") } : {}),
    ...(typeof raw.localImageRoot === "string" ? { localImageRoot: raw.localImageRoot } : {}),
  };
}

/** Read src/site.config.json (or the example, for tests). */
export function loadSiteConfig(path: string, opts: { allowPlaceholders?: boolean } = {}): SiteConfig {
  if (!existsSync(path))
    throw new Error(`Missing ${path}.\nCopy src/site.config.example.json to src/site.config.json and fill in your URLs.`);
  return parseSiteConfig(readFileSync(path, "utf8"), path, opts);
}

export const publicSiteConfig = ({ imageBase, dataBase, repoUrl }: SiteConfig): PublicSiteConfig =>
  ({ imageBase, dataBase, ...(repoUrl ? { repoUrl } : {}) });
