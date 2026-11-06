// Notices sent a burst at a time (2026-11-06): twelve pieces of work shared at once were twelve
// cards in a team's Google Chat and twelve buzzes on a phone. Pushes and channel posts are queued
// (0077_notice_outbox.sql) and a once-a-minute tick sends each person's, and each team's, as one.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { announce, flushNotices, MAX_WAIT_MS, notify, pushBatch, QUIET_MS } from "../src/notify.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const SLACK = "https://hooks.slack.com/services/T0/B0/x";
const CHAT = "https://chat.googleapis.com/v1/spaces/A/messages?key=k&token=t";

/** The outbox and a team's channels, in SQLite, behind D1's shape. */
function d1() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(read("../migrations/0077_notice_outbox.sql"));
  sql.exec(`CREATE TABLE team_channel (id TEXT, team_id TEXT, url TEXT, failures INTEGER DEFAULT 0,
            last_error TEXT DEFAULT '', created TEXT DEFAULT '')`);
  return {
    raw: sql,
    prepare(q) {
      const stmt = sql.prepare(q);
      const bound = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
  };
}

/** Put a notice in the outbox as if it had been queued `ago` ms before `now`. */
const put = (db, channel, dest, body, at) =>
  db.raw
    .prepare("INSERT INTO notice_outbox (channel, dest, at, body) VALUES (?, ?, ?, ?)")
    .run(channel, dest, new Date(at).toISOString(), JSON.stringify(body));
const left = (db) => db.raw.prepare("SELECT COUNT(*) AS n FROM notice_outbox").get().n;

const NOW = Date.parse("2026-11-06T12:00:00Z");

test("a person's burst of pushes goes as one, once it has gone quiet", async () => {
  const db = d1();
  put(
    db,
    "push",
    "ada",
    { text: 'Bo sent you "Fix the invoice email"', work: "w1", kind: "sent_to_you" },
    NOW - 20_000,
  );
  put(
    db,
    "push",
    "ada",
    { text: 'Cy finished "Deal timer"', work: "w2", kind: "task_finished" },
    NOW - 10_000,
  );
  const sent = [];
  const push = async (to, m) => sent.push({ to, m });

  await flushNotices({ DB: db }, push, NOW);
  assert.equal(sent.length, 0, "the last came 10s ago: more may follow");

  await flushNotices({ DB: db }, push, NOW + QUIET_MS);
  assert.equal(sent.length, 1, "one push for the burst");
  assert.equal(sent[0].to, "ada");
  assert.equal(sent[0].m.text, 'Bo sent you "Fix the invoice email"\nCy finished "Deal timer"');
  assert.equal(sent[0].m.work, "", "about two pieces of work, so it opens the hub");
  assert.equal(sent[0].m.kind, "batch");
  assert.equal(left(db), 0, "and nothing is sent twice");
});

test("one push alone goes as it always read; a steady stream is not held past three minutes", async () => {
  const db = d1();
  const alone = { text: 'Bo sent you "Fix it"', work: "w1", kind: "sent_to_you" };
  put(db, "push", "ada", alone, NOW - QUIET_MS - 1000);
  put(db, "push", "bo", { text: "first", work: "w1", kind: "asked" }, NOW - MAX_WAIT_MS - 1000);
  put(db, "push", "bo", { text: "latest", work: "w1", kind: "asked" }, NOW - 1000);
  const sent = [];
  await flushNotices({ DB: db }, async (to, m) => sent.push({ to, m }), NOW);
  assert.deepEqual(sent.find((s) => s.to === "ada").m, alone);
  const bo = sent.find((s) => s.to === "bo");
  assert.ok(bo, "waited three minutes, so it goes though more keep coming");
  assert.equal(bo.m.work, "w1", "all about one piece of work: the push opens it");
  assert.equal(bo.m.kind, "asked");
});

test("a batch push names three, says how many more, and is urgent if any one was", () => {
  const m = pushBatch([
    { text: "a", work: "1", kind: "sent_to_you" },
    { text: "b", work: "2", kind: "blocked" },
    { text: "c", work: "3", kind: "stalled" },
    { text: "d", work: "4", kind: "stalled" },
    { text: "a", work: "1", kind: "sent_to_you" },
  ]);
  assert.equal(m.text, "b\nc\nd\nand 1 more", "the same one twice is said once, as the latest");
  assert.equal(m.urgent, true);
});

test("a push that fails is logged, not retried, and never stops the rest", async () => {
  const db = d1();
  put(db, "push", "ada", { text: "x", work: "", kind: "stalled" }, NOW - 60_000);
  put(db, "push", "bo", { text: "y", work: "", kind: "stalled" }, NOW - 60_000);
  const sent = [];
  const errors = console.error;
  console.error = () => {};
  try {
    await flushNotices(
      { DB: db },
      async (to) => {
        if (to === "ada") throw new Error("push service down");
        sent.push(to);
      },
      NOW,
    );
  } finally {
    console.error = errors;
  }
  assert.deepEqual(sent, ["bo"]);
  assert.equal(left(db), 0);
});

test("a team's burst is one post per channel: a list with links, or one Chat card", async () => {
  const db = d1();
  db.raw
    .prepare("INSERT INTO team_channel (id, team_id, url) VALUES ('s', 't1', ?), ('c', 't1', ?)")
    .run(SLACK, CHAT);
  const env = { DB: db };
  for (const [i, title] of ["Deal timer", "Coupon dates", "Popup dates"].entries())
    await announce(env, {
      kind: "shared",
      team_id: "t1",
      text: `Ada shared "${title}" with Khaime`,
      title,
      url: `https://passalong.dev/w/w${i}/key`,
    });
  assert.equal(left(db), 3, "queued, not posted");

  const posts = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    posts.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  };
  try {
    await flushNotices(env, async () => {}, Date.now() + QUIET_MS + 1000);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(posts.length, 2, "one message per channel, not three");
  const slack = posts.find((p) => p.url === SLACK).body;
  assert.match(
    slack.text,
    /^3 updates from Passalong:\n• Ada shared "Deal timer" with Khaime https:\/\/passalong\.dev\/w\/w0\/key\n/,
  );
  const chat = posts.find((p) => p.url === CHAT).body;
  assert.doesNotMatch(chat.text, /https:/, "the card carries the links");
  const card = chat.cardsV2[0].card;
  assert.deepEqual(Object.keys(card).sort(), ["header", "sections"]);
  assert.equal(card.header.title, "3 updates");
  const widgets = card.sections[0].widgets;
  assert.equal(widgets.length, 3);
  for (const w of widgets) assert.deepEqual(Object.keys(w), ["textParagraph"]);
  assert.match(
    widgets[2].textParagraph.text,
    /Popup dates.*<a href="https:\/\/passalong\.dev\/w\/w2\/key">Open it<\/a>/,
  );
});

test("notify queues the push rather than sending it", () => {
  const src = read("../src/notify.ts");
  const hook = src.slice(src.indexOf("if (row && PUSHED.has(e.kind))"));
  assert.match(hook.slice(0, 900), /await queue\(env, "push", e\.to,/);
  assert.match(hook.slice(0, 900), /\.catch\(/, "a push never fails the action that caused it");
  assert.equal(typeof notify, "function");
});

test("the queue is sent every minute, and the hourly sweeps don't run every minute", () => {
  const wrangler = read("../../web/wrangler.jsonc");
  assert.match(wrangler, /"crons": \["17 \* \* \* \*", "\* \* \* \* \*"\]/);
  const notices = read("../../web/server/plugins/notices.ts");
  assert.match(notices, /export const EVERY_MINUTE = "\* \* \* \* \*"/);
  assert.match(notices, /if \(payload\?\.controller\?\.cron !== EVERY_MINUTE\) return;/);
  const sweep = read("../../web/server/plugins/sweep.ts");
  assert.match(sweep, /if \(payload\?\.controller\?\.cron === EVERY_MINUTE\) return;/);
  const index = read("../src/index.ts");
  assert.match(index, /flushOutbox\(env, \(to, m\) => deliverPush\(env, to, m\), now\)/);
  assert.match(index, /urgency: m\.urgent \|\| m\.kind === "blocked" \? "high" : "normal"/);
});
