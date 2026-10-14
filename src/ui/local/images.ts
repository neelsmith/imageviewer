import type { Photo } from "../../lib/types";
import { isHeicName } from "../../lib/local/tree";
import type { HeicDecoder } from "./heic";

/** What the grid and photo view need to show photos that aren't plain URLs. */
export interface ImageProvider {
  /** URL for the grid tile (may decode in the background). */
  tile(p: Photo): Promise<string>;
  /** URL of the full image for the photo view, plus its size if known. */
  full(p: Photo): Promise<{ url: string; size: { w: number; h: number } | null }>;
  /** Already-made tile URL, used as a placeholder while the full image loads. */
  placeholder(p: Photo): string | null;
  /** Full-image size if already known (from decoding the tile). */
  size(p: Photo): { w: number; h: number } | null;
}

type Size = { w: number; h: number };

/**
 * Images from local files. JPEG/PNG/WebP/GIF are shown straight from the file. HEIC:
 * grid tiles come from the thumbnail stored inside the file (decoded by libheif in a
 * worker); the photo view uses the browser's own HEIC support when it has one (Safari)
 * and otherwise decodes the full image in a worker.
 */
export class LocalImages implements ImageProvider {
  private urls: string[] = [];
  private fileUrl = new Map<string, string>();
  private tiles = new Map<string, Promise<string>>();
  private tileDone = new Map<string, string>();
  private sizes = new Map<string, Size>();
  private fulls = new Map<string, Promise<{ url: string; size: Size | null }>>();
  private fullOrder: string[] = [];
  private nativeHeic: Promise<boolean> | null = null;

  constructor(
    private readonly files: Map<string, File>,
    private readonly decoder: HeicDecoder,
    /** Override for tests: does the browser decode this HEIC file itself? */
    private readonly probeNative: (f: File) => Promise<boolean> = probeNativeHeic,
    private readonly keepFull = 3,
  ) {}

  /** Object URL for the file itself ("Open original", and non-HEIC display). */
  originalUrl(p: Photo): string {
    let u = this.fileUrl.get(p.path);
    const f = this.files.get(p.path);
    if (!u && f) { u = this.track(URL.createObjectURL(f)); this.fileUrl.set(p.path, u); }
    return u ?? "";
  }

  tile(p: Photo): Promise<string> {
    let t = this.tiles.get(p.path);
    if (!t) {
      t = this.makeTile(p).then((u) => { this.tileDone.set(p.path, u); return u; });
      t.catch(() => this.tiles.delete(p.path)); // allow a retry next time it scrolls into view
      this.tiles.set(p.path, t);
    }
    return t;
  }

  placeholder(p: Photo): string | null { return this.tileDone.get(p.path) ?? null; }
  size(p: Photo): Size | null { return this.sizes.get(p.path) ?? null; }

  full(p: Photo): Promise<{ url: string; size: Size | null }> {
    let f = this.fulls.get(p.path);
    if (!f) {
      f = this.makeFull(p);
      f.catch(() => this.fulls.delete(p.path));
      this.fulls.set(p.path, f);
      // Keep only the last few decoded full images (they can be large).
      this.fullOrder.push(p.path);
      while (this.fullOrder.length > this.keepFull) {
        const old = this.fullOrder.shift()!;
        const pr = this.fulls.get(old);
        this.fulls.delete(old);
        pr?.then((r) => { if (!this.fileUrl.has(old) || this.fileUrl.get(old) !== r.url) URL.revokeObjectURL(r.url); }, () => {});
      }
    }
    return f;
  }

  /** Revoke every object URL (call when leaving this folder). */
  dispose(): void {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
    for (const pr of this.fulls.values()) pr.then((r) => URL.revokeObjectURL(r.url), () => {});
    this.fulls.clear();
  }

  private track(u: string): string { this.urls.push(u); return u; }

  private file(p: Photo): File {
    const f = this.files.get(p.path);
    if (!f) throw new Error(`file not found: ${p.path}`);
    return f;
  }

  private async makeTile(p: Photo): Promise<string> {
    if (!isHeicName(p.path)) return this.originalUrl(p); // shown full size, as decided
    const d = await this.decoder.thumb(this.file(p));
    this.sizes.set(p.path, { w: d.fullW, h: d.fullH });
    return this.track(URL.createObjectURL(d.blob));
  }

  private async makeFull(p: Photo): Promise<{ url: string; size: Size | null }> {
    if (!isHeicName(p.path)) return { url: this.originalUrl(p), size: null };
    const f = this.file(p);
    this.nativeHeic ??= this.probeNative(f);
    if (await this.nativeHeic) return { url: this.originalUrl(p), size: this.size(p) };
    const d = await this.decoder.full(f);
    const size = { w: d.w, h: d.h };
    this.sizes.set(p.path, size);
    return { url: URL.createObjectURL(d.blob), size };
  }
}

/** Safari decodes HEIC itself; Chrome and Firefox don't. Tested once on a real file. */
export async function probeNativeHeic(f: File): Promise<boolean> {
  if (typeof createImageBitmap !== "function") return false;
  try {
    const bmp = await createImageBitmap(f);
    const ok = bmp.width > 0;
    bmp.close();
    return ok;
  } catch {
    return false;
  }
}
