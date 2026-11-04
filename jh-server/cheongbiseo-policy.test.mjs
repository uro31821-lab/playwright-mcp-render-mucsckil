import test from "node:test";
import assert from "node:assert/strict";
import {
  CHEONGBISEO_IMAGE_RETENTION_MS,
  CHEONGBISEO_FILE_RETENTION_MS,
  classifyCheongbiseoFile,
  cheongbiseoPolicy,
  isImageFile
} from "./cheongbiseo-policy.mjs";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-04T00:00:00Z");

test("image files expire at 12 hours", () => {
  assert.equal(classifyCheongbiseoFile({name:"a.png",created_at:new Date(NOW-12*HOUR).toISOString()}, NOW).status, "expired");
  assert.equal(classifyCheongbiseoFile({mime_type:"image/jpeg",created_at:new Date(NOW-12*HOUR+1).toISOString()}, NOW).status, "keep");
  assert.equal(CHEONGBISEO_IMAGE_RETENTION_MS, 12*HOUR);
});

test("non-image files expire at 14 days", () => {
  assert.equal(classifyCheongbiseoFile({name:"a.zip",created_at:new Date(NOW-14*DAY).toISOString()}, NOW).status, "expired");
  assert.equal(classifyCheongbiseoFile({name:"a.md",created_at:new Date(NOW-14*DAY+1).toISOString()}, NOW).status, "keep");
  assert.equal(CHEONGBISEO_FILE_RETENTION_MS, 14*DAY);
});

test("image rule wins even when the image is older than 14 days", () => {
  const r=classifyCheongbiseoFile({name:"old.webp",created_at:new Date(NOW-20*DAY).toISOString()}, NOW);
  assert.equal(r.image, true);
  assert.equal(r.thresholdMs, 12*HOUR);
  assert.equal(r.reason, "image_over_12h");
});

test("missing or future timestamps are never deletion candidates", () => {
  assert.equal(classifyCheongbiseoFile({name:"a.zip"}, NOW).status, "skip");
  assert.equal(classifyCheongbiseoFile({name:"a.zip",created_at:new Date(NOW+HOUR).toISOString()}, NOW).status, "keep");
});

test("image detection accepts MIME and common extensions", () => {
  assert.equal(isImageFile({mime_type:"image/png",name:"x"}), true);
  assert.equal(isImageFile({name:"x.JPEG"}), true);
  assert.equal(isImageFile({name:"x.zip"}), false);
});

test("policy is manual-only and verifies after deletion", () => {
  const p=cheongbiseoPolicy();
  assert.equal(p.executionMode, "manual_only");
  assert.equal(p.imageRetentionHours, 12);
  assert.equal(p.nonImageRetentionDays, 14);
  assert.equal(p.dryRunBeforeDelete, true);
  assert.equal(p.verifyAfterDelete, true);
  assert.equal(p.transientRetryLimit, 1);
  assert.equal(p.deleteFolders, false);
});
