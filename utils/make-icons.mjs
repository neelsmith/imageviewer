#!/usr/bin/env node
// Make the app icons for local.html from one large square-ish picture on a white background.
//
//   npm run icons -- [--src ../src/icons/imageviewer.png] [--out ../src/icons/local]
//
// The white background (and the soft grey shadow touching it) is made transparent by a
// flood fill from the edges, the picture is cropped to its subject, padded to a square,
// and saved at the sizes browsers use. The build (src/build/icons.ts) inlines the small
// ones into local.html; the large ones are for other uses (release page, shortcuts).
// Re-run only when the source picture changes, then commit the PNGs.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));

/** Favicons (transparent) and the Apple touch icon (opaque white, as iOS expects). */
export const SIZES = { favicon: [16, 32, 48, 64, 128, 192, 512, 1024], apple: [180] };

/**
 * RGBA with the edge-connected white background removed. Near-white pixels reachable
 * from the border become transparent; light greys (the shadow) become black at an
 * opacity matching their darkness, so they still read as a shadow on dark backgrounds.
 */
export function removeBackground(rgb, width, height, { white = 248, light = 200, maxTint = 18 } = {}) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += 3) {
    out[i * 4] = rgb[j]; out[i * 4 + 1] = rgb[j + 1]; out[i * 4 + 2] = rgb[j + 2]; out[i * 4 + 3] = 255;
  }
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i]) continue;
    seen[i] = 1;
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    if (lo < light || hi - lo > maxTint) continue; // part of the picture: stop here
    const o = i * 4;
    if (lo >= white) out[o + 3] = 0;
    else { out[o] = out[o + 1] = out[o + 2] = 0; out[o + 3] = Math.round(255 - lo); } // shadow → translucent black
    const x = i % width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }
  return out;
}

/** Bounding box of pixels with alpha above `min`. */
export function opaqueBox(rgba, width, height, min = 40) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] > min) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export async function makeIcons(src, outDir, { pad = 0.04, log = console.log } = {}) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = removeBackground(data, info.width, info.height);
  const box = opaqueBox(rgba, info.width, info.height);
  if (!box) throw new Error("the picture seems to be all background");
  const side = Math.round(Math.max(box.width, box.height) * (1 + 2 * pad));
  const subject = await sharp(Buffer.from(rgba.buffer), { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box).png().toBuffer();
  const master = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: subject, left: Math.round((side - box.width) / 2), top: Math.round((side - box.height) / 2) }])
    .png().toBuffer();
  await mkdir(outDir, { recursive: true });
  const written = [];
  for (const s of SIZES.favicon) {
    const f = join(outDir, `icon-${s}.png`);
    await sharp(master).resize(s, s, { kernel: "lanczos3" }).png({ compressionLevel: 9, palette: s <= 64 }).toFile(f);
    written.push(f);
  }
  for (const s of SIZES.apple) {
    const f = join(outDir, `apple-touch-icon-${s}.png`);
    await sharp(master).resize(s, s, { kernel: "lanczos3" }).flatten({ background: "#ffffff" }).png({ compressionLevel: 9 }).toFile(f);
    written.push(f);
  }
  log(`Wrote ${written.length} icons to ${outDir}`);
  return written;
}

async function main() {
  const { values } = parseArgs({ options: {
    src: { type: "string", default: join(here, "..", "src", "icons", "imageviewer.png") },
    out: { type: "string", default: join(here, "..", "src", "icons", "local") },
  } });
  await makeIcons(values.src, values.out);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
