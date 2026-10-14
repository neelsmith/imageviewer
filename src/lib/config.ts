export interface AppConfig {
  /** Root URL of the pCloud Public Folder; image paths are relative to this. */
  imageBase: string;
  /** Directory URL holding catalog.cex and images.cex. */
  dataBase: string;
}

/** From src/site.config.json at build time (see build/site-config.ts). */
export const DEFAULTS: AppConfig = {
  imageBase: __SITE_CONFIG__.imageBase,
  dataBase: __SITE_CONFIG__.dataBase,
};

const RAW_GITHUB = /^(https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/)([^/]+)(\/.*)$/;

/**
 * Point a raw.githubusercontent.com data URL at another branch. Other hosts have
 * no branches, so their URL is returned unchanged.
 */
export function withBranch(dataBase: string, branch: string): string {
  const m = RAW_GITHUB.exec(dataBase);
  return m ? `${m[1]}${encodeURIComponent(branch)}${m[3]}` : dataBase;
}

/**
 * Overrides from the page URL:
 *   ?branch=dev        read data/ from another branch
 *   ?data=<url>        read data files from any directory URL
 *   ?images=<url>      read images from another base URL
 */
export function configFromSearch(search: string, base: AppConfig = DEFAULTS): AppConfig {
  const q = new URLSearchParams(search);
  const slash = (u: string) => (u.endsWith("/") ? u : u + "/");
  const cfg = { ...base };
  const branch = q.get("branch");
  if (branch) cfg.dataBase = withBranch(cfg.dataBase, branch);
  const data = q.get("data");
  if (data) cfg.dataBase = slash(data);
  const images = q.get("images");
  if (images) cfg.imageBase = slash(images);
  return cfg;
}
