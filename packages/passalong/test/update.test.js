// The update notice: what it says, and the two ways it must never misbehave.
//
// The first version of this awaited the registry with a 1.5s timeout, and measuring it is what
// found the design wrong — the registry answered in six to ten seconds, so the check timed out
// every time, cached nothing, and would have shipped doing nothing while reading fine. What is
// pinned here is the shape that replaced it: the line comes off a file, and the file is refreshed
// by somebody else.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECK_EVERY_MS,
  cachedNotice,
  isNewer,
  noticeFor,
  RETRY_AFTER_MS,
  refresh,
} from "../src/update.js";

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const held =
  (over = {}) =>
  () => ({ update_checked: NOW, update_latest: "0.9.1", ...over });

test("a version is newer only when its numbers are", () => {
  assert.equal(isNewer("0.8.0", "0.7.9"), true);
  assert.equal(isNewer("1.0.0", "0.99.99"), true);
  assert.equal(isNewer("0.7.1", "0.7.0"), true);
  assert.equal(isNewer("0.7.0", "0.7.0"), false, "the same version is not news");
  assert.equal(isNewer("0.6.0", "0.7.0"), false, "a local build ahead of the registry is not news");
  // A prerelease is read as its release: what matters is that the numbers moved.
  assert.equal(isNewer("0.8.0-rc.1", "0.7.0"), true);
  // Nothing usable means nothing said, rather than a sentence about "undefined".
  for (const bad of ["", "latest", "1.2", "1.2.3.4", null, undefined])
    assert.equal(isNewer(bad, "0.7.0"), false, `${JSON.stringify(bad)} is not a version`);
});

test("the line names both versions and how to fix it", () => {
  assert.equal(
    noticeFor("0.9.1", "0.7.0"),
    "passalong 0.9.1 is out (you have 0.7.0) — npm i -g passalong",
  );
  assert.equal(noticeFor("0.7.0", "0.7.0"), "");
});

test("the notice comes off the file, and nothing waits for the network", () => {
  // No fetch is passed, and none is reachable from here: if this needed the network it could not
  // pass at all, which is the property worth having.
  const { notice, stale } = cachedNotice({ current: "0.7.0", now: NOW, config: held() });
  assert.match(notice, /0\.9\.1 is out/);
  assert.equal(stale, false, "checked just now");
});

test("a day old asks for a refresh; an hour after a failure asks sooner", () => {
  const dayLater = NOW + CHECK_EVERY_MS + 1;
  assert.equal(cachedNotice({ current: "0.7.0", now: dayLater, config: held() }).stale, true);

  // A check that reached nobody records the attempt with an empty answer. Blinding the notice for
  // a whole day over one bad minute is the failure this avoids; retrying on every command is the
  // one the gap avoids.
  const failed = held({ update_latest: "" });
  assert.equal(cachedNotice({ current: "0.7.0", now: NOW + 60_000, config: failed }).stale, false);
  assert.equal(
    cachedNotice({ current: "0.7.0", now: NOW + RETRY_AFTER_MS + 1, config: failed }).stale,
    true,
  );
});

test("turning it off turns it off, including the refresh", () => {
  const off = { PASSALONG_NO_UPDATE_CHECK: "1" };
  const out = cachedNotice({
    current: "0.7.0",
    now: NOW + CHECK_EVERY_MS * 9,
    config: held(),
    env: off,
  });
  assert.deepEqual(out, { notice: "", stale: false }, "no line, and nothing spawned");
});

test("a refresh writes what the registry said", async () => {
  const saved = [];
  const fetchImpl = async () => ({ ok: true, json: async () => ({ version: "1.2.3" }) });
  const got = await refresh({ now: NOW, fetchImpl, save: (p) => saved.push(p) });
  assert.equal(got, "1.2.3");
  assert.deepEqual(saved, [{ update_checked: NOW, update_latest: "1.2.3" }]);
});

test("a refresh that fails records the attempt and says nothing", async () => {
  for (const fetchImpl of [
    async () => {
      throw new Error("offline");
    },
    // 406 is not hypothetical: the first version sent an accept header this endpoint refuses, and
    // every check failed on it.
    async () => ({ ok: false, status: 406, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ nope: true }) }),
  ]) {
    const saved = [];
    assert.equal(await refresh({ now: NOW, fetchImpl, save: (p) => saved.push(p) }), "");
    assert.deepEqual(
      saved,
      [{ update_checked: NOW, update_latest: "" }],
      "the attempt is recorded, so the retry gap applies to it",
    );
  }
});

test("a config that cannot be written is not an error", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ version: "1.2.3" }) });
  const save = () => {
    throw new Error("read-only home");
  };
  assert.equal(await refresh({ now: NOW, fetchImpl, save }), "1.2.3");
});
