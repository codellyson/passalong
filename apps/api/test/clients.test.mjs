// Which CLI is calling, and whether it is too old to serve. See src/clients.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { clientVersion, MIN_CLIENT, older, tooOld, UNSTATED, writtenBy } from "../src/clients.ts";

test("a CLI that states its version is taken at its word", () => {
  assert.deepEqual(clientVersion("0.12.0", "node"), { version: "0.12.0", stated: true });
});

test("a CLI from before the header is known by Node's own user-agent, and nothing else is", () => {
  assert.deepEqual(clientVersion("", "node"), { version: UNSTATED, stated: false });
  assert.deepEqual(clientVersion(undefined, "undici"), { version: UNSTATED, stated: false });
  // A browser, curl and an SDK are not an installed package: there is nothing for them to update.
  for (const ua of ["Mozilla/5.0 (Macintosh)", "curl/8.7.1", "python-requests/2.32", "", null])
    assert.equal(clientVersion("", ua).version, "", String(ua));
});

test("older compares numbers, not strings, and never calls the unreadable old", () => {
  assert.equal(older("0.9.0", "0.12.0"), true, "9 is before 12, whatever the characters say");
  assert.equal(older("0.12.0", "0.12.0"), false);
  assert.equal(older("1.0.0", "0.12.0"), false);
  assert.equal(older("0.12.0-rc.1", "0.12.0"), false, "a prerelease counts as its release");
  assert.equal(older("banana", "0.12.0"), false);
});

test("below the floor is refused with what to run and who restarts it", () => {
  const said = tooOld("0.9.0", "node", "0.12.0");
  assert.match(said, /passalong 0\.9\.0/);
  assert.match(said, /0\.12\.0 or later/);
  assert.match(said, /npm i -g passalong@latest/);
  assert.match(said, /\/mcp/);
  assert.match(said, /tell the person/);
  // Unstated: the build is not known, only that it is no newer than the last one without a header.
  assert.match(
    tooOld("", "node", "0.12.0"),
    new RegExp(`${UNSTATED.replaceAll(".", "\\.")} or older`),
  );
  assert.equal(tooOld("0.12.0", "node", "0.12.0"), "");
  assert.equal(tooOld("", "curl/8.7.1", "0.12.0"), "", "not the CLI, so never refused as one");
});

// The floor deploys on merge, so it is raised only after that version is `latest` on npm. Once it
// is past the last release that sent no header, every CLI that cannot say its version is refused.
test("a CLI that cannot state its version is below today's floor, and is told to update", () => {
  assert.ok(older(UNSTATED, MIN_CLIENT), `MIN_CLIENT ${MIN_CLIENT} is past ${UNSTATED}`);
  assert.match(tooOld("", "node"), /npm i -g passalong@latest/);
  assert.equal(tooOld(MIN_CLIENT, "node"), "", "the floor itself is served");
});

test("what wrote a guide: the surface from the credential, the CLI by the version it said", () => {
  assert.equal(writtenBy("internal", "0.13.0", "node"), "mcp");
  assert.equal(writtenBy("session", "0.13.0", "node"), "hub");
  assert.equal(writtenBy("token", "0.13.0", "node"), "cli@0.13.0");
  assert.equal(writtenBy("token", "", "node"), `cli@<=${UNSTATED}`);
  assert.equal(writtenBy("token", "", "curl/8.7.1"), "api");
  assert.equal(writtenBy("token", "x".repeat(200), "node").length, "cli@".length + 32);
});
