import {
  fitView, isZoomed, panBy, scaleLimits, toggleZoom, wheelFactor, zoomAt,
  type Size, type View,
} from "../lib/zoom";

export interface ZoomViewerOptions {
  /** Horizontal touch swipe while not zoomed: -1 = previous, 1 = next. */
  onSwipe?: (dir: -1 | 1) => void;
}

const STEP = 1.5; // zoom factor for buttons and +/- keys

/**
 * Zoomable, pannable image for the single-photo view. Mouse wheel / trackpad
 * pinch / touch pinch zoom toward the pointer; drag pans; double-click or
 * double-tap toggles fit ↔ 100%; +, −, 0 keys and on-screen buttons.
 */
export class ZoomViewer {
  readonly el: HTMLDivElement;
  readonly controls: HTMLDivElement;
  readonly img: HTMLImageElement;
  private view: View = { scale: 1, x: 0, y: 0 };
  private natural: Size | null = null;
  private readonly label: HTMLSpanElement;
  private readonly outBtn: HTMLButtonElement;
  private readonly inBtn: HTMLButtonElement;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture: { startX: number; startY: number; time: number; type: string } | null = null;
  private lastTap = { time: 0, x: 0, y: 0 };
  private lastTouchToggle = 0;
  private safariScale = 1;

  constructor(private readonly opts: ZoomViewerOptions = {}) {
    this.img = document.createElement("img");
    this.img.className = "zoom-img";
    this.img.draggable = false;
    this.el = document.createElement("div");
    this.el.className = "zoom";
    this.el.append(this.img);

    const btn = (cls: string, text: string, label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.textContent = text;
      b.setAttribute("aria-label", label);
      b.title = label;
      b.addEventListener("click", fn);
      return b;
    };
    this.outBtn = btn("zoom-out", "−", "Zoom out (−)", () => this.zoomBy(1 / STEP));
    this.inBtn = btn("zoom-in", "+", "Zoom in (+)", () => this.zoomBy(STEP));
    this.label = document.createElement("span");
    this.label.className = "zoom-level";
    this.controls = document.createElement("div");
    this.controls.className = "zoom-controls";
    this.controls.append(this.outBtn, this.label, this.inBtn, btn("zoom-fit", "Fit", "Fit to screen (0)", () => this.reset()));

    this.img.addEventListener("load", () => {
      this.natural = { w: this.img.naturalWidth, h: this.img.naturalHeight };
      this.reset();
      this.img.style.visibility = "";
    });
    this.bindEvents();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => this.onResize()).observe(this.el);
  }

  /** Show a new image, fitted. `size` (from images.cex) lets it lay out before loading. */
  load(url: string, alt: string, size: Size | null = null): void {
    this.natural = size && size.w > 0 && size.h > 0 ? size : null;
    this.img.alt = alt;
    this.img.style.visibility = this.natural ? "" : "hidden";
    this.img.src = url;
    if (this.natural) this.reset();
  }

  clear(): void {
    this.img.removeAttribute("src");
    this.natural = null;
  }

  get scale(): number { return this.view.scale; }
  get zoomed(): boolean { return !!this.natural && isZoomed(this.view, this.stage(), this.natural); }

  reset(): void {
    if (!this.natural) return;
    this.view = fitView(this.stage(), this.natural);
    this.apply();
  }

  /** Zoom by a factor around a stage point (default: center). */
  zoomBy(factor: number, px?: number, py?: number): void {
    if (!this.natural) return;
    const s = this.stage();
    this.view = zoomAt(this.view, factor, px ?? s.w / 2, py ?? s.h / 2, s, this.natural);
    this.apply();
  }

  /** Handle +, −, 0. Returns true if the key was used. */
  handleKey(e: KeyboardEvent): boolean {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "+" || e.key === "=") this.zoomBy(STEP);
    else if (e.key === "-" || e.key === "_") this.zoomBy(1 / STEP);
    else if (e.key === "0") this.reset();
    else return false;
    return true;
  }

  private stage(): Size {
    return { w: this.el.clientWidth, h: this.el.clientHeight };
  }

  private point(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private apply(): void {
    const { scale, x, y } = this.view;
    this.img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.label.textContent = `${Math.round(scale * 100)}%`;
    const zoomed = this.zoomed;
    this.el.classList.toggle("zoomed", zoomed);
    if (this.natural) {
      const { min, max } = scaleLimits(this.stage(), this.natural);
      this.outBtn.disabled = scale <= min * 1.001;
      this.inBtn.disabled = scale >= max * 0.999;
    }
  }

  private onResize(): void {
    if (!this.natural) return;
    if (this.zoomed) this.zoomBy(1); // re-clamp to the new stage
    else this.reset();
  }

  private bindEvents(): void {
    const el = this.el;

    el.addEventListener("wheel", (e) => {
      if (!this.natural) return;
      e.preventDefault();
      const [px, py] = this.point(e);
      this.zoomBy(wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey), px, py);
    }, { passive: false });

    // Safari trackpad pinch (non-standard gesture events).
    el.addEventListener("gesturestart", (e) => { e.preventDefault(); this.safariScale = 1; });
    el.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      const g = e as unknown as { scale: number; clientX: number; clientY: number };
      const [px, py] = this.point(g);
      this.zoomBy(g.scale / this.safariScale, px, py);
      this.safariScale = g.scale;
    });

    el.addEventListener("dblclick", (e) => {
      if (!this.natural || Date.now() - this.lastTouchToggle < 600) return;
      const [px, py] = this.point(e);
      this.view = toggleZoom(this.view, px, py, this.stage(), this.natural);
      this.apply();
    });

    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1)
        this.gesture = { startX: e.clientX, startY: e.clientY, time: Date.now(), type: e.pointerType };
      else this.gesture = null; // pinch: no swipe / tap
      el.classList.add("dragging");
    });

    el.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev || !this.natural) return;
      const s = this.stage();
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.entries()];
        const other = a[0] === e.pointerId ? b[1] : a[1];
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        const [mx, my] = this.point({ clientX: (e.clientX + other.x) / 2, clientY: (e.clientY + other.y) / 2 });
        if (before > 0) this.view = zoomAt(this.view, after / before, mx, my, s, this.natural);
        this.view = panBy(this.view, (e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2, s, this.natural);
        this.apply();
      } else if (this.pointers.size === 1 && this.zoomed) {
        this.view = panBy(this.view, e.clientX - prev.x, e.clientY - prev.y, s, this.natural);
        this.apply();
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });

    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size === 0) el.classList.remove("dragging");
      const g = this.gesture;
      if (!g || this.pointers.size > 0 || e.type === "pointercancel") return;
      this.gesture = null;
      const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
      if (g.type !== "touch") return;
      // Swipe to change photo (only when not zoomed in).
      if (!this.zoomed && Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        this.opts.onSwipe?.(dx < 0 ? 1 : -1);
        return;
      }
      // Double-tap toggles zoom.
      if (Math.hypot(dx, dy) < 10 && Date.now() - g.time < 300) {
        const now = Date.now();
        const near = Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 30;
        if (now - this.lastTap.time < 300 && near && this.natural) {
          const [px, py] = this.point(e);
          this.view = toggleZoom(this.view, px, py, this.stage(), this.natural);
          this.apply();
          this.lastTouchToggle = now;
          this.lastTap.time = 0;
        } else {
          this.lastTap = { time: now, x: e.clientX, y: e.clientY };
        }
      }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
}
