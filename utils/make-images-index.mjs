#!/usr/bin/env node
// Build data/images.cex from the pCloud Public Folder: one row per image with
// date taken, GPS position, place names and display size.
//
//   npm run images-index -- [--root DIR] [--out FILE] [--refresh] [--no-geocode] [--dry-run]
//
// Files already in images.cex are not re-read unless --refresh is given, so
// reruns only touch new photos (each read downloads part of the file from pCloud).
import { open, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import exifr from "exifr";
import { imageSize } from "image-size";
import { listImages, exifDateToIso, displaySize, serialize, parseExisting } from "./lib/index-lib.mjs";
import { Geocoder } from "./lib/geocode.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// JPEG EXIF must sit in the first 64 KB; 512 KB also covers image-size's needs.
const HEAD_BYTES = 512 * 1024;
// Formats whose EXIF can be anywhere in the file: read it all if the head had no date.
const WHOLE_FILE_FALLBACK = /\.(heic|heif|avif|tiff?)$/i;

/**
 * Read up to `maxBytes` from the start of a file (all of it if maxBytes is Infinity).
 * We own the file handle and always close it: exifr's own file reader leaks its
 * handle when a read fails part-way, which Node 22+ turns into a fatal
 * ERR_INVALID_STATE ("FileHandle object was closed during garbage collection").
 */
export async function readHead(file, maxBytes = HEAD_BYTES, openImpl = open) {
  const fh = await openImpl(file, "r");
  try {
    const { size } = await fh.stat();
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    let off = 0;
    while (off < len) {
      const { bytesRead } = await fh.read(buf, off, len - off, off);
      if (bytesRead === 0) break;
      off += bytesRead;
    }
    return buf.subarray(0, off);
  } finally {
    await fh.close();
  }
}

const EXIF_OPTIONS = {
  tiff: true, exif: true, gps: true, ifd1: false, xmp: false, icc: false, iptc: false,
  reviveValues: false, translateValues: false,
};

async function parseExif(buf) {
  try { return (await exifr.parse(buf, EXIF_OPTIONS)) ?? {}; }
  catch { return {}; } // no or unreadable EXIF
}

export async function readImage(root, path) {
  const file = join(root, path);
  let buf = await readHead(file);
  let meta = await parseExif(buf);
  if (!meta.DateTimeOriginal && WHOLE_FILE_FALLBACK.test(path) && buf.length === HEAD_BYTES) {
    buf = await readHead(file, Infinity);
    meta = await parseExif(buf);
  }
  let size = {};
  try { size = imageSize(buf); } catch { /* unsupported format */ }
  const { width, height } = displaySize(size.width ?? null, size.height ?? null, meta.Orientation ?? size.orientation);
  const date = exifDateToIso(meta.DateTimeOriginal ?? meta.CreateDate ?? meta.DateTimeDigitized ?? meta.ModifyDate);
  const ok = (n) => typeof n === "number" && Number.isFinite(n);
  const hasGps = ok(meta.latitude) && ok(meta.longitude) && !(meta.latitude === 0 && meta.longitude === 0);
  return {
    path, date,
    lat: hasGps ? meta.latitude.toFixed(6) : "",
    lon: hasGps ? meta.longitude.toFixed(6) : "",
    city: "", region: "", country: "",
    width: width ?? "", height: height ?? "",
  };
}

export async function buildIndex({ root, existingText = "", refresh = false, geocoder = null, log = console.log }) {
  const existing = refresh ? new Map() : parseExisting(existingText);
  const paths = await listImages(root);
  const rows = [];
  const failed = [];
  let read = 0;
  for (const path of paths) {
    let row = existing.get(path);
    // Rows without a size were never read successfully: try them again.
    if (!row || !row.width) {
      try {
        row = await readImage(root, path);
        read++;
        log(`  read ${path}`);
      } catch (e) {
        failed.push(path);
        log(`  FAILED ${path}: ${e.code ?? e.message}`);
        row = row ?? { path, date: "", lat: "", lon: "", city: "", region: "", country: "", width: "", height: "" };
      }
    }
    if (geocoder && row.lat && row.lon && !row.city && !row.region && !row.country) {
      const place = await geocoder.place(Number(row.lat), Number(row.lon));
      if (place) Object.assign(row, place);
    }
    rows.push(row);
  }
  const removed = [...existing.keys()].filter((p) => !paths.includes(p));
  return { text: serialize(rows), total: paths.length, read, removed, failed };
}

async function main() {
  const { values } = parseArgs({ options: {
    root: { type: "string", default: join(homedir(), "pCloud Drive", "Public Folder") },
    out: { type: "string", default: join(here, "..", "data", "images.cex") },
    cache: { type: "string", default: join(here, "geocache.json") },
    refresh: { type: "boolean", default: false },
    "no-geocode": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  } });

  let existingText = "";
  try { existingText = await readFile(values.out, "utf8"); } catch { /* first run */ }
  let geocoder = null;
  if (!values["no-geocode"]) {
    geocoder = new Geocoder(values.cache, { log: console.log });
    await geocoder.load();
  }
  console.log(`Scanning ${values.root}`);
  try {
    const r = await buildIndex({ root: values.root, existingText, refresh: values.refresh, geocoder });
    console.log(`${r.total} images, ${r.read} newly read, ${r.removed.length} removed` +
      (geocoder ? `, ${geocoder.lookups} place lookups` : "") +
      (r.failed.length ? `, ${r.failed.length} unreadable (listed without metadata; retried next run)` : ""));
    if (values["dry-run"]) process.stdout.write(r.text);
    else { await writeFile(values.out, r.text); console.log(`Wrote ${values.out}`); }
  } finally {
    if (geocoder && !values["dry-run"]) await geocoder.save();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
