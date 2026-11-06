// Product news by email (2026-11-06): written in /admin, sent in batches to every account with a
// proven address that has not said no, with a stop link in every mail and in its headers.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  announcement,
  announcements,
  audience,
  claim,
  createAnnouncement,
  deleteAnnouncement,
  draft,
  keepOffLink,
  left,
  markSent,
  nextRecipients,
  setNewsMail,
  startSending,
  turnOffByLink,
  updateAnnouncement,
} from "../src/announcements.ts";
import { newsCopy } from "../src/mail-copy.ts";
import { prose } from "../src/mail-html.ts";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "..", "migrations");
const read = (p) => readFileSync(join(here, p), "utf8");
const AT = "2026-11-06T10:00:00.000Z";

function d1() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).sort())
    sql.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
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

function person(db, id, o = {}) {
  db.raw
    .prepare(
      "INSERT INTO account (id, token_hash, created, email, email_verified, news_mail_off) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      `h-${id}`,
      o.created ?? AT,
      o.email ?? `${id}@example.com`,
      o.verified ?? AT,
      o.off ?? "",
    );
}

async function withNews(db) {
  await createAnnouncement(db, { id: "n1", subject: "New", body: "Hello", by: "op", at: AT });
}

test("only a proven address that hasn't said no is sent news", async () => {
  const db = d1();
  person(db, "ada");
  person(db, "bo", { verified: "" });
  person(db, "cy", { email: "", verified: "" });
  person(db, "di", { off: AT });
  assert.equal(await audience(db), 1);
  await withNews(db);
  assert.deepEqual(
    (await nextRecipients(db, "n1")).map((r) => r.id),
    ["ada"],
  );
});

test("a recipient is claimed once, so overlapping batches never send twice", async () => {
  const db = d1();
  person(db, "ada");
  person(db, "bo");
  await withNews(db);
  assert.equal(await left(db, "n1"), 2);
  assert.equal(await claim(db, "n1", "ada", AT), true);
  assert.equal(await claim(db, "n1", "ada", AT), false, "a second batch skips them");
  await markSent(db, "n1", "ada", true);
  assert.deepEqual(
    (await nextRecipients(db, "n1")).map((r) => r.id),
    ["bo"],
  );
  assert.equal(await left(db, "n1"), 1);
  const [row] = await announcements(db);
  assert.equal(row.sent, 1);
  assert.equal(row.failed, 0);
});

test("batches are capped, and a send carries on where it stopped", async () => {
  const db = d1();
  for (let i = 0; i < 5; i++) person(db, `p${i}`, { created: `2026-11-0${i + 1}T00:00:00.000Z` });
  await withNews(db);
  const first = await nextRecipients(db, "n1", 2);
  assert.deepEqual(
    first.map((r) => r.id),
    ["p0", "p1"],
  );
  for (const r of first) await claim(db, "n1", r.id, AT);
  assert.deepEqual(
    (await nextRecipients(db, "n1", 2)).map((r) => r.id),
    ["p2", "p3"],
  );
});

test("a draft can change until the send starts; after that it is the record", async () => {
  const db = d1();
  await withNews(db);
  assert.deepEqual(await updateAnnouncement(db, "n1", { subject: "Newer", body: "Hi" }), {
    ok: true,
  });
  await startSending(db, "n1", "op", AT);
  assert.equal((await announcement(db, "n1")).started, AT);
  assert.equal((await updateAnnouncement(db, "n1", { subject: "x", body: "y" })).status, 409);
  assert.equal((await deleteAnnouncement(db, "n1")).status, 409);
  assert.equal((await updateAnnouncement(db, "gone", { subject: "x", body: "y" })).status, 404);
  assert.equal((await announcement(db, "n1")).subject, "Newer");
});

test("a stop link turns news off, works twice, and Settings can turn it back on", async () => {
  const db = d1();
  person(db, "ada");
  await keepOffLink(db, "hash-1", "ada", AT);
  assert.equal(await turnOffByLink(db, "hash-1", AT), true);
  assert.equal(await turnOffByLink(db, "hash-1", "2026-12-01T00:00:00.000Z"), true);
  assert.equal(await turnOffByLink(db, "nope", AT), false);
  const off = () => db.raw.prepare("SELECT news_mail_off FROM account WHERE id = 'ada'").get();
  assert.equal(off().news_mail_off, AT, "the first time they said no is kept");
  assert.equal(await audience(db), 0);
  await setNewsMail(db, "ada", true, AT);
  assert.equal(off().news_mail_off, "");
  assert.equal(await audience(db), 1);
});

test("the form is checked before anything is saved", () => {
  assert.equal(draft({ subject: " ", body: "x" }).status, 400);
  assert.equal(draft({ subject: "x", body: "" }).status, 400);
  assert.equal(draft({ subject: "x".repeat(151), body: "y" }).status, 400);
  assert.deepEqual(draft({ subject: "  What's\n new ", body: "a\r\nb\n" }), {
    subject: "What's new",
    body: "a\nb",
  });
});

test("the mail's markdown is escaped first, and only http(s) becomes a link", () => {
  const html = prose(
    "## New <b>things</b>\n\n- one `code`\n- **two**\n\nSee [docs](https://passalong.dev/docs) " +
      'and [bad](javascript:alert(1)) and <img src=x onerror="1">',
  );
  assert.match(html, /<h2[^>]*>New &lt;b&gt;things&lt;\/b&gt;<\/h2>/);
  assert.match(
    html,
    /<ul[^>]*><li[^>]*>one <code[^>]*>code<\/code><\/li><li[^>]*><b[^>]*>two<\/b><\/li><\/ul>/,
  );
  assert.match(html, /<a href="https:\/\/passalong\.dev\/docs"[^>]*>docs<\/a>/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.doesNotMatch(html, /<img/);
  // A heading straight over its list, with no blank line between, is still a heading and a list.
  assert.match(prose("## Plans\n- Free\n- Solo"), /<\/h2><ul/);
});

test("the text half ends with why it came and how to stop it", () => {
  const copy = newsCopy({
    subject: "What's new",
    body: "First paragraph [here](https://x.dev).\n\n## More\n- a",
    off: "https://passalong.dev/news/off#t=abc",
    settings: "https://passalong.dev/hub/settings#news",
  });
  const text = copy.text.join("\n");
  assert.equal(copy.preview, "First paragraph here (https://x.dev).");
  assert.match(text, /Stop product news: https:\/\/passalong\.dev\/news\/off#t=abc/);
  assert.match(text, /Or turn it off in Settings: https:\/\/passalong\.dev\/hub\/settings#news/);
  assert.match(text, /Mail about your work is separate/);
});

test("every mail carries one-click unsubscribe headers, a reply-to, and is admin-only to send", () => {
  const email = read("../src/email.ts");
  const index = read("../src/index.ts");
  assert.match(email, /"List-Unsubscribe": `<\$\{o\.oneClick\}>`/);
  assert.match(email, /"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/);
  assert.match(email, /o\.oneClick\.startsWith\("https:\/\/"\)/);
  assert.match(index, /const NEWS_REPLY_TO = "support@passalong\.dev"/);
  assert.match(index, /"POST \/v1\/news\/off",/);
  assert.match(index, /off: `\$\{origin\(c\)\}\/news\/off#t=\$\{token\}`/);
  for (const route of [
    'app.get("/v1/admin/announcements"',
    'app.post("/v1/admin/announcements"',
    'app.post("/v1/admin/announcements/:id/send"',
    'app.post("/v1/admin/announcements/:id/test"',
  ]) {
    const at = index.indexOf(route);
    assert.ok(at > 0, route);
    assert.match(index.slice(at, at + 200), /operator\(c\)/, `${route} is for admins only`);
  }
});
