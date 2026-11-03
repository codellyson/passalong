// The "we've got your message" email to a new customer is the team's choice, off until its owner
// turns it on. It used to go to everyone who wrote to a support address, with no way to stop it
// (2026-11-03).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const index = read("../src/index.ts");
const migration = read("../migrations/0069_ack_customer.sql");

test("off for every team until its owner turns it on", () => {
  assert.match(migration, /ADD COLUMN ack_customer INTEGER NOT NULL DEFAULT 0;/);
  assert.match(migration, /ADD COLUMN ack_text TEXT NOT NULL DEFAULT '';/, "and the default words");
});

test("a new request is acknowledged only when its team turned it on, and never without a team", () => {
  const at = index.indexOf("const copy = ackCopy({");
  assert.ok(at > 0);
  const before = index.slice(at - 700, at);
  assert.match(
    before,
    /const ack = box\.team\s*\?\s*await env\.DB\.prepare\("SELECT ack_customer, ack_text FROM team WHERE slug = \?"\)/,
  );
  assert.match(before, /: null;\s*if \(ack\?\.ack_customer\) \{/);
  assert.equal(index.split("ackCopy(").length - 1, 1, "and nowhere else sends it");
});

test("only the team's owner sets it", () => {
  const route = index.slice(index.indexOf('app.put("/v1/teams/:slug/ack-customer"'));
  const body = route.slice(0, route.indexOf("\n});\n"));
  assert.match(body, /if \(team\.role !== "owner"\)\s*return err\(c, 403,/);
  assert.match(body, /UPDATE team SET ack_customer = COALESCE/);
});

test("the team's own words replace the first line; the tracking number stays whatever they wrote", async () => {
  const { ACK_DEFAULT, ackCopy } = await import("../src/mail-copy.ts");
  const o = { from: "Khaime support", subject: "Card declined", ref: "R-K7Q2M9" };
  assert.equal(ackCopy(o).text[0], ACK_DEFAULT, "nothing written: the default");
  assert.equal(ackCopy({ ...o, said: "   " }).text[0], ACK_DEFAULT, "blank is nothing");
  const own = ackCopy({ ...o, said: "Hi! We read every message.\nUsually within a day." });
  assert.deepEqual(own.text.slice(0, 2), ["Hi! We read every message.", "Usually within a day."]);
  assert.match(own.text.join("\n"), /Your tracking number is R-K7Q2M9\. Reply to this email/);
  assert.equal(own.text.at(-1), "— Khaime support");
  assert.equal(own.subject, ackCopy(o).subject, "the same thread either way");
});

test("the owner's route takes the switch, the words, or both, and no more than the limit", () => {
  const route = index.slice(index.indexOf('app.put("/v1/teams/:slug/ack-customer"'));
  const body = route.slice(0, route.indexOf("\n});\n"));
  assert.match(body, /text\.length > ACK_MAX/);
  assert.match(
    body,
    /ack_customer = COALESCE\(\?, ack_customer\), ack_text = COALESCE\(\?, ack_text\)/,
  );
  assert.match(index, /said: ack\.ack_text,/, "and what is sent is what was saved");
});
