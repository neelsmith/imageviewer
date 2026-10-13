import { readFile, writeFile } from "node:fs/promises";
import { geoKey, placeFromNominatim } from "./index-lib.mjs";

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "imageviewer-utils/0.1 (+https://github.com/neelsmith/imageviewer)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Reverse geocoder with a JSON file cache. Respects Nominatim's usage policy:
 * at most 1 request per second, identifying User-Agent, results cached.
 */
export class Geocoder {
  constructor(cachePath, { fetchImpl = fetch, delayMs = 1100, log = () => {} } = {}) {
    this.cachePath = cachePath;
    this.fetch = fetchImpl;
    this.delayMs = delayMs;
    this.log = log;
    this.cache = {};
    this.last = 0;
    this.dirty = false;
    this.lookups = 0;
  }

  async load() {
    try { this.cache = JSON.parse(await readFile(this.cachePath, "utf8")); }
    catch (e) { if (e.code !== "ENOENT") throw e; this.cache = {}; }
  }

  async save() {
    if (!this.dirty) return;
    const sorted = Object.fromEntries(Object.entries(this.cache).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(this.cachePath, JSON.stringify(sorted, null, 1) + "\n");
    this.dirty = false;
  }

  /** Returns {city, region, country} or null if the lookup failed (not cached, so it is retried next run). */
  async place(lat, lon) {
    const key = geoKey(lat, lon);
    if (key in this.cache) return this.cache[key];
    const wait = this.last + this.delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    this.lookups++;
    const url = `${ENDPOINT}?format=jsonv2&zoom=10&addressdetails=1&accept-language=en&lat=${lat}&lon=${lon}`;
    try {
      const res = await this.fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const place = placeFromNominatim(await res.json());
      this.cache[key] = place;
      this.dirty = true;
      return place;
    } catch (e) {
      this.log(`  geocode failed for ${key}: ${e.message}`);
      return null;
    }
  }
}
