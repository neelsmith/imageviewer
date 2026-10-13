import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startCatalogApp } from "../ui/catalog-app";

// UI flow for private-catalogs.html: menu from catalog_of_private_catalogs.cex, a password
// per catalog. Reference hash: "open sesame", 1000 iterations (see auth.test.ts).
const SPEC = "pbkdf2-sha256:1000:c2FsdHNhbHRzYWx0c2FsdA==:GDAYJJtfElk+xpdigX69OXyhgz3//WebdzIiNpVdWzI=";
const FILES: Record<string, string> = {
  "https://h/data/catalog_of_private_catalogs.cex":
    `cex_file|label|password\ndata/private/brunswick.cex|Brunswick, ME|${SPEC}\ndata/private/open.cex|Open|\n`,
  "https://h/data/private/brunswick.cex": "path|caption|credits|license|tags|year|place\nb1.jpg|Parade||||1990|Brunswick, ME\nb2.jpg|Two||||1991|\n",
  "https://h/data/private/open.cex": "path|caption|credits|license|tags\no1.jpg|Open one|||\n",
  "https://h/data/images.cex": "path|date|lat|lon|city|region|country|width|height\n",
};
const cfg = { imageBase: "https://img/", dataBase: "https://h/data/" };
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await wait(); }
}
const hashChanged = () => new Promise((r) => window.addEventListener("hashchange", r, { once: true }));

describe("private-catalogs app", () => {
  let root: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    history.replaceState(null, "", "/private-catalogs.html");
    root = document.createElement("div");
    document.body.append(root);
    vi.stubGlobal("fetch", async (url: string) =>
      url in FILES ? new Response(FILES[url]) : new Response("", { status: 404 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const gate = () => root.querySelector<HTMLFormElement>("form.gate");
  const tiles = () => root.querySelectorAll(".tile").length;
  async function enter(pw: string, keep = true) {
    const f = gate()!;
    f.querySelector<HTMLInputElement>("#gate-pw")!.value = pw;
    f.querySelector<HTMLInputElement>(".remember input")!.checked = keep;
    f.requestSubmit();
    // Done when the form is gone (right password) or shows a result (wrong password).
    await until(() => !f.isConnected || f.querySelector(".gate-msg")!.textContent !== "Checking…");
  }

  it("lists the private catalogs, marking those with a password", async () => {
    await startCatalogApp(root, cfg, { listFile: "catalog_of_private_catalogs.cex" });
    const items = [...root.querySelectorAll(".catalog-menu li button")].map((b) => b.textContent);
    expect(items).toEqual(["Brunswick, ME password", "Open"]);
  });

  it("asks for the catalog's password, rejects a wrong one, then shows the photos", async () => {
    await startCatalogApp(root, cfg, { listFile: "catalog_of_private_catalogs.cex" });
    let changed = hashChanged();
    root.querySelector<HTMLElement>(".catalog-menu li button")!.click();
    await changed;
    await until(() => !!gate());
    expect(gate()!.querySelector("h1")!.textContent).toBe("Brunswick, ME");
    expect(tiles()).toBe(0);
    await enter("wrong");
    expect(gate()!.querySelector(".gate-msg")!.textContent).toBe("Wrong password.");
    await enter("open sesame");
    await until(() => tiles() === 2);
    expect(root.querySelector(".lock")).not.toBeNull();
    // Year / place drop-downs work here too.
    expect(root.querySelector<HTMLSelectElement>('select[aria-label="Year"]')!.hidden).toBe(false);

    // Switching to the open catalog needs no password and has no Lock button.
    changed = hashChanged();
    const sel = root.querySelector<HTMLSelectElement>(".catalog-select")!;
    sel.value = "data/private/open.cex";
    sel.dispatchEvent(new Event("change"));
    await changed;
    await until(() => tiles() === 1);
    expect(gate()).toBeNull();
    expect(root.querySelector(".lock")).toBeNull();
  });

  it("remembers per catalog; Lock forgets it; a deep link asks first", async () => {
    history.replaceState(null, "", "/private-catalogs.html#catalog=data%2Fprivate%2Fbrunswick.cex&photo=b2.jpg");
    await startCatalogApp(root, cfg, { listFile: "catalog_of_private_catalogs.cex" });
    await until(() => !!gate());
    await enter("open sesame", true);
    await until(() => tiles() === 2);
    // The linked photo opened after unlocking.
    await until(() => !document.querySelector<HTMLElement>(".lightbox")!.hidden);
    expect(document.querySelector(".lightbox dd:last-of-type")!.textContent).toBe("b2.jpg");
    expect(localStorage.getItem("imageviewer.unlocked.catalog:data/private/brunswick.cex")).toBe(
      "GDAYJJtfElk+xpdigX69OXyhgz3//WebdzIiNpVdWzI=");
    expect(localStorage.getItem("imageviewer.unlocked")).toBeNull(); // private.html's key untouched

    root.querySelector<HTMLElement>(".lock")!.click();
    await until(() => !!gate());
    expect(localStorage.getItem("imageviewer.unlocked.catalog:data/private/brunswick.cex")).toBeNull();
  });

  it("opens straight away when remembered on this device", async () => {
    localStorage.setItem("imageviewer.unlocked.catalog:data/private/brunswick.cex", "GDAYJJtfElk+xpdigX69OXyhgz3//WebdzIiNpVdWzI=");
    history.replaceState(null, "", "/private-catalogs.html#catalog=data%2Fprivate%2Fbrunswick.cex");
    await startCatalogApp(root, cfg, { listFile: "catalog_of_private_catalogs.cex" });
    await until(() => tiles() === 2);
    expect(gate()).toBeNull();
  });

  it("'Back to catalogs' returns to the menu", async () => {
    history.replaceState(null, "", "/private-catalogs.html#catalog=data%2Fprivate%2Fbrunswick.cex");
    await startCatalogApp(root, cfg, { listFile: "catalog_of_private_catalogs.cex" });
    await until(() => !!gate());
    const changed = hashChanged();
    root.querySelector<HTMLElement>(".gate-cancel")!.click();
    await changed;
    await until(() => !!root.querySelector(".catalog-menu"));
  });
});
