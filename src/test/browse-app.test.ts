import { describe, it, expect, beforeEach, vi } from "vitest";
import { startBrowseApp } from "../ui/browse-app";

// UI flow test for www-browse.html with a fake web server.
const BASE = "https://ex.org/images/";
const IMAGES = `path|date|lat|lon|city|region|country|width|height
trips/rome1.jpg|2019-06-01T10:00:00|41.9|12.5|Rome|Lazio|Italy|400|300
trips/rome2.jpg|2019-06-02T10:00:00|41.9|12.5|Rome|Lazio|Italy|400|300
trips/deep/x.png|2018-01-01T00:00:00|||||||
top.jpg|2020-01-01T00:00:00|||||||
../escape.jpg|||||||||
`;
const CATALOGS = "path\ntrips/catalog.cex\n../evil.cex\n";
let catalogText = "path|caption|credits|license|tags\nrome2.jpg|Second, listed first|||Rome\nrome1.jpg|First|||Rome\n";

function server(files: Record<string, () => string | null>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = files[String(url)]?.();
    return body == null ? new Response("nope", { status: 404 }) : new Response(body);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const site = () => server({
  [BASE + "images.cex"]: () => IMAGES,
  [BASE + "catalogs.cex"]: () => CATALOGS,
  [BASE + "trips/catalog.cex"]: () => catalogText,
});

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
});
async function navigate(root: HTMLElement, act: () => void) {
  act();
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  await settle(root);
}

describe("www-browse.html", () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/images/www-browse.html");
    root = document.createElement("div");
    document.body.append(root);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
  });

  it("explains what to do when there is no images.cex", async () => {
    const r = await startBrowseApp(root, { base: BASE, fetchImpl: server({}).fetchImpl });
    expect(r).toBeNull();
    expect(root.textContent).toContain("There is no images.cex next to this page");
  });

  it("browses the folders in images.cex, with catalogs and thumbnails", async () => {
    const s = site();
    await startBrowseApp(root, { base: BASE, fetchImpl: s.fetchImpl, rootName: "images" });
    await settle(root);
    // Top folder: its own photo, the subfolder; the unsafe "../" paths are ignored.
    expect(read(root)).toEqual({ crumbs: "images", sub: ["trips"], catalog: null, tiles: ["top.jpg"] });
    expect(root.querySelector<HTMLImageElement>(".tile img")!.src).toBe("https://ex.org/images/_thumbs/top.jpg.jpg");

    // Into trips/: catalog.cex is chosen and its order kept; place names come from images.cex.
    await navigate(root, () => root.querySelector<HTMLButtonElement>(".subfolder")!.click());
    expect(read(root)).toEqual({ crumbs: "images / trips", sub: ["deep"], catalog: "catalog.cex",
      tiles: ["Second, listed first", "First"] });
    expect(root.querySelector(".group h2")!.firstChild!.textContent).toBe("Rome, Lazio, Italy");

    // A missing thumbnail falls back to the original.
    const img = root.querySelector<HTMLImageElement>(".tile img")!;
    img.dispatchEvent(new Event("error"));
    await tick(5);
    expect(img.src).toBe("https://ex.org/images/trips/rome2.jpg");

    // No catalog → all photos in trips/; include subfolders adds deep/x.png.
    const sel = root.querySelector<HTMLSelectElement>(".catalog-select")!;
    await navigate(root, () => { sel.value = "none"; sel.dispatchEvent(new Event("change")); });
    expect(read(root).tiles.sort()).toEqual(["rome1.jpg", "rome2.jpg"]);
    await navigate(root, () => root.querySelectorAll<HTMLInputElement>(".toggle input")[0].click());
    expect(read(root).tiles).toContain("deep/x.png");
  });

  it("reads catalogs fresh each time (edits show up on the next load)", async () => {
    const s = site();
    history.replaceState(null, "", "/images/www-browse.html#dir=trips");
    await startBrowseApp(root, { base: BASE, fetchImpl: s.fetchImpl });
    await settle(root);
    const catFetch = s.calls.find((c) => c.url.endsWith("trips/catalog.cex"))!;
    expect(catFetch.init?.cache).toBe("no-cache");
    expect(s.calls.find((c) => c.url.endsWith("images.cex"))!.init?.cache).toBe("no-cache");
    expect(read(root).tiles[0]).toBe("Second, listed first");
    catalogText = "path|caption|credits|license|tags\nrome1.jpg|Edited caption|||Rome\n";
    document.body.innerHTML = ""; root = document.createElement("div"); document.body.append(root);
    await startBrowseApp(root, { base: BASE, fetchImpl: s.fetchImpl });
    await settle(root);
    expect(read(root).tiles).toEqual(["Edited caption"]);
  });
});
