import { parseCatalog } from "../lib/catalog";
import { mergePhotos } from "../lib/merge";
import type { ImageRecord, Photo } from "../lib/types";
import { readHash, withHash } from "../lib/hash";
import { collect, findDir, isCatalogName, isImageName, type LocalDir, type LocalFile } from "../lib/local/tree";
import { startApp, type AppHandle } from "./app";
import { missingNotice, type LoadResult, type Notice } from "./load";
import type { ImageProvider } from "./local/images";

/** Where photos and their metadata come from (local files, or a web server's index). */
export interface PhotoSource {
  /**
   * Metadata records (paths relative to the folder being viewed) and an image provider
   * for the given image files.
   */
  prepare(imgs: { file: LocalFile; rel: string }[]): Promise<{ records: ImageRecord[]; images: ImageProvider }>;
}

export interface FolderBrowserOptions {
  /** The top folder; navigation can't go above it. */
  top: LocalDir;
  source: PhotoSource;
  /** Show an "Open another folder" button that calls this (local.html). */
  onLeave?: () => void;
  /** Called whenever a view is torn down (e.g. cancel queued HEIC decoding). */
  onTeardown?: () => void;
  /** Message added to the notices when the top folder has no photos or subfolders. */
  emptyMessage?: string;
}

const NO_CATALOG = "none";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

/**
 * Folder navigation shared by local.html and www-browse.html: breadcrumb, subfolder buttons,
 * "Include subfolders", and a catalog menu for the .cex files in the folder, all on top of
 * the usual grid + photo view. State lives in the URL hash (#dir=a/b&sub=1&cat=x.cex).
 * Returns stop(), which removes the view and its listeners.
 */
export function browseFolder(root: HTMLElement, opts: FolderBrowserOptions): { stop(): void } {
  const { top, source } = opts;
  let view: AppHandle | null = null;
  let current: ImageProvider | null = null;
  let shownKey: string | null = null;
  let stopped = false;
  let routeId = 0;

  // startApp needs the provider up front; the real one is made when the photos load.
  const images: ImageProvider = {
    tile: (p) => current!.tile(p),
    full: (p) => current!.full(p),
    placeholder: (p) => current?.placeholder(p) ?? null,
    size: (p) => current?.size(p) ?? null,
    tileFallback: (p) => current?.tileFallback ? current.tileFallback(p) : Promise.reject(new Error("no fallback")),
    originalUrl: (p: Photo) => current?.originalUrl?.(p) ?? "",
  };

  const stateKey = () => {
    const h = readHash(location.hash);
    return JSON.stringify([h.dir ?? "", h.sub === "1", h.cat ?? ""]);
  };

  function teardown() {
    view?.destroy(); view = null;
    current?.dispose?.(); current = null;
    opts.onTeardown?.();
  }

  const go = (changes: Record<string, string | null>) => {
    location.hash = withHash(location.hash, { photo: null, ...changes }) || "#";
  };

  async function route() {
    if (stopped) return;
    const key = stateKey();
    if (key === shownKey) return;
    shownKey = key;
    const id = ++routeId;
    teardown();
    const h = readHash(location.hash);
    const warnings: Notice[] = [];
    let dir = await findDir(top, h.dir ?? "");
    if (!dir) { warnings.push(`Folder “${h.dir}” was not found.`); dir = top; }
    const listing = await dir.list();
    if (id !== routeId || stopped) return;
    const catalogs = listing.files.filter((f) => isCatalogName(f.name)).map((f) => f.name);
    const cat = h.cat === NO_CATALOG ? ""
      : h.cat && catalogs.includes(h.cat) ? h.cat
      : !h.cat && catalogs.includes("catalog.cex") ? "catalog.cex" : "";
    if (h.cat && h.cat !== NO_CATALOG && !catalogs.includes(h.cat)) warnings.push(`Catalog “${h.cat}” is not in this folder.`);
    const includeSub = h.sub === "1";
    // A catalog may name photos in subfolders, so the whole tree is read when one is in use.
    const recursive = includeSub || !!cat;
    const here = dir;
    document.title = `${here.path ? here.name : top.name} · Image Viewer`;
    const rel = (path: string) => (here.path ? path.slice(here.path.length + 1) : path);

    const load = async (): Promise<LoadResult> => {
      const { files: found } = await collect(here, recursive);
      const imgs = found.filter((f) => isImageName(f.name)).map((file) => ({ file, rel: rel(file.path) }));
      const { records, images: provider } = await source.prepare(imgs);
      if (id !== routeId) { provider.dispose?.(); return { photos: [], missingFiles: [], warnings: [] }; }
      current = provider;
      let entries: ReturnType<typeof parseCatalog>["entries"] = [];
      if (cat) {
        const cf = listing.files.find((f) => f.name === cat)!;
        try {
          const parsed = parseCatalog(await (await cf.file()).text());
          entries = parsed.entries;
          warnings.push(...parsed.errors.map((e) => `${cat} ${e}`));
        } catch (e) {
          warnings.push(`${cat} could not be read: ${(e as Error).message}`);
        }
      }
      const merged = mergePhotos(records, entries, "");
      const photos = merged.photos.map((p) => ({ ...p, url: "", thumb: "" }));
      if (merged.missingFiles.length)
        warnings.push(missingNotice(`${merged.missingFiles.length} photo(s) listed in ${cat} were not found in this folder.`,
          merged.missingFiles, merged.photos));
      if (!imgs.length && !listing.dirs.length) warnings.push(opts.emptyMessage ?? "This folder has no photos.");
      return { photos, missingFiles: merged.missingFiles, warnings };
    };

    view = startApp(root, { imageBase: "", dataBase: "" }, {
      load, images, localFallback: false, catalogToggle: !!cat, markUncataloged: !!cat,
      toolbar: toolbar(here, catalogs, cat, includeSub),
      banner: subfolders(listing.dirs, rel),
      exportName: cat || (here.path ? here.name : top.name),
    });
  }

  function toolbar(here: LocalDir, catalogs: string[], cat: string, includeSub: boolean): HTMLElement[] {
    // Breadcrumb: the top folder, then each subfolder down to this one.
    const crumbs = el("nav", { class: "crumbs", "aria-label": "Folder" });
    const parts = here.path ? here.path.split("/") : [];
    const crumb = (label: string, path: string, isCurrent: boolean) => {
      if (isCurrent) return el("span", { class: "crumb current", "aria-current": "page" }, label);
      const b = el("button", { type: "button", class: "crumb" }, label);
      b.addEventListener("click", () => go({ dir: path || null }));
      return b;
    };
    crumbs.append(crumb(top.name, "", parts.length === 0));
    parts.forEach((p, i) => crumbs.append(el("span", { class: "sep" }, "/"),
      crumb(p, parts.slice(0, i + 1).join("/"), i === parts.length - 1)));

    const items: HTMLElement[] = [crumbs];
    const sub = el("input", { type: "checkbox" });
    sub.checked = includeSub || !!cat;
    sub.disabled = !!cat;
    sub.addEventListener("change", () => go({ sub: sub.checked ? "1" : null }));
    items.push(el("label", { class: "toggle", title: cat ? "A catalog always reads the whole folder tree" : "" },
      sub, " Include subfolders"));
    if (catalogs.length) {
      const sel = el("select", { class: "catalog-select", "aria-label": "Catalog" });
      sel.add(new Option("No catalog", NO_CATALOG, false, !cat));
      for (const c of catalogs) sel.add(new Option(`Catalog: ${c}`, c, false, c === cat));
      sel.addEventListener("change", () => go({ cat: sel.value, all: null }));
      items.push(sel);
    }
    if (opts.onLeave) {
      const other = el("button", { type: "button", class: "lock" }, "Open another folder");
      other.addEventListener("click", opts.onLeave);
      items.push(other);
    }
    return items;
  }

  function subfolders(dirs: LocalDir[], rel: (p: string) => string): HTMLElement {
    const box = el("div", { class: "subfolders" });
    if (!dirs.length) { box.hidden = true; return box; }
    for (const d of dirs) {
      const b = el("button", { type: "button", class: "subfolder", title: rel(d.path) }, "📁 ", d.name);
      b.addEventListener("click", () => go({ dir: d.path }));
      box.append(b);
    }
    return box;
  }

  const onHash = () => { route(); };
  window.addEventListener("hashchange", onHash);
  route();
  return {
    stop() {
      stopped = true;
      routeId++;
      window.removeEventListener("hashchange", onHash);
      teardown();
    },
  };
}
