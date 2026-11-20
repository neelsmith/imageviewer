import type { AppConfig } from "../lib/config";
import type { Photo } from "../lib/types";
import { facetValues, placeLabel, selectPhotos, type Facet } from "../lib/group";
import { readHash, withHash } from "../lib/hash";
import { versionInfo } from "../lib/version";
import {
  DEFAULT_SPEED, DEFAULT_TRANSITION, MAX_SECS, MIN_SECS, ORDERS, SPEEDS, TRANSITIONS, effectiveTransition, orderPhotos, panFrames,
  parseOrder, parseSecs, parseSpeed, parseTransition, transitionFrames, transitionMs, wrap,
  type SlideOrder, type Speed, type Transition,
} from "../lib/slideshow";
import { sameImage, splitUrn } from "../lib/urn";
import { formatDate, type AppHandle, type AppOptions } from "./app";
import { loadRemote, type LoadResult, type Notice } from "./load";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

/** Wait until an image URL is loaded and decoded (so the cross-fade doesn't show a half-drawn image). */
function decodeImage(url: string): Promise<void> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  return img.decode ? img.decode() : new Promise((ok, fail) => { img.onload = () => ok(); img.onerror = fail; });
}

type WakeLockLike = { release(): Promise<void> };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

/** How long the controls stay up after the pointer last moved, while playing. */
const IDLE_MS = 2500;

/**
 * The slide-show pages (*-slideshow.html): the same data and choosers as the matching
 * grid app, shown one photo at a time, full window, advancing every few seconds.
 * Takes the same options as startApp, so each app's chooser can start either view.
 *
 * URL hash: secs=<seconds per slide> (1–600, default 4), order=catalog|date|name|shuffle,
 * transition=black|slide|dissolve|wipe|zoom|none (default black), speed=quick|normal|slow (default slow),
 * pan=0 turns off the slow pan and zoom on each photo (on by default), captions=0 hides the caption overlay, photo=<path> is the slide on screen (so a link
 * starts there), urn=<image urn> starts at that image; all=1, year=, place= as in the grid.
 */
export function startSlideshow(root: HTMLElement, cfg: AppConfig, opts: AppOptions = {}): AppHandle {
  const h0 = readHash(location.hash);
  let all: Photo[] = [];
  let warnings: Notice[] = [];
  let list: Photo[] = [];
  let index = 0;
  let catalogedOnly = !!opts.catalogToggle && h0.all !== "1";
  let order: SlideOrder = parseOrder(h0.order);
  let secs = parseSecs(h0.secs);
  let captions = h0.captions !== "0";
  let transition: Transition = parseTransition(h0.transition);
  let speed: Speed = parseSpeed(h0.speed);
  let pan = h0.pan !== "0";
  const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let playing = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0; // ignores slides that finish loading after moving on
  let alive = true;
  const facets: Record<Facet, string> = { year: h0.year ?? "", placeName: h0.place ?? "" };
  const facetKey: Record<Facet, string> = { year: "year", placeName: "place" };

  const setHash = (changes: Record<string, string | null>) =>
    history.replaceState(history.state, "", withHash(location.hash, changes) || location.pathname + location.search);

  // ---- Top bar: what to show ----
  const orderSel = el("select", { class: "facet-select", "aria-label": "Order" });
  for (const o of ORDERS) orderSel.add(new Option(o.label, o.order, false, o.order === order));
  orderSel.addEventListener("change", () => {
    order = parseOrder(orderSel.value);
    setHash({ order: order === "catalog" ? null : order });
    rebuild(true);
  });
  const transSel = el("select", { class: "facet-select", "aria-label": "Transition" });
  for (const t of TRANSITIONS) transSel.add(new Option(t.label, t.transition, false, t.transition === transition));
  transSel.addEventListener("change", () => {
    transition = parseTransition(transSel.value);
    setHash({ transition: transition === DEFAULT_TRANSITION ? null : transition });
    speedSel.disabled = transition === "none";
  });
  const speedSel = el("select", { class: "facet-select", "aria-label": "Transition speed" });
  for (const x of SPEEDS) speedSel.add(new Option(x.label, x.speed, false, x.speed === speed));
  speedSel.disabled = transition === "none";
  speedSel.addEventListener("change", () => {
    speed = parseSpeed(speedSel.value);
    setHash({ speed: speed === DEFAULT_SPEED ? null : speed });
  });
  const panBox = el("input", { type: "checkbox" });
  panBox.checked = pan;
  panBox.addEventListener("change", () => {
    pan = panBox.checked;
    setHash({ pan: pan ? null : "0" });
    if (pan) startPan(layers[front]); else panAnim?.cancel();
  });
  function facetSelect(facet: Facet, label: string, anyLabel: string) {
    const sel = el("select", { class: "facet-select", "aria-label": label, hidden: "" });
    sel.dataset.facet = facet;
    sel.dataset.any = anyLabel;
    sel.addEventListener("change", () => {
      facets[facet] = sel.value;
      setHash({ [facetKey[facet]]: sel.value || null });
      rebuild(false);
    });
    return sel;
  }
  const yearSel = facetSelect("year", "Year", "All years");
  const placeSel = facetSelect("placeName", "Place", "All places");
  function fillFacets() {
    for (const sel of [yearSel, placeSel]) {
      const facet = sel.dataset.facet as Facet;
      const values = facetValues(all, facet);
      if (facets[facet] && !values.includes(facets[facet])) { facets[facet] = ""; setHash({ [facetKey[facet]]: null }); }
      sel.replaceChildren(new Option(sel.dataset.any!, ""), ...values.map((v) => new Option(v, v)));
      sel.value = facets[facet];
      sel.hidden = values.length === 0;
    }
  }
  const toggles: HTMLElement[] = [];
  if (opts.catalogToggle) {
    const box = el("input", { type: "checkbox" });
    box.checked = catalogedOnly;
    box.addEventListener("change", () => {
      catalogedOnly = box.checked;
      setHash({ all: catalogedOnly ? null : "1" });
      rebuild(false);
    });
    toggles.push(el("label", { class: "toggle" }, box, " Cataloged images only"));
  }
  const capBox = el("input", { type: "checkbox" });
  capBox.checked = captions;
  capBox.addEventListener("change", () => {
    captions = capBox.checked;
    setHash({ captions: captions ? null : "0" });
    renderCaption();
  });
  toggles.push(el("label", { class: "toggle" }, capBox, " Captions"));
  const header = el("header", { class: "bar" }, el("h1", {}, "Slide show"), ...(opts.toolbar ?? []),
    orderSel, yearSel, placeSel, transSel, speedSel, el("label", { class: "toggle" }, panBox, " Pan & zoom"), ...toggles, el("span", { class: "count" }), versionInfo());
  if (opts.onLock) {
    const lock = el("button", { type: "button", class: "lock", title: "Lock (forget password on this device)" }, "Lock");
    lock.addEventListener("click", opts.onLock);
    header.append(lock);
  }
  const notices = el("div", { class: "notices", hidden: "" });

  // ---- Stage: two image layers for the cross-fade, caption, controls ----
  // Two layers (a box holding the photo) take turns: the incoming one animates in over the other.
  const layers = [0, 1].map(() => el("div", { class: "slide-layer" }, el("img", { class: "slide", alt: "" })));
  const imgOf = (l: HTMLElement) => l.firstElementChild as HTMLImageElement;
  let front = 0;
  const caption = el("div", { class: "slide-caption" });
  const status = el("p", { class: "slide-status" }, "Loading…");
  const btn = (cls: string, label: string, text: string) =>
    el("button", { type: "button", class: cls, "aria-label": label, title: label }, text);
  const prevBtn = btn("ss-prev", "Previous (←)", "‹");
  const playBtn = btn("ss-play", "Pause (space)", "❚❚");
  const nextBtn = btn("ss-next", "Next (→)", "›");
  const counter = el("span", { class: "ss-counter" });
  const secsIn = el("input", { type: "number", min: String(MIN_SECS), max: String(MAX_SECS), step: "1",
    value: String(secs), "aria-label": "Seconds per slide" });
  const fsBtn = btn("ss-full", "Full screen (F)", "⛶");
  const stage = el("div", { class: "slide-stage", tabindex: "-1" }, ...layers, status, caption,
    el("div", { class: "ss-controls" }, prevBtn, playBtn, nextBtn, counter,
      el("label", { class: "ss-secs" }, secsIn, " s"), fsBtn));
  const fsEl = stage as FsElement;
  if (!fsEl.requestFullscreen && !fsEl.webkitRequestFullscreen) fsBtn.hidden = true;

  root.replaceChildren(el("div", { class: "slideshow" }, header, notices,
    ...(opts.banner ? [opts.banner] : []), stage));

  // ---- Showing slides ----
  const urlFor = async (p: Photo) => (opts.images ? (await opts.images.full(p)).url : p.url);

  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function schedule() {
    clearTimer();
    if (playing && alive && list.length > 1) timer = setTimeout(() => go(index + 1), secs * 1000);
  }

  function renderCaption() {
    const p = list[index];
    caption.hidden = !captions || !p;
    if (!p) return;
    const when = p.year || (p.date ? formatDate(p.date) : "");
    const where = p.placeName || (p.place ? placeLabel(p.place) : "");
    const meta = [when, where].filter(Boolean).join(" · ");
    caption.replaceChildren(
      ...(p.caption ? [el("p", { class: "slide-title" }, p.caption)] : []),
      ...(meta ? [el("p", {}, meta)] : []),
      ...(p.credits ? [el("p", { class: "slide-credits" }, p.credits)] : []),
    );
    if (!caption.childNodes.length) caption.hidden = true;
  }

  function renderCounter() {
    counter.textContent = list.length ? `${index + 1} / ${list.length}` : "0 / 0";
    prevBtn.disabled = nextBtn.disabled = list.length < 2;
  }

  // ---- Transitions (Web Animations; without them the new photo simply replaces the old) ----
  let running: Animation[] = [];
  let finishSwap: (() => void) | null = null;
  let panAnim: Animation | null = null;
  const canAnimate = (e: Element) => typeof (e as HTMLElement).animate === "function";

  /** Slow pan and zoom on this layer's photo, lasting the whole slide; paused with the show. */
  function startPan(layer: HTMLElement) {
    // The outgoing photo keeps its pan until the transition ends (cancelled in swapLayers).
    const img = imgOf(layer);
    img.getAnimations?.().forEach((x) => x.cancel());
    panAnim = null;
    if (!pan || reducedMotion() || !canAnimate(img)) return;
    const tms = transitionMs(transition, speed, secs);
    panAnim = img.animate(panFrames(), { duration: secs * 1000 + tms + 500, easing: "linear", fill: "forwards" });
    if (!playing) panAnim.pause();
  }

  /** Bring the back layer in front with the chosen transition. dir: +1 forward, -1 back. */
  function swapLayers(dir: 1 | -1) {
    finishSwap?.(); // a transition still running ends at once
    const incoming = layers[1 - front], outgoing = layers[front];
    front = 1 - front;
    imgOf(incoming).classList.add("on");
    imgOf(outgoing).classList.remove("on");
    incoming.style.zIndex = "2";
    outgoing.style.zIndex = "1";
    incoming.style.opacity = "1";
    startPan(incoming);
    const done = () => {
      if (finishSwap !== done) return;
      finishSwap = null;
      running.forEach((a) => a.cancel());
      running = [];
      outgoing.style.opacity = "0";
      imgOf(outgoing).getAnimations?.().forEach((a) => a.cancel());
    };
    finishSwap = done;
    const t = effectiveTransition(transition, reducedMotion());
    const ms = transitionMs(t, speed, secs);
    const frames = transitionFrames(t, dir);
    if (!ms || !canAnimate(incoming) || (!frames.incoming && !frames.outgoing)) { done(); return; }
    const half = frames.sequential ? ms / 2 : ms;
    const easing = t === "slide" || t === "wipe" ? "cubic-bezier(.4,0,.2,1)" : "ease";
    if (frames.outgoing) running.push(outgoing.animate(frames.outgoing, { duration: half, easing, fill: "forwards" }));
    if (frames.incoming) running.push(incoming.animate(frames.incoming,
      { duration: half, delay: frames.sequential ? half : 0, easing, fill: "backwards" }));
    Promise.all(running.map((a) => a.finished)).then(done, () => { /* cancelled */ });
  }

  /** Show slide i (wrapping round); the timer for the next one starts once it's on screen. */
  async function go(i: number, dir: 1 | -1 = 1) {
    clearTimer();
    if (!list.length) return;
    index = wrap(i, list.length);
    const t = ++token;
    const p = list[index];
    renderCounter();
    setHash({ photo: p.path, urn: null });
    try {
      const url = await urlFor(p);
      await decodeImage(url);
      if (t !== token || !alive) return;
      const back = imgOf(layers[1 - front]);
      back.src = url;
      back.alt = p.caption || p.path;
      swapLayers(dir);
      status.hidden = true;
    } catch (e) {
      if (t !== token || !alive) return;
      finishSwap?.();
      layers.forEach((l) => { imgOf(l).classList.remove("on"); l.style.opacity = "0"; });
      status.textContent = `Can't display ${p.path}${e instanceof Error && e.message ? `: ${e.message}` : ""}`;
      status.hidden = false;
    }
    renderCaption();
    preload(index + 1);
    schedule();
  }

  /** Start loading the next slide now, so it's ready when its turn comes. */
  function preload(i: number) {
    if (list.length < 2) return;
    const p = list[wrap(i, list.length)];
    urlFor(p).then(decodeImage).catch(() => { /* reported when it's shown */ });
  }

  /** Recompute the slide list (filters/order changed or data loaded), staying on the same photo if it's still there. */
  function rebuild(keepCurrent: boolean, startPath?: string) {
    const was = startPath ?? (keepCurrent ? list[index]?.path : undefined);
    list = orderPhotos(selectPhotos(all, { catalogedOnly, query: "", year: facets.year, place: facets.placeName }), order);
    const pool = catalogedOnly ? all.filter((p) => p.cataloged) : all;
    header.querySelector(".count")!.textContent = `${list.length} of ${pool.length} ${catalogedOnly ? "cataloged " : ""}photos`;
    const at = was ? list.findIndex((p) => p.path === was) : -1;
    if (!list.length) {
      clearTimer(); token++;
      finishSwap?.();
      layers.forEach((l) => { imgOf(l).classList.remove("on"); l.style.opacity = "0"; });
      status.textContent = !all.length ? "No photos loaded." : "No photos match these settings.";
      status.hidden = false;
      index = 0;
      renderCounter(); renderCaption();
      return;
    }
    go(at >= 0 ? at : 0);
  }

  // ---- Controls ----
  function setPlaying(on: boolean) {
    playing = on;
    playBtn.textContent = on ? "❚❚" : "▶";
    playBtn.title = on ? "Pause (space)" : "Play (space)";
    playBtn.setAttribute("aria-label", playBtn.title);
    stage.classList.toggle("paused", !on);
    if (on) { wake(); schedule(); panAnim?.play(); } else { clearTimer(); unwake(); panAnim?.pause(); }
    poke();
  }
  prevBtn.addEventListener("click", () => go(index - 1, -1));
  nextBtn.addEventListener("click", () => go(index + 1));
  playBtn.addEventListener("click", () => setPlaying(!playing));
  secsIn.addEventListener("change", () => {
    secs = parseSecs(secsIn.value);
    secsIn.value = String(secs);
    setHash({ secs: secs === parseSecs(undefined) ? null : String(secs) });
    if (playing && timer) schedule();
  });
  const isFull = () => {
    const d = document as FsDocument;
    return (d.fullscreenElement ?? d.webkitFullscreenElement ?? null) === stage;
  };
  function toggleFull() {
    const d = document as FsDocument;
    if (isFull()) (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    else if (fsEl.requestFullscreen) fsEl.requestFullscreen().catch(() => {});
    else fsEl.webkitRequestFullscreen?.();
  }
  fsBtn.addEventListener("click", toggleFull);

  // Clicking the photo pauses/resumes; a sideways swipe moves back or on.
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest(".ss-controls")) return;
    down = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) setPlaying(!playing);
  };
  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointerup", onUp);

  // Controls and pointer fade out while playing, back on any movement.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  function poke() {
    stage.classList.remove("idle");
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = playing ? setTimeout(() => stage.classList.add("idle"), IDLE_MS) : null;
  }
  stage.addEventListener("pointermove", poke);

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " || e.key === "k") setPlaying(!playing);
    else if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1, -1);
    else if (e.key === "f" || e.key === "F") toggleFull();
    else return;
    e.preventDefault();
    poke();
  };
  document.addEventListener("keydown", onKey);

  // Keep the screen awake while playing (where the browser allows it).
  let lock: WakeLockLike | null = null;
  async function wake() {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLockLike> } }).wakeLock;
    if (!wl || lock || !playing || document.visibilityState !== "visible") return;
    try { lock = await wl.request("screen"); } catch { /* not allowed: fine */ }
    if (!alive || !playing) unwake();
  }
  function unwake() { lock?.release().catch(() => {}); lock = null; }
  const onVisible = () => { if (document.visibilityState === "visible") { lock = null; wake(); } };
  document.addEventListener("visibilitychange", onVisible);

  function renderNotices() {
    const items: Node[] = warnings.map((w) => typeof w === "string" ? el("li", {}, w)
      : el("li", {}, el("details", { class: "notice-details" },
        el("summary", {}, w.text, el("span", { class: "notice-more" }, " Show list")),
        el("ul", {}, ...w.items.map((i) => el("li", {}, el("code", {}, i)))))));
    notices.replaceChildren(...(items.length ? [el("ul", {}, ...items)] : []));
    notices.hidden = items.length === 0;
  }

  function apply(r: LoadResult) {
    all = r.photos;
    warnings = [...r.warnings];
    fillFacets();
    // Start at the photo named by a link: urn= (an image URN; any region is ignored) or photo=.
    const h = readHash(location.hash);
    let start = h.photo;
    if (h.urn) {
      const { base } = splitUrn(h.urn);
      const hit = all.find((p) => sameImage(p.urn, base));
      if (hit) start = hit.path; else warnings.push(`No photo with URN “${base}” was found.`);
      setHash({ urn: null });
    }
    rebuild(false, start);
    if (start && list.length && list[index].path !== start) {
      warnings.push(catalogedOnly && all.some((p) => p.path === start)
        ? `Photo “${start}” is not cataloged. Untick “Cataloged images only” to include it.`
        : `Photo “${start}” is not in this slide show; starting at the beginning.`);
    }
    renderNotices();
    wake();
    poke();
    stage.focus({ preventScroll: true });
  }

  // A link by URN pasted into the open page: go to that photo.
  const onHashChange = () => {
    const urn = readHash(location.hash).urn;
    if (!urn || !all.length) return;
    const { base } = splitUrn(urn);
    const at = list.findIndex((p) => sameImage(p.urn, base));
    setHash({ urn: null });
    if (at >= 0) go(at);
    else { warnings = [...warnings, `No photo with URN “${base}” is in this slide show.`]; renderNotices(); }
  };
  window.addEventListener("hashchange", onHashChange);

  renderCounter();
  (opts.load ?? (() => loadRemote(cfg)))().then((r) => { if (alive) apply(r); });

  return {
    destroy() {
      alive = false;
      token++;
      clearTimer();
      finishSwap?.();
      panAnim?.cancel();
      if (idleTimer) clearTimeout(idleTimer);
      unwake();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("hashchange", onHashChange);
      if (isFull()) (document as FsDocument).exitFullscreen?.().catch(() => {});
    },
  };
}
