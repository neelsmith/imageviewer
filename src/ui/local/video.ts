/**
 * Poster frames for video tiles: load the video (muted, off-screen), seek a little way in,
 * and draw that frame to a small JPEG. Works only where the browser can decode the video
 * (e.g. HEVC needs Safari or hardware support); otherwise it rejects and the tile shows a
 * plain "video" placeholder. At most two run at once, so a folder of videos doesn't
 * open dozens of decoders.
 */
export interface VideoFrame { blob: Blob; w: number; h: number; duration: number | null }

const MAX_SIDE = 480;
const TIMEOUT_MS = 20_000;
const LIMIT = 2;
let active = 0;
const queue: (() => void)[] = [];

function slot(): Promise<() => void> {
  return new Promise((resolve) => {
    const go = () => { active++; resolve(() => { active--; queue.shift()?.(); }); };
    if (active < LIMIT) go(); else queue.push(go);
  });
}

export async function videoFrame(url: string): Promise<VideoFrame> {
  const release = await slot();
  try {
    return await grab(url);
  } finally {
    release();
  }
}

function grab(url: string): Promise<VideoFrame> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    let done = false;
    const finish = (err: Error | null, frame?: VideoFrame) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      try { v.load(); } catch { /* jsdom */ }
      if (err) reject(err); else resolve(frame!);
    };
    const timer = setTimeout(() => finish(new Error("this browser can't play this video")), TIMEOUT_MS);
    v.addEventListener("error", () => finish(new Error("this browser can't play this video")), { once: true });
    v.addEventListener("loadedmetadata", () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      v.currentTime = Math.min(1, d / 3);
    }, { once: true });
    v.addEventListener("seeked", () => {
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return finish(new Error("this browser can't play this video"));
      const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const ctx = c.getContext("2d");
      if (!ctx) return finish(new Error("no canvas"));
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const duration = Number.isFinite(v.duration) ? v.duration : null;
      c.toBlob((blob) => blob ? finish(null, { blob, w, h, duration }) : finish(new Error("no frame")), "image/jpeg", 0.8);
    }, { once: true });
    v.src = url;
    try { v.load(); } catch { /* jsdom */ }
  });
}
