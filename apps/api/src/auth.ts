// Identity. Two ways to prove who you are, one place that decides:
//
//   session cookie   the hub, after logging in
//   bearer token     the CLI and MCP servers, from a token minted in the hub
//
// Passwords are PBKDF2-HMAC-SHA256 through WebCrypto, because a Worker has no bcrypt or argon2 and
// rolling our own is worse than a well-parameterised KDF. Everything secret is stored as a
// SHA-256: tokens, session ids and reset codes are all bearer credentials, so a database read must
// not hand someone a working credential.

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * 100,000 is not a preference, it is the ceiling: the Workers runtime rejects anything higher with
 * `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`. Local
 * workerd does not enforce the cap, so this only appears on the real edge — it shipped once and
 * broke sign-in until `wrangler dev --remote` reproduced it.
 *
 * That is below current OWASP guidance for PBKDF2-HMAC-SHA256, and worth knowing. The iteration
 * count is stored inside each hash, so raising it later (or moving to another KDF) can be done
 * per-account on next sign-in without invalidating anyone.
 */
const ITERATIONS = 100_000;

export const MIN_PASSWORD = 12;

export function rand(length: number, alphabet = ALPHABET): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/** Constant-time compare, so a wrong password cannot be narrowed down by how long it took. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * A hash to check against when there is no account, so a wrong email costs the same as a wrong
 * password. Computed once per isolate: hashing a throwaway on every failed attempt would double
 * the work an unauthenticated caller can make us do.
 */
let decoy: Promise<string> | null = null;
export const decoyHash = () => {
  decoy ??= hashPassword(rand(24));
  return decoy;
};

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(iterations));
  return sameBytes(got, unb64(hash));
}

/** What a password has to clear. Length does more here than a zoo of character classes. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `password must be at least ${MIN_PASSWORD} characters`;
  if (password.length > 200) return "password is too long";
  if (!password.trim()) return "password cannot be only spaces";
  return null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- breached passwords ------------------------------------------------------------------

/**
 * Is this password in a public breach corpus? Checked against Have I Been Pwned's Pwned Passwords
 * range API, which is built so the password never leaves: we SHA-1 it locally, send only the first
 * five hex characters of that hash, and get back every suffix sharing that prefix — some hundreds
 * of them — to match ourselves. They learn a bucket, not a password.
 *
 * This matters more here than the iteration count does. The runtime caps PBKDF2 at 100,000, so
 * what actually decides whether a stolen hash falls is whether the password was guessable at all,
 * and "already in a breach list" is the most guessable a password can be.
 *
 * `fetchImpl` is a seam for tests. Failures fail *open*: a rejected sign-up because someone else's
 * API is down is a worse outcome than a weak password getting through.
 */
export async function isBreached(password: string, fetchImpl = fetch): Promise<boolean> {
  if (!password) return false;
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const sha1 = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const [prefix, suffix] = [sha1.slice(0, 5), sha1.slice(5)];
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "add-padding": "true" }, // uniform response sizes, so length leaks nothing
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hash, count] = line.trim().split(":");
      if (hash === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ---- sessions ---------------------------------------------------------------------------

export const SESSION_COOKIE = "pa_session";
const SESSION_DAYS = 30;

export const sessionExpiry = () => new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();

/**
 * `Secure` is dropped on plain http so that `wrangler dev` on localhost can hold a session; every
 * real origin is https, so in production the attribute is always there.
 */
export function sessionCookie(id: string, url: string): string {
  const secure = new URL(url).protocol === "https:" ? "; Secure" : "";
  const maxAge = SESSION_DAYS * 86400;
  return `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function clearCookie(url: string): string {
  const secure = new URL(url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export function readCookie(header: string | undefined, name: string): string {
  for (const part of (header || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}
