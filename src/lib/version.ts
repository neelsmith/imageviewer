/** GitHub repo page from site.config.json ("" if not set: no release links). */
export const REPO_URL: string = __SITE_CONFIG__.repoUrl ?? "";

export const APP_VERSION: string = __APP_VERSION__;

/** GitHub release page for a version, or null for dev/pre-release builds or no repoUrl. */
export function releaseUrl(version: string, repoUrl: string = REPO_URL): string | null {
  return repoUrl && /^\d+\.\d+\.\d+$/.test(version) ? `${repoUrl}/releases/tag/v${version}` : null;
}

/** Small, muted version label; links to the release page when there is one. */
export function versionLabel(version: string = APP_VERSION): HTMLElement {
  const url = releaseUrl(version);
  const el = document.createElement(url ? "a" : "span");
  el.className = "version";
  el.textContent = `v${version}`;
  if (url) {
    (el as HTMLAnchorElement).href = url;
    (el as HTMLAnchorElement).target = "_blank";
    (el as HTMLAnchorElement).rel = "noopener";
    el.title = "Release notes";
  }
  return el;
}

// ---- Data "last updated" date ----
// data/last-updated.txt holds a date Neel sets by hand when he updates the catalogs or
// images (YYYY-MM-DD, e.g. 2026-10-13). The apps read it at run time and show it next to
// the app version.

let dataUpdated = ""; // YYYY-MM-DD, or "" when unknown

/** The first non-blank, non-comment (`//`, `#`) line if it's a real YYYY-MM-DD date; else "". */
export function parseDataUpdated(text: string): string {
  const line = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim())
    .find((l) => l && !l.startsWith("//") && !l.startsWith("#")) ?? "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(line);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? line : "";
}

/** "2026-10-13" → "Oct 13, 2026" (in the viewer's locale). */
export function formatDataUpdated(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Record the date and update every label already on the page. */
export function setDataUpdated(iso: string): void {
  dataUpdated = iso;
  document.querySelectorAll<HTMLElement>(".data-updated").forEach(fillDataLabel);
}

function fillDataLabel(el: HTMLElement) {
  el.textContent = dataUpdated ? ` · data updated ${formatDataUpdated(dataUpdated)}` : "";
  el.hidden = !dataUpdated;
}

/** App version link plus the data's last-updated date (filled in once it has loaded). */
export function versionInfo(): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "versions";
  const data = document.createElement("span");
  data.className = "data-updated version";
  data.title = "Catalogs and images last updated (data/last-updated.txt)";
  fillDataLabel(data);
  wrap.append(versionLabel(), data);
  return wrap;
}
