import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRelease, hasVersion } from "../check-release.mjs";

const built = (v) => `<script>const O=\`${v}\`;</script>`; // as the minifier writes it
const ok = { tag: "v1.0.0", pkgVersion: "1.0.0", existingTags: [],
  pages: { "docs/index.html": built("1.0.0"), "docs/family.html": built("1.0.0") } };

test("passes when tag, package.json and built pages agree", () => {
  assert.deepEqual(checkRelease(ok), []);
});

test("catches mismatched, malformed and duplicate tags", () => {
  assert.match(checkRelease({ ...ok, tag: "v1.0.1" })[0], /doesn't match/);
  assert.match(checkRelease({ ...ok, tag: "1.0.0" })[0], /should look like/);
  assert.match(checkRelease({ ...ok, existingTags: ["v1.0.0"] })[0], /already exists/);
});

test("hasVersion accepts any quote style but not a -dev build", () => {
  for (const q of [`"`, `'`, "`"]) assert.ok(hasVersion(`x=${q}1.0.0${q}`, "1.0.0"));
  assert.ok(!hasVersion("x=`1.0.0-dev`", "1.0.0"));
  assert.ok(!hasVersion("x=`1.0.01`", "1.0.0"));
});

test("catches stale, dev or missing pages", () => {
  const p = checkRelease({ ...ok, pages: { "docs/index.html": built("0.9.0"),
    "docs/family.html": built("1.0.0-dev"), "docs/x.html": null } });
  assert.equal(p.length, 3);
  assert.match(p[0], /index\.html wasn't built/);
  assert.match(p[1], /family\.html wasn't built/);
  assert.match(p[2], /missing/);
});
