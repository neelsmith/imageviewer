#!/usr/bin/env node
// Set (or remove) the viewer's password. Writes ../src/auth.json; rebuild afterwards.
//
//   npm run set-password            # prompts twice, input hidden
//   npm run set-password -- --off   # remove the password screen
//
// Only a salted PBKDF2 hash is stored. It's committed to a public repo, so pick a
// password you don't use anywhere else.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

export const ITERATIONS = 600_000;
const AUTH_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "auth.json");

export function hashPassword(password, saltB64, iterations = ITERATIONS) {
  return pbkdf2Sync(password, Buffer.from(saltB64, "base64"), iterations, 32, "sha256").toString("base64");
}

export function makeAuthConfig(password, iterations = ITERATIONS) {
  const salt = randomBytes(16).toString("base64");
  return { algorithm: "PBKDF2-SHA256", iterations, salt, hash: hashPassword(password, salt, iterations) };
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

async function main() {
  const current = JSON.parse(await readFile(AUTH_FILE, "utf8"));
  let next;
  if (process.argv.includes("--off")) {
    next = { ...current, salt: "", hash: "" };
    console.log("Password screen disabled.");
  } else {
    const pw = await askHidden("New password: ");
    if (pw.length < 6) throw new Error("Use at least 6 characters.");
    if (pw !== (await askHidden("Repeat password: "))) throw new Error("Passwords don't match.");
    next = { note: current.note, ...makeAuthConfig(pw) };
    console.log("Password set.");
  }
  await writeFile(AUTH_FILE, JSON.stringify(next, null, 2) + "\n");
  console.log(`Wrote ${AUTH_FILE}. Rebuild with: cd ../src && npm run build`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
