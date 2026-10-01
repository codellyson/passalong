/**
 * Web Push, sent from the Worker: VAPID (RFC 8292) to prove the sender, and aes128gcm (RFC 8291)
 * so the push service carrying the message cannot read it. WebCrypto only — the usual `web-push`
 * package leans on Node's crypto, which a Worker does not have.
 *
 * The push service (Google's, Apple's, Mozilla's) learns an endpoint, a size and a time. The
 * sentence itself — which may carry a guide's title — is encrypted to keys only the subscribed
 * browser holds.
 *
 * Imports no sibling, so test/webpush.test.mjs can decrypt what this encrypts and verify what it
 * signs, which is the only way to know the bytes are right without a real push service.
 */

export interface Subscription {
  endpoint: string;
  /** The browser's P-256 public key, base64url, uncompressed (65 bytes). */
  p256dh: string;
  /** The browser's 16-byte auth secret, base64url. */
  auth: string;
}

export interface Vapid {
  /** base64url, uncompressed P-256 public key — also what the browser subscribes with. */
  publicKey: string;
  /** base64url, the 32-byte private scalar. */
  privateKey: string;
  /** Who to contact about this sender: "mailto:…" or an https URL. */
  subject: string;
}

const enc = new TextEncoder();
/** Text as bytes WebCrypto accepts: the Worker types widen encode()'s buffer to ArrayBufferLike. */
const bytes = (text: string) => enc.encode(text) as Uint8Array<ArrayBuffer>;

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8),
  );
}

/** The VAPID signing key, from the raw public point and private scalar. */
async function signingKey(v: Vapid): Promise<CryptoKey> {
  const pub = fromB64url(v.publicKey);
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: b64url(pub.slice(1, 33)),
      y: b64url(pub.slice(33, 65)),
      d: v.privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** `Authorization: vapid t=…, k=…` for one push service. */
export async function vapidHeader(endpoint: string, v: Vapid, now = Date.now()): Promise<string> {
  const header = b64url(bytes(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    bytes(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        // Twelve hours: the longest a push service is asked to accept, and far longer than a send.
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: v.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto's ECDSA signature is already JOSE's raw r||s, which is what ES256 wants.
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      await signingKey(v),
      bytes(unsigned),
    ),
  );
  return `vapid t=${unsigned}.${b64url(sig)}, k=${v.publicKey}`;
}

/**
 * The encrypted body for one subscription, RFC 8291: one aes128gcm record, the sender's ephemeral
 * key in its header, keyed from ECDH with the browser's key and the browser's auth secret.
 */
export async function encrypt(
  sub: Subscription,
  payload: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const ephemeral = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", ephemeral.publicKey)) as ArrayBuffer,
  );
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    // `public` is the spec's name; the Workers types spell it `$public`, the runtime takes both.
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      ephemeral.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(bytes("WebPush: info\0"), uaPublic, asPublic),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, bytes("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, bytes("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record, so it is the last: the delimiter is 0x02 and there is no padding.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      concat(payload, Uint8Array.of(2)),
    ),
  );
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, Uint8Array.of(asPublic.length), asPublic, sealed);
}

export type Outcome = "sent" | "gone" | "failed";

/**
 * What the push service said. `status` is 0 when it could not be reached at all, and `detail` is
 * the start of its answer on a failure — Google, Apple and Mozilla each say why they refused a send
 * (a bad JWT, a key mismatch, a body too large), and without it a failure is indistinguishable from
 * a success nobody saw.
 */
export interface Sent {
  outcome: Outcome;
  status: number;
  detail: string;
}

/**
 * Send one message to one browser. "gone" means the push service says this subscription no longer
 * exists (404 or 410) and the caller should forget it; "failed" is anything else, kept for next time.
 */
export async function sendPush(
  sub: Subscription,
  message: unknown,
  v: Vapid,
  {
    ttl = 86_400,
    urgency = "normal",
    topic,
  }: { ttl?: number; urgency?: string; topic?: string } = {},
): Promise<Sent> {
  const body = await encrypt(sub, bytes(JSON.stringify(message)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(sub.endpoint, v),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(ttl),
      urgency,
      // A newer message on the same topic replaces an undelivered older one, so a phone that was off
      // wakes to one notice per guide rather than a backlog.
      ...(topic ? { topic } : {}),
    },
    body,
  }).catch((e: Error) => e);
  if (res instanceof Error) return { outcome: "failed", status: 0, detail: res.message };
  if (res.ok) return { outcome: "sent", status: res.status, detail: "" };
  const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);
  const outcome = res.status === 404 || res.status === 410 ? "gone" : "failed";
  return { outcome, status: res.status, detail };
}

/** A fresh VAPID key pair, base64url: for `scripts/vapid-keys.mjs` and the tests. */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
  ])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return { publicKey: b64url(pub), privateKey: jwk.d as string };
}
