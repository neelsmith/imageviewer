import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startSlideshow } from "../ui/slideshow";
import { buildPhotos } from "../ui/load";
import type { AppHandle } from "../ui/app";

// UI flow test for the slide-show pages (*-slideshow.html), with a catalog and index.
const CAT = "path|caption|credits|license|tags|year|place|urn\n" +
  "c.jpg|Cee|Photo C||x|1990|Rome|urn:cite2:t:img.v1:c\n" +
  "a.jpg|Ay|||x|1986|Priene|urn:cite2:t:img.v1:a\n";
const IDX = "path|date|lat|lon|city|region|country|width|height\n" +
  "a.jpg|2020-01-01||||||1|1\nb.jpg|2019-01-01||||||1|1\nc.jpg|2021-01-01||||||1|1\n";
const cfg = { imageBase: "https://h/", dataBase: "https://d/" };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const read = (root: HTMLElement) => ({
  counter: root.querySelector(".ss-counter")!.textContent,
  src: root.querySelector<HTMLImageElement>(".slide.on")?.getAttribute("src") ?? null,
  caption: root.querySelector<HTMLElement>(".slide-caption")!.hidden ? null
    : [...root.querySelectorAll(".slide-caption p")].map((p) => p.textContent),
});
const key = (k: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k }));

describe("slide show", () => {
  let root: HTMLElement;
  let view: AppHandle | null = null;
  const start = (hash = "", opts = {}) => {
    history.replaceState(null, "", `/catalogs-slideshow.html${hash}`);
    view = startSlideshow(root, cfg, { catalogToggle: true, load: async () => buildPhotos(CAT, IDX, cfg.imageBase), ...opts });
  };
  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.append(root);
    // jsdom doesn't load images: treat every image as decoded at once.
    HTMLImageElement.prototype.decode = () => Promise.resolve();
  });
  afterEach(() => { view?.destroy(); view = null; });

  it("shows cataloged photos in catalog order, with captions, and moves with the keys (looping)", async () => {
    start();
    await tick(5);
    expect(read(root)).toEqual({ counter: "1 / 2", src: "https://h/c.jpg", caption: ["Cee", "1990 · Rome", "Photo C"] });
    expect(root.querySelector(".bar .count")!.textContent).toBe("2 of 2 cataloged photos");
    expect(location.hash).toBe("#photo=c.jpg");
    key("ArrowRight"); await tick(5);
    expect(read(root).src).toBe("https://h/a.jpg");
    key("ArrowRight"); await tick(5);
    expect(read(root).counter).toBe("1 / 2"); // wrapped round
    key("ArrowLeft"); await tick(5);
    expect(read(root).counter).toBe("2 / 2");
  });

  it("advances on the timer, and pauses with the space bar", async () => {
    start("#secs=1");
    await tick(5);
    expect(root.querySelector<HTMLInputElement>(".ss-secs input")!.value).toBe("1");
    await tick(1100);
    expect(read(root).src).toBe("https://h/a.jpg");
    key(" ");
    expect(root.querySelector(".ss-play")!.getAttribute("aria-label")).toBe("Play (space)");
    await tick(1100);
    expect(read(root).src).toBe("https://h/a.jpg");
  }, 5000);

  it("settings come from the URL: all photos, date order, no captions, start photo", async () => {
    start("#all=1&order=date&captions=0&photo=a.jpg");
    await tick(5);
    expect(read(root)).toEqual({ counter: "2 / 3", src: "https://h/a.jpg", caption: null });
    expect(root.querySelector<HTMLSelectElement>(".bar select[aria-label=Order]")!.value).toBe("date");
    key("ArrowLeft"); await tick(5);
    expect(read(root).src).toBe("https://h/b.jpg"); // oldest first
  });

  it("changing the order keeps the photo on screen and records it in the URL", async () => {
    start("#all=1&photo=c.jpg");
    await tick(5);
    const sel = root.querySelector<HTMLSelectElement>(".bar select[aria-label=Order]")!;
    sel.value = "name"; sel.dispatchEvent(new Event("change"));
    await tick(5);
    expect(read(root)).toMatchObject({ counter: "3 / 3", src: "https://h/c.jpg" });
    expect(location.hash).toContain("order=name");
  });

  it("transition, speed and pan & zoom: 4 s, fade through black, slow, pan on by default; choices kept in the URL", async () => {
    start();
    await tick(5);
    const sel = (label: string) => root.querySelector<HTMLSelectElement>(`.bar select[aria-label="${label}"]`)!;
    expect(root.querySelector<HTMLInputElement>(".ss-secs input")!.value).toBe("4");
    expect(sel("Transition").value).toBe("black");
    expect(sel("Transition speed").value).toBe("slow");
    const panBox = [...root.querySelectorAll<HTMLLabelElement>(".bar .toggle")].find((l) => l.textContent!.includes("Pan"))!.querySelector("input")!;
    panBox.click();
    expect(location.hash).toContain("pan=0");
    panBox.click();
    expect(location.hash).not.toContain("pan=");
    sel("Transition speed").value = "quick"; sel("Transition speed").dispatchEvent(new Event("change"));
    expect(location.hash).toContain("speed=quick");
    expect([...root.querySelectorAll<HTMLInputElement>(".bar > .toggle input")].map((b) => b.checked)).toEqual([true, true, true]);
    sel("Transition").value = "wipe"; sel("Transition").dispatchEvent(new Event("change"));
    expect(location.hash).toContain("transition=wipe");
    sel("Transition").value = "none"; sel("Transition").dispatchEvent(new Event("change"));
    expect(sel("Transition speed").disabled).toBe(true);
    sel("Transition").value = "black"; sel("Transition").dispatchEvent(new Event("change"));
    expect(location.hash).not.toContain("transition=");
    // Without Web Animations (jsdom) the new photo simply replaces the old one.
    key("ArrowRight"); await tick(5);
    const layers = [...root.querySelectorAll<HTMLElement>(".slide-layer")];
    expect(layers.map((l) => l.style.opacity).sort()).toEqual(["0", "1"]);
    expect(read(root).src).toBe("https://h/a.jpg");
  });

  it("starts at the photo named by a link by URN (any region ignored)", async () => {
    start("#urn=" + encodeURIComponent("urn:cite2:t:img.v1:a@0.1,0.1,0.5,0.5"));
    await tick(5);
    expect(read(root).src).toBe("https://h/a.jpg");
    expect(location.hash).toBe("#photo=a.jpg");
  });

  it("an image that can't be shown is reported, and the show goes on", async () => {
    HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
      return this.src.endsWith("c.jpg") ? Promise.reject(new Error("broken")) : Promise.resolve();
    };
    start("#secs=1");
    await tick(5);
    expect(root.querySelector(".slide-status")!.textContent).toBe("Can't display c.jpg: broken");
    await tick(1100);
    expect(read(root).src).toBe("https://h/a.jpg");
    expect(root.querySelector<HTMLElement>(".slide-status")!.hidden).toBe(true);
  }, 5000);

  it("videos play through, then the show moves on; sound and length settings", async () => {
    let loads = 0;
    HTMLMediaElement.prototype.load = function (this: HTMLMediaElement) {
      if (!this.getAttribute("src")) return;
      loads++;
      setTimeout(() => this.dispatchEvent(new Event("loadeddata")), 0);
    };
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { get: () => 640, configurable: true });
    const played: HTMLMediaElement[] = [];
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { played.push(this); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = () => {};
    const cat = "path|caption|credits|license|tags\nc.jpg|Cee|||\nclip.mov|A clip|||\na.jpg|Ay|||\n";
    history.replaceState(null, "", "/catalogs-slideshow.html#secs=1&photo=clip.mov");
    view = startSlideshow(root, cfg, { catalogToggle: true, load: async () => buildPhotos(cat, IDX + "clip.mov|2020-06-01||||||1|1\n", cfg.imageBase) });
    await tick(20);
    const v = root.querySelector<HTMLVideoElement>(".slide-video.on")!;
    expect(v).not.toBeNull();
    expect(v.getAttribute("src")).toBe("https://h/clip.mov");
    expect(v.muted).toBe(true);
    expect(played).toContain(v);
    expect(loads).toBe(1);
    expect(root.querySelector<HTMLElement>(".video-opts")!.hidden).toBe(false);
    // Longer than the 1 s per slide: a video isn't cut short by the photo timer.
    await tick(1200);
    expect(read(root).counter).toBe("2 / 3");
    // Sound on: unmuted, kept in the URL.
    const sound = [...root.querySelectorAll<HTMLLabelElement>(".video-opts .toggle")][0].querySelector("input")!;
    sound.click();
    expect(v.muted).toBe(false);
    expect(location.hash).toContain("sound=1");
    // When it ends, the next photo comes.
    v.dispatchEvent(new Event("ended"));
    await tick(10);
    expect(read(root)).toMatchObject({ counter: "3 / 3", src: "https://h/a.jpg" });
    expect(v.getAttribute("src")).toBeNull(); // unloaded once off screen
    const sel = root.querySelector<HTMLSelectElement>('.bar select[aria-label="Videos"]')!;
    sel.value = "15"; sel.dispatchEvent(new Event("change"));
    expect(location.hash).toContain("vmax=15");
  }, 5000);
});
