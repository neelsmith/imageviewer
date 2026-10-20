import type { Photo } from "../../lib/types";
import { joinUrl, thumbUrl } from "../../lib/merge";
import { isHeicName } from "../../lib/local/tree";
import type { ImageProvider } from "../local/images";
import { probeNativeHeic } from "../local/images";
import type { HeicDecoder } from "../local/heic";

type Size = { w: number; h: number };

/**
 * Images on the web server, below the page's folder (www-browse.html). Grid tiles use the
 * thumbnails made by utils/make-thumbnails.mjs (`_thumbs/<path>.jpg`); if one is missing,
 * the tile falls back to the original — or, for HEIC, to the thumbnail stored inside the
 * file, decoded in a worker. The photo view uses the original; HEIC is shown by the
 * browser itself when it can (Safari), otherwise decoded in a worker.
 */
export class WebImages implements ImageProvider {
  private urls: string[] = [];
  private tileUrl = new Map<string, string>();
  private decodedSize = new Map<string, Size>();
  private blobs = new Map<string, Promise<File>>();
  private fulls = new Map<string, Promise<{ url: string; size: Size | null }>>();
  private fullOrder: string[] = [];
  private nativeHeic: Promise<boolean> | null = null;

  constructor(
    private readonly base: string,
    /** Path as listed in the view → path below `base`. */
    private readonly paths: Map<string, string>,
    /** Display size from images.cex, when known. */
    private readonly sizes: Map<string, Size>,
    private readonly decoder: HeicDecoder | null,
    private readonly probeNative: (f: Blob) => Promise<boolean> = (b) => probeNativeHeic(b as File),
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    private readonly keepFull = 3,
  ) {}

  private rootPath(p: Photo): string {
    const r = this.paths.get(p.path);
    if (r === undefined) throw new Error(`not in the index: ${p.path}`);
    return r;
  }

  originalUrl(p: Photo): string {
    const r = this.paths.get(p.path);
    return r === undefined ? "" : joinUrl(this.base, r);
  }

  async tile(p: Photo): Promise<string> {
    const u = thumbUrl(this.base, this.rootPath(p));
    this.tileUrl.set(p.path, u);
    return u;
  }

  async tileFallback(p: Photo): Promise<string> {
    let u: string;
    if (isHeicName(p.path) && this.decoder) {
      const d = await this.decoder.thumb(await this.download(p)); // not kept: only the tile is
      this.decodedSize.set(p.path, { w: d.fullW, h: d.fullH });
      u = this.track(URL.createObjectURL(d.blob));
    } else {
      u = this.originalUrl(p);
    }
    this.tileUrl.set(p.path, u);
    return u;
  }

  placeholder(p: Photo): string | null { return this.tileUrl.get(p.path) ?? null; }
  size(p: Photo): Size | null { return this.sizes.get(p.path) ?? this.decodedSize.get(p.path) ?? null; }

  full(p: Photo): Promise<{ url: string; size: Size | null }> {
    let f = this.fulls.get(p.path);
    if (!f) {
      f = this.makeFull(p);
      f.catch(() => this.fulls.delete(p.path));
      this.fulls.set(p.path, f);
      this.fullOrder.push(p.path);
      while (this.fullOrder.length > this.keepFull) {
        const old = this.fullOrder.shift()!;
        const pr = this.fulls.get(old);
        this.fulls.delete(old);
        this.blobs.delete(old);
        pr?.then((r) => { if (r.url.startsWith("blob:")) URL.revokeObjectURL(r.url); }, () => {});
      }
    }
    return f;
  }

  dispose(): void {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
    for (const pr of this.fulls.values()) pr.then((r) => { if (r.url.startsWith("blob:")) URL.revokeObjectURL(r.url); }, () => {});
    this.fulls.clear();
    this.blobs.clear();
  }

  private track(u: string): string { this.urls.push(u); return u; }

  private async download(p: Photo): Promise<File> {
    const r = await this.fetchImpl(this.originalUrl(p));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return new File([await r.arrayBuffer()], p.path.split("/").pop()!);
  }

  /** The original for the photo view, downloaded once while it's among the last few viewed. */
  private async file(p: Photo): Promise<File> {
    let b = this.blobs.get(p.path);
    if (!b) {
      b = this.download(p);
      b.catch(() => this.blobs.delete(p.path));
      this.blobs.set(p.path, b);
    }
    return b;
  }

  private async makeFull(p: Photo): Promise<{ url: string; size: Size | null }> {
    const size = this.size(p);
    if (!isHeicName(p.path)) return { url: this.originalUrl(p), size };
    const f = await this.file(p);
    this.nativeHeic ??= this.probeNative(f);
    if (await this.nativeHeic || !this.decoder) return { url: this.originalUrl(p), size };
    const d = await this.decoder.full(f);
    const s = { w: d.w, h: d.h };
    this.decodedSize.set(p.path, s);
    return { url: URL.createObjectURL(d.blob), size: s };
  }
}
