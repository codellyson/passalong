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

test("reaching the line or the limit is checked when work is created, in any status", () => {
  // Every status counts (quota.ts COUNTED), so new work is the one act that adds to the count. It
  // says which team the work went to, since work in a paying team never counts.
  assert.match(
    index,
    /if \(!existing\) await tellIfLimitReached\(c, account, team\?\.id \|\| ""\);/,
  );
  const route = index.slice(index.indexOf('app.patch("/v1/work/:id/status"'));
  const moving = route.slice(0, route.indexOf("\n});\n"));
  assert.doesNotMatch(
    moving,
    /tellIfLimitReached|quota\(/,
    "moving between statuses changes nothing",
  );
  // Said every time it is reached, and at the limit to the owners of the account's teams that
  // aren't paying too: a paying team's owners can do nothing about work outside it.
  const tell = index.slice(index.indexOf("async function tellIfLimitReached("));
  const body = tell.slice(0, tell.indexOf("\nasync function quota("));
  assert.match(body, /limitReached\(room\.used, room\)/);
  assert.equal(body.split("everyTime: true").length - 1, 2, "both notices mail every time");
  assert.match(body, /WHERE m\.role = 'owner' AND m\.account_id <> \?/);
  assert.match(
    body,
    /AND NOT \(t\.plan = 'team' AND \(t\.plan_until = '' OR t\.plan_until > \?\)\)/,
  );
  assert.match(body, /catch \(err\)/, "a notice never fails the act that caused it");
});

test("the wall asks an agent to tell the person, and only an agent", () => {
  const refusal = index.slice(index.indexOf("function limitRefusal("));
  assert.match(
    refusal.slice(0, 1500),
    /return fromAgent\(client\)\s*\?\s*`\$\{said\} Agents: tell the person this in your reply/,
  );
  assert.match(index, /return by === "mcp" \|\| by\.startsWith\("cli@"\);/);
  assert.match(index, /return err\(c, 402, limitRefusal\(c\.get\("client"\), room\)\);/);
});

test("new work in any status is held to the free limit, before anything is written", () => {
  const route = index.slice(index.indexOf('app.put("/v1/work/:id"'));
  const check = route.indexOf(
    'if (!existing) {\n    const room = await quota(c, account, team?.id || "");',
  );
  assert.ok(check > 0, "the check is on creation, whatever the status");
  assert.ok(check < route.indexOf("INSERT INTO work"), "and before anything is written");
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

test("somebody past the limit is told how many they keep, that deleting or a plan is the way, and that nothing is taken", () => {
  const refusal = index.slice(index.indexOf("function limitRefusal("));
  const body = refusal.slice(0, refusal.indexOf("\n}\n"));
  assert.match(body, /room\.used > room\.limit/);
  assert.match(
    body,
    /You keep \$\{room\.used\} pieces of work and the free plan holds \$\{room\.limit\}/,
  );
  assert.match(body, /you can still read, finish, archive and delete it\./);
  assert.doesNotMatch(body, /rchive finished work to/, "archiving no longer makes room");
});
