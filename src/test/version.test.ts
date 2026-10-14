import { describe, it, expect } from "vitest";
import { APP_VERSION, releaseUrl, versionLabel, versionInfo, parseDataUpdated, formatDataUpdated, setDataUpdated } from "../lib/version";
import pkg from "../package.json";

describe("version", () => {
  it("comes from package.json", () => {
    expect(APP_VERSION.replace(/-dev$/, "")).toBe(pkg.version);
  });
  it("links releases to their GitHub tag, but not dev builds", () => {
    expect(releaseUrl("1.0.0")).toBe("https://github.com/YOUR-GITHUB-USER/imageviewer/releases/tag/v1.0.0");
    expect(releaseUrl("1.0.0", "https://github.com/neelsmith/imageviewer"))
      .toBe("https://github.com/neelsmith/imageviewer/releases/tag/v1.0.0");
    expect(releaseUrl("1.0.0-dev")).toBeNull();
    expect(releaseUrl("1.0.0", "")).toBeNull(); // no repoUrl configured
  });
  it("renders a link for releases and plain text otherwise", () => {
    const a = versionLabel("1.2.3");
    expect(a.tagName).toBe("A");
    expect(a.textContent).toBe("v1.2.3");
    expect(versionLabel("1.2.3-dev").tagName).toBe("SPAN");
  });
});

describe("data last-updated date (data/last-updated.txt)", () => {
  it("takes the first non-blank, non-comment line when it's a real YYYY-MM-DD date", () => {
    expect(parseDataUpdated("2026-10-13\n")).toBe("2026-10-13");
    expect(parseDataUpdated("\uFEFF// set by hand\n\n  2026-01-05  \r\nignored\n")).toBe("2026-01-05");
    expect(parseDataUpdated("# note\n")).toBe("");
    expect(parseDataUpdated("")).toBe("");
  });
  it("ignores anything that isn't a valid date", () => {
    for (const bad of ["13 Oct 2026", "2026-10-13 extra", "2026-02-30", "2026-13-01", "<!doctype html>"])
      expect(parseDataUpdated(bad)).toBe("");
  });
  it("formats the date for display without shifting the day", () => {
    expect(formatDataUpdated("2026-10-13")).toBe(new Date(2026, 9, 13).toLocaleDateString(undefined,
      { year: "numeric", month: "short", day: "numeric" }));
    expect(formatDataUpdated("2026-01-01")).toContain("2026");
  });
  it("is shown beside the app version, including labels made before it loaded", () => {
    setDataUpdated("");
    const early = versionInfo();
    document.body.replaceChildren(early);
    const data = () => early.querySelector<HTMLElement>(".data-updated")!;
    expect(data().hidden).toBe(true);
    setDataUpdated("2026-10-13");
    expect(data().hidden).toBe(false);
    expect(early.textContent).toBe(`${early.querySelector(".version")!.textContent} · data updated ${formatDataUpdated("2026-10-13")}`);
    expect(versionInfo().textContent).toContain("data updated"); // later labels too
    setDataUpdated("");
  });
});
