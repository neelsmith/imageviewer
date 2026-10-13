export const REPO_URL = "https://github.com/neelsmith/imageviewer";

export const APP_VERSION: string = __APP_VERSION__;

/** GitHub release page for a version, or null for dev/pre-release builds. */
export function releaseUrl(version: string): string | null {
  return /^\d+\.\d+\.\d+$/.test(version) ? `${REPO_URL}/releases/tag/v${version}` : null;
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
