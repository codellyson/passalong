// A team's support inbox forwarded to its Passalong address: by a Google Group, whose list headers
// made every customer's message count as a machine's, or by a Gmail rule, whose confirmation code
// never reached anyone, so forwarding never started (2026-11-05). This pins receiveSupport's side.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const support = index.slice(index.indexOf("async function receiveSupport("));
const body = support.slice(0, support.indexOf("\n}\n"));

test("Gmail's forwarding check reaches the owner as a sender, before anything else is decided", () => {
  const check = body.indexOf("if (mail.sender === GMAIL_CHECK) {");
  assert.ok(check > 0, "it is looked for");
  assert.ok(check < body.indexOf("state = 'blocked'"), "first");
  const handled = body.slice(check, body.indexOf("const blocked"));
  assert.match(handled, /INSERT INTO inbound_sender \(account_id, sender, subject/);
  assert.match(handled, /kind: "email_sender"/);
});

test("only a machine's mail is dropped; mail a group forwarded becomes a request", () => {
  assert.match(
    body,
    /if \(mail\.machine\) return void console\.log\("support", "made by a machine", me\);/,
  );
  assert.doesNotMatch(body, /if \(mail\.automated\) return/);
});

test("every message that goes nowhere says why in the log", () => {
  const receive = index.slice(index.indexOf("export async function receiveEmail("));
  const head = receive.slice(0, receive.indexOf("if (to.box === SUPPORT)"));
  for (const why of ["not one of our addresses", "too big", "no inbox has that key", "no sender"])
    assert.match(head, new RegExp(`console\\.log\\("inbound", "${why}"\\)`), why);
});
