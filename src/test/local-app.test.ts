import { describe, it, expect, beforeEach, vi } from "vitest";
import { startLocalApp } from "../ui/local-app";
import { dirFromFileList } from "../lib/local/tree";
import type { HeicDecoder } from "../ui/local/heic";

// UI flow test for local.html with a fake folder, fake EXIF reader and fake HEIC decoder.
const file = (relPath: string, body = "x") => {
  const f = new File([body], relPath.split("/").pop()!);
  Object.defineProperty(f, "webkitRelativePath", { value: relPath });
  return f;
};
const CATALOG = "path|caption|credits|license|tags\nstones/s2.heic|Second stone|||Stones\nmisc/park.jpg|Park|||Outdoors\nstones/s1.heic|First stone|||Stones\n";
const folder = () => dirFromFileList([
  file("Family/top.heic"), file("Family/catalog.cex", CATALOG), file("Family/other.cex", "path|caption\n"),
  file("Family/stones/s1.heic"), file("Family/stones/s2.heic"), file("Family/misc/park.jpg"),
])!;
const EXIF: Record<string, Record<string, unknown>> = {
  "top.heic": { DateTimeOriginal: "2025:09:01 10:00:00" },
  "s1.heic": { DateTimeOriginal: "2025:09:29 10:00:00", latitude: 39.3, longitude: -76.6 },
  "s2.heic": { DateTimeOriginal: "2025:09:29 11:00:00" },
  "park.jpg": { DateTimeOriginal: "2015:05:01 10:00:00" },
};
const decoder = {
  thumb: async () => ({ blob: new Blob(["t"]), w: 240, h: 320, fullW: 3024, fullH: 4032, source: "embedded" }),
  full: async () => ({ blob: new Blob(["f"]), w: 3024, h: 4032, fullW: 3024, fullH: 4032, source: "full" }),
  cancelQueued: () => {},
} as unknown as HeicDecoder;

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function settle(root: HTMLElement) {
  for (let i = 0; i < 60; i++) {
    await tick(5);
    if (root.querySelector(".bar") && !root.querySelector(".empty")?.textContent?.includes("Loading")) return;
  }
}
const read = (root: HTMLElement) => ({
  crumbs: [...root.querySelectorAll(".crumbs .crumb")].map((c) => c.textContent).join(" / "),
  sub: [...root.querySelectorAll(".subfolder")].map((c) => c.textContent!.replace("📁 ", "")),
  catalog: root.querySelector<HTMLSelectElement>(".catalog-select")?.value ?? null,
  tiles: [...root.querySelectorAll<HTMLElement>(".tile")].map((t) => t.title),
  count: root.querySelector(".count")?.textContent,
});
/** Do something that changes the hash, then let the app react. */
async function navigate(root: HTMLElement, act: () => void) {
  act();
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  await settle(root);
}

describe("local.html", () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/local.html");
    root = document.createElement("div");
    document.body.append(root);
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    URL.revokeObjectURL = vi.fn();
  });

  it("starts with a folder chooser (upload-style control when there's no folder picker)", () => {
    startLocalApp(root, { pickDirectory: null, decoder });
    expect(root.querySelector(".local-start input[type=file]")!.hasAttribute("webkitdirectory")).toBe(true);
    expect(root.querySelector(".drop")).not.toBeNull();
  });

  it("opens a folder: catalog.cex by default, catalog order, subfolders, navigation", async () => {
    const app = startLocalApp(root, { pickDirectory: null, decoder, probeNative: async () => false,
      readExif: async (f) => EXIF[f.name] });
    app.open(folder());
    await settle(root);
    expect(read(root)).toEqual({
      crumbs: "Family", sub: ["misc", "stones"], catalog: "catalog.cex",
      // Grouped by location (the default): photos with GPS, then "No location"; catalog order within each.
      tiles: ["First stone", "Second stone", "Park"], count: "3 of 3 cataloged photos",
    });

    // No catalog: just this folder's own photos.
    const sel = root.querySelector<HTMLSelectElement>(".catalog-select")!;
    await navigate(root, () => { sel.value = "none"; sel.dispatchEvent(new Event("change")); });
    expect(read(root).tiles).toEqual(["top.heic"]);
    expect(root.querySelector(".tile.uncataloged")).toBeNull(); // no catalog → nothing marked

    // Into a subfolder via its button; breadcrumb follows.
    await navigate(root, () => root.querySelector<HTMLButtonElement>(".subfolder:last-child")!.click());
    expect(read(root)).toMatchObject({ crumbs: "Family / stones", sub: [], catalog: null,
      tiles: ["s1.heic", "s2.heic"] }); // s1 has GPS, so its location group comes first

    // Back to the top via the breadcrumb, then include subfolders.
    await navigate(root, () => root.querySelector<HTMLButtonElement>(".crumbs button")!.click());
    expect(read(root).crumbs).toBe("Family");
    const sub = root.querySelectorAll<HTMLInputElement>(".toggle input")[0];
    await navigate(root, () => sub.click());
    expect(read(root).count).toBe("4 of 4 photos");
    expect(location.hash).toContain("sub=1");
  });

  it("tiles get their image from the provider and GPS gives a coordinate place", async () => {
    const app = startLocalApp(root, { pickDirectory: null, decoder, probeNative: async () => false,
      readExif: async (f) => EXIF[f.name] });
    app.open(folder());
    await settle(root);
    await tick(10);
    const imgs = [...root.querySelectorAll<HTMLImageElement>(".tile img")];
    expect(imgs.length).toBe(3);
    expect(imgs.every((i) => i.src.startsWith("blob:"))).toBe(true);
    expect(root.querySelector('button[data-mode="location"]')!.getAttribute("aria-checked")).toBe("true");
    expect([...root.querySelectorAll(".group h2")].map((h) => h.firstChild!.textContent))
      .toEqual(["39.30° N, 76.60° W", "No location"]);
  });

  it("'Open another folder' returns to the start screen", async () => {
    const app = startLocalApp(root, { pickDirectory: null, decoder, readExif: async () => undefined });
    app.open(folder());
    await settle(root);
    [...root.querySelectorAll<HTMLButtonElement>(".bar .lock")].find((b) => b.textContent === "Open another folder")!.click();
    expect(root.querySelector(".local-start")).not.toBeNull();
  });
});
