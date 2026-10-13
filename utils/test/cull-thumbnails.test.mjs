import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rename, writeFile, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeThumbnails } from "../make-thumbnails.mjs";
import { cullThumbnails } from "../cull-thumbnails.mjs";

const FIX = fileURLToPath(new URL("./fixtures/photos", import.meta.url));
const quiet = { log: () => {} };
const exists = (p) => access(p).then(() => true, () => false);

async function withThumbs() {
  const root = await mkdtemp(join(tmpdir(), "iv-cull-"));
  await cp(FIX, root, { recursive: true });
  await makeThumbnails(root, quiet);
  return root;
}

test("nothing to cull when every thumbnail has its image", async () => {
  const root = await withThumbs();
  const r = await cullThumbnails(root, { del: true, ...quiet });
  assert.deepEqual([r.images, r.thumbs, r.obsolete.length, r.deleted], [3, 3, 0, 0]);
});

test("lists thumbnails of renamed/removed images, deleting only with del", async () => {
  const root = await withThumbs();
  await rename(join(root, "plain.png"), join(root, "renamed.png"));
  await mkdir(join(root, "_thumbs/gone"), { recursive: true });
  await writeFile(join(root, "_thumbs/gone/old.jpg.jpg"), "x");
  await writeFile(join(root, "_thumbs/gone/.DS_Store"), "x");
  await writeFile(join(root, "_thumbs/notes.txt"), "x");

  let r = await cullThumbnails(root, quiet); // dry run
  assert.deepEqual(r.obsolete, ["_thumbs/gone/old.jpg.jpg", "_thumbs/plain.png.jpg"]);
  assert.deepEqual(r.other, ["_thumbs/notes.txt"]);
  assert.equal(r.deleted, 0);
  assert.ok(await exists(join(root, "_thumbs/plain.png.jpg")));

  r = await cullThumbnails(root, { del: true, ...quiet });
  assert.deepEqual([r.deleted, r.dirsRemoved], [2, 1]);
  assert.ok(!(await exists(join(root, "_thumbs/plain.png.jpg"))));
  assert.ok(!(await exists(join(root, "_thumbs/gone"))));
  assert.ok(await exists(join(root, "_thumbs/notes.txt")));        // non-thumbnail kept
  assert.ok(await exists(join(root, "_thumbs/leiden/gps.jpg.jpg"))); // still-current kept
  assert.ok(await exists(join(root, "renamed.png")));               // images untouched
});

test("refuses to delete when the root has no images (wrong root / not mounted)", async () => {
  const root = await mkdtemp(join(tmpdir(), "iv-cull-empty-"));
  await mkdir(join(root, "_thumbs"));
  await writeFile(join(root, "_thumbs/a.jpg.jpg"), "x");
  await assert.rejects(cullThumbnails(root, { del: true, ...quiet }), /refusing/);
  assert.deepEqual(await readdir(join(root, "_thumbs")), ["a.jpg.jpg"]);
});

test("a root without _thumbs/ is fine", async () => {
  const root = await mkdtemp(join(tmpdir(), "iv-cull-none-"));
  await cp(FIX, root, { recursive: true });
  const r = await cullThumbnails(root, { del: true, ...quiet });
  assert.deepEqual([r.thumbs, r.obsolete.length], [0, 0]);
});
