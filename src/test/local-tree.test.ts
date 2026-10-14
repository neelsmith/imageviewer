import { describe, it, expect } from "vitest";
import {
  collect, dirFromEntry, dirFromFileList, dirFromHandle, findDir, isImageName, isHeicName,
  type DirHandleLike, type EntryLike, type LocalDir,
} from "../lib/local/tree";

const file = (relPath: string) => {
  const f = new File(["x"], relPath.split("/").pop()!);
  Object.defineProperty(f, "webkitRelativePath", { value: relPath });
  return f;
};

async function snapshot(dir: LocalDir, recursive = true) {
  const { files } = await collect(dir, recursive);
  return files.map((f) => f.path);
}

const LIST = [
  "Family/b.jpg", "Family/A.HEIC", "Family/notes.txt", "Family/.DS_Store",
  "Family/stones/x.heic", "Family/stones/deep/y.png", "Family/_thumbs/b.jpg.jpg", "Family/.hidden/z.jpg",
];

describe("local folder tree", () => {
  it("builds a tree from an upload-style FileList, skipping hidden and _thumbs", async () => {
    const root = dirFromFileList(LIST.map(file))!;
    expect(root.name).toBe("Family");
    const top = await root.list();
    expect(top.dirs.map((d) => d.path)).toEqual(["stones"]);
    expect(top.files.map((f) => f.name)).toEqual(["A.HEIC", "b.jpg", "notes.txt"]);
    expect(await snapshot(root)).toEqual(["A.HEIC", "b.jpg", "notes.txt", "stones/x.heic", "stones/deep/y.png"]);
    expect(await snapshot(root, false)).toEqual(["A.HEIC", "b.jpg", "notes.txt"]);
    expect(dirFromFileList([])).toBeNull();
    const f = await top.files[1].file();
    expect(f.name).toBe("b.jpg");
  });

  it("reads a folder-picker handle lazily", async () => {
    let listed = 0;
    const fh = (name: string) => ({ kind: "file" as const, name, getFile: async () => new File(["x"], name) });
    const dh = (name: string, kids: (DirHandleLike | ReturnType<typeof fh>)[]): DirHandleLike => ({
      kind: "directory", name,
      async *entries() { listed++; for (const k of kids) yield [k.name, k] as [string, typeof k]; },
    });
    const root = dirFromHandle(dh("Pics", [fh("z.jpg"), dh("Sub", [fh("a.heic")]), fh(".DS_Store"), fh("a.jpg")]));
    expect(listed).toBe(0);
    const top = await root.list();
    expect(top.files.map((f) => f.path)).toEqual(["a.jpg", "z.jpg"]);
    expect(top.dirs.map((d) => d.path)).toEqual(["Sub"]);
    expect((await findDir(root, "Sub"))!.path).toBe("Sub");
    expect(await findDir(root, "Nope")).toBeNull();
    expect(await snapshot(root)).toEqual(["a.jpg", "z.jpg", "Sub/a.heic"]);
  });

  it("reads drag-and-drop entries in batches", async () => {
    const fe = (name: string): EntryLike => ({ isFile: true, isDirectory: false, name,
      file: (ok) => ok(new File(["x"], name)) });
    const de = (name: string, kids: EntryLike[]): EntryLike => ({
      isFile: false, isDirectory: true, name,
      createReader: () => { let i = 0; return { readEntries: (ok) => { ok(kids.slice(i, i + 2)); i += 2; } }; },
    });
    const root = dirFromEntry(de("Drop", [fe("1.jpg"), fe("2.jpg"), fe("3.jpg"), de("In", [fe("4.png")])]));
    expect(await snapshot(root)).toEqual(["1.jpg", "2.jpg", "3.jpg", "In/4.png"]);
  });

  it("recognizes image and HEIC names", () => {
    expect(["a.JPG", "b.jpeg", "c.heic", "d.HEIF", "e.webp"].every(isImageName)).toBe(true);
    expect(isImageName("notes.txt")).toBe(false);
    expect(isHeicName("x.HEIC")).toBe(true);
    expect(isHeicName("x.jpg")).toBe(false);
  });
});
