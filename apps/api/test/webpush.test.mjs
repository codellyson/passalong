// Web Push (src/webpush.ts): the bytes a push service carries, checked by doing the browser's half.
//
// There is no push service in a test, so the proof is the other end: a receiver key pair stands in
// for the browser, and the test decrypts what encrypt() produced (RFC 8291) and verifies the VAPID
// signature (RFC 8292). If either were wrong, a real browser would drop the message silently.
import assert from "node:assert/strict";
import { test } from "node:test";
import { b64url, encrypt, fromB64url, sendPush, vapidHeader, vapidKeys } from "../src/webpush.ts";

const enc = new TextEncoder();
const concat = (...p) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) {
    out.set(x, i);
    i += x.length;
  }
  return out;
};
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8),
  );
}

/** A browser: a P-256 key pair and an auth secret, as a subscription would carry them. */
async function browser() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    pair,
    pub,
    auth,
    sub: { endpoint: "https://push.example/abc", p256dh: b64url(pub), auth: b64url(auth) },
  };
}

/** What the browser does with a push body: RFC 8291, receiving side. */
async function decrypt(b, body) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey(
    "raw",
    asPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, b.pair.privateKey, 256),
  );
  const ikm = await hkdf(
    b.auth,
    shared,
    concat(enc.encode("WebPush: info\0"), b.pub, asPublic),
    32,
  );
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed),
  );
  return { rs, idlen, text: new TextDecoder().decode(plain.slice(0, -1)), delimiter: plain.at(-1) };
}

test("the browser can decrypt what is sent, and nothing about it is in the clear", async () => {
  const b = await browser();
  const message = JSON.stringify({ title: "Bo Adeyemi handed it in", url: "/hub/g/ordpaid1" });
  const body = await encrypt(b.sub, enc.encode(message));
  assert.ok(!new TextDecoder().decode(body).includes("handed"), "the sentence is not readable");
  const out = await decrypt(b, body);
  assert.equal(out.text, message);
  assert.equal(out.delimiter, 2, "one record, marked as the last");
  assert.equal(out.idlen, 65, "the sender's key rides in the header");
  assert.equal(out.rs, 4096);
});

test("each message is keyed afresh, so the same text never produces the same bytes", async () => {
  const b = await browser();
  const one = await encrypt(b.sub, enc.encode("same"));
  const two = await encrypt(b.sub, enc.encode("same"));
  assert.notDeepEqual(one, two);
});

test("the VAPID header is signed by the key the browser subscribed with, for that push service", async () => {
  const keys = await vapidKeys();
  const header = await vapidHeader("https://fcm.googleapis.com/fcm/send/xyz", {
    ...keys,
    subject: "mailto:ops@passalong.dev",
  });
  const [, t, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [h, c, s] = t.split(".");
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "mailto:ops@passalong.dev");
  assert.ok(claims.exp > Date.now() / 1000);
  const pub = await crypto.subtle.importKey(
    "raw",
    fromB64url(keys.publicKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pub,
    fromB64url(s),
    enc.encode(`${h}.${c}`),
  );
  assert.ok(ok, "the signature verifies against the public key");
});

test("sendPush says what the push service answered", async () => {
  const keys = await vapidKeys();
  const v = { ...keys, subject: "mailto:test@example.com" };
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const sub = {
    endpoint: "https://push.example.com/abc",
    p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey))),
    auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
  };
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("", { status: 201 });
    assert.deepEqual(await sendPush(sub, { body: "x" }, v), {
      outcome: "sent",
      status: 201,
      detail: "",
    });
    globalThis.fetch = async () => new Response("  invalid JWT\n provided ", { status: 403 });
    assert.deepEqual(await sendPush(sub, { body: "x" }, v), {
      outcome: "failed",
      status: 403,
      detail: "invalid JWT provided",
    });
    globalThis.fetch = async () => new Response("expired", { status: 410 });
    assert.equal((await sendPush(sub, { body: "x" }, v)).outcome, "gone");
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    assert.deepEqual(await sendPush(sub, { body: "x" }, v), {
      outcome: "failed",
      status: 0,
      detail: "network down",
    });
  } finally {
    globalThis.fetch = real;
  }
});
