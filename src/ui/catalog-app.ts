import type { AppConfig } from "../lib/config";
import { catalogUrl, parseCatalogList, type CatalogChoice } from "../lib/catalogs";
import { catalogKey, forget } from "../lib/auth";
import { readHash, withHash } from "../lib/hash";
import { startApp, type AppHandle } from "./app";
import { passwordGate } from "./gate";
import { versionInfo } from "../lib/version";
import { fetchText, loadCatalog } from "./load";

export interface CatalogAppOptions {
  /** Catalog list file in the data directory (default catalog_of_catalogs.cex). */
  listFile?: string;
}

/**
 * Catalog-chooser app: lists the catalogs in a catalog list file by label, then
 * shows only the images in the chosen catalog. The choice lives in the URL hash
 * (#catalog=<cex_file>) so views can be bookmarked; an open photo adds
 * `&photo=<path>` (see startApp).
 *
 * A catalog with a hash in the list's optional `password` column asks for its
 * password before loading (a "keep out" sign only: the files are public). The
 * password can be remembered per catalog on this device; "Lock" forgets it.
 */
export async function startCatalogApp(root: HTMLElement, cfg: AppConfig, opts: CatalogAppOptions = {}): Promise<void> {
  const listName = opts.listFile ?? "catalog_of_catalogs.cex";
  root.replaceChildren(message("Loading catalogs…"));
  const listUrl = cfg.dataBase + listName;
  const text = await fetchText(listUrl);
  if (text === null) {
    root.replaceChildren(message(`${listName} could not be loaded from ${listUrl}`));
    return;
  }
  const { catalogs, errors } = parseCatalogList(text);
  if (!catalogs.length) {
    root.replaceChildren(message([`No catalogs listed in ${listName}.`, ...errors].join(" ")));
    return;
  }

  let view: AppHandle | null = null;
  let shown: string | null = null; // catalog file on screen; "" = menu
  let routeId = 0; // a newer route() abandons a password screen still waiting

  async function route() {
    const id = ++routeId;
    view?.destroy();
    view = null;
    const chosen = catalogs.find((c) => c.file === readHash(location.hash).catalog);
    shown = chosen?.file ?? "";
    if (!chosen) return showMenu();
    document.title = `${chosen.label} · Image Viewer`;
    if (chosen.auth) {
      const ok = await passwordGate(root, chosen.auth,
        { title: chosen.label, storageKey: catalogKey(chosen.file), cancelLabel: "Back to catalogs" });
      if (id !== routeId) return;
      if (!ok) return choose(null);
    }
    view = startApp(root, cfg, {
      load: () => loadCatalog(cfg, chosen.file, catalogUrl(cfg.dataBase, chosen.file)),
      toolbar: [switcher(chosen)],
      localFallback: false,
      exportName: chosen.file,
      onLock: chosen.auth ? () => { forget(undefined, catalogKey(chosen.file)); route(); } : undefined,
    });
  }

  function choose(c: CatalogChoice | null) {
    // Keep the grouping choice; drop the open photo and the year/place filters, which
    // belong to the old catalog. Changing the hash triggers route().
    location.hash = withHash(location.hash, { catalog: c ? c.file : null, photo: null, year: null, place: null }) || "#";
  }

  function showMenu() {
    document.title = "Image Viewer";
    const list = document.createElement("ul");
    for (const c of catalogs) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.label;
      if (c.auth) {
        const tag = document.createElement("span");
        tag.className = "pw-tag";
        tag.textContent = "password";
        b.append(" ", tag);
      }
      b.addEventListener("click", () => choose(c));
      const li = document.createElement("li");
      li.append(b);
      list.append(li);
    }
    const menu = document.createElement("div");
    menu.className = "catalog-menu";
    const h = document.createElement("h1");
    h.textContent = "Image Viewer";
    const p = document.createElement("p");
    p.textContent = "Choose a catalog:";
    menu.append(h, p, list);
    if (errors.length) menu.append(message(errors.join(" ")));
    menu.append(versionInfo());
    root.replaceChildren(menu);
    list.querySelector("button")?.focus();
  }

  function switcher(current: CatalogChoice): HTMLElement {
    const sel = document.createElement("select");
    sel.className = "catalog-select";
    sel.setAttribute("aria-label", "Catalog");
    for (const c of catalogs) sel.add(new Option(c.label, c.file, false, c.file === current.file));
    sel.add(new Option("All catalogs…", ""));
    sel.addEventListener("change", () =>
      choose(catalogs.find((c) => c.file === sel.value) ?? null));
    return sel;
  }

  // Re-route only when the catalog changes (back/forward, edited URL, menu or switcher).
  window.addEventListener("hashchange", () => {
    const wanted = catalogs.find((c) => c.file === readHash(location.hash).catalog)?.file ?? "";
    if (wanted !== shown) route();
  });
  route();
}

function message(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "empty";
  p.style.padding = "32px 16px";
  p.textContent = text;
  return p;
}
