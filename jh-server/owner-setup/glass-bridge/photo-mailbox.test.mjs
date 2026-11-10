import test from "node:test";
import assert from "node:assert/strict";
import {
  GlassPhotoMailbox,
  MAX_JPEG_BYTES,
  PAIRING_TTL_MS,
  PHOTO_TTL_MS,
} from "./photo-mailbox.mjs";

const OWNER_A = "owner:jh-primary-01";
const OWNER_B = "owner:other-user-02";
const photo = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(100, 7),
  Buffer.from([0xff, 0xd9]),
]);

function fixture() {
  let timestamp = 100_000;
  let seq = 0;
  const box = new GlassPhotoMailbox({
    now: () => timestamp,
    makeToken: () => Buffer.alloc(32, ++seq).toString("base64url"),
  });
  return { box, advance: (ms) => { timestamp += ms; } };
}

test("happy path: verified owner can pair, upload one JPEG, and consume once", () => {
  const { box } = fixture();
  const pairing = box.beginPairing({ ownerId: OWNER_A });
  assert.equal(pairing.ok, true);
  assert.equal(pairing.pairingToken.length, 43);
  const received = box.receivePhoto({
    pairingToken: pairing.pairingToken,
    contentType: "image/jpeg",
    imageBytes: photo,
  });
  assert.equal(received.code, "PHOTO_RECEIVED");
  assert.equal(received.byteLength, photo.length);
  assert.equal(box.status({ ownerId: OWNER_A }).photoPending, true);
  const result = box.consumePhoto({ ownerId: OWNER_A });
  assert.equal(result.ok, true);
  assert.deepEqual(result.imageBytes, photo);
  assert.equal(result.sha256, received.sha256);
  assert.equal(box.consumePhoto({ ownerId: OWNER_A }).code, "NO_PENDING_PHOTO");
  box.close();
});

test("different authenticated owner cannot read the pending photo", () => {
  const { box } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: photo });
  assert.equal(box.consumePhoto({ ownerId: OWNER_B }).ok, false);
  assert.equal(box.consumePhoto({ ownerId: OWNER_A }).ok, true);
});

test("one-time pairing prevents upload replay", () => {
  const { box } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  assert.equal(box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: photo }).ok, true);
  assert.equal(box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: photo }).ok, false);
});

test("pairing expires; no late upload accepted", () => {
  const { box, advance } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  advance(PAIRING_TTL_MS);
  assert.equal(box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: photo }).ok, false);
});

test("pending photo expires and cannot be consumed", () => {
  const { box, advance } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: photo });
  advance(PHOTO_TTL_MS);
  assert.equal(box.consumePhoto({ ownerId: OWNER_A }).ok, false);
});

test("wrong media type consumes token without accepting image", () => {
  const { box } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  assert.equal(box.receivePhoto({ pairingToken, contentType: "image/png", imageBytes: photo }).code, "JPEG_REQUIRED");
  assert.equal(box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: photo }).ok, false);
});

test("oversize photo rejected, including exact one-byte overflow", () => {
  const { box } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  const bytes = Buffer.alloc(MAX_JPEG_BYTES + 1, 1);
  assert.equal(box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: bytes }).code, "PHOTO_TOO_LARGE");
});

test("JPEG magic required", () => {
  const { box } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  assert.equal(box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: Buffer.alloc(100) }).code, "INVALID_JPEG");
});

test("invalid pairing token is rejected", () => {
  const { box } = fixture();
  assert.equal(box.receivePhoto({ pairingToken: "bad", contentType: "image/jpeg", imageBytes: photo }).code, "PAIRING_INVALID");
});

test("only authenticated and properly formed server principal can request a pairing", () => {
  const { box } = fixture();
  assert.throws(() => box.beginPairing({ ownerId: "a" }), TypeError);
  assert.throws(() => box.consumePhoto({ ownerId: "fake user" }), TypeError);
});

test("new pairing revokes older pairing for the same owner", () => {
  const { box } = fixture();
  const first = box.beginPairing({ ownerId: OWNER_A }).pairingToken;
  const second = box.beginPairing({ ownerId: OWNER_A }).pairingToken;
  assert.equal(box.receivePhoto({ pairingToken: first, contentType: "image/jpeg", imageBytes: photo }).ok, false);
  assert.equal(box.receivePhoto({ pairingToken: second, contentType: "image/jpeg", imageBytes: photo }).ok, true);
});

test("pending photo blocks overwrite by another pairing", () => {
  const { box } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: photo });
  assert.equal(box.beginPairing({ ownerId: OWNER_A }).code, "PHOTO_PENDING");
});

test("close destroys pending photo and tokens", () => {
  const { box } = fixture();
  const { pairingToken } = box.beginPairing({ ownerId: OWNER_A });
  box.receivePhoto({ pairingToken, contentType: "image/jpeg", imageBytes: photo });
  box.close();
  assert.equal(box.consumePhoto({ ownerId: OWNER_A }).ok, false);
});
