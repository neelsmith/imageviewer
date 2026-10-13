import { describe, it, expect, beforeEach } from "vitest";
import { startApp } from "../ui/app";
import { buildPhotos } from "../ui/load";

// UI flow test for the "Cataloged images only" toggle (private.html).
const CAT = "path|caption|credits|license|tags\na.jpg|A|||x\n";
const IDX = "path|date|lat|lon|city|region|country|width|height\na.jpg|||||||1|1\nb.jpg|||||||1|1\nc.jpg|||||||1|1\n";
const cfg = { imageBase: "https://h/", dataBase: "https://d/" };
const flush = () => new Promise((r) => setTimeout(r, 0));
const tiles = (root: HTMLElement) => root.querySelectorAll(".tile").length;

describe("Cataloged images only toggle", () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/private.html");
    root = document.createElement("div");
    document.body.append(root);
  });

  it("starts on, showing cataloged images; unticking shows all and records all=1", async () => {
    startApp(root, cfg, { catalogToggle: true, load: async () => buildPhotos(CAT, IDX, cfg.imageBase) });
    await flush();
    const box = root.querySelector<HTMLInputElement>(".toggle input")!;
    expect(box.checked).toBe(true);
    expect(tiles(root)).toBe(1);
    expect(root.querySelector(".count")!.textContent).toBe("1 of 1 cataloged photos");

    box.click();
    expect(tiles(root)).toBe(3);
    expect(root.querySelector(".count")!.textContent).toBe("3 of 3 photos");
    expect(location.hash).toBe("#all=1");

    box.click();
    expect(tiles(root)).toBe(1);
    expect(location.hash).toBe("");
  });

  it("restores the unticked state from the URL", async () => {
    history.replaceState(null, "", "/private.html#all=1");
    startApp(root, cfg, { catalogToggle: true, load: async () => buildPhotos(CAT, IDX, cfg.imageBase) });
    await flush();
    expect(root.querySelector<HTMLInputElement>(".toggle input")!.checked).toBe(false);
    expect(tiles(root)).toBe(3);
  });

  it("is absent unless requested (index.html)", async () => {
    startApp(root, cfg, { load: async () => buildPhotos(CAT, IDX, cfg.imageBase) });
    await flush();
    expect(root.querySelector(".toggle")).toBeNull();
    expect(tiles(root)).toBe(3);
  });
});

describe("grid thumbnails", () => {
  it("loads the thumbnail, falls back to the original, then marks the tile broken", async () => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/");
    const root = document.createElement("div");
    document.body.append(root);
    startApp(root, cfg, { load: async () => buildPhotos(CAT, IDX, cfg.imageBase) });
    await flush();
    const tile = root.querySelector<HTMLElement>(".tile")!;
    const img = tile.querySelector("img")!;
    expect(img.src).toMatch(/^https:\/\/h\/_thumbs\/.+\.jpg\.jpg$|^https:\/\/h\/_thumbs\/.+\.jpg$/);
    img.dispatchEvent(new Event("error"));
    expect(img.src).toMatch(/^https:\/\/h\/[abc]\.jpg$/);
    expect(tile.classList.contains("broken")).toBe(false);
    img.dispatchEvent(new Event("error"));
    expect(tile.classList.contains("broken")).toBe(true);
  });
});
