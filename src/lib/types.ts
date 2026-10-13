export interface CatalogEntry {
  path: string;
  caption: string;
  credits: string;
  license: string;
  tags: string[];
}

export interface Place {
  city: string;
  region: string;
  country: string;
}

/** One row of data/images.cex, written by utils/make-images-index. */
export interface ImageRecord {
  path: string;
  /** Local date-time taken, ISO-like "YYYY-MM-DDTHH:MM:SS"; "" if unknown. */
  date: string;
  lat: number | null;
  lon: number | null;
  place: Place | null;
  width: number | null;
  height: number | null;
}

export interface Photo {
  path: string;
  url: string;
  caption: string;
  credits: string;
  license: string;
  tags: string[];
  date: string;
  lat: number | null;
  lon: number | null;
  place: Place | null;
  width: number | null;
  height: number | null;
  /** Has a row in catalog.cex. */
  cataloged: boolean;
  /** Has a row in images.cex (i.e. the file was found in the pCloud folder). */
  indexed: boolean;
}
