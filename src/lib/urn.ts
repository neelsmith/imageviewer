import { parseRoi, type Roi } from "cite-roi";
import { parseCatalog } from "./catalog";

/**
 * A CITE2 image URN, optionally with a region: "urn:cite2:ns:img.v1:X@0.1,0.2,0.3,0.4".
 * `base` is the image URN (no "@…"); `roi` the region if there is a valid one.
 */
export function splitUrn(urn: string): { base: string; roi: Roi | null } {
  const t = urn.trim();
  const at = t.indexOf("@");
  return at < 0 ? { base: t, roi: null } : { base: t.slice(0, at), roi: parseRoi(t.slice(at + 1)) };
}

/** True if a catalog `urn` value names the same image as `base` (ignoring any region). */
export const sameImage = (catalogUrn: string, base: string): boolean =>
  !!catalogUrn && !!base && splitUrn(catalogUrn).base === base;

/** Path of the first entry in a catalog whose urn is this image; null if none. */
export function findUrnInCatalog(catalogText: string, base: string): string | null {
  return parseCatalog(catalogText).entries.find((e) => sameImage(e.urn, base))?.path ?? null;
}

/** A link that opens this page on the image (and region) named by the URN: "<page>#urn=…". */
export function urnLink(pageUrl: string, urn: string): string {
  return `${pageUrl.split("#")[0]}#urn=${encodeURIComponent(urn.trim())}`;
}
