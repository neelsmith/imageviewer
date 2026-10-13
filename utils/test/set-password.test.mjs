import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, makeAuthConfig } from "../set-password.mjs";

test("hashPassword matches the reference vector used by the app's tests", () => {
  assert.equal(hashPassword("open sesame", "c2FsdHNhbHRzYWx0c2FsdA==", 1000),
    "GDAYJJtfElk+xpdigX69OXyhgz3//WebdzIiNpVdWzI=");
});

test("makeAuthConfig uses a fresh random salt each time", () => {
  const a = makeAuthConfig("pw-123456", 1000), b = makeAuthConfig("pw-123456", 1000);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(a.hash, hashPassword("pw-123456", a.salt, 1000));
});
