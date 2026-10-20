import exifr from "exifr";
import { parseCatalog } from "../lib/catalog";
import { mergePhotos } from "../lib/merge";
import type { ImageRecord } from "../lib/types";
import { readHash, withHash } from "../lib/hash";
import { versionInfo } from "../lib/version";
import {
  collect, dirFromEntry, dirFromFileList, dirFromHandle, findDir, isCatalogName, isImageName,
  type DirHandleLike, type EntryLike, type LocalDir,
} from "../lib/local/tree";
import { coordPlace, mapLimit, metaFromExif, NO_META, type PhotoMeta } from "../lib/local/meta";
import { startApp, type AppHandle } from "./app";
import type { LoadResult } from "./load";
import { HeicDecoder } from "./local/heic";
import { LocalImages, probeNativeHeic } from "./local/images";

export interface LocalAppDeps {
  /** Read EXIF (date, GPS) from a file; default uses exifr. */
  readExif?: (f: File) => Promise<Record<string, unknown> | undefined>;
  decoder?: HeicDecoder;
  probeNative?: (f: File) => Promise<boolean>;
  /** Folder picker; default window.showDirectoryPicker when the browser has it. */
  pickDirectory?: (() => Promise<DirHandleLike>) | null;
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

async function exifrRead(f: File): Promise<Record<string, unknown> | undefined> {
  return exifr.parse(f, {
    tiff: true, exif: true, gps: true, ifd1: false, xmp: false, icc: false, iptc: false,
    reviveValues: false, translateValues: false,
  });
}

/**
 * local.html: browse a folder on this computer. The person opens a folder (folder
 * picker, upload-style control or drag-and-drop); inside it they can move between
 * subfolders, include subfolders, and pick a catalog (.cex) found in the folder.
 * The folder, subfolder setting and catalog are kept in the URL hash
 * (#dir=a/b&sub=1&cat=x.cex) so Back/Forward work within a session.
 */
export function startLocalApp(root: HTMLElement, deps: LocalAppDeps = {}): { open(dir: LocalDir): void } {
  const readExif = deps.readExif ?? exifrRead;
  const decoder = deps.decoder ?? new HeicDecoder();
  const pick = deps.pickDirectory !== undefined ? deps.pickDirectory
    : "showDirectoryPicker" in window
      ? () => (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandleLike> }).showDirectoryPicker({ mode: "read" })
      : null;

  let top: LocalDir | null = null;
  let view: AppHandle | null = null;
  let images: LocalImages | null = null;
  let shownKey: string | null = null;

  const stateKey = () => {
    const h = readHash(location.hash);
    return JSON.stringify([h.dir ?? "", h.sub === "1", h.cat ?? ""]);
  };

  function teardown() {
    view?.destroy(); view = null;
    images?.dispose(); images = null;
    decoder.cancelQueued();
  }

  // ---- Start screen ----
  function startScreen(message = "") {
    teardown();
    top = null; shownKey = null;
    document.title = "Image Viewer · local folders";
    const buttons: HTMLElement[] = [];
    if (pick) {
      const b = el("button", { type: "button", class: "primary" }, "Choose a folder…");
      b.addEventListener("click", async () => {
        try { open(dirFromHandle(await pick())); }
        catch (e) { if ((e as Error).name !== "AbortError") startScreen(`Couldn't open that folder: ${(e as Error).message}`); }
      });
      buttons.push(b);
    } else {
      const input = el("input", { type: "file", hidden: "" });
      input.setAttribute("webkitdirectory", "");
      input.multiple = true;
      input.addEventListener("change", () => {
        const d = dirFromFileList(input.files ?? []);
        if (d) open(d); else startScreen("That folder is empty.");
      });
      buttons.push(el("label", { class: "primary" }, "Choose a folder…", input));
    }
    const drop = el("div", { class: "drop" }, "…or drag a folder here");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault(); drop.classList.remove("over");
      const entry = [...(e.dataTransfer?.items ?? [])]
        .map((i) => (i as DataTransferItem & { webkitGetAsEntry?(): EntryLike | null }).webkitGetAsEntry?.())
        .find((x) => x?.isDirectory);
      if (entry) open(dirFromEntry(entry)); else startScreen("Please drop a folder (not individual files).");
    });
    root.replaceChildren(el("div", { class: "local-start" },
      el("h1", {}, "Image Viewer"),
      el("p", {}, "Browse the photos in a folder on this computer. Nothing is uploaded: the files are read here, in this page."),
      el("div", { class: "local-actions" }, ...buttons), drop,
      ...(message ? [el("p", { class: "local-message", role: "alert" }, message)] : []),
      el("p", { class: "local-note" }, pick
        ? "Your browser will ask to let this page view the folder."
        : "Your browser may say it will “upload” the files — nothing leaves this computer."),
      versionInfo()));
  }

  // ---- Folder view ----
  function open(dir: LocalDir) {
    top = dir;
    shownKey = null;
    // A fresh folder starts at its top, without subfolders or catalog choices from before.
    history.replaceState(null, "", location.pathname + location.search);
    route();
  }

  async function route() {
    if (!top) return;
    const key = stateKey();
    if (key === shownKey) return;
    shownKey = key;
    teardown();
    const h = readHash(location.hash);
    const warnings: string[] = [];
    let dir = await findDir(top, h.dir ?? "");
    if (!dir) { warnings.push(`Folder “${h.dir}” was not found.`); dir = top; }
    const listing = await dir.list();
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

    const files = new Map<string, File>();
    images = new LocalImages(files, decoder, deps.probeNative ?? probeNativeHeic);
    const rel = (path: string) => (here.path ? path.slice(here.path.length + 1) : path);

    const load = async (): Promise<LoadResult> => {
      const { files: found } = await collect(here, recursive);
      const imgs = found.filter((f) => isImageName(f.name));
      const loaded = await mapLimit(imgs, 8, async (f) => {
        const file = await f.file();
        let meta: PhotoMeta = NO_META;
        try { meta = metaFromExif(await readExif(file)); } catch { /* no readable metadata */ }
        return { path: rel(f.path), file, meta };
      });
      const records: ImageRecord[] = loaded.map(({ path, file, meta }) => {
        files.set(path, file);
        return { path, date: meta.date, lat: meta.lat, lon: meta.lon, place: coordPlace(meta.lat, meta.lon), width: null, height: null };
      });
      let entries: ReturnType<typeof parseCatalog>["entries"] = [];
      if (cat) {
        const cf = listing.files.find((f) => f.name === cat)!;
        const parsed = parseCatalog(await (await cf.file()).text());
        entries = parsed.entries;
        warnings.push(...parsed.errors.map((e) => `${cat} ${e}`));
      }
      const merged = mergePhotos(records, entries, "");
      const photos = merged.photos.map((p) => ({ ...p, url: "", thumb: "" }));
      if (merged.missingFiles.length)
        warnings.push(`${merged.missingFiles.length} photo(s) listed in ${cat} were not found in this folder.`);
      if (!imgs.length && !listing.dirs.length) warnings.push("This folder has no photos.");
      return { photos, missingFiles: merged.missingFiles, warnings };
    };

    view = startApp(root, { imageBase: "", dataBase: "" }, {
      load, images, localFallback: false, catalogToggle: !!cat, markUncataloged: !!cat,
      toolbar: toolbar(here, catalogs, cat, includeSub),
      banner: subfolders(listing.dirs, rel),
      exportName: cat || (here.path ? here.name : top.name),
    });
  }

  const go = (changes: Record<string, string | null>) => {
    location.hash = withHash(location.hash, { photo: null, ...changes }) || "#";
  };

  function toolbar(here: LocalDir, catalogs: string[], cat: string, includeSub: boolean): HTMLElement[] {
    // Breadcrumb: the opened folder, then each subfolder down to this one.
    const crumbs = el("nav", { class: "crumbs", "aria-label": "Folder" });
    const parts = here.path ? here.path.split("/") : [];
    const crumb = (label: string, path: string, current: boolean) => {
      if (current) return el("span", { class: "crumb current", "aria-current": "page" }, label);
      const b = el("button", { type: "button", class: "crumb" }, label);
      b.addEventListener("click", () => go({ dir: path || null }));
      return b;
    };
    crumbs.append(crumb(top!.name, "", parts.length === 0));
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
    const other = el("button", { type: "button", class: "lock" }, "Open another folder");
    other.addEventListener("click", () => { history.replaceState(null, "", location.pathname + location.search); startScreen(); });
    items.push(other);
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

  window.addEventListener("hashchange", () => { if (top) route(); });
  startScreen();
  return { open };
}
