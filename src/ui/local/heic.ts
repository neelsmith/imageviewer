// The libheif WebAssembly bundle (~2 MB, LGPL-3.0) and our worker code, as text. They are
// joined into a Blob and started as workers, which works in a page opened from disk.
import libheifSource from "libheif-js/libheif-wasm/libheif-bundle.js?raw";
import workerSource from "./heic-worker.js?raw";

export interface Decoded {
  /** JPEG of the decoded image (or thumbnail). */
  blob: Blob;
  w: number;
  h: number;
  /** Size of the full photo, after rotation. */
  fullW: number;
  fullH: number;
  /** "embedded" = the thumbnail stored in the file; "full" = the whole image was decoded. */
  source: "embedded" | "full";
}

interface Job {
  file: File;
  mode: "thumb" | "full";
  resolve: (d: Decoded) => void;
  reject: (e: Error) => void;
}

/** Turn RGBA from a worker without OffscreenCanvas into a JPEG on the main thread. */
async function rgbaToJpeg(rgba: ArrayBuffer, w: number, h: number, quality: number, short: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  let out = c;
  if (short && Math.min(w, h) > short) {
    const k = short / Math.min(w, h);
    out = document.createElement("canvas");
    out.width = Math.round(w * k); out.height = Math.round(h * k);
    out.getContext("2d")!.drawImage(c, 0, 0, out.width, out.height);
  }
  const blob = await new Promise<Blob>((ok, fail) =>
    out.toBlob((b) => (b ? ok(b) : fail(new Error("canvas encode failed"))), "image/jpeg", quality));
  return { blob, w: out.width, h: out.height };
}

/**
 * A small pool of HEIC-decoding workers. Full-size requests (the photo being viewed)
 * jump ahead of queued thumbnails.
 */
export class HeicDecoder {
  private url: string | null = null;
  private idle: Worker[] = [];
  private all: Worker[] = [];
  private queue: Job[] = [];
  private nextId = 1;

  constructor(private readonly size = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1)),
              private readonly thumbSize = 320) {}

  thumb(file: File): Promise<Decoded> { return this.enqueue(file, "thumb"); }
  full(file: File): Promise<Decoded> { return this.enqueue(file, "full"); }

  /** Drop queued (not yet started) work, e.g. after opening another folder. */
  cancelQueued(): void {
    for (const j of this.queue.splice(0)) j.reject(new Error("cancelled"));
  }

  dispose(): void {
    this.cancelQueued();
    this.all.forEach((w) => w.terminate());
    this.all = []; this.idle = [];
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private enqueue(file: File, mode: Job["mode"]): Promise<Decoded> {
    return new Promise((resolve, reject) => {
      const job = { file, mode, resolve, reject };
      if (mode === "full") this.queue.unshift(job); else this.queue.push(job);
      this.pump();
    });
  }

  private worker(): Worker | null {
    const w = this.idle.pop();
    if (w) return w;
    if (this.all.length >= this.size) return null;
    this.url ??= URL.createObjectURL(new Blob([libheifSource, "\n", workerSource], { type: "text/javascript" }));
    const nw = new Worker(this.url);
    this.all.push(nw);
    return nw;
  }

  private pump(): void {
    while (this.queue.length) {
      const w = this.worker();
      if (!w) return;
      const job = this.queue.shift()!;
      this.run(w, job).finally(() => { if (this.all.includes(w)) this.idle.push(w); this.pump(); });
    }
  }

  private async run(w: Worker, job: Job): Promise<void> {
    try {
      const buf = await job.file.arrayBuffer();
      const id = this.nextId++;
      const msg = await new Promise<Record<string, unknown>>((ok, fail) => {
        w.onmessage = (e) => { if (e.data.id === id) ok(e.data); };
        w.onerror = (e) => fail(new Error(e.message || "worker error"));
        w.postMessage({ id, buf, mode: job.mode, thumbSize: this.thumbSize }, [buf]);
      });
      if (!msg.ok) throw new Error(String(msg.error));
      let { blob, w: dw, h: dh } = msg as unknown as { blob?: Blob; w: number; h: number };
      if (!blob) {
        const j = await rgbaToJpeg(msg.rgba as ArrayBuffer, dw, dh,
          job.mode === "thumb" ? 0.85 : 0.92, job.mode === "thumb" ? this.thumbSize : 0);
        ({ blob, w: dw, h: dh } = j);
      }
      job.resolve({ blob, w: dw, h: dh, fullW: msg.fullW as number, fullH: msg.fullH as number,
        source: msg.source as Decoded["source"] });
    } catch (e) {
      job.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
