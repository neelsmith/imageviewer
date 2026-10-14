import { describe, it, expect } from "vitest";
import { coordPlace, exifDateToIso, mapLimit, metaFromExif } from "../lib/local/meta";

describe("local metadata", () => {
  it("reads date and GPS from exifr output", () => {
    expect(metaFromExif({ DateTimeOriginal: "2025:09:29 10:12:05", latitude: 39.3, longitude: -76.6 }))
      .toEqual({ date: "2025-09-29T10:12:05", lat: 39.3, lon: -76.6 });
    expect(metaFromExif({ CreateDate: "2015:05:01 10:00:00", latitude: 0, longitude: 0 }))
      .toEqual({ date: "2015-05-01T10:00:00", lat: null, lon: null });
    expect(metaFromExif(undefined)).toEqual({ date: "", lat: null, lon: null });
    expect(exifDateToIso("0000:00:00 00:00:00")).toBe("");
  });

  it("labels places by rounded coordinates", () => {
    expect(coordPlace(39.3456, -76.612)!.city).toBe("39.35° N, 76.61° W");
    expect(coordPlace(-33.9, 151.2)!.city).toBe("33.90° S, 151.20° E");
    expect(coordPlace(null, 4)).toBeNull();
  });

  it("mapLimit keeps order and limits concurrency", async () => {
    let active = 0, peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
