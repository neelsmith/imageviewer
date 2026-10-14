import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultImageRoot, expandHome, FALLBACK_ROOT } from "../lib/site-config.mjs";

test("expandHome", () => {
  assert.equal(expandHome("~/pCloud Drive/Public Folder", "/Users/n"), "/Users/n/pCloud Drive/Public Folder");
  assert.equal(expandHome("~", "/Users/n"), "/Users/n");
  assert.equal(expandHome("/Volumes/x", "/Users/n"), "/Volumes/x");
});

test("defaultImageRoot reads localImageRoot, else falls back", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iv-sc-"));
  const f = join(dir, "site.config.json");
  assert.equal(defaultImageRoot(f), FALLBACK_ROOT); // missing file
  await writeFile(f, JSON.stringify({ imageBase: "https://x/", dataBase: "https://y/", localImageRoot: "/Volumes/Photos/Public" }));
  assert.equal(defaultImageRoot(f), "/Volumes/Photos/Public");
  await writeFile(f, JSON.stringify({ imageBase: "https://x/", dataBase: "https://y/" }));
  assert.equal(defaultImageRoot(f), FALLBACK_ROOT); // not set
  await writeFile(f, "{ broken");
  assert.throws(() => defaultImageRoot(f), /site\.config\.json/);
});
