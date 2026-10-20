/**
 * A path from images.cex / catalogs.cex, made safe to resolve below the app's folder:
 * forward slashes, no "." or ".." segments, no leading "/", no scheme or backslashes.
 * Returns null for anything that could point outside (or is empty).
 */
export function safeRelPath(p: string): string | null {
  const t = p.trim();
  if (!t || t.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("/") || /[\u0000-\u001f]/.test(t)) return null;
  const parts = t.split("/");
  if (parts.some((s) => s === "" || s === "." || s === "..")) return null;
  return parts.join("/");
}

/** The folder name to show for the app's own folder, from its URL ("…/images/www-browse.html" → "images"). */
export function folderNameFromUrl(href: string, fallback = "Photos"): string {
  const segs = new URL(href).pathname.split("/").filter(Boolean);
  if (segs.length && /\.[a-z0-9]+$/i.test(segs[segs.length - 1])) segs.pop();
  const last = segs.pop();
  try { return last ? decodeURIComponent(last) : fallback; } catch { return last ?? fallback; }
}
