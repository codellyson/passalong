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

/** OWASP's floor for PBKDF2-HMAC-SHA256 is well above this; Workers CPU time is the other side. */
const ITERATIONS = 210_000;

export const MIN_PASSWORD = 10;

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
