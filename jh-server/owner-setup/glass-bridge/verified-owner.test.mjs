import test from "node:test";
import assert from "node:assert/strict";
import { verifiedGlassOwner } from "./verified-owner.mjs";

const valid = {
  scope: "jh.secure",
  expiresAt: 300_000,
  subject: "jhsub_AAAAAAAAAAAAAAAAAAAAAA",
};
test("stable authenticated OAuth subject yields stable privacy-preserving owner key", () => {
  const a = verifiedGlassOwner(valid, 100_000);
  const b = verifiedGlassOwner({ ...valid, expiresAt: 400_000 }, 100_000);
  assert.equal(a.ok, true);
  assert.equal(a.ownerId, b.ownerId);
  assert.match(a.ownerId, /^owner:[a-f0-9]{64}$/);
});
test("different OAuth owners are isolated", () => {
  const a = verifiedGlassOwner(valid, 100_000);
  const b = verifiedGlassOwner({ ...valid, subject: "jhsub_BBBBBBBBBBBBBBBBBBBBBB" }, 100_000);
  assert.notEqual(a.ownerId, b.ownerId);
});
test("legacy scope-only token fails closed", () => {
  assert.equal(verifiedGlassOwner({ scope: "jh.secure", expiresAt: 300_000 }, 100_000).code, "OAUTH_STABLE_SUBJECT_MISSING");
});
test("wrong scope rejected", () => {
  assert.equal(verifiedGlassOwner({ ...valid, scope: "other" }, 100_000).ok, false);
});
test("expired token rejected", () => {
  assert.equal(verifiedGlassOwner(valid, 300_000).code, "OAUTH_ACCESS_EXPIRED");
});
test("raw client owner string is not an OAuth principal", () => {
  assert.equal(verifiedGlassOwner("owner:somebody", 100_000).ok, false);
});
