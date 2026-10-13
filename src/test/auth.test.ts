// @vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveHash, checkPassword, isAuthEnabled, isRemembered, remember, forget, type AuthConfig } from "../lib/auth";

// Reference value computed independently with Python's hashlib.pbkdf2_hmac.
const SALT = "c2FsdHNhbHRzYWx0c2FsdA==";
const VECTOR = "GDAYJJtfElk+xpdigX69OXyhgz3//WebdzIiNpVdWzI=";
const cfg: AuthConfig = { algorithm: "PBKDF2-SHA256", iterations: 1000, salt: SALT, hash: VECTOR };

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k) };
}

describe("auth", () => {
  it("derives the same PBKDF2-SHA256 hash as Python/Node", async () => {
    expect(await deriveHash("open sesame", SALT, 1000)).toBe(VECTOR);
  });
  it("accepts the right password and rejects others", async () => {
    expect(await checkPassword("open sesame", cfg)).toBe(true);
    expect(await checkPassword("Open sesame", cfg)).toBe(false);
    expect(await checkPassword("", cfg)).toBe(false);
  });
  it("is disabled when no hash is set", () => {
    expect(isAuthEnabled({ ...cfg, hash: "" })).toBe(false);
    expect(isAuthEnabled(cfg)).toBe(true);
  });
  it("remembers per hash, so a new password invalidates old devices", () => {
    const s = memStorage();
    expect(isRemembered(cfg, s)).toBe(false);
    remember(cfg, s);
    expect(isRemembered(cfg, s)).toBe(true);
    expect(isRemembered({ ...cfg, hash: "other" }, s)).toBe(false);
    forget(s);
    expect(isRemembered(cfg, s)).toBe(false);
  });
  it("treats throwing storage as not remembered", () => {
    const bad = { getItem: () => { throw new Error("blocked"); } };
    expect(isRemembered(cfg, bad)).toBe(false);
  });
});
