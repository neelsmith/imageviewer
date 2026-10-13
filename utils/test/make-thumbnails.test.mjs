import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, writeFile, utimes, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { makeThumbnails } from "../make-thumbnails.mjs";
import { listImages } from "../lib/index-lib.mjs";

const FIX = fileURLToPath(new URL("./fixtures/photos", import.meta.url));

async function copyFixtures() {
  const dir = await mkdtemp(join(tmpdir(), "iv-thumbs-"));
  await cp(FIX, dir, { recursive: true });
  return dir;
}

test("makes _thumbs/<path>.jpg for every image, oriented, never enlarged", async () => {
  const root = await copyFixtures();
  // A big landscape image to check downscaling.
  await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#c84" } }).jpeg().toFile(join(root, "big.jpg"));
  const r = await makeThumbnails(root, { log: () => {} });
  assert.deepEqual([r.total, r.made, r.failed.length], [4, 4, 0]);
  const big = await sharp(join(root, "_thumbs/big.jpg.jpg")).metadata();
  assert.deepEqual([big.width, big.height], [533, 400]); // short side 400
  const rotated = await sharp(join(root, "_thumbs/leiden/gps.jpg.jpg")).metadata();
  assert.deepEqual([rotated.width, rotated.height], [30, 40]); // EXIF orientation 6 applied, not enlarged
  assert.ok((await stat(join(root, "_thumbs/plain.png.jpg"))).size > 0);
  // Thumbnails are never indexed as images.
  assert.ok(!(await listImages(root)).some((p) => p.startsWith("_thumbs/")));
});

test("reruns skip up-to-date thumbnails, redo changed sources, and --force redoes all", async () => {
  const root = await copyFixtures();
  await makeThumbnails(root, { log: () => {} });
  let r = await makeThumbnails(root, { log: () => {} });
  assert.deepEqual([r.made, r.skipped], [0, 3]);
  const later = new Date(Date.now() + 60_000);
  await utimes(join(root, "plain.png"), later, later); // source changed after its thumbnail
  r = await makeThumbnails(root, { log: () => {} });
  assert.deepEqual([r.made, r.skipped], [1, 2]);
  r = await makeThumbnails(root, { force: true, log: () => {} });
  assert.equal(r.made, 3);
});

test("an unreadable image is reported and doesn't stop the run", async () => {
  const root = await copyFixtures();
  await writeFile(join(root, "broken.jpg"), "not really a jpeg");
  const r = await makeThumbnails(root, { log: () => {} });
  assert.deepEqual(r.failed, ["broken.jpg"]);
  assert.equal(r.made, 3);
});
