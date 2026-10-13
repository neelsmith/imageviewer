import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { listImages, exifDateToIso, displaySize, geoKey, placeFromNominatim, serialize, parseExisting } from "../lib/index-lib.mjs";

const FIX = fileURLToPath(new URL("./fixtures/photos", import.meta.url));

test("listImages finds images recursively, skips dotfiles and non-images", async () => {
  assert.deepEqual(await listImages(FIX), ["leiden/gps.jpg", "plain.png", "sub/dir/nodate.jpg"]);
});

test("exifDateToIso", () => {
  assert.equal(exifDateToIso("2019:06:12 14:03:22"), "2019-06-12T14:03:22");
  assert.equal(exifDateToIso("2019-06-12"), "2019-06-12T00:00:00");
  assert.equal(exifDateToIso("0000:00:00 00:00:00"), "");
  assert.equal(exifDateToIso(undefined), "");
  assert.equal(exifDateToIso(new Date(2020, 0, 2, 3, 4, 5)), "2020-01-02T03:04:05");
});

test("displaySize swaps for rotated orientations", () => {
  assert.deepEqual(displaySize(40, 30, 6), { width: 30, height: 40 });
  assert.deepEqual(displaySize(40, 30, 1), { width: 40, height: 30 });
  assert.deepEqual(displaySize(null, 30, 1), { width: null, height: null });
});

test("geoKey rounds to 3 decimals", () => {
  assert.equal(geoKey(52.15701, 4.48499), "52.157,4.485");
});

test("placeFromNominatim falls back through address fields", () => {
  assert.deepEqual(placeFromNominatim({ address: { city: "Leiden", state: "South Holland", country: "Netherlands" } }),
    { city: "Leiden", region: "South Holland", country: "Netherlands" });
  assert.deepEqual(placeFromNominatim({ address: { village: "Paxton", state: "Massachusetts", country: "United States" } }),
    { city: "Paxton", region: "Massachusetts", country: "United States" });
  assert.deepEqual(placeFromNominatim({ error: "Unable to geocode" }), { city: "", region: "", country: "" });
});

test("serialize sorts rows and strips delimiters from values; parseExisting round-trips", () => {
  const text = serialize([{ path: "b.jpg", city: "A|B" }, { path: "a.jpg", date: "2020-01-01T00:00:00" }]);
  assert.equal(text, "path|date|lat|lon|city|region|country|width|height\n" +
    "a.jpg|2020-01-01T00:00:00|||||||\nb.jpg||||A B||||\n");
  const rows = parseExisting(text);
  assert.equal(rows.get("b.jpg").city, "A B");
  assert.equal(rows.size, 2);
});

test("thumbPath", async () => {
  const { thumbPath } = await import("../lib/index-lib.mjs");
  assert.equal(thumbPath("leiden-pliny/IMG_1200.jpeg"), "_thumbs/leiden-pliny/IMG_1200.jpeg.jpg");
});
