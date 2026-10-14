// HEIC decoding worker for local.html. Plain JavaScript: it is appended to the libheif
// bundle (which defines the global `libheif`) and started from a Blob URL, so it works
// in a page opened from disk. Messages in: { id, buf: ArrayBuffer, mode: "thumb" | "full",
// thumbSize }. Messages out: { id, ok, blob? | rgba?, w, h, fullW, fullH, source } or
// { id, ok: false, error }.
let M = null;
const lib = () => (M ??= libheif()); // libheif compiles its WebAssembly synchronously: fine in a worker
const i32 = (p) => M.HEAP32[p >> 2];

function open(buf) {
  lib();
  const s = { ctx: M._heif_context_alloc(), dp: M._malloc(buf.byteLength), err: M._malloc(16), out: M._malloc(8), ids: M._malloc(64) };
  M.HEAPU8.set(new Uint8Array(buf), s.dp);
  M._heif_context_read_from_memory(s.err, s.ctx, s.dp, buf.byteLength, 0);
  if (i32(s.err)) { close(s); throw new Error("not a readable HEIC file (libheif error " + i32(s.err) + ")"); }
  M._heif_context_get_primary_image_handle(s.err, s.ctx, s.out);
  if (i32(s.err)) { close(s); throw new Error("no primary image (libheif error " + i32(s.err) + ")"); }
  s.h = i32(s.out);
  return s;
}
function close(s) {
  if (s.h) M._heif_image_handle_release(s.h);
  M._heif_context_free(s.ctx);
  for (const p of [s.dp, s.err, s.out, s.ids]) M._free(p);
}
/** Decode an image handle to RGBA (libheif applies rotation/mirroring). */
function decode(s, handle) {
  M._heif_decode_image(s.err, handle, s.out, 1 /* RGB */, 11 /* interleaved RGBA */, 0);
  if (i32(s.err)) throw new Error("decode failed (libheif error " + i32(s.err) + ")");
  const img = i32(s.out);
  const w = M._heif_image_get_primary_width(img), h = M._heif_image_get_primary_height(img);
  const strideP = M._malloc(4);
  const p = M._heif_image_get_plane_readonly(img, 10 /* interleaved */, strideP);
  const stride = i32(strideP);
  M._free(strideP);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) rgba.set(M.HEAPU8.subarray(p + y * stride, p + y * stride + w * 4), y * w * 4);
  M._heif_image_release(img);
  return { w, h, rgba };
}

const canEncode = typeof OffscreenCanvas !== "undefined" && "convertToBlob" in OffscreenCanvas.prototype;

/** RGBA → JPEG blob (optionally downscaled so the short side is `short`). */
async function toJpeg(r, quality, short) {
  const full = new OffscreenCanvas(r.w, r.h);
  full.getContext("2d").putImageData(new ImageData(r.rgba, r.w, r.h), 0, 0);
  if (!short || Math.min(r.w, r.h) <= short) return { blob: await full.convertToBlob({ type: "image/jpeg", quality }), w: r.w, h: r.h };
  const k = short / Math.min(r.w, r.h);
  const w = Math.round(r.w * k), h = Math.round(r.h * k);
  const small = new OffscreenCanvas(w, h);
  const ctx = small.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, w, h);
  return { blob: await small.convertToBlob({ type: "image/jpeg", quality }), w, h };
}

onmessage = async (e) => {
  const { id, buf, mode, thumbSize = 320 } = e.data;
  let s;
  try {
    s = open(buf);
    const fullW = M._heif_image_handle_get_width(s.h), fullH = M._heif_image_handle_get_height(s.h);
    let r, source = "full";
    if (mode === "thumb" && M._heif_image_handle_get_number_of_thumbnails(s.h) > 0) {
      M._heif_image_handle_get_list_of_thumbnail_IDs(s.h, s.ids, 16);
      M._heif_image_handle_get_thumbnail(s.err, s.h, i32(s.ids), s.out);
      const th = i32(s.out);
      try { r = decode(s, th); source = "embedded"; } finally { M._heif_image_handle_release(th); }
    } else {
      r = decode(s, s.h);
    }
    close(s); s = null;
    const short = mode === "thumb" ? thumbSize : 0;
    if (canEncode) {
      const j = await toJpeg(r, mode === "thumb" ? 0.85 : 0.92, short);
      postMessage({ id, ok: true, blob: j.blob, w: j.w, h: j.h, fullW, fullH, source });
    } else {
      postMessage({ id, ok: true, rgba: r.rgba.buffer, w: r.w, h: r.h, fullW, fullH, source }, [r.rgba.buffer]);
    }
  } catch (err) {
    if (s) try { close(s); } catch { /* ignore */ }
    postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
