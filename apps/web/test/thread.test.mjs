import assert from "node:assert/strict";
import { test } from "node:test";
import { composeReply, grouped, messageOf } from "../app/utils/thread.ts";

const by = (over = {}) => ({ name: "", handle: "", agent: false, host: "", you: false, ...over });
const item = (kind, over = {}) => ({
  id: kind,
  kind,
  at: "2026-10-01T10:00:00.000Z",
  body: "",
  by: by(),
  ...over,
});

test("an agent's words come through as it wrote them, and its own side is never yours", () => {
  const m = messageOf(
    item("progress", {
      body: "migration written",
      by: by({ agent: true, you: true, host: "mbp" }),
    }),
  );
  assert.equal(m.text, "migration written");
  assert.equal(m.who, "Agent");
  assert.equal(m.where, "mbp");
  assert.equal(m.mine, false, "your agent is still not you");
});

test("what has no words of its own gets a sentence, and is quiet", () => {
  assert.equal(messageOf(item("taken", { by: by({ agent: true }) })).text, "Taking this.");
  assert.equal(messageOf(item("taken", { by: by({ agent: true }) })).quiet, true);
  assert.equal(messageOf(item("released", { by: by({ you: true }) })).text, "Took this back.");
});

test("a refusal carries its reason and reads as a refusal", () => {
  const m = messageOf(item("sent_back", { body: "Acceptance 2 not met", by: by({ you: true }) }));
  assert.equal(m.text, "Sent back: Acceptance 2 not met");
  assert.equal(m.tone, "bad");
  assert.equal(m.mine, true);
  assert.equal(
    messageOf(item("verdict", { ok: false, body: "500 on save" })).text,
    "It does not work: 500 on save",
  );
  assert.equal(
    messageOf(item("ack", { ok: false, body: "wrong repo" })).text,
    "Not me: wrong repo",
  );
});

test("somebody else is named, by name else handle", () => {
  assert.equal(messageOf(item("approved", { by: by({ handle: "ada" }) })).who, "@ada");
  assert.equal(
    messageOf(item("approved", { by: by({ name: "Ada L", handle: "ada" }) })).who,
    "Ada L",
  );
});

test("one speaker's run shares a name; a long gap or a new speaker starts another", () => {
  const a = by({ agent: true });
  const t = (min) => new Date(Date.parse("2026-10-01T10:00:00.000Z") + min * 60000).toISOString();
  const g = grouped([
    item("taken", { id: "1", at: t(0), by: a }),
    item("progress", { id: "2", at: t(2), body: "x", by: a }),
    item("progress", { id: "3", at: t(30), body: "y", by: a }),
    item("approved", { id: "4", at: t(31), by: by({ you: true }) }),
  ]);
  assert.deepEqual(
    g.map((x) => x.messages.map((m) => m.id)),
    [["1", "2"], ["3"], ["4"]],
  );
});

test("a question is the agent's words, a reply is yours, and both come through as written", () => {
  const q = messageOf(
    item("asked", { body: "Settings or the header?", by: by({ agent: true, you: true }) }),
  );
  assert.equal(q.text, "Settings or the header?");
  assert.equal(q.mine, false, "your own agent is still not you");
  const r = messageOf(item("replied", { body: "Settings.", by: by({ you: true }) }));
  assert.equal(r.text, "Settings.");
  assert.equal(r.mine, true);
});

test("a reply is the words then each picture, and is refused before it would be cut", () => {
  const ok = composeReply("Looks wrong here.", [
    { kind: "image", name: "shot [1].png", url: "https://passalong.dev/v1/shots/abc123xyz" },
  ]);
  assert.equal(
    ok.body,
    "Looks wrong here.\n![shot 1.png](https://passalong.dev/v1/shots/abc123xyz)",
  );
  assert.equal(ok.over, 0);
  assert.equal(
    composeReply("", [
      { kind: "image", name: "a", url: "https://x/v1/shots/abc123" },
    ]).body.startsWith("!["),
    true,
    "a picture alone is a reply",
  );
  // A picture's address cut in half by the server's cap would be a broken image nobody can fix.
  assert.equal(
    composeReply("x".repeat(990), [
      { kind: "image", name: "a", url: "https://passalong.dev/v1/shots/abc123xyz" },
    ]).over > 0,
    true,
  );
  assert.equal(composeReply("   ", []).body, "");
});

test("only our own screenshots are drawn as pictures", () => {
  const draw = (text) => messageOf(item("replied", { body: text, by: by({ you: true }) })).pictures;
  assert.equal(draw("see ![a](https://passalong.dev/v1/shots/abc123xyz)"), true);
  assert.equal(
    draw("see ![a](https://evil.example/pixel.gif)"),
    false,
    "a stranger's address is just text",
  );
  assert.equal(draw("no picture"), false);
});

test("a file is a line of its own, shown as something to download and not as the markdown", () => {
  const m = messageOf(
    item("replied", {
      body: "The failing input.\n[orders (final).csv](https://passalong.dev/v1/attachments/abc123xyz)\n[log.txt](http://localhost:3001/v1/attachments/def456uvw)",
      by: by({ you: true }),
    }),
  );
  assert.equal(m.text, "The failing input.", "the lines that carry the files are not in the words");
  assert.deepEqual(
    m.files,
    [
      { name: "orders (final).csv", url: "/v1/attachments/abc123xyz" },
      { name: "log.txt", url: "/v1/attachments/def456uvw" },
    ],
    "a path with no origin, so whichever origin the reader is on serves it",
  );
  assert.equal(m.pictures, false);
  // A file alone is a message too.
  const only = messageOf(
    item("replied", {
      body: "[a.pdf](https://x.dev/v1/attachments/abc123xyz)",
      by: by({ you: true }),
    }),
  );
  assert.equal(only.text, "");
  assert.equal(only.files.length, 1);
});

test("only our own attachment path is a file, anything else stays text", () => {
  const files = (body) => messageOf(item("replied", { body, by: by({ you: true }) })).files;
  assert.deepEqual(files("[x](https://evil.example/payload.exe)"), []);
  assert.deepEqual(
    files("see [x](https://passalong.dev/v1/attachments/abc123xyz) inline"),
    [],
    "a link in a sentence is a link, not an attachment",
  );
  assert.equal(
    composeReply("see this", [
      { kind: "file", name: "a (1).pdf", url: "https://p.dev/v1/attachments/abc123xyz" },
    ]).body,
    "see this\n[a 1.pdf](https://p.dev/v1/attachments/abc123xyz)",
  );
});
