import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findCatalogs, joinPath, mergeCatalogs, mergeCatalogTree, MARKER } from "../merge-catalogs.mjs";

const HEAD = "path|caption|credits|license|tags";

async function tree(files) {
  const root = await mkdtemp(join(tmpdir(), "iv-merge-"));
  for (const [p, text] of Object.entries(files)) {
    await mkdir(join(root, p, ".."), { recursive: true });
    await writeFile(join(root, p), text);
  }
  return root;
}

const dataLines = (text) => text.split("\n").filter((l) => l && !l.startsWith("//"));

test("joinPath prefixes the catalog's folder and refuses paths that leave it", () => {
  assert.equal(joinPath("A", "A1.jpg"), "A/A1.jpg");
  assert.equal(joinPath("A", "./sub/x.jpg"), "A/sub/x.jpg");
  assert.equal(joinPath("A/C", "x.jpg"), "A/C/x.jpg");
  assert.equal(joinPath(".", "x.jpg"), "x.jpg");
  assert.equal(joinPath("A", "../B/x.jpg"), null);
  assert.equal(joinPath("A", "  "), null);
});

test("the example: A and B catalogs merge into the root with A/ and B/ paths", async () => {
  const root = await tree({
    "A/catalog.cex": `${HEAD}\nA1.jpg|one|me|CC BY|x\nA2.jpg|two|me|CC BY|x,y\n`,
    "B/catalog.cex": `${HEAD}\nB1.jpg|b1|||\nB2.jpg|b2|||\nB3.jpg|b3|||\n`,
    "A/A1.jpg": "", "B/B1.jpg": "",
  });
  const r = await mergeCatalogTree(root);
  assert.deepEqual(r.sources, ["A/catalog.cex", "B/catalog.cex"]);
  assert.equal(r.rows, 5);
  assert.deepEqual(r.warnings, []);
  const text = await readFile(join(root, "catalog.cex"), "utf8");
  assert.ok(text.startsWith(MARKER));
  assert.deepEqual(dataLines(text), [
    HEAD,
    "A/A1.jpg|one|me|CC BY|x", "A/A2.jpg|two|me|CC BY|x,y",
    "B/B1.jpg|b1|||", "B/B2.jpg|b2|||", "B/B3.jpg|b3|||",
  ]);
});

test("nested catalogs, folder order, and skipped folders", async () => {
  const root = await tree({
    "B/catalog.cex": `${HEAD}\nb.jpg||||\n`,
    "A/C/catalog.cex": `${HEAD}\nc.jpg||||\n`,
    "A/catalog.cex": `${HEAD}\na.jpg||||\n`,
    "A-Z/catalog.cex": `${HEAD}\nz.jpg||||\n`,
    ".hidden/catalog.cex": `${HEAD}\nh.jpg||||\n`,
    "_thumbs/catalog.cex": `${HEAD}\nt.jpg||||\n`,
    "A/other.cex": `${HEAD}\no.jpg||||\n`,
  });
  assert.deepEqual(await findCatalogs(root), ["A/catalog.cex", "A/C/catalog.cex", "A-Z/catalog.cex", "B/catalog.cex"]);
});

test("columns: matched by name, optional ones only when used, extras kept", () => {
  const { headers, rows } = mergeCatalogs([
    { file: "A/catalog.cex", text: "tags|path|caption|credits|license\nt|a.jpg|cap|cr|lic\n" },
    { file: "B/catalog.cex", text: `${HEAD}|year|place|urn|note\nb.jpg|||||1986||urn:x:1|hi\n` },
  ]);
  assert.deepEqual(headers, [...HEAD.split("|"), "year", "urn", "note"]);
  assert.deepEqual(rows.map((r) => [r.path, r.tags, r.year, r.urn]), [["A/a.jpg", "t", undefined, undefined], ["B/b.jpg", "", "1986", "urn:x:1"]]);
});

test("warnings: duplicates, paths outside the folder, bad rows, missing path column", () => {
  const { rows, warnings } = mergeCatalogs([
    { file: "A/catalog.cex", text: `// note\n${HEAD}\na.jpg||||\n../B/b.jpg||||\nshort|row\n` },
    { file: "A/C/catalog.cex", text: `${HEAD}\n../a.jpg||||\n` },
    { file: "D/catalog.cex", text: "caption\nx\n" },
  ]);
  assert.deepEqual(rows.map((r) => r.path), ["A/a.jpg", "A/short"]);
  assert.equal(warnings.length, 4);
  assert.match(warnings.join("\n"), /outside A\//);
  assert.match(warnings.join("\n"), /expected 5 fields, found 2/);
  assert.match(warnings.join("\n"), /\.\.\/a\.jpg" is outside A\/C\//);
  assert.match(warnings.join("\n"), /D\/catalog\.cex: no "path" column/);
});

test("reruns replace a generated catalog but not a hand-made one (unless force)", async () => {
  const root = await tree({ "A/catalog.cex": `${HEAD}\na.jpg||||\n` });
  await mergeCatalogTree(root);
  await writeFile(join(root, "A/catalog.cex"), `${HEAD}\na.jpg||||\na2.jpg||||\n`);
  assert.equal((await mergeCatalogTree(root)).rows, 2); // generated file replaced, not read as input

  const root2 = await tree({ "A/catalog.cex": `${HEAD}\na.jpg||||\n`, "catalog.cex": `${HEAD}\nmine.jpg||||\n` });
  await assert.rejects(mergeCatalogTree(root2), /--force/);
  assert.match(await readFile(join(root2, "catalog.cex"), "utf8"), /mine\.jpg/);
  await mergeCatalogTree(root2, { force: true });
  assert.doesNotMatch(await readFile(join(root2, "catalog.cex"), "utf8"), /mine\.jpg/);
});

test("dry run writes nothing; --out elsewhere includes the root catalog as a source", async () => {
  const root = await tree({ "A/catalog.cex": `${HEAD}\na.jpg||||\n`, "catalog.cex": `${HEAD}\ntop.jpg||||\n` });
  const dry = await mergeCatalogTree(root, { dryRun: true, out: join(root, "all.cex") });
  assert.equal(dry.written, false);
  assert.deepEqual(dry.sources, ["catalog.cex", "A/catalog.cex"]);
  const r = await mergeCatalogTree(root, { out: join(root, "all.cex") });
  assert.deepEqual(dataLines(await readFile(join(root, "all.cex"), "utf8")).slice(1), ["top.jpg||||", "A/a.jpg||||"]);
  assert.equal(r.rows, 2);
});
