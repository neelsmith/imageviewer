// The utils/ scripts' default --root comes from "localImageRoot" in src/site.config.json
// (gitignored; see src/site.config.example.json), falling back to ~/pCloud Drive/Public Folder.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE_CONFIG = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "site.config.json");
export const FALLBACK_ROOT = join(homedir(), "pCloud Drive", "Public Folder");

/** "~" or "~/x" → home directory paths. */
export function expandHome(p, home = homedir()) {
  return p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p;
}

/** Default image root: localImageRoot from the site config if set, else the pCloud default. */
export function defaultImageRoot(configPath = SITE_CONFIG) {
  let cfg;
  try { cfg = JSON.parse(readFileSync(configPath, "utf8")); }
  catch (e) {
    if (e.code === "ENOENT") return FALLBACK_ROOT;
    throw new Error(`${configPath}: ${e.message}`);
  }
  const root = cfg?.localImageRoot;
  return typeof root === "string" && root.trim() ? expandHome(root.trim()) : FALLBACK_ROOT;
}
