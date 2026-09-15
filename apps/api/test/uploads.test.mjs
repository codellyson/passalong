// Upload links are reached without a credential, so what the middleware lets through and what the
// route believes an upload is are the two things worth pinning. The route itself lives in index.ts,
// which is not importable from a test; these are the decisions it delegates.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isUploadToken, publicUpload, sniffImage } from "../src/uploads.ts";

const TOKEN = `pa_up_${"a1B2".repeat(8)}`;

test("only a well-formed upload link skips the credential check", () => {
  assert.ok(publicUpload("PUT", `/v1/uploads/${TOKEN}`));
  // curl --data-binary without -X sends POST, and that has to work too.
  assert.ok(publicUpload("POST", `/v1/uploads/${TOKEN}`));
  // Minting a link is not public: it needs the account the link will upload as.
  assert.ok(!publicUpload("POST", "/v1/uploads"));
  assert.ok(!publicUpload("GET", `/v1/uploads/${TOKEN}`));
  assert.ok(!publicUpload("DELETE", `/v1/uploads/${TOKEN}`));
  assert.ok(!publicUpload("PUT", `/v1/uploads/${TOKEN}/x`));
  assert.ok(!publicUpload("PUT", "/v1/uploads/pa_up_short"));
  assert.ok(!publicUpload("PUT", `/v1/uploads/pa_at_${"a".repeat(32)}`));
  assert.ok(!publicUpload("PUT", `/v1/shots/${TOKEN}`));
});

test("a token is the prefix and exactly 32 letters or digits", () => {
  assert.ok(isUploadToken(TOKEN));
  assert.ok(!isUploadToken(`${TOKEN}a`));
  assert.ok(!isUploadToken(`pa_up_${"-".repeat(32)}`));
});

const bytes = (...b) => new Uint8Array([...b, ...new Array(16).fill(0)]).buffer;

test("the bytes say what an image is, whatever it was labelled", () => {
  assert.equal(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffImage(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), "image/gif");
  assert.equal(sniffImage(bytes(0x47, 0x49, 0x46, 0x38, 0x37, 0x61)), "image/gif");
  assert.equal(
    sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)),
    "image/webp",
  );
});

test("anything else is not an image, including a RIFF that is not WebP", () => {
  assert.equal(sniffImage(new TextEncoder().encode("<svg></svg>").buffer), "");
  assert.equal(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)), "");
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50]).buffer), "");
  assert.equal(sniffImage(new ArrayBuffer(0)), "");
});
