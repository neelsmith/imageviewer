import type { AppConfig } from "../lib/config";
import type { Photo } from "../lib/types";
import { filterPhotos, groupPhotos, placeLabel, type GroupMode, type PhotoGroup } from "../lib/group";
import { buildPhotos, loadRemote, type LoadResult } from "./load";

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
}

export function startApp(root: HTMLElement, cfg: AppConfig, opts: AppOptions = {}): void {
  let all: Photo[] = [];
  let warnings: string[] = [];
  let mode: GroupMode = (new URLSearchParams(location.hash.slice(1)).get("group") as GroupMode) || "date";
  if (!MODES.some((m) => m.mode === mode)) mode = "date";
  let query = "";
  let visible: Photo[] = []; // flattened order for lightbox navigation

  const count = el("span", { class: "count" });
  const search = el("input", { type: "search", placeholder: "Filter…", "aria-label": "Filter photos" });
  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "Group by" });
  const notices = el("div", { class: "notices" });
  const main = el("main", { class: "groups" });
  const header = el("header", { class: "bar" },
    el("h1", {}, "Image Viewer"), seg, search, count);
  if (opts.onLock) {
    const lock = el("button", { type: "button", class: "lock", title: "Lock (forget password on this device)" }, "Lock");
    lock.addEventListener("click", opts.onLock);
    header.append(lock);
  }
  root.replaceChildren(header, notices, main);

  for (const m of MODES) {
    const b = el("button", { type: "button", role: "radio", "data-mode": m.mode }, m.label);
    b.addEventListener("click", () => { mode = m.mode; history.replaceState(null, "", `#group=${mode}`); render(); });
    seg.append(b);
  }
  search.addEventListener("input", () => { query = search.value; render(); });

  // ---- Lightbox ----
  const lbImg = el("img", { alt: "" });
  const lbInfo = el("aside", { class: "info" });
  const prev = el("button", { class: "nav prev", "aria-label": "Previous" }, "‹");
  const next = el("button", { class: "nav next", "aria-label": "Next" }, "›");
  const close = el("button", { class: "close", "aria-label": "Close" }, "×");
  const lb = el("div", { class: "lightbox", hidden: "", role: "dialog", "aria-modal": "true" },
    el("div", { class: "stage" }, lbImg, prev, next, close), lbInfo);
  document.body.append(lb);
  let current = -1;

  function show(i: number) {
    if (i < 0 || i >= visible.length) return;
    current = i;
    const p = visible[i];
    lbImg.src = p.url;
    lbImg.alt = p.caption || p.path;
    const rows: [string, string][] = [
      ["Caption", p.caption], ["Date", p.date ? formatDate(p.date) : ""],
      ["Place", p.place ? placeLabel(p.place) : ""], ["Tags", p.tags.join(", ")],
      ["Credits", p.credits], ["License", p.license], ["File", p.path],
    ];
    lbInfo.replaceChildren(
      ...(p.cataloged ? [] : [el("p", { class: "badge" }, "Not in catalog")]),
      el("dl", {}, ...rows.filter(([, v]) => v).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
      el("a", { href: p.url, target: "_blank", rel: "noopener" }, "Open original ↗"),
    );
    prev.disabled = i === 0;
    next.disabled = i === visible.length - 1;
    lb.hidden = false;
    close.focus();
  }
  const hide = () => { lb.hidden = true; lbImg.removeAttribute("src"); current = -1; };
  prev.addEventListener("click", () => show(current - 1));
  next.addEventListener("click", () => show(current + 1));
  close.addEventListener("click", hide);
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") hide();
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "ArrowRight") show(current + 1);
  });

  // ---- Rendering ----
  function tile(p: Photo, index: number) {
    const img = el("img", { src: p.url, alt: p.caption || p.path, loading: "lazy", decoding: "async" });
    const b = el("button", { class: "tile", type: "button", title: p.caption || p.path }, img);
    if (!p.cataloged) b.classList.add("uncataloged");
    img.addEventListener("error", () => b.classList.add("broken"), { once: true });
    b.addEventListener("click", () => show(index));
    return b;
  }

  function section(g: PhotoGroup, start: number) {
    return el("section", { class: "group" },
      el("h2", {}, g.label, el("span", { class: "n" }, String(g.photos.length))),
      el("div", { class: "grid" }, ...g.photos.map((p, i) => tile(p, start + i))));
  }

  function render() {
    seg.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
    const groups = groupPhotos(filterPhotos(all, query), mode);
    visible = groups.flatMap((g) => g.photos);
    let start = 0;
    const sections = groups.map((g) => { const s = section(g, start); start += g.photos.length; return s; });
    const shown = new Set(visible.map((p) => p.path)).size;
    count.textContent = `${shown} of ${all.length} photos`;
    main.replaceChildren(...(sections.length ? sections
      : [el("p", { class: "empty" }, all.length ? "No photos match the filter." : "No photos loaded.")]));
  }

  function renderNotices(failed: boolean) {
    const items: Node[] = warnings.map((w) => el("li", {}, w));
    const box: Node[] = items.length ? [el("ul", {}, ...items)] : [];
    if (failed) {
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
    renderNotices(failed);
    render();
  }

  main.replaceChildren(el("p", { class: "empty" }, "Loading…"));
  loadRemote(cfg).then((r) => apply(r, r.photos.length === 0));
}
