import { describe, it, expect } from "vitest";
import { APP_VERSION, releaseUrl, versionLabel } from "../lib/version";
import pkg from "../package.json";

describe("version", () => {
  it("comes from package.json", () => {
    expect(APP_VERSION.replace(/-dev$/, "")).toBe(pkg.version);
  });
  it("links releases to their GitHub tag, but not dev builds", () => {
    expect(releaseUrl("1.0.0")).toBe("https://github.com/neelsmith/imageviewer/releases/tag/v1.0.0");
    expect(releaseUrl("1.0.0-dev")).toBeNull();
  });
  it("renders a link for releases and plain text otherwise", () => {
    const a = versionLabel("1.2.3");
    expect(a.tagName).toBe("A");
    expect(a.textContent).toBe("v1.2.3");
    expect(versionLabel("1.2.3-dev").tagName).toBe("SPAN");
  });
});
