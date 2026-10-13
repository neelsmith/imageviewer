export interface AppConfig {
  /** Root URL of the pCloud Public Folder; image paths are relative to this. */
  imageBase: string;
  /** Directory URL holding catalog.cex and images.cex. */
  dataBase: string;
}

const REPO_RAW = "https://raw.githubusercontent.com/neelsmith/imageviewer";

export const DEFAULTS: AppConfig = {
  imageBase: "https://filedn.com/ldIRRzyYNhLyfSxf2i1xC0B/",
  dataBase: `${REPO_RAW}/main/data/`,
};

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
  if (branch) cfg.dataBase = `${REPO_RAW}/${encodeURIComponent(branch)}/data/`;
  const data = q.get("data");
  if (data) cfg.dataBase = slash(data);
  const images = q.get("images");
  if (images) cfg.imageBase = slash(images);
  return cfg;
}
