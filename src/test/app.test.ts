import { describe, it, expect, beforeEach, vi } from "vitest";
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

  it("is absent unless requested (catalogs.html)", async () => {
    startApp(root, cfg, { load: async () => buildPhotos(CAT, IDX, cfg.imageBase) });
    await flush();
    expect([...root.querySelectorAll(".toggle")].some((l) => l.textContent?.includes("Cataloged images only"))).toBe(false);
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

describe("photo links (#photo=<path>)", () => {
  let root: HTMLElement;
  const lightbox = () => document.querySelector<HTMLElement>(".lightbox")!;
  const file = () => lightbox().querySelector("dd:last-of-type")?.textContent;
  const start = (opts = {}) =>
    startApp(root, cfg, { load: async () => buildPhotos(CAT, IDX, cfg.imageBase), ...opts });
  const waitHash = () => new Promise((r) => window.addEventListener("hashchange", r, { once: true }));
  beforeEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/");
    root = document.createElement("div");
    document.body.append(root);
  });

  it("opening a photo puts its path in the URL; next/prev replace it; close removes it", async () => {
    start();
    await flush();
    root.querySelectorAll<HTMLElement>(".tile")[0].click();
    expect(lightbox().hidden).toBe(false);
    const first = file()!;
    expect(location.hash).toBe(`#photo=${first}`);
    const len = history.length;
    lightbox().querySelector<HTMLElement>(".nav.next")!.click();
    expect(location.hash).not.toBe(`#photo=${first}`);
    expect(location.hash).toBe(`#photo=${file()}`);
    expect(history.length).toBe(len); // replaced, not pushed
    const back = waitHash();
    lightbox().querySelector<HTMLElement>(".close")!.click();
    expect(lightbox().hidden).toBe(true);
    await back; // Close steps back over the entry the photo added
    expect(location.hash).toBe("");
  });

  it("opens the photo named in the URL, keeping the other keys", async () => {
    history.replaceState(null, "", "/#group=tag&photo=b.jpg");
    start();
    await flush();
    expect(lightbox().hidden).toBe(false);
    expect(file()).toBe("b.jpg");
    lightbox().querySelector<HTMLElement>(".close")!.click();
    expect(location.hash).toBe("#group=tag");
  });

  it("follows back/forward and edited URLs", async () => {
    start();
    await flush();
    let change = waitHash();
    location.hash = "#photo=c.jpg";
    await change;
    expect(lightbox().hidden).toBe(false);
    expect(file()).toBe("c.jpg");
    change = waitHash();
    location.hash = "";
    await change;
    expect(lightbox().hidden).toBe(true);
  });

  it("explains a link to a photo that is hidden or missing", async () => {
    history.replaceState(null, "", "/private.html#photo=b.jpg");
    start({ catalogToggle: true });
    await flush();
    expect(lightbox().hidden).toBe(true);
    expect(root.querySelector(".notices")!.textContent).toContain("not cataloged");
    expect(location.hash).toBe("");

    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.append(root);
    history.replaceState(null, "", "/#photo=zzz.jpg");
    start();
    await flush();
    expect(root.querySelector(".notices")!.textContent).toContain("“zzz.jpg” was not found");
  });
});

describe("year / place drop-downs", () => {
  const CAT2 = "path|caption|credits|license|tags|year|place\n" +
    "a.jpg|A||||1986|Priene\nb.jpg|B||||2019|Leiden\nc.jpg|C||||1986|\n";
  let root: HTMLElement;
  const sel = (label: string) => root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  const pick = (s: HTMLSelectElement, v: string) => { s.value = v; s.dispatchEvent(new Event("change")); };
  beforeEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/");
    root = document.createElement("div");
    document.body.append(root);
  });

  it("are hidden when the catalog has no year/place columns", async () => {
    startApp(root, cfg, { load: async () => buildPhotos(CAT, IDX, cfg.imageBase) });
    await flush();
    expect(sel("Year").hidden).toBe(true);
    expect(sel("Place").hidden).toBe(true);
  });

  it("offer the catalog's values, filter the grid and record the choice in the URL", async () => {
    startApp(root, cfg, { load: async () => buildPhotos(CAT2, IDX, cfg.imageBase) });
    await flush();
    expect(sel("Year").hidden).toBe(false);
    expect([...sel("Year").options].map((o) => o.text)).toEqual(["All years", "1986", "2019"]);
    expect([...sel("Place").options].map((o) => o.text)).toEqual(["All places", "Leiden", "Priene"]);
    expect(tiles(root)).toBe(3);
    pick(sel("Year"), "1986");
    expect(tiles(root)).toBe(2);
    expect(location.hash).toBe("#year=1986");
    pick(sel("Place"), "Priene");
    expect(tiles(root)).toBe(1);
    expect(location.hash).toBe("#year=1986&place=Priene");
    pick(sel("Place"), "Leiden");
    expect(root.querySelector(".empty")!.textContent).toBe("No photos match the filters.");
    pick(sel("Year"), "");
    pick(sel("Place"), "");
    expect(tiles(root)).toBe(3);
    expect(location.hash).toBe("");
  });

  it("restore from the URL, ignoring values not in the data", async () => {
    history.replaceState(null, "", "/#year=2019&place=Nowhere");
    startApp(root, cfg, { load: async () => buildPhotos(CAT2, IDX, cfg.imageBase) });
    await flush();
    expect(sel("Year").value).toBe("2019");
    expect(sel("Place").value).toBe("");
    expect(tiles(root)).toBe(1);
    expect(location.hash).toBe("#year=2019");
  });

  it("show year and place in the photo view", async () => {
    startApp(root, cfg, { load: async () => buildPhotos(CAT2, IDX, cfg.imageBase) });
    await flush();
    pick(sel("Place"), "Priene");
    root.querySelector<HTMLElement>(".tile")!.click();
    const info = document.querySelector(".lightbox .info")!.textContent!;
    expect(info).toContain("Year1986");
    expect(info).toContain("PlacePriene");
  });
});

describe("default grouping", () => {
  const checked = (root: HTMLElement) =>
    root.querySelector('.seg button[aria-checked="true"]')?.getAttribute("data-mode");
  const open = async (url: string) => {
    document.body.innerHTML = "";
    history.replaceState(null, "", url);
    const root = document.createElement("div");
    document.body.append(root);
    startApp(root, cfg, { load: async () => buildPhotos(CAT, IDX, cfg.imageBase) });
    await flush();
    return root;
  };
  it("is Location when the URL doesn't name one", async () => {
    expect(checked(await open("/"))).toBe("location");
  });
  it("follows #group= from the URL, and ignores unknown values", async () => {
    expect(checked(await open("/#group=date"))).toBe("date");
    expect(checked(await open("/#group=nonsense"))).toBe("location");
  });
});

describe("Export and Captions (grid)", () => {
  const CAT2 = "path|caption|credits|license|tags\nc.jpg|Third|||t\na.jpg|First|||t\n";
  async function open(url = "/") {
    document.body.innerHTML = "";
    history.replaceState(null, "", url);
    const root = document.createElement("div");
    document.body.append(root);
    startApp(root, cfg, { catalogToggle: true, exportName: "data/catalogs/mss.cex",
      load: async () => buildPhotos(CAT2, IDX, cfg.imageBase) });
    await flush();
    return root;
  }

  it("Export downloads the shown photos' catalog rows, honouring filters and order", async () => {
    let blob: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    let downloaded = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    const root = await open();
    const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = "first";
    search.dispatchEvent(new Event("input"));
    root.querySelector<HTMLButtonElement>(".export")!.click();
    expect(downloaded).toBe("mss-selection.cex");
    expect(await blob!.text()).toBe("path|caption|credits|license|tags\na.jpg|First|||t\n");

    search.value = "";
    search.dispatchEvent(new Event("input"));
    root.querySelector<HTMLButtonElement>(".export")!.click();
    expect((await blob!.text()).split("\n").slice(1, 3)).toEqual(["c.jpg|Third|||t", "a.jpg|First|||t"]); // catalog order
    click.mockRestore();
  });

  it("Captions is off by default; ticking it shows captions and records captions=1", async () => {
    const root = await open();
    const main = root.querySelector("main")!;
    const box = [...root.querySelectorAll<HTMLLabelElement>(".toggle")].find((l) => l.textContent?.includes("Captions"))!
      .querySelector("input")!;
    expect(box.checked).toBe(false);
    expect(main.classList.contains("with-captions")).toBe(false);
    expect([...root.querySelectorAll(".tile-caption")].map((c) => c.textContent)).toEqual(["Third", "First"]);
    box.click();
    expect(main.classList.contains("with-captions")).toBe(true);
    expect(location.hash).toContain("captions=1");
    const again = await open("/#captions=1");
    expect(again.querySelector("main")!.classList.contains("with-captions")).toBe(true);
  });
});

describe("region selections in the photo view", () => {
  const CATU = "path|caption|credits|license|tags|urn\na.jpg|A|||t|urn:cite2:test:img.v1:a\nb.jpg|B|||t|\n";
  const IDXU = "path|date|lat|lon|city|region|country|width|height\na.jpg|||||||400|300\nb.jpg|||||||400|300\n";
  async function open(url: string) {
    document.body.innerHTML = "";
    history.replaceState(null, "", url);
    const root = document.createElement("div");
    document.body.append(root);
    startApp(root, cfg, { exportName: "data/catalogs/mss.cex", load: async () => buildPhotos(CATU, IDXU, cfg.imageBase) });
    await flush(); await flush();
    return root;
  }
  const rows = () => [...document.querySelectorAll(".selections li")].map((li) =>
    [...li.querySelectorAll("code")].map((c) => c.textContent));

  it("a link with roi= reopens the photo with its selections and CITE2 URNs", async () => {
    await open("/#photo=a.jpg&roi=0,0,0.5,0.5;0.25,0.125,0.5,0.25");
    expect(rows()).toEqual([
      ["0.0000,0.0000,0.5000,0.5000", "urn:cite2:test:img.v1:a@0.0000,0.0000,0.5000,0.5000"],
      ["0.2500,0.1250,0.5000,0.2500", "urn:cite2:test:img.v1:a@0.2500,0.1250,0.5000,0.2500"],
    ]);
    expect(document.querySelectorAll(".roi-layer .roi").length).toBe(2);
    expect(document.querySelector(".selections h3")!.textContent).toBe("Selections (2)");

    // Removing one updates the URL.
    (document.querySelectorAll<HTMLButtonElement>('.selections li button[title="Remove this selection"]')[0]).click();
    expect(rows().length).toBe(1);
    expect(decodeURIComponent(location.hash)).toContain("roi=0.2500,0.1250,0.5000,0.2500");
  });

  it("selections are kept per photo while the page is open, and Export selections lists the URNs", async () => {
    const root = await open("/#photo=a.jpg&roi=0.1,0.1,0.2,0.2");
    // Move to b.jpg (no selections, no urn) and back.
    (document.querySelector<HTMLButtonElement>(".nav.next")!).click();
    expect(rows()).toEqual([]);
    expect(location.hash).not.toContain("roi=");
    (document.querySelector<HTMLButtonElement>(".nav.prev")!).click();
    expect(rows()[0][0]).toBe("0.1000,0.1000,0.2000,0.2000");
    expect(location.hash).toContain("roi=");

    const btn = root.querySelector<HTMLButtonElement>(".export-selections")!;
    expect(btn.hidden).toBe(false);
    let blob: Blob | null = null; let name = "";
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    btn.click();
    expect(name).toBe("mss-regions.txt");
    expect(await blob!.text()).toContain("urn:cite2:test:img.v1:a@0.1000,0.1000,0.2000,0.2000\n");
    click.mockRestore();
  });

  it("photos without a urn still list x,y,w,h, with a hint", async () => {
    await open("/#photo=b.jpg&roi=0,0,1,1");
    expect(rows()).toEqual([["0.0000,0.0000,1.0000,1.0000"]]);
    expect(document.querySelector(".selections")!.textContent).toContain("Add a urn column");
  });
});

describe("Copy all selections", () => {
  it("copies every selection, one per line: URNs if the photo has a urn, else x,y,w,h", async () => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async (t: string) => { copied = t; } } });
    const CATU = "path|caption|credits|license|tags|urn\na.jpg|A|||t|urn:cite2:test:img.v1:a\nb.jpg|B|||t|\n";
    const IDXU = "path|date|lat|lon|city|region|country|width|height\na.jpg|||||||4|3\nb.jpg|||||||4|3\n";
    for (const [photo, expected] of [
      ["a.jpg", "urn:cite2:test:img.v1:a@0.0000,0.0000,0.5000,0.5000\nurn:cite2:test:img.v1:a@0.5000,0.5000,0.5000,0.5000"],
      ["b.jpg", "0.0000,0.0000,0.5000,0.5000\n0.5000,0.5000,0.5000,0.5000"],
    ]) {
      document.body.innerHTML = "";
      history.replaceState(null, "", `/#photo=${photo}&roi=0,0,0.5,0.5;0.5,0.5,0.5,0.5`);
      const root = document.createElement("div");
      document.body.append(root);
      startApp(root, cfg, { load: async () => buildPhotos(CATU, IDXU, cfg.imageBase) });
      await flush(); await flush();
      const actions = [...document.querySelectorAll(".sel-actions button")].map((b) => b.textContent);
      expect(actions.slice(-2)).toEqual(["Copy all", "Clear all"]); // side by side
      document.querySelector<HTMLButtonElement>(".copy-all")!.click();
      await flush();
      expect(copied).toBe(expected);
      expect(document.querySelector(".copy-all")!.textContent).toBe("Copied 2");
    }
  });
});

describe("missing catalog entries notice", () => {
  it("shows the count, and unfolds to list each missing path with its caption", async () => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/");
    const root = document.createElement("div");
    document.body.append(root);
    const CATM = "path|caption|credits|license|tags\na.jpg|A|||t\ngone1.jpg|First gone|||t\nsub/gone2.jpg||||t\n";
    startApp(root, cfg, { load: async () => buildPhotos(CATM, IDX, cfg.imageBase) });
    await flush();
    const details = root.querySelector<HTMLDetailsElement>(".notices details")!;
    expect(details.querySelector("summary")!.textContent).toBe("2 cataloged image(s) not found in images.cex. Show list");
    expect(details.open).toBe(false); // folded by default
    expect([...details.querySelectorAll("ul code")].map((c) => c.textContent))
      .toEqual(["gone1.jpg — First gone", "sub/gone2.jpg"]);
  });
});
