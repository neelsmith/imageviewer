import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { makeIcons, opaqueBox, removeBackground, SIZES } from "../make-icons.mjs";

/** 100×80 white picture: a black 20×30 block at (30,20), a light grey shadow under it, and a white hole inside. */
function picture() {
  const w = 100, h = 80, rgb = new Uint8Array(w * h * 3).fill(255);
  const set = (x, y, v) => { const i = (y * w + x) * 3; rgb[i] = rgb[i + 1] = rgb[i + 2] = v; };
  for (let y = 20; y < 50; y++) for (let x = 30; x < 50; x++) set(x, y, 0);
  for (let y = 25; y < 30; y++) for (let x = 35; x < 40; x++) set(x, y, 255); // enclosed white: must stay
  for (let x = 30; x < 50; x++) set(x, 50, 220); // shadow touching the background
  return { rgb, w, h };
}

test("removeBackground clears edge-connected white, keeps enclosed white, turns shadow into translucent black", () => {
  const { rgb, w, h } = picture();
  const out = removeBackground(rgb, w, h);
  const px = (x, y) => Array.from(out.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
  assert.deepEqual(px(0, 0), [255, 255, 255, 0]);
  assert.deepEqual(px(40, 40), [0, 0, 0, 255]);
  assert.deepEqual(px(36, 26), [255, 255, 255, 255]); // inside the block
  assert.deepEqual(px(40, 50), [0, 0, 0, 35]); // shadow
  assert.deepEqual(opaqueBox(out, w, h), { left: 30, top: 20, width: 20, height: 30 });
});

test("makeIcons writes every size, square, with transparent corners (opaque for Apple)", async () => {
  const { rgb, w, h } = picture();
  const dir = await mkdtemp(join(tmpdir(), "iv-icons-"));
  const src = join(dir, "src.png");
  await sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } }).png().toFile(src);
  const out = join(dir, "out");
  await makeIcons(src, out, { log: () => {} });
  const files = (await readdir(out)).sort();
  assert.equal(files.length, SIZES.favicon.length + SIZES.apple.length);
  for (const s of SIZES.favicon) {
    const m = await sharp(join(out, `icon-${s}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([m.info.width, m.info.height], [s, s]);
    assert.equal(m.data[3], 0, `icon-${s} corner transparent`);
  }
  const a = await sharp(join(out, "apple-touch-icon-180.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([a.info.width, a.data[3], a.data[0]], [180, 255, 255]); // opaque white corner
});
