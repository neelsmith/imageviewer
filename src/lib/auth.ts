/**
 * Simple password screen. This is a "keep out" sign, not security: the data and
 * images are public, and anyone can bypass this with the browser's dev tools.
 * PBKDF2 just makes guessing the password from the public hash slow.
 */
export interface AuthConfig {
  algorithm: string;
  iterations: number;
  /** base64 */
  salt: string;
  /** base64 PBKDF2-SHA256 output, 32 bytes; "" = no password */
  hash: string;
}

export const isAuthEnabled = (cfg: AuthConfig): boolean => cfg.hash.trim() !== "";

/**
 * Per-catalog passwords are written into a catalog list's `password` column by
 * utils/catalog-password.mjs as `pbkdf2-sha256:<iterations>:<salt b64>:<hash b64>`.
 * Returns null for a blank cell (no password); throws for anything malformed.
 */
export function parseAuthSpec(spec: string): AuthConfig | null {
  const s = spec.trim();
  if (!s) return null;
  const m = /^pbkdf2-sha256:(\d+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) throw new Error("password value isn't in the form written by npm run catalog-password");
  return { algorithm: "PBKDF2-SHA256", iterations: Number(m[1]), salt: m[2], hash: m[3] };
}

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

export async function deriveHash(password: string, saltB64: string, iterations: number): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser can't check the password here (Web Crypto unavailable).");
  const key = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations }, key, 256);
  return toB64(bits);
}

export async function checkPassword(password: string, cfg: AuthConfig): Promise<boolean> {
  return (await deriveHash(password, cfg.salt, cfg.iterations)) === cfg.hash;
}

// "Remember me": store the hash itself, so changing the password logs everyone out.
// private.html uses KEY; each password-protected catalog has its own key (catalogKey).
const KEY = "imageviewer.unlocked";

/** Storage key for "remember on this device" for one catalog file. */
export const catalogKey = (file: string): string => `${KEY}.catalog:${file}`;

export function isRemembered(cfg: AuthConfig, storage: Pick<Storage, "getItem"> | null = safeStorage(), key = KEY): boolean {
  try { return storage?.getItem(key) === cfg.hash; } catch { return false; }
}
export function remember(cfg: AuthConfig, storage: Pick<Storage, "setItem"> | null = safeStorage(), key = KEY): void {
  try { storage?.setItem(key, cfg.hash); } catch { /* private mode etc. */ }
}
export function forget(storage: Pick<Storage, "removeItem"> | null = safeStorage(), key = KEY): void {
  try { storage?.removeItem(key); } catch { /* ignore */ }
}
function safeStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
