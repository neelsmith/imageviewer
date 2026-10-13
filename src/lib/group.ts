import type { Photo, Place } from "./types";

export type GroupMode = "date" | "location" | "tag";

export interface PhotoGroup {
  key: string;
  label: string;
  photos: Photo[];
}

const MONTHS = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];

/** Newest first; undated photos last, then by path. */
export function comparePhotos(a: Photo, b: Photo): number {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  return a.path.localeCompare(b.path);
}

export function placeLabel(p: Place): string {
  return [p.city, p.region, p.country].filter(Boolean).join(", ");
}

function monthKey(date: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(date);
  return m ? `${m[1]}-${m[2]}` : /^\d{4}/.test(date) ? `${date.slice(0, 4)}-00` : null;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return m === "00" ? y : `${MONTHS[Number(m) - 1]} ${y}`;
}

const MISSING = { date: "No date", location: "No location", tag: "Untagged" };

/** Group photos. A photo can appear in several tag groups. Empty buckets come last. */
export function groupPhotos(photos: Photo[], mode: GroupMode): PhotoGroup[] {
  const groups = new Map<string, PhotoGroup>();
  const add = (key: string, label: string, p: Photo) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, label, photos: [] }));
    g.photos.push(p);
  };
  const NONE = "￿"; // sorts after everything

  for (const p of photos) {
    switch (mode) {
      case "date": {
        const k = monthKey(p.date);
        k ? add(k, monthLabel(k), p) : add(NONE, MISSING.date, p);
        break;
      }
      case "location":
        p.place ? add(placeLabel(p.place).toLowerCase(), placeLabel(p.place), p)
                : add(NONE, MISSING.location, p);
        break;
      case "tag":
        if (p.tags.length) p.tags.forEach((t) => add(t.toLowerCase(), t, p));
        else add(NONE, MISSING.tag, p);
        break;
    }
  }

  const list = [...groups.values()];
  list.forEach((g) => g.photos.sort(comparePhotos));
  list.sort((a, b) => {
    if (a.key === NONE) return 1;
    if (b.key === NONE) return -1;
    if (mode === "date") return a.key < b.key ? 1 : -1; // newest first
    return a.key.localeCompare(b.key);
  });
  return list;
}

/** Case-insensitive match on caption, path, tags, credits and place. */
export function filterPhotos(photos: Photo[], query: string): Photo[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return photos;
  return photos.filter((p) => {
    const hay = [p.caption, p.path, p.credits, p.tags.join(" "),
      p.place ? placeLabel(p.place) : ""].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Photos to show: optionally only cataloged ones, then the text filter. */
export function selectPhotos(photos: Photo[], opts: { catalogedOnly: boolean; query: string }): Photo[] {
  return filterPhotos(opts.catalogedOnly ? photos.filter((p) => p.cataloged) : photos, opts.query);
}
