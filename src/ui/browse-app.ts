import { parseDelimited } from "../lib/cex";
import { parseImagesIndex } from "../lib/images";
import { joinUrl } from "../lib/merge";
import type { ImageRecord } from "../lib/types";
import { versionInfo } from "../lib/version";
import { dirFromPaths, isImageName } from "../lib/local/tree";
import { folderNameFromUrl, safeRelPath } from "../lib/web/paths";
import { browseFolder, type PhotoSource } from "./folder-browser";
import type { HeicDecoder } from "./local/heic";
import { WebImages } from "./web/images";

export interface BrowseAppDeps {
  /** URL of the folder holding www-browse.html, images.cex and catalogs.cex (default: the page's folder). */
  base?: string;
  fetchImpl?: typeof fetch;
  /** HEIC decoder; null leaves HEIC to the browser (Safari) and links to the original otherwise. */
  decoder?: HeicDecoder | null;
  probeNative?: (f: Blob) => Promise<boolean>;
  /** Name shown for the top folder (default: the folder's name from the URL). */
  rootName?: string;
}

async function getText(fetchImpl: typeof fetch, url: string): Promise<string | null> {
  try {
    const r = await fetchImpl(url, { cache: "no-cache" });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/**
 * www-browse.html: put it in a folder on a web server (e.g. WWW_ROOT/images) next to an
 * images.cex made by `npm run images-index -- --root <that folder> --out <that folder>/images.cex
 * --catalogs`. It lets visitors browse everything below that folder: subfolders,
 * catalogs (.cex, read fresh on every load), grid and photo view. Browsers can't list
 * server folders, so images.cex (and catalogs.cex) say what's there.
 */
export async function startBrowseApp(root: HTMLElement, deps: BrowseAppDeps = {}): Promise<{ stop(): void } | null> {
  const fetchImpl = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = deps.base ?? new URL(".", location.href).href;
  const message = (...kids: (Node | string)[]) => {
    const box = document.createElement("div");
    box.className = "local-start";
    const h = document.createElement("h1");
    h.textContent = "Image Viewer";
    for (const k of kids) {
      const p = document.createElement("p");
      p.append(k);
      box.append(p);
    }
    box.append(versionInfo());
    root.replaceChildren(box);
  };

  message("Loading…");
  const [indexText, catalogsText] = await Promise.all([
    getText(fetchImpl, base + "images.cex"), getText(fetchImpl, base + "catalogs.cex"),
  ]);
  if (indexText === null) {
    message("There is no images.cex next to this page, so there's nothing to show yet.",
      "Create it with: npm run images-index -- --root <this folder> --out <this folder>/images.cex --catalogs");
    return null;
  }

  // Images, with their metadata, keyed by path below the folder.
  const index = new Map<string, ImageRecord>();
  for (const r of parseImagesIndex(indexText).records) {
    const safe = safeRelPath(r.path);
    if (safe && isImageName(safe)) index.set(safe, { ...r, path: safe });
  }
  const catalogPaths = catalogsText
    ? parseDelimited(catalogsText).rows.map((r) => safeRelPath(r.path ?? "")).filter((p): p is string => !!p)
    : [];

  const fetchFile = (path: string) => async () => {
    const r = await fetchImpl(joinUrl(base, path), { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return new File([await r.arrayBuffer()], path.split("/").pop()!);
  };
  const top = dirFromPaths(deps.rootName ?? folderNameFromUrl(location.href),
    [...index.keys(), ...catalogPaths].map((path) => ({ path, file: fetchFile(path) })));

  const decoder = deps.decoder === undefined ? null : deps.decoder;
  const source: PhotoSource = {
    async prepare(imgs) {
      const paths = new Map<string, string>();
      const sizes = new Map<string, { w: number; h: number }>();
      const records: ImageRecord[] = [];
      for (const { file, rel } of imgs) {
        const r = index.get(file.path);
        if (!r) continue;
        paths.set(rel, file.path);
        if (r.width && r.height) sizes.set(rel, { w: r.width, h: r.height });
        records.push({ ...r, path: rel });
      }
      return { records, images: new WebImages(base, paths, sizes, decoder, deps.probeNative, fetchImpl) };
    },
  };
  return browseFolder(root, {
    top, source,
    onTeardown: () => decoder?.cancelQueued(),
    emptyMessage: "This folder has no photos listed in images.cex.",
  });
}
