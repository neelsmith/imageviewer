import type { AppConfig } from "../lib/config";
import type { Photo } from "../lib/types";
import { facetValues, groupPhotos, selectPhotos, placeLabel, type Facet, type GroupMode, type PhotoGroup } from "../lib/group";
import { buildPhotos, loadRemote, type LoadResult } from "./load";
import { readHash, withHash } from "../lib/hash";
import { versionInfo } from "../lib/version";
import { ZoomViewer } from "./zoom-viewer";
import type { ImageProvider } from "./local/images";

/** Grouping shown when the URL doesn't name one (#group=date|location|tag). */
export const DEFAULT_MODE: GroupMode = "location";

const MODES: { mode: GroupMode; label: string }[] = [
  { mode: "date", label: "Date" },
  { mode: "location", label: "Location" },
  { mode: "tag", label: "Tag" },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  return d.toLocaleString(undefined, {
    year: "numeric", month: "long", day: "numeric",
    ...(m[4] ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export interface AppOptions {
  /** When set, a "Lock" button is shown that calls it. */
  onLock?: () => void;
  /** Data loader; defaults to catalog.cex + images.cex (all images). */
  load?: () => Promise<LoadResult>;
  /** Extra controls placed in the top bar after the title. */
  toolbar?: HTMLElement[];
  /** Offer loading catalog.cex/images.cex from disk when nothing loads (default true). */
  localFallback?: boolean;
  /**
   * Show a "Cataloged images only" checkbox (on by default). Unticking it shows
   * every image; that choice is kept in the URL hash as `all=1`.
   */
  catalogToggle?: boolean;
  /**
   * Images that aren't plain URLs (local.html): tiles are requested as they scroll into
   * view, and the photo view asks for the full image. `originalUrl` feeds "Open original".
   */
  images?: ImageProvider & { originalUrl?(p: Photo): string };
  /** Shown between the notices and the grid (local.html: subfolders). */
  banner?: HTMLElement;
  /** Mark photos missing from the catalog (dot on tile, "Not in catalog"). Default true. */
  markUncataloged?: boolean;
}

export interface AppHandle {
  /** Remove global listeners and the lightbox (before starting another view). */
  destroy(): void;
}

export function startApp(root: HTMLElement, cfg: AppConfig, opts: AppOptions = {}): AppHandle {
  let all: Photo[] = [];
  let warnings: string[] = [];
  let mode: GroupMode = (readHash(location.hash).group as GroupMode) || DEFAULT_MODE;
  if (!MODES.some((m) => m.mode === mode)) mode = DEFAULT_MODE;
  let query = "";
  let catalogedOnly = !!opts.catalogToggle && readHash(location.hash).all !== "1";
  let visible: Photo[] = []; // flattened order for lightbox navigation
  // Year / place drop-downs (optional catalog columns), kept in the hash as year= / place=.
  const facets: Record<Facet, string> = {
    year: readHash(location.hash).year ?? "",
    placeName: readHash(location.hash).place ?? "",
  };
  const facetKey: Record<Facet, string> = { year: "year", placeName: "place" };

  const count = el("span", { class: "count" });
  const search = el("input", { type: "search", placeholder: "Filter…", "aria-label": "Filter photos" });
  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "Group by" });
  const notices = el("div", { class: "notices" });
  const main = el("main", { class: "groups" });
  function facetSelect(facet: Facet, label: string, anyLabel: string) {
    const sel = el("select", { class: "facet-select", "aria-label": label, hidden: "" });
    sel.dataset.facet = facet;
    sel.dataset.any = anyLabel;
    sel.addEventListener("change", () => {
      facets[facet] = sel.value;
      history.replaceState(null, "",
        withHash(location.hash, { [facetKey[facet]]: sel.value || null }) || location.pathname + location.search);
      render();
    });
    return sel;
  }
  const yearSel = facetSelect("year", "Year", "All years");
  const placeSel = facetSelect("placeName", "Place", "All places");
  /** Fill the drop-downs from the loaded photos; hide one whose column is empty everywhere. */
  function fillFacets() {
    for (const sel of [yearSel, placeSel]) {
      const facet = sel.dataset.facet as Facet;
      const values = facetValues(all, facet);
      // A value from the URL that isn't in this data is dropped.
      if (facets[facet] && !values.includes(facets[facet])) {
        facets[facet] = "";
        history.replaceState(history.state, "",
          withHash(location.hash, { [facetKey[facet]]: null }) || location.pathname + location.search);
      }
      sel.replaceChildren(new Option(sel.dataset.any!, ""), ...values.map((v) => new Option(v, v)));
      sel.value = facets[facet];
      sel.hidden = values.length === 0;
    }
  }
  const toggle: HTMLElement[] = [];
  if (opts.catalogToggle) {
    const box = el("input", { type: "checkbox" });
    box.checked = catalogedOnly;
    box.addEventListener("change", () => {
      catalogedOnly = box.checked;
      history.replaceState(null, "",
        withHash(location.hash, { all: catalogedOnly ? null : "1" }) || location.pathname + location.search);
      render();
    });
    toggle.push(el("label", { class: "toggle" }, box, " Cataloged images only"));
  }
  const header = el("header", { class: "bar" },
    el("h1", {}, "Image Viewer"), ...(opts.toolbar ?? []), seg, yearSel, placeSel, ...toggle, search, count, versionInfo());
  if (opts.onLock) {
    const lock = el("button", { type: "button", class: "lock", title: "Lock (forget password on this device)" }, "Lock");
    lock.addEventListener("click", opts.onLock);
    header.append(lock);
  }
  root.replaceChildren(header, notices, ...(opts.banner ? [opts.banner] : []), main);

  for (const m of MODES) {
    const b = el("button", { type: "button", role: "radio", "data-mode": m.mode }, m.label);
    b.addEventListener("click", () => { mode = m.mode; history.replaceState(null, "", withHash(location.hash, { group: mode }) || location.pathname + location.search); render(); });
    seg.append(b);
  }
  search.addEventListener("input", () => { query = search.value; render(); });

  // ---- Lightbox ----
  const viewer = new ZoomViewer({ onSwipe: (dir) => show(current + dir) });
  const lbInfo = el("aside", { class: "info" });
  const prev = el("button", { class: "nav prev", "aria-label": "Previous" }, "‹");
  const next = el("button", { class: "nav next", "aria-label": "Next" }, "›");
  const close = el("button", { class: "close", "aria-label": "Close" }, "×");
  const lb = el("div", { class: "lightbox", hidden: "", role: "dialog", "aria-modal": "true" },
    el("div", { class: "stage" }, viewer.el, prev, next, close, viewer.controls), lbInfo);
  document.body.append(lb);
  let current = -1;
  let fullToken = 0; // ignores full images that arrive after moving on

  /**
   * The open photo is kept in the URL hash as `photo=<path>`, so every photo view has
   * its own address. Opening from the grid adds a history entry (Back closes the photo);
   * moving to the previous/next photo replaces it.
   */
  function setPhotoHash(path: string | null, push: boolean) {
    const url = withHash(location.hash, { photo: path }) || location.pathname + location.search;
    if (push) history.pushState({ photoView: true }, "", url);
    else history.replaceState(history.state, "", url);
  }

  /** Open the first photo in the current view with this path; false if there is none. */
  function openPath(path: string, how: "push" | "replace" | "none"): boolean {
    const i = visible.findIndex((p) => p.path === path);
    if (i >= 0) show(i, how);
    return i >= 0;
  }

  function show(i: number, how: "push" | "replace" | "none" = "replace") {
    if (i < 0 || i >= visible.length) return;
    current = i;
    const p = visible[i];
    const alt = p.caption || p.path;
    if (opts.images) {
      // Show the tile (stretched) at once if we know the photo's size, then the full image.
      const imgs = opts.images, token = ++fullToken;
      const known = imgs.size(p), ph = imgs.placeholder(p);
      if (known && ph) viewer.preview(ph, alt, known);
      imgs.full(p).then(
        (r) => { if (token === fullToken) viewer.load(r.url, alt, r.size ?? imgs.size(p) ?? known, ph ?? undefined); },
        (e) => { if (token === fullToken) { viewer.clear(); lbInfo.prepend(el("p", { class: "badge" }, `Can't display: ${e.message}`)); } },
      );
    } else {
      viewer.load(p.url, alt, p.width && p.height ? { w: p.width, h: p.height } : null, p.thumb);
    }
    const rows: [string, string][] = [
      ["Caption", p.caption], ["Year", p.year], ["Place", p.placeName],
      ["Date", p.date ? formatDate(p.date) : ""],
      // EXIF/GPS place from images.cex; labelled "Location" when the catalog also names a place.
      [p.placeName ? "Location" : "Place", p.place ? placeLabel(p.place) : ""], ["Tags", p.tags.join(", ")],
      ["Credits", p.credits], ["License", p.license], ["File", p.path],
    ];
    lbInfo.replaceChildren(
      ...(p.cataloged || opts.markUncataloged === false ? [] : [el("p", { class: "badge" }, "Not in catalog")]),
      el("dl", {}, ...rows.filter(([, v]) => v).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
      el("a", { href: opts.images?.originalUrl?.(p) ?? p.url, target: "_blank", rel: "noopener" }, "Open original ↗"),
    );
    prev.disabled = i === 0;
    next.disabled = i === visible.length - 1;
    lb.hidden = false;
    viewer.reset(); // stage has a size only once visible
    close.focus();
    if (how !== "none") setPhotoHash(p.path, how === "push");
  }
  const closeLightbox = () => { lb.hidden = true; viewer.clear(); current = -1; fullToken++; };
  function hide() {
    if (lb.hidden) return;
    closeLightbox();
    // If opening the photo added a history entry, step back over it; otherwise drop the key.
    if (history.state?.photoView) history.back();
    else if (readHash(location.hash).photo) setPhotoHash(null, false);
  }
  // Back/forward, or an edited URL: follow the photo named in the hash.
  const onHashChange = () => {
    const path = readHash(location.hash).photo;
    if (!path) { if (!lb.hidden) closeLightbox(); return; }
    if (current >= 0 && visible[current]?.path === path) return;
    openPath(path, "none");
  };
  window.addEventListener("hashchange", onHashChange);
  prev.addEventListener("click", () => show(current - 1));
  next.addEventListener("click", () => show(current + 1));
  close.addEventListener("click", hide);
  const onKey = (e: KeyboardEvent) => {
    if (lb.hidden) return;
    if (e.key === "Escape") hide();
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "ArrowRight") show(current + 1);
    else if (viewer.handleKey(e)) e.preventDefault();
  };
  document.addEventListener("keydown", onKey);

  // ---- Rendering ----
  // With an image provider, tiles get their image only when they come near the screen.
  const pendingTiles = new WeakMap<Element, () => void>();
  const tileObserver = opts.images && typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        tileObserver!.unobserve(e.target);
        pendingTiles.get(e.target)?.();
        pendingTiles.delete(e.target);
      }
    }, { rootMargin: "600px 0px" })
    : null;

  function tile(p: Photo, index: number) {
    const img = el("img", { alt: p.caption || p.path, decoding: "async" });
    const b = el("button", { class: "tile", type: "button", title: p.caption || p.path }, img);
    if (!p.cataloged && opts.markUncataloged !== false) b.classList.add("uncataloged");
    if (opts.images) {
      const imgs = opts.images;
      const fill = () => imgs.tile(p).then((u) => { img.src = u; }, () => b.classList.add("broken"));
      img.addEventListener("error", () => b.classList.add("broken"));
      if (tileObserver) { pendingTiles.set(b, fill); tileObserver.observe(b); } else fill();
    } else {
      // Thumbnail first; if there isn't one yet, fall back to the full-size original.
      img.loading = "lazy";
      img.src = p.thumb;
      let triedOriginal = false;
      img.addEventListener("error", () => {
        if (triedOriginal) b.classList.add("broken");
        else { triedOriginal = true; img.src = p.url; }
      });
    }
    b.addEventListener("click", () => show(index, "push"));
    return b;
  }

  function section(g: PhotoGroup, start: number) {
    return el("section", { class: "group" },
      el("h2", {}, g.label, el("span", { class: "n" }, String(g.photos.length))),
      el("div", { class: "grid" }, ...g.photos.map((p, i) => tile(p, start + i))));
  }

  function render() {
    tileObserver?.disconnect(); // tiles about to be replaced
    seg.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
    const pool = catalogedOnly ? all.filter((p) => p.cataloged) : all;
    const groups = groupPhotos(selectPhotos(all, { catalogedOnly, query, year: facets.year, place: facets.placeName }), mode);
    visible = groups.flatMap((g) => g.photos);
    let start = 0;
    const sections = groups.map((g) => { const s = section(g, start); start += g.photos.length; return s; });
    const shown = new Set(visible.map((p) => p.path)).size;
    count.textContent = `${shown} of ${pool.length} ${catalogedOnly ? "cataloged " : ""}photos`;
    const empty = !all.length ? "No photos loaded."
      : !pool.length ? "No cataloged photos. Untick “Cataloged images only” to see all images."
      : facets.year || facets.placeName ? "No photos match the filters."
      : "No photos match the filter.";
    main.replaceChildren(...(sections.length ? sections : [el("p", { class: "empty" }, empty)]));
  }

  function renderNotices(failed: boolean) {
    const items: Node[] = warnings.map((w) => el("li", {}, w));
    const box: Node[] = items.length ? [el("ul", {}, ...items)] : [];
    if (failed && opts.localFallback !== false) {
      const input = el("input", { type: "file", accept: ".cex,.txt", multiple: "" });
      input.addEventListener("change", async () => {
        const files = [...(input.files ?? [])];
        const text = async (name: string) => {
          const f = files.find((f) => f.name === name);
          return f ? await f.text() : null;
        };
        apply(buildPhotos(await text("catalog.cex"), await text("images.cex"), cfg.imageBase), false);
      });
      box.push(el("label", { class: "local" }, "Load catalog.cex / images.cex from your computer: ", input));
    }
    notices.replaceChildren(...box);
    notices.hidden = box.length === 0;
  }

  function apply(r: LoadResult, failed: boolean) {
    all = r.photos;
    warnings = r.warnings;
    fillFacets();
    render();
    // A link to a single photo (#photo=<path>) opens it once the photos are loaded.
    const wanted = readHash(location.hash).photo;
    if (wanted && !openPath(wanted, "none")) {
      const hiddenUncataloged = catalogedOnly && all.some((p) => p.path === wanted);
      warnings = [...warnings, hiddenUncataloged
        ? `Photo “${wanted}” is not cataloged. Untick “Cataloged images only” to see it.`
        : `Photo “${wanted}” was not found.`];
      setPhotoHash(null, false);
    }
    renderNotices(failed);
  }

  main.replaceChildren(el("p", { class: "empty" }, "Loading…"));
  let alive = true;
  (opts.load ?? (() => loadRemote(cfg)))().then((r) => { if (alive) apply(r, r.photos.length === 0); });
  return {
    destroy() {
      alive = false;
      tileObserver?.disconnect();
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHashChange);
      lb.remove();
    },
  };
}
