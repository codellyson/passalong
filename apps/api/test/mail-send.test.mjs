// Runs on Node 22.18+ with built-in type stripping (`node --test`). mail-send.ts imports nothing,
// which is what keeps the transport — and the one branch in it that matters — testable.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fromLine, sendMail } from "../src/mail-send.ts";

test("the sender is named, so an inbox does not list it as no-reply", () => {
  assert.equal(
    fromLine("no-reply@passalong.dev", "Passalong"),
    '"Passalong" <no-reply@passalong.dev>',
  );
  // Quoted, because the name is configurable and a comma or a colon in it would split the header.
  assert.equal(fromLine("a@b.c", "Passalong, Inc."), '"Passalong, Inc." <a@b.c>');
  assert.equal(
    fromLine("a@b.c", 'he said "hi"\\'),
    '"he said hi" <a@b.c>',
    "no way to close the quote",
  );
  // An empty name is the way back to the bare address, deliberately.
  assert.equal(fromLine("a@b.c", ""), "a@b.c");
  assert.equal(fromLine("a@b.c", "   "), "a@b.c");
});

test("a sender the service will not parse costs the name, not the mail", async () => {
  const tried = [];
  const env = {
    EMAIL_FROM: "no-reply@passalong.dev",
    EMAIL: {
      async send(m) {
        tried.push(m.from);
        // Stand in for a service that accepts only a bare address.
        if (m.from.includes("<")) throw new Error("invalid from");
        return null;
      },
    },
  };
  assert.equal(await sendMail(env, "a@b.c", "s", ["line"]), true, "the mail still goes out");
  assert.deepEqual(tried, ['"Passalong" <no-reply@passalong.dev>', "no-reply@passalong.dev"]);
});

test("a send that fails for any other reason still fails quietly", async () => {
  let calls = 0;
  const env = {
    EMAIL: {
      async send() {
        calls++;
        throw new Error("E_SENDER_NOT_VERIFIED");
      },
    },
  };
  assert.equal(await sendMail(env, "a@b.c", "s", ["line"]), false);
  assert.equal(calls, 2, "one retry without the name, and then it gives up rather than throwing");
  assert.equal(await sendMail({}, "a@b.c", "s", ["l"]), false, "no binding is not an error");
});
