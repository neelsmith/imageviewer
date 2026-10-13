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
const KEY = "imageviewer.unlocked";

export function isRemembered(cfg: AuthConfig, storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try { return storage?.getItem(KEY) === cfg.hash; } catch { return false; }
}
export function remember(cfg: AuthConfig, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try { storage?.setItem(KEY, cfg.hash); } catch { /* private mode etc. */ }
}
export function forget(storage: Pick<Storage, "removeItem"> | null = safeStorage()): void {
  try { storage?.removeItem(KEY); } catch { /* ignore */ }
}
function safeStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
