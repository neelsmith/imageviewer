#!/usr/bin/env node
// Set (or remove) the password for one catalog in a catalog list. No rebuild needed:
// commit and push the list file and the apps pick it up.
//
//   npm run catalog-password -- data/private/brunswick.cex          # prompts twice, input hidden
//   npm run catalog-password -- data/private/brunswick.cex --off    # remove its password
//   npm run catalog-password -- <cex_file> --list data/catalog_of_catalogs.cex
//
// The list defaults to data/catalog_of_private_catalogs.cex. The catalog is named by its
// `cex_file` value. A `password` column is added to the list if it has none. Only a salted
// PBKDF2 hash is stored (`pbkdf2-sha256:<iterations>:<salt>:<hash>`); the repo is public,
// so pick a password you don't use anywhere else. Changing a password logs out every
// device that remembered the old one.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { askHidden, makeAuthConfig } from "./set-password.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LIST = "data/catalog_of_private_catalogs.cex";

/** `pbkdf2-sha256:<iterations>:<salt>:<hash>` for a password (fresh random salt). */
export function passwordSpec(password, iterations) {
  const a = makeAuthConfig(password, iterations);
  return `pbkdf2-sha256:${a.iterations}:${a.salt}:${a.hash}`;
}

const isSkipped = (line) => { const t = line.trim(); return t === "" || t.startsWith("//") || t.startsWith("#!"); };
const normFile = (s) => s.trim().replace(/^\.?\/+/, "");
const normHeader = (s) => s.trim().toLowerCase().replace(/\s+/g, "_");

/**
 * Return the list text with the `password` cell of the row for `file` set to `spec`
 * ("" removes it). Adds a `password` column if missing; other lines are kept as they are.
 * Throws if the list has no cex_file column or no row for `file`.
 */
export function setCatalogPassword(text, file, spec) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => !isSkipped(l));
  if (h < 0) throw new Error("the catalog list is empty");
  const headers = lines[h].split("|").map(normHeader);
  const fileCol = headers.indexOf("cex_file");
  if (fileCol < 0) throw new Error('the catalog list has no "cex_file" column');
  let pwCol = headers.indexOf("password");
  if (pwCol < 0) {
    pwCol = headers.length;
    lines[h] = lines[h].replace(/\s+$/, "") + "|password";
  }
  const width = Math.max(headers.length, pwCol + 1);
  const want = normFile(file);
  let found = false;
  const known = [];
  for (let i = h + 1; i < lines.length; i++) {
    if (isSkipped(lines[i])) continue;
    const cells = lines[i].replace(/\s+$/, "").split("|");
    known.push(normFile(cells[fileCol] ?? ""));
    if (normFile(cells[fileCol] ?? "") !== want) {
      if (cells.length < width && headers.indexOf("password") < 0) {
        while (cells.length < width) cells.push("");
        lines[i] = cells.join("|"); // keep rows the same width as the new header
      }
      continue;
    }
    while (cells.length < width) cells.push("");
    cells[pwCol] = spec;
    lines[i] = cells.join("|");
    found = true;
  }
  if (!found) throw new Error(`no catalog "${want}" in the list. Listed: ${known.filter(Boolean).join(", ") || "none"}`);
  return lines.join(eol);
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    off: { type: "boolean", default: false },
    list: { type: "string", default: DEFAULT_LIST },
  } });
  if (positionals.length !== 1)
    throw new Error("Usage: npm run catalog-password -- <cex_file, e.g. data/private/brunswick.cex> [--off] [--list <file>]");
  const listPath = resolve(REPO, values.list);
  const text = await readFile(listPath, "utf8");
  let spec = "";
  if (!values.off) {
    const pw = await askHidden("New password: ");
    if (pw.length < 6) throw new Error("Use at least 6 characters.");
    if (pw !== (await askHidden("Repeat password: "))) throw new Error("Passwords don't match.");
    spec = passwordSpec(pw);
  }
  await writeFile(listPath, setCatalogPassword(text, positionals[0], spec));
  console.log(`${values.off ? "Password removed for" : "Password set for"} ${normFile(positionals[0])} in ${values.list}.` +
    "\nCommit and push it; no rebuild needed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
