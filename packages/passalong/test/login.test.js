import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/passalong", import.meta.url));

/** The real binary with a home of its own. Async, because the fake API below shares this process. */
function run(args, { home, api = "http://127.0.0.1:9", stdin = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], {
      env: {
        ...process.env,
        PASSALONG_HOME: home || mkdtempSync(join(tmpdir(), "passalong-login-")),
        PASSALONG_API: api,
        PASSALONG_TOKEN: "",
        PASSALONG_ACCOUNT: "",
        PASSALONG_NO_UPDATE_CHECK: "1",
      },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.stdin.end(stdin ?? "");
    child.on("exit", (status) => resolve({ status, out }));
  });
}

/** Answers /v1/me for one token, the only call a login makes before keeping it. */
async function fakeApi(good) {
  const server = createServer((req, res) => {
    const ok = req.url === "/v1/me" && req.headers.authorization === `Bearer ${good}`;
    res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { account: "acc1", handle: "tester" } : { message: "bad token" }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

// A token in argv lands in shell history; it is only ever read from stdin.
test("a token given as an argument is refused, pointing at --with-token", async () => {
  const r = await run(["login", "pa_secret"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /--with-token/);
});

test("password sign-in is refused and points at the browser", async () => {
  const r = await run(["login", "--email", "a@b.c"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /browser/);
});

test("--with-token with nothing on stdin is refused", async () => {
  const r = await run(["login", "--with-token"], { stdin: "  \n" });
  assert.equal(r.status, 1);
  assert.match(r.out, /no token on stdin/);
});

test("--with-token keeps a good token, never prints it, and logout with no name forgets it", async () => {
  const api = await fakeApi("pa_good");
  const home = mkdtempSync(join(tmpdir(), "passalong-login-"));
  try {
    const bad = await run(["login", "--with-token"], { home, api: api.url, stdin: "pa_wrong\n" });
    assert.equal(bad.status, 1);
    assert.match(bad.out, /token rejected/);

    const r = await run(["login", "--with-token"], { home, api: api.url, stdin: "pa_good\n" });
    assert.equal(r.status, 0, r.out);
    assert.doesNotMatch(r.out, /pa_good/, "the credential is never printed");
    assert.equal(JSON.parse(readFileSync(join(home, "config.json"), "utf8")).token, "pa_good");

    const again = await run(["login"], { home, api: api.url });
    assert.equal(again.status, 0, again.out);
    assert.match(again.out, /already logged in as @tester/);
    assert.doesNotMatch(again.out, /pa_good/);

    const out = await run(["logout"], { home, api: api.url });
    assert.equal(out.status, 0, out.out);
    assert.match(out.out, /no account is signed in here now/);
    assert.ok(!JSON.parse(readFileSync(join(home, "config.json"), "utf8")).token);
  } finally {
    api.close();
  }
});
