import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readImage, readHead, buildIndex } from "../make-images-index.mjs";
import { Geocoder } from "../lib/geocode.mjs";

const FIX = fileURLToPath(new URL("./fixtures/photos", import.meta.url));

function fakeFetch(calls) {
  return async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ address: { city: "Leiden", state: "South Holland", country: "Netherlands" } }) };
  };
}

test("readImage extracts date, GPS and rotated size", async () => {
  const r = await readImage(FIX, "leiden/gps.jpg");
  assert.equal(r.date, "2019-06-12T14:03:22");
  assert.equal(Number(r.lat).toFixed(3), "52.157");
  assert.equal(Number(r.lon).toFixed(3), "4.485");
  assert.deepEqual([r.width, r.height], [30, 40]);
});

test("readImage tolerates images without EXIF", async () => {
  const r = await readImage(FIX, "plain.png");
  assert.deepEqual([r.date, r.lat, r.lon, r.width, r.height], ["", "", "", 20, 10]);
});

test("buildIndex geocodes once per location, caches, and reuses existing rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iv-"));
  const calls = [];
  const geo = new Geocoder(join(dir, "cache.json"), { fetchImpl: fakeFetch(calls), delayMs: 0 });
  await geo.load();
  const first = await buildIndex({ root: FIX, geocoder: geo, log: () => {} });
  assert.equal(first.total, 3);
  assert.equal(first.read, 3);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /lat=52\.15/);
  assert.match(first.text, /^leiden\/gps\.jpg\|2019-06-12T14:03:22\|52\.157\d*\|4\.485\d*\|Leiden\|South Holland\|Netherlands\|30\|40$/m);
  await geo.save();
  assert.ok(JSON.parse(await readFile(join(dir, "cache.json"), "utf8"))["52.157,4.485"]);

  // Second run with the previous output plus a stale row: nothing re-read, stale row dropped.
  const stale = first.text + "gone.jpg||||||||\n";
  const second = await buildIndex({ root: FIX, existingText: stale, geocoder: geo, log: () => {} });
  assert.equal(second.read, 0);
  assert.deepEqual(second.removed, ["gone.jpg"]);
  assert.equal(second.text, first.text);
  assert.equal(calls.length, 1);
});

test("Geocoder does not cache failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iv-"));
  const geo = new Geocoder(join(dir, "c.json"), { fetchImpl: async () => ({ ok: false, status: 429 }), delayMs: 0 });
  assert.equal(await geo.place(1, 2), null);
  assert.deepEqual(geo.cache, {});
});

test("readHead closes the file handle even when a read fails", async () => {
  let closed = false;
  const fakeOpen = async () => ({
    stat: async () => ({ size: 100 }),
    read: async () => { throw Object.assign(new Error("I/O error"), { code: "EIO" }); },
    close: async () => { closed = true; },
  });
  await assert.rejects(readHead("x.jpg", 512, fakeOpen), /I\/O error/);
  assert.ok(closed);
});

test("readHead reads only the requested head, or the whole file", async () => {
  const full = await readHead(join(FIX, "leiden/gps.jpg"), Infinity);
  const head = await readHead(join(FIX, "leiden/gps.jpg"), 100);
  assert.equal(head.length, 100);
  assert.deepEqual(head, full.subarray(0, 100));
});

test("buildIndex keeps going when a file can't be read, and retries it next run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iv-"));
  await writeFile(join(dir, "ok.png"), await readFile(join(FIX, "plain.png")));
  await mkdir(join(dir, "dir.jpg")); // a directory named like an image is skipped by listImages
  await writeFile(join(dir, "empty.jpg"), ""); // readable but no size → retried later
  await writeFile(join(dir, "locked.jpg"), "x");
  await chmod(join(dir, "locked.jpg"), 0o000); // open() fails with EACCES
  const r = await buildIndex({ root: dir, log: () => {} });
  assert.equal(r.total, 3);
  assert.deepEqual(r.failed, ["locked.jpg"]);
  assert.match(r.text, /^locked\.jpg\|{8}$/m);
  assert.match(r.text, /^ok\.png\|.*\|20\|10$/m);
  assert.match(r.text, /^empty\.jpg\|{8}$/m);
  const again = await buildIndex({ root: dir, existingText: r.text, log: () => {} });
  assert.equal(again.read, 1); // empty.jpg re-read; locked.jpg retried and failed again
  assert.deepEqual(again.failed, ["locked.jpg"]);
});

test("no file handles are left open after indexing", async () => {
  await buildIndex({ root: FIX, log: () => {} });
  assert.equal(process.getActiveResourcesInfo().filter((x) => x === "FileHandle").length, 0);
});
