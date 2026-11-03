// Telling people it is time to pay. The wall at the free limit was the only message, said to
// whoever hit it — most often an agent — while the person who could pay never opened the hub.
// The decisions are pure and tested in quota.test.mjs and notify.test.mjs; this pins where they run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const index = read("../src/index.ts");
const alerts = read("../src/alerts.ts");
const sweep = read("../../web/server/plugins/sweep.ts");

test("reaching the line or the limit is checked on both ways work becomes Ready", () => {
  // Publishing new Ready work, or work that was not Ready.
  assert.match(
    index,
    /if \(status === "ready" && existing\?\.status !== "ready"\) await tellIfLimitReached\(c, account\);/,
  );
  // Marking a draft Ready — how most work starts counting — against whoever wrote it.
  assert.match(
    index,
    /if \(status === "ready" && found\.row\.status !== "ready"\)\s*await tellIfLimitReached\(c, found\.row\.account_id\);/,
  );
  // Said every time it is reached, and at the limit to the owners of the account's teams too.
  const tell = index.slice(index.indexOf("async function tellIfLimitReached("));
  const body = tell.slice(0, tell.indexOf("\nasync function quota("));
  assert.match(body, /limitReached\(room\.used, room\)/);
  assert.equal(body.split("everyTime: true").length - 1, 2, "both notices mail every time");
  assert.match(body, /WHERE m\.role = 'owner' AND m\.account_id <> \?/);
  assert.match(body, /catch \(err\)/, "a notice never fails the act that caused it");
});

test("the wall asks an agent to tell the person, and only an agent", () => {
  const refusal = index.slice(index.indexOf("function limitRefusal("));
  assert.match(
    refusal.slice(0, 1500),
    /return fromAgent\(client\)\s*\?\s*`\$\{said\} Agents: tell the person this in your reply/,
  );
  assert.match(index, /return by === "mcp" \|\| by\.startsWith\("cli@"\);/);
  // Publishing and marking Ready say it the same way.
  assert.match(index, /return err\(c, 402, limitRefusal\(c\.get\("client"\), room\)\);/);
  assert.match(index, /return err\(c, 402, limitRefusal\(c\.get\("client"\), room, whose\)\);/);
});

test("marking a draft Ready is held to the free limit, before anything is written", () => {
  // It wasn't: a draft could be made Ready past the limit, and most work starts as a draft.
  const route = index.slice(index.indexOf('app.patch("/v1/work/:id/status"'));
  const body = route.slice(0, route.indexOf("\n});\n"));
  const check = body.indexOf('if (status === "ready" && found.row.status !== "ready") {');
  assert.ok(check > 0, "the check is there");
  assert.match(
    body.slice(check, check + 300),
    /const room = await quota\(c, found\.row\.account_id\);\s*if \(isFull\(room\.used, room\)\)/,
    "against whoever wrote it",
  );
  assert.ok(check < body.indexOf("let markdown = setField("), "and before anything is written");
});

test("a plan that won't renew is said by the hourly run, and its owners see when in the hub", () => {
  assert.match(sweep, /await plansEnding\(env\.DB as D1Database, at, 60 \* 60 \* 1000\)/);
  const block = sweep.slice(sweep.indexOf("await plansEnding("));
  assert.match(block.slice(0, 2500), /kind: "plan_ending"/);
  assert.match(block.slice(0, 2500), /everyTime: true/);
  // /v1/me carries an owned Team plan's end dates, which the hub's last-week banner reads.
  assert.match(
    index,
    /t\.role === "owner" && t\.plan === "team"\s*\?\s*\{ plan_until: t\.plan_until \|\| "", plan_ends: t\.plan_ends \|\| "" \}/,
  );
});

test("mailing every time still writes the feed and pushes, then mails directly", () => {
  assert.match(
    alerts,
    /if \(opts\.everyTime\) \{\s*await notify\(env, \{ \.\.\.e, to: person\.id \}\);\s*if \(person\.email\) await send\(person\.email\)\(\);/,
  );
});
