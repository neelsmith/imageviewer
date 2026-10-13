#!/usr/bin/env node
// Pre-tag check for an app release.
//
//   npm run check-release            # checks v<version from src/package.json>
//   npm run check-release -- v1.0.0  # or an explicit tag
//
// Verifies that the tag matches src/package.json's version, isn't already used,
// and that docs/index.html was built from that version. private.html is not checked:
// Neel places it wherever he likes under docs/.
// Prints the git commands to run if everything is in order.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PAGES = ["docs/index.html"];

/** True if the built page embeds exactly this version as a string literal ("…", '…' or `…`). */
export function hasVersion(html, version) {
  const v = version.replace(/\./g, "\\.");
  return new RegExp(`["'\`]${v}["'\`]`).test(html);
}

/** Returns a list of problems (empty = OK). Pure, for testing. */
export function checkRelease({ tag, pkgVersion, existingTags, pages }) {
  const problems = [];
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) problems.push(`Tag "${tag ?? ""}" should look like v1.2.3.`);
  else if (tag !== `v${pkgVersion}`)
    problems.push(`Tag ${tag} doesn't match src/package.json version ${pkgVersion}.`);
  if (existingTags.includes(tag)) problems.push(`Tag ${tag} already exists.`);
  for (const [path, html] of Object.entries(pages)) {
    if (html === null) problems.push(`${path} is missing.`);
    else if (!hasVersion(html, pkgVersion))
      problems.push(`${path} wasn't built from version ${pkgVersion} — run npm run build in src/ and copy dist/index.html to docs/.`);
  }
  return problems;
}

async function main() {
  const { version } = JSON.parse(await readFile(join(ROOT, "src", "package.json"), "utf8"));
  const tag = process.argv[2] || `v${version}`;
  console.log(`Checking release ${tag} (src/package.json version ${version})`);
  const existingTags = execFileSync("git", ["tag", "--list"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const pages = {};
  for (const p of PAGES) pages[p] = await readFile(join(ROOT, p), "utf8").catch(() => null);
  const problems = checkRelease({ tag, pkgVersion: version, existingTags, pages });
  if (problems.length) {
    console.error("Not ready to release:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`Ready to release ${tag}. After committing docs/ and releases.md:\n` +
    `  git tag -a ${tag} -m "Release ${tag}"\n  git push --follow-tags`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
