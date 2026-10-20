import exifr from "exifr";
import type { ImageRecord } from "../lib/types";
import { versionInfo } from "../lib/version";
import { dirFromEntry, dirFromFileList, dirFromHandle, type DirHandleLike, type EntryLike, type LocalDir } from "../lib/local/tree";
import { coordPlace, mapLimit, metaFromExif, NO_META, type PhotoMeta } from "../lib/local/meta";
import { browseFolder, type PhotoSource } from "./folder-browser";
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

/** Photos from local files: EXIF read in the browser, images via LocalImages. */
export function localSource(deps: { readExif: LocalAppDeps["readExif"]; decoder: HeicDecoder;
  probeNative?: (f: File) => Promise<boolean> }): PhotoSource {
  const readExif = deps.readExif ?? exifrRead;
  return {
    async prepare(imgs) {
      const files = new Map<string, File>();
      const loaded = await mapLimit(imgs, 8, async ({ file: f, rel }) => {
        const file = await f.file();
        let meta: PhotoMeta = NO_META;
        try { meta = metaFromExif(await readExif(file)); } catch { /* no readable metadata */ }
        return { rel, file, meta };
      });
      const records: ImageRecord[] = loaded.map(({ rel, file, meta }) => {
        files.set(rel, file);
        return { path: rel, date: meta.date, lat: meta.lat, lon: meta.lon, place: coordPlace(meta.lat, meta.lon), width: null, height: null };
      });
      return { records, images: new LocalImages(files, deps.decoder, deps.probeNative ?? probeNativeHeic) };
    },
  };
}

/**
 * local.html: browse a folder on this computer. The person opens a folder (folder
 * picker, upload-style control or drag-and-drop); then the shared folder browser takes
 * over (subfolders, catalogs, grid, photo view).
 */
export function startLocalApp(root: HTMLElement, deps: LocalAppDeps = {}): { open(dir: LocalDir): void } {
  const decoder = deps.decoder ?? new HeicDecoder();
  const source = localSource({ readExif: deps.readExif, decoder, probeNative: deps.probeNative });
  const pick = deps.pickDirectory !== undefined ? deps.pickDirectory
    : "showDirectoryPicker" in window
      ? () => (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandleLike> }).showDirectoryPicker({ mode: "read" })
      : null;
  let browser: { stop(): void } | null = null;

  // ---- Start screen ----
  function startScreen(message = "") {
    browser?.stop(); browser = null;
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

  function open(dir: LocalDir) {
    browser?.stop();
    // A fresh folder starts at its top, without subfolders or catalog choices from before.
    history.replaceState(null, "", location.pathname + location.search);
    browser = browseFolder(root, {
      top: dir, source,
      onTeardown: () => decoder.cancelQueued(),
      onLeave: () => { history.replaceState(null, "", location.pathname + location.search); startScreen(); },
    });
  }

  startScreen();
  return { open };
}
