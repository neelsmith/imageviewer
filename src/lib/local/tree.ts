/**
 * A read-only view of a local folder tree, whichever way the browser gave it to us:
 * the folder picker (FileSystemDirectoryHandle), the upload-style folder control
 * (a flat FileList with webkitRelativePath) or drag-and-drop (FileSystemDirectoryEntry).
 * Paths are forward-slash, relative to the folder the person opened.
 */
export interface LocalFile {
  name: string;
  /** Path relative to the opened folder, e.g. "trip/IMG_1.HEIC". */
  path: string;
  file(): Promise<File>;
}

export interface LocalDir {
  name: string;
  /** "" for the opened folder itself. */
  path: string;
  list(): Promise<{ dirs: LocalDir[]; files: LocalFile[] }>;
}

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif)$/i;
export const isImageName = (name: string) => IMAGE_RE.test(name);
export const isHeicName = (name: string) => /\.hei[cf]$/i.test(name);
export const isCatalogName = (name: string) => /\.cex$/i.test(name);
/** Hidden files/folders, macOS junk, and pCloud thumbnail folders are skipped. */
export const isSkipped = (name: string) => name.startsWith(".") || name === "_thumbs" || name === "__MACOSX";

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

// ---- Folder picker ----

/** Minimal shape of FileSystemDirectoryHandle we use (lets tests pass fakes). */
export interface DirHandleLike {
  kind: "directory";
  name: string;
  entries(): AsyncIterable<[string, DirHandleLike | FileHandleLike]>;
}
export interface FileHandleLike { kind: "file"; name: string; getFile(): Promise<File> }

export function dirFromHandle(handle: DirHandleLike, path = ""): LocalDir {
  return {
    name: handle.name,
    path,
    async list() {
      const dirs: LocalDir[] = [];
      const files: LocalFile[] = [];
      for await (const [name, h] of handle.entries()) {
        if (isSkipped(name)) continue;
        if (h.kind === "directory") dirs.push(dirFromHandle(h, join(path, name)));
        else files.push({ name, path: join(path, name), file: () => (h as FileHandleLike).getFile() });
      }
      return { dirs: dirs.sort(byName), files: files.sort(byName) };
    },
  };
}

// ---- A flat list of paths (upload-style folder control, web index) ----

interface Node { dirs: Map<string, Node>; files: Map<string, () => Promise<File>> }
const newNode = (): Node => ({ dirs: new Map(), files: new Map() });

/**
 * Build a tree from a flat list of forward-slash paths relative to the root, each with
 * a way to get its File. Hidden/skipped segments are left out.
 */
export function dirFromPaths(rootName: string, entries: { path: string; file: () => Promise<File> }[]): LocalDir {
  const root = newNode();
  for (const { path, file } of entries) {
    const parts = path.split("/");
    if (parts.some(isSkipped)) continue;
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, newNode());
      node = node.dirs.get(part)!;
    }
    node.files.set(parts[parts.length - 1], file);
  }
  const make = (node: Node, name: string, path: string): LocalDir => ({
    name,
    path,
    async list() {
      return {
        dirs: [...node.dirs].map(([n, d]) => make(d, n, join(path, n))).sort(byName),
        files: [...node.files].map(([n, f]) => ({ name: n, path: join(path, n), file: f })).sort(byName),
      };
    },
  });
  return make(root, rootName, "");
}

/**
 * Build a tree from the files of an <input webkitdirectory>. Every path starts with
 * the chosen folder's name, which becomes the root. Returns null for an empty list.
 */
export function dirFromFileList(list: ArrayLike<File>): LocalDir | null {
  const files = Array.from(list);
  if (!files.length) return null;
  const rootName = (files[0].webkitRelativePath || files[0].name).split("/")[0];
  return dirFromPaths(rootName, files.map((f) => {
    const parts = (f.webkitRelativePath || f.name).split("/");
    if (parts.length > 1) parts.shift(); // drop the root folder's own name
    return { path: parts.join("/"), file: async () => f };
  }));
}

// ---- Drag and drop ----

/** Minimal shapes of FileSystemEntry / DirectoryEntry (webkitGetAsEntry). */
export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(ok: (f: File) => void, fail: (e: unknown) => void): void;
  createReader?(): { readEntries(ok: (batch: EntryLike[]) => void, fail: (e: unknown) => void): void };
}

export function dirFromEntry(entry: EntryLike, path = ""): LocalDir {
  return {
    name: entry.name,
    path,
    async list() {
      const reader = entry.createReader!();
      const all: EntryLike[] = [];
      // readEntries returns batches (about 100 at a time in Chrome) until an empty one.
      for (;;) {
        const batch = await new Promise<EntryLike[]>((ok, fail) => reader.readEntries(ok, fail));
        if (!batch.length) break;
        all.push(...batch);
      }
      const dirs: LocalDir[] = [];
      const files: LocalFile[] = [];
      for (const e of all) {
        if (isSkipped(e.name)) continue;
        if (e.isDirectory) dirs.push(dirFromEntry(e, join(path, e.name)));
        else if (e.isFile) files.push({
          name: e.name, path: join(path, e.name),
          file: () => new Promise<File>((ok, fail) => e.file!(ok, fail)),
        });
      }
      return { dirs: dirs.sort(byName), files: files.sort(byName) };
    },
  };
}

// ---- Helpers ----

/** Find the folder at a relative path ("" = dir itself); null if it doesn't exist. */
export async function findDir(dir: LocalDir, path: string): Promise<LocalDir | null> {
  let cur = dir;
  for (const part of path.split("/").filter(Boolean)) {
    const next = (await cur.list()).dirs.find((d) => d.name === part);
    if (!next) return null;
    cur = next;
  }
  return cur;
}

/** All files under dir (optionally recursive), plus its immediate subfolders. */
export async function collect(dir: LocalDir, recursive: boolean): Promise<{ files: LocalFile[]; subdirs: LocalDir[] }> {
  const top = await dir.list();
  const files = [...top.files];
  if (recursive) {
    const stack = [...top.dirs];
    while (stack.length) {
      const d = stack.shift()!;
      const { dirs, files: fs } = await d.list();
      files.push(...fs);
      stack.unshift(...dirs);
    }
  }
  return { files, subdirs: top.dirs };
}
