// What a person reads when something is refused. The hub prints a failed call's `message` verbatim,
// so these are sentences for people: what happened, and what to do next.
//
// Most refusals live in index.ts, which is not importable from a test (see the note in hosts.ts),
// so those are pinned against its source, the way guide.test.mjs pins its rules.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { passwordProblem } from "../src/auth.ts";
import { PAYMENTS_NOT_SET_UP, setSeats, startCheckout } from "../src/billing.ts";

const source = () => readFile(new URL("../src/index.ts", import.meta.url), "utf8");

test("a crash says something true and useful, and the real error is still logged", async () => {
  const src = await source();
  const at = src.indexOf("app.onError(");
  const body = src.slice(at, at + 300);
  assert.match(body, /console\.error\(e\)/);
  assert.match(body, /"Something went wrong on our side\. Try again in a moment\."/);
  assert.doesNotMatch(src, /"internal error"/);
});

test("the old machine phrasings are gone from everything a person can reach", async () => {
  const src = await source();
  for (const old of [
    "no such team, or you are not a member",
    "no such guide (or it is not in one of your teams)",
    "invite not found",
    "email or password is wrong",
    "handle: 2–31 chars",
    "the channel URL must be https",
    "this deployment has no screenshot storage configured",
    "`to` needs a `team`",
    "POST /v1/shots",
    "subscribe at /hub/settings",
    "`passalong done <id>`",
    "is read-only: its subscription lapsed",
  ]) {
    assert.ok(!src.includes(old), `still says: ${old}`);
  }
});

test("refusals name what happened and what to do next", async () => {
  const src = await source();
  for (const now of [
    "You're not in that team any more, or it was deleted.",
    "This guide isn't available any more. It may have been deleted or moved to a team you're not in.",
    "This invite doesn't work any more. Ask whoever sent it for a new link.",
    "That reset link has expired or was already used. Ask for a new one from the sign-in page.",
    "Choose 2 to 31 letters, numbers or dashes, starting with a letter or number.",
    "Screenshots can't be uploaded here right now.",
    "That file isn't an image. Use a PNG, JPEG, WebP or GIF.",
    "This report doesn't exist or was deleted.",
    "Syncing guides needs a plan. Choose one in Settings.",
  ]) {
    assert.ok(src.includes(now), `missing: ${now}`);
  }
  assert.match(src, /Forgot your password\?/, "a failed sign-in points at the way out");
});

test("a person is named by team name in a refusal, never by slug", async () => {
  const src = await source();
  // Every message that interpolates a team uses its name. The slug is an address, not a name.
  const messages = src.match(/err\(\s*c,\s*\d+,[\s\S]*?\);/g) ?? [];
  const bySlug = messages.filter((m) => /\$\{(team|inv)\.slug\}/.test(m));
  assert.deepEqual(bySlug, []);
});

test("a deployment without payment keys says so in a person's words", async () => {
  const opts = { subject: { kind: "team", id: "t1" }, seats: 1, email: "a@b.c", returnTo: "x" };
  await assert.rejects(startCheckout("stripe", {}, opts), { message: PAYMENTS_NOT_SET_UP });
  await assert.rejects(startCheckout("paystack", {}, opts), { message: PAYMENTS_NOT_SET_UP });
  await assert.rejects(setSeats("stripe", {}, "sub_1", 2), { message: PAYMENTS_NOT_SET_UP });
  assert.equal(PAYMENTS_NOT_SET_UP, "Payments aren't set up yet. Try again later.");
  // Paystack cannot change seats at all, so the refusal says where to go instead.
  await assert.rejects(setSeats("paystack", {}, "SUB_1", 2), /Cancel it .*Settings/);
});

test("password refusals are sentences", () => {
  assert.equal(passwordProblem("short"), "Use a password of at least 8 characters.");
  assert.match(passwordProblem(" ".repeat(14)), /^A password can't be only spaces\./);
  assert.match(passwordProblem("x".repeat(201)), /^That password is too long\./);
});
