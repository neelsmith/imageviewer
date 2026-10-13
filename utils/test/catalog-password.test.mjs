import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordSpec, setCatalogPassword } from "../catalog-password.mjs";
import { hashPassword } from "../set-password.mjs";

const LIST = "cex_file|label\ndata/private/brunswick.cex|Brunswick, ME\ndata/private/other.cex|Other\n";

test("passwordSpec is pbkdf2-sha256:<iterations>:<salt>:<hash> and verifies", () => {
  const s = passwordSpec("open sesame", 1000);
  const [alg, it, salt, hash] = s.split(":");
  assert.deepEqual([alg, it], ["pbkdf2-sha256", "1000"]);
  assert.equal(hash, hashPassword("open sesame", salt, 1000));
  assert.ok(!s.includes("|"));
});

test("adds a password column and sets only the named row (Neel's list)", () => {
  const out = setCatalogPassword(LIST, "data/private/brunswick.cex", "pbkdf2-sha256:1:QQ==:Qg==");
  assert.equal(out,
    "cex_file|label|password\ndata/private/brunswick.cex|Brunswick, ME|pbkdf2-sha256:1:QQ==:Qg==\ndata/private/other.cex|Other|\n");
});

test("replaces and removes an existing password; keeps comments and other columns", () => {
  const list = "// private catalogs\nCex File|label|password|note\n\na.cex|A|old|n1\nb.cex|B||n2\n";
  let out = setCatalogPassword(list, "./a.cex", "new");
  assert.equal(out, "// private catalogs\nCex File|label|password|note\n\na.cex|A|new|n1\nb.cex|B||n2\n");
  out = setCatalogPassword(out, "a.cex", "");
  assert.equal(out, "// private catalogs\nCex File|label|password|note\n\na.cex|A||n1\nb.cex|B||n2\n");
});

test("keeps Windows line endings", () => {
  const out = setCatalogPassword("cex_file|label\r\na.cex|A\r\n", "a.cex", "x");
  assert.equal(out, "cex_file|label|password\r\na.cex|A|x\r\n");
});

test("explains an unknown catalog or a list without cex_file", () => {
  assert.throws(() => setCatalogPassword(LIST, "data/private/nope.cex", "x"), /no catalog "data\/private\/nope.cex".*brunswick/);
  assert.throws(() => setCatalogPassword("file|label\na|b\n", "a", "x"), /cex_file/);
});
