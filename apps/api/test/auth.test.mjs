// Runs on Node 22.18+ with built-in type stripping (`node --test`).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearCookie,
  hashPassword,
  isBreached,
  passwordProblem,
  readCookie,
  sessionCookie,
  verifyPassword,
} from "../src/auth.ts";

test("a password verifies against its own hash and nothing else", async () => {
  const stored = await hashPassword("correct-horse-battery");
  assert.equal(await verifyPassword("correct-horse-battery", stored), true);
  assert.equal(await verifyPassword("correct-horse-batterY", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("the same password hashes differently every time", async () => {
  const [a, b] = [
    await hashPassword("correct-horse-battery"),
    await hashPassword("correct-horse-battery"),
  ];
  assert.notEqual(a, b, "a shared salt would let one crack answer for every account");
  assert.equal(await verifyPassword("correct-horse-battery", b), true);
});

test("the stored form carries its own parameters", async () => {
  const [scheme, iterations, salt, hash] = (await hashPassword("correct-horse-battery")).split("$");
  assert.equal(scheme, "pbkdf2");
  // 100,000 is the Workers runtime's hard ceiling for PBKDF2, not a tuning choice. Going above it
  // throws NotSupportedError on the edge while passing locally, so this guards both directions.
  assert.equal(Number(iterations), 100_000);
  assert.ok(salt.length > 20 && hash.length > 20);
  // Parameters live in the record so they can be raised later without invalidating old passwords.
  assert.equal(await verifyPassword("correct-horse-battery", `pbkdf2$1000$${salt}$${hash}`), false);
});

test("garbage in the hash column fails closed", async () => {
  for (const stored of ["", "not-a-hash", "pbkdf2$", "bcrypt$10$x$y", "pbkdf2$210000$$"]) {
    assert.equal(await verifyPassword("correct-horse-battery", stored), false, stored);
  }
});

test("password rules are about length, not character zoos", () => {
  assert.match(passwordProblem("short"), /at least 8/);
  assert.match(passwordProblem(" ".repeat(14)), /only spaces/);
  assert.match(passwordProblem("x".repeat(201)), /too long/);
  assert.equal(passwordProblem("a-brand-new-passphrase"), null);
});

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8. The API is asked for the first
// five characters only and answers with every suffix in that bucket.
const PREFIX = "5BAA6";
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

const stub = (body, ok = true) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok, text: async () => body };
  };
  fn.calls = calls;
  return fn;
};

test("a breached password is recognised, and only its hash prefix is sent", async () => {
  const fetchImpl = stub(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:9659365\r\n`);
  assert.equal(await isBreached("password", fetchImpl), true);
  const [{ url }] = fetchImpl.calls;
  assert.equal(url, `https://api.pwnedpasswords.com/range/${PREFIX}`);
  assert.equal(
    new URL(url).pathname,
    `/range/${PREFIX}`,
    "the request is the prefix, nothing more",
  );
  assert.ok(!url.includes(SUFFIX), "the rest of the hash never leaves this machine");
  assert.equal(PREFIX.length, 5);
});

test("a password absent from the bucket passes", async () => {
  assert.equal(
    await isBreached("password", stub("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n")),
    false,
  );
  // A suffix present but never actually seen is not a breach.
  assert.equal(await isBreached("password", stub(`${SUFFIX}:0\r\n`)), false);
});

test("the check fails open, because someone else's outage must not block a sign-up", async () => {
  assert.equal(await isBreached("password", stub("", false)), false);
  assert.equal(
    await isBreached("password", async () => {
      throw new Error("network down");
    }),
    false,
  );
  assert.equal(await isBreached("", stub(`${SUFFIX}:1`)), false, "no password, no call");
});

test("the session cookie cannot be read by script and is https-only in production", () => {
  const live = sessionCookie("abc123", "https://passalong.dev/v1/auth/login");
  assert.match(live, /^pa_session=abc123;/);
  assert.match(live, /HttpOnly/);
  assert.match(live, /SameSite=Lax/);
  assert.match(live, /Secure/);
  // Dropped on http so a localhost dev session can exist at all.
  assert.doesNotMatch(sessionCookie("abc123", "http://localhost:8787/x"), /Secure/);
  assert.match(clearCookie("https://x.test/y"), /Max-Age=0/);
});

test("reading a cookie picks the right one out of the header", () => {
  assert.equal(readCookie("a=1; pa_session=xyz; b=2", "pa_session"), "xyz");
  assert.equal(readCookie("pa_session=xyz", "pa_session"), "xyz");
  assert.equal(readCookie("other=1", "pa_session"), "");
  assert.equal(readCookie(undefined, "pa_session"), "");
  // A value containing "=" survives the split.
  assert.equal(readCookie("pa_session=a=b=c", "pa_session"), "a=b=c");
});

test("the demo sign-in cannot exist anywhere it was not deliberately turned on", async () => {
  // A route that hands out a session without asking for anything is an auth bypass by
  // construction, so what is pinned here is that it takes two switches to open and that neither
  // is on by default. Checked against the source because the Hono app is not importable from a
  // test — the same way oauth.test.mjs holds the internal-call marker.
  const { readFile } = await import("node:fs/promises");
  const here = new URL("../src/index.ts", import.meta.url);
  const src = await readFile(here, "utf8");

  const route = src.slice(src.indexOf('app.post("/v1/auth/demo"'));
  const body = route.slice(0, route.indexOf("\napp."));
  assert.ok(body.length > 0, "the route should still be there");

  // Switch one: an environment variable that is nowhere in either wrangler.jsonc, so a deployed
  // Worker has nothing to read. Switch two: the request must be for localhost, so the variable
  // escaping a .dev.vars into somewhere real is still not enough on its own.
  assert.match(body, /c\.env\.DEMO_LOGIN !== "1"/, "the flag must be checked, and exactly");
  assert.match(body, /hostname/, "the host must be checked too");
  assert.match(body, /return c\.notFound\(\)/, "a door that is not open should not announce itself");

  // Both in one condition: two separate ifs would let a later edit drop one and still read as
  // guarded.
  assert.match(
    body,
    /if \(c\.env\.DEMO_LOGIN !== "1" \|\| !local\) return c\.notFound\(\);/,
    "one gate, both halves",
  );

  // It must not be able to sign in as an account that already exists: it makes a new one, and the
  // INSERT is the whole of it. A SELECT here would be a way to pick a victim.
  assert.match(body, /INSERT INTO account/, "it mints an account");
  assert.ok(!/SELECT/.test(body), "it must never look an existing account up");

  for (const f of ["../wrangler.jsonc", "../../web/wrangler.jsonc"]) {
    const conf = await readFile(new URL(f, import.meta.url), "utf8");
    assert.ok(!/DEMO_LOGIN/.test(conf), `${f} must never carry DEMO_LOGIN`);
  }
});
