/**
 * Rectangular selections ("regions of interest") on a photo, stored as fractions of the
 * full image (0–1), so they mean the same part of the photo at any zoom or resolution:
 * the top-left quarter is { x: 0, y: 0, w: 0.5, h: 0.5 }.
 */
export interface Roi { x: number; y: number; w: number; h: number }
export interface View { scale: number; x: number; y: number }
export interface Size { w: number; h: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Smallest selection kept (as a fraction of width/height); smaller drags are ignored. */
export const MIN_ROI = 0.002;

/** Screen point (relative to the viewer) → position on the photo as fractions, clamped to 0–1. */
export function screenToFrac(view: View, img: Size, sx: number, sy: number): { fx: number; fy: number } {
  return {
    fx: clamp01((sx - view.x) / view.scale / img.w),
    fy: clamp01((sy - view.y) / view.scale / img.h),
  };
}

/** A selection → its box on screen (relative to the viewer). */
export function roiToScreen(view: View, img: Size, r: Roi): { left: number; top: number; width: number; height: number } {
  return {
    left: view.x + r.x * img.w * view.scale,
    top: view.y + r.y * img.h * view.scale,
    width: r.w * img.w * view.scale,
    height: r.h * img.h * view.scale,
  };
}

/** The rectangle spanned by two corner points (any order); null if too small. */
export function roiFromCorners(a: { fx: number; fy: number }, b: { fx: number; fy: number }): Roi | null {
  const x = Math.min(a.fx, b.fx), y = Math.min(a.fy, b.fy);
  const w = Math.abs(a.fx - b.fx), h = Math.abs(a.fy - b.fy);
  return w < MIN_ROI || h < MIN_ROI ? null : { x, y, w, h };
}

/** Move a selection by (dx, dy) fractions, keeping it inside the photo. */
export function moveRoi(r: Roi, dx: number, dy: number): Roi {
  return { ...r, x: Math.min(1 - r.w, Math.max(0, r.x + dx)), y: Math.min(1 - r.h, Math.max(0, r.y + dy)) };
}

export type Handle = "nw" | "ne" | "sw" | "se";

/** Drag one corner of a selection to (fx, fy); the opposite corner stays put. */
export function resizeRoi(r: Roi, handle: Handle, fx: number, fy: number): Roi {
  const fixed = {
    fx: handle.includes("w") ? r.x + r.w : r.x,
    fy: handle.includes("n") ? r.y + r.h : r.y,
  };
  return roiFromCorners(fixed, { fx: clamp01(fx), fy: clamp01(fy) }) ?? r;
}

/** "0.1250,0.0833,0.5000,0.3333" (four decimals: under half a pixel on a 4000-px photo). */
export function formatRoi(r: Roi): string {
  return [r.x, r.y, r.w, r.h].map((v) => v.toFixed(4)).join(",");
}

/** Parse one "x,y,w,h" (fractions); null if malformed or outside the photo. */
export function parseRoi(s: string): Roi | null {
  const n = s.split(",").map((v) => Number(v.trim()));
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  const [x, y, w, h] = n;
  const eps = 1e-6;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1 + eps || y + h > 1 + eps) return null;
  return { x, y, w, h };
}

/** Several selections for the URL hash: "x,y,w,h;x,y,w,h". */
export const formatRois = (rs: Roi[]) => rs.map(formatRoi).join(";");
export const parseRois = (s: string): Roi[] =>
  s.split(";").map(parseRoi).filter((r): r is Roi => r !== null);

/** CITE2 URN for a region: the image URN (any existing @… part dropped) + "@x,y,w,h". */
export function roiUrn(imageUrn: string, r: Roi): string {
  return `${imageUrn.split("@")[0]}@${formatRoi(r)}`;
}
