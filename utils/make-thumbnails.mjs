#!/usr/bin/env node
// Make small thumbnails for the grid: <Public Folder>/_thumbs/<image path>.jpg
//
//   npm run thumbnails -- [--root DIR] [--size 400] [--force] [--jobs 4]
//
// Thumbnails are about 400 px on the short side (enough for sharp tiles on
// high-DPI screens), JPEG ~30–50 KB. Existing thumbnails newer than their source
// are skipped, so reruns only process new or changed photos. The first run reads
// every full image through pCloud Drive and can take a long time.
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { listImages, thumbPath } from "./lib/index-lib.mjs";

async function mtime(file) {
  try { return (await stat(file)).mtimeMs; } catch { return null; }
}

/** Write one thumbnail. Returns "made" | "skipped"; throws if the image can't be read. */
export async function makeThumbnail(root, path, { size = 400, force = false } = {}) {
  const src = join(root, path);
  const dest = join(root, thumbPath(path));
  if (!force) {
    const [s, d] = [await mtime(src), await mtime(dest)];
    if (s !== null && d !== null && d >= s) return "skipped";
  }
  await mkdir(dirname(dest), { recursive: true });
  await sharp(src, { failOn: "none" })
    .rotate() // apply EXIF orientation
    .resize(size, size, { fit: "outside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toFile(dest);
  return "made";
}

export async function makeThumbnails(root, { size = 400, force = false, jobs = 4, log = console.log } = {}) {
  const paths = await listImages(root);
  const counts = { made: 0, skipped: 0 };
  const failed = [];
  let next = 0;
  async function worker() {
    while (next < paths.length) {
      const path = paths[next++];
      try {
        const r = await makeThumbnail(root, path, { size, force });
        counts[r]++;
        if (r === "made") log(`  ${path}`);
      } catch (e) {
        failed.push(path);
        log(`  FAILED ${path}: ${e.message.split("\n")[0]}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return { total: paths.length, ...counts, failed };
}

async function main() {
  const { values } = parseArgs({ options: {
    root: { type: "string", default: join(homedir(), "pCloud Drive", "Public Folder") },
    size: { type: "string", default: "400" },
    jobs: { type: "string", default: "4" },
    force: { type: "boolean", default: false },
  } });
  console.log(`Thumbnails for ${values.root}`);
  const r = await makeThumbnails(values.root, {
    size: Number(values.size), jobs: Number(values.jobs), force: values.force,
  });
  console.log(`${r.total} images: ${r.made} made, ${r.skipped} up to date, ${r.failed.length} failed` +
    (r.failed.length ? " (the app falls back to the original for these)" : ""));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
