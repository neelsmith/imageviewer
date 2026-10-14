#!/usr/bin/env node
// Find (and optionally delete) obsolete thumbnails: files in <Public Folder>/_thumbs/
// whose full-size image no longer exists, e.g. after renaming or removing photos.
//
//   npm run cull-thumbnails -- [--root DIR]            # list only (dry run)
//   npm run cull-thumbnails -- [--root DIR] --delete   # delete them
//
// Only thumbnail-style files (*.jpg) are considered; dotfiles are ignored. Folders
// under _thumbs/ left empty by the deletion are removed too. As a safeguard, nothing is
// deleted if no images at all are found under the root (wrong --root, pCloud not mounted).
import { readdir, rm, rmdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { listImages, thumbPath, THUMBS_DIR } from "./lib/index-lib.mjs";
import { defaultImageRoot } from "./lib/site-config.mjs";

/** Forward-slash paths (relative to root) of every non-dot file under _thumbs/, sorted. */
async function listThumbFiles(root) {
  const out = [];
  async function walk(dir) {
    let ents;
    try { ents = await readdir(dir, { withFileTypes: true }); }
    catch (e) { if (e.code === "ENOENT") return; throw e; }
    for (const ent of ents) {
      if (ent.name.startsWith(".")) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) out.push(relative(root, full).split(sep).join("/"));
    }
  }
  await walk(join(root, THUMBS_DIR));
  return out.sort();
}

/** Remove empty folders below (not including) dir, deepest first. Returns how many. */
async function removeEmptyDirs(dir) {
  let removed = 0;
  let ents;
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const ent of ents) {
    if (!ent.isDirectory()) continue;
    const sub = join(dir, ent.name);
    removed += await removeEmptyDirs(sub);
    // Treat a folder holding only dotfiles (e.g. .DS_Store) as empty.
    const left = await readdir(sub);
    if (left.every((n) => n.startsWith("."))) {
      await rm(sub, { recursive: true });
      removed++;
    }
  }
  return removed;
}

/**
 * Returns { images, thumbs, obsolete, other, deleted, dirsRemoved }.
 * `obsolete`: *.jpg thumbnails with no matching image; `other`: non-.jpg files left alone.
 */
export async function cullThumbnails(root, { del = false, log = console.log } = {}) {
  const images = await listImages(root);
  const wanted = new Set(images.map(thumbPath));
  const files = await listThumbFiles(root);
  const obsolete = files.filter((f) => f.endsWith(".jpg") && !wanted.has(f));
  const other = files.filter((f) => !f.endsWith(".jpg"));
  const result = { images: images.length, thumbs: files.length, obsolete, other, deleted: 0, dirsRemoved: 0 };
  if (!del || !obsolete.length) return result;
  if (!images.length) throw new Error(`No images found under ${root}; refusing to delete thumbnails.`);
  for (const f of obsolete) {
    await rm(join(root, f));
    result.deleted++;
    log(`  deleted ${f}`);
  }
  result.dirsRemoved = await removeEmptyDirs(join(root, THUMBS_DIR));
  return result;
}

async function main() {
  const { values } = parseArgs({ options: {
    root: { type: "string", default: defaultImageRoot() },
    delete: { type: "boolean", default: false },
  } });
  console.log(`Obsolete thumbnails in ${join(values.root, THUMBS_DIR)}`);
  const r = await cullThumbnails(values.root, { del: values.delete });
  if (!values.delete) for (const f of r.obsolete) console.log(`  ${f}`);
  if (!r.images) console.log("WARNING: no images found under this root — is --root right and pCloud Drive mounted?");
  for (const f of r.other) console.log(`  (not a thumbnail, left alone) ${f}`);
  console.log(`${r.images} images, ${r.thumbs} files in ${THUMBS_DIR}/, ${r.obsolete.length} obsolete` +
    (values.delete
      ? `: ${r.deleted} deleted, ${r.dirsRemoved} empty folders removed.`
      : r.obsolete.length ? ". Nothing deleted — rerun with --delete to remove them." : "."));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
