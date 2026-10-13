import { describe, it, expect } from "vitest";
import { parseImagesIndex } from "../lib/images";

const TEXT = `path|date|lat|lon|city|region|country|width|height
a/1.jpg|2019-06-12T14:03:22|52.157|4.485|Leiden|South Holland|Netherlands|4032|3024
b.png||||||||
`;

describe("parseImagesIndex", () => {
  it("parses numbers, dates and places; blanks become null", () => {
    const { records } = parseImagesIndex(TEXT);
    expect(records[0]).toEqual({
      path: "a/1.jpg", date: "2019-06-12T14:03:22", lat: 52.157, lon: 4.485,
      place: { city: "Leiden", region: "South Holland", country: "Netherlands" },
      width: 4032, height: 3024,
    });
    expect(records[1]).toMatchObject({ path: "b.png", date: "", lat: null, place: null, width: null });
  });
});
