// The admin hub's campaigns (admin-hub CONTRACT.md, "Campaigns"), against a real SQLite with every
// migration: product news written in the hub, sent by this app to its own audience from a queue.
//
// What must hold: the audience is the one /admin sends to, never a suspended or deleted account;
// a send is refused when the audience moved since the operator looked; it is fixed when asked for,
// so nobody who signs up later is sent it and anybody who says no before their turn is not; and
// the hub's routes are signed or read-secret routes like the rest of the hub.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  audience,
  campaign,
  campaignAudience,
  campaigns,
  claim,
  createAnnouncement,
  dequeue,
  markSent,
  nextRecipients,
  queued,
  sendCampaign,
  setNewsMail,
  startSending,
} from "../src/announcements.ts";
import { firstName, prose } from "../src/mail-html.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");
const SRC = (f) => readFileSync(join(HERE, "..", "src", f), "utf8");
const AT = "2026-11-13T09:00:00.000Z";
const OP = "ife@example.com";

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
      `INSERT INTO account (id, token_hash, created, email, email_verified, news_mail_off, suspended_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `h-${id}`,
      o.created ?? AT,
      o.email ?? `${id}@example.com`,
      o.verified ?? AT,
      o.off ?? "",
      o.suspended ?? "",
      o.deleted ?? "",
    );
}

/** Everyone the contract says is left out, one reason each, and two who are reached. */
function everyone(db) {
  person(db, "ada");
  person(db, "ann", { created: "2026-11-13T09:00:01.000Z" });
  person(db, "bo", { verified: "" });
  person(db, "cy", { email: "", verified: "" });
  person(db, "di", { off: AT });
  person(db, "ev", { suspended: AT });
  person(db, "gi", { suspended: AT, off: AT });
  // Deleted, with its email left in place on purpose: the rule must not lean on it being emptied.
  person(db, "fy", { deleted: AT });
}

const one = (db, q, ...a) => db.raw.prepare(q).get(...a);
const ids = (rows) => rows.map((r) => r.id);
const ask = (o = {}) => ({ subject: "What's new", markdown: "Hello **all**", expected: 2, ...o });

/** What the cron does with a batch (sendCampaigns in index.ts), with the mailer answering `ok`. */
async function tick(db, ok = () => true) {
  const went = [];
  for (const to of await queued(db)) {
    if (await claim(db, to.announcement, to.id, AT)) {
      await markSent(db, to.announcement, to.id, ok(to));
      went.push(to.id);
    }
    await dequeue(db, to.announcement, to.id);
  }
  return went;
}

test("the audience is verified, consenting, not suspended and not deleted; the rest are counted by why", async () => {
  const db = d1();
  everyone(db);
  assert.deepEqual(await campaignAudience(db), {
    reachable: 2,
    // Suspended wins over opted out, so each account is counted once; no address is unproven.
    excluded: { no_consent: 1, unverified: 2, suspended: 2 },
  });
  // /admin's own send reaches the same people, so a deleted account is out of that too.
  assert.equal(await audience(db), 2);
  await createAnnouncement(db, { id: "n1", subject: "s", body: "b", by: "op", at: AT });
  assert.deepEqual(ids(await nextRecipients(db, "n1")), ["ada", "ann"]);
});

test("subject and body limits are a 400, as is a missing expected count", async () => {
  const db = d1();
  everyone(db);
  const no = async (o) => (await sendCampaign(db, ask(o), { id: "c1", by: OP, at: AT })).status;
  assert.equal(await no({ subject: " " }), 400);
  assert.equal(await no({ subject: "x".repeat(151) }), 400);
  assert.equal(await no({ markdown: "" }), 400);
  assert.equal(await no({ markdown: "x".repeat(20_001) }), 400);
  assert.equal(await no({ expected: undefined }), 400);
  assert.equal(await no({ expected: "2" }), 400);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM announcement").n, 0);
  // Exactly at the limits is fine.
  const ok = await sendCampaign(
    db,
    ask({ subject: "x".repeat(150), markdown: "y".repeat(20_000) }),
    { id: "c1", by: OP, at: AT },
  );
  assert.equal(ok.ok, true);
});

test("an audience that moved since the operator looked is a 409 saying the new number", async () => {
  const db = d1();
  everyone(db);
  const r = await sendCampaign(db, ask({ expected: 3 }), { id: "c1", by: OP, at: AT });
  assert.deepEqual(r, { error: "The audience is now 2, not 3.", status: 409 });
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM announcement").n, 0);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM announcement_queue").n, 0);
});

test("a send records the announcement under the operator's email and queues exactly its audience", async () => {
  const db = d1();
  everyone(db);
  const r = await sendCampaign(db, ask(), { id: "c1", by: OP, at: AT });
  assert.deepEqual(r, {
    ok: true,
    campaign: {
      id: "c1",
      subject: "What's new",
      status: "sending",
      recipients: 2,
      sent: 0,
      failed: 0,
      created_at: AT,
      by: OP,
    },
  });
  const row = one(db, "SELECT * FROM announcement WHERE id = 'c1'");
  assert.equal(row.body, "Hello **all**");
  assert.equal(row.created_by, OP);
  assert.equal(row.started_by, OP);
  assert.equal(row.started, AT);
  assert.deepEqual(
    db.raw
      .prepare("SELECT account_id FROM announcement_queue ORDER BY account_id")
      .all()
      .map((q) => q.account_id),
    ["ada", "ann"],
  );
});

test("the queue is fixed when asked for: later sign-ups never get it, and saying no first still holds", async () => {
  const db = d1();
  everyone(db);
  await sendCampaign(db, ask(), { id: "c1", by: OP, at: AT });
  person(db, "new");
  await setNewsMail(db, "ann", false, AT);
  assert.deepEqual(await tick(db), ["ada"]);
  assert.deepEqual(await campaign(db, "c1"), {
    id: "c1",
    subject: "What's new",
    status: "done",
    recipients: 1,
    sent: 1,
    failed: 0,
    created_at: AT,
    by: OP,
  });
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM announcement_queue").n, 0);
});

test("batches of forty, a refused mail counts as failed, and nobody is mailed twice", async () => {
  const db = d1();
  for (let i = 0; i < 45; i++)
    person(db, `p${String(i).padStart(2, "0")}`, {
      created: `2026-11-13T09:00:${String(i).padStart(2, "0")}Z`,
    });
  await sendCampaign(db, ask({ expected: 45 }), { id: "c1", by: OP, at: AT });
  // /admin's page-driven send got to one of them first: theirs is the copy they get.
  await claim(db, "c1", "p44", AT);
  await markSent(db, "c1", "p44", true);
  assert.equal((await tick(db, (to) => to.id !== "p00")).length, 40);
  assert.equal((await campaign(db, "c1")).status, "sending");
  assert.deepEqual(await tick(db), ["p40", "p41", "p42", "p43"]);
  const c = await campaign(db, "c1");
  assert.deepEqual([c.status, c.recipients, c.sent, c.failed], ["done", 45, 44, 1]);
  assert.deepEqual(await tick(db), []);
});

test("the list is started announcements, newest first, at most twenty; an /admin send says its operator's email", async () => {
  const db = d1();
  everyone(db);
  person(db, "op", { email: "boss@example.com" });
  // A draft in /admin is no campaign; a started one is, with no queue, so it is done.
  await createAnnouncement(db, { id: "draft", subject: "d", body: "b", by: "op", at: AT });
  await createAnnouncement(db, { id: "old", subject: "o", body: "b", by: "op", at: AT });
  await startSending(db, "old", "op", "2026-11-01T00:00:00.000Z");
  for (let i = 0; i < 21; i++)
    await sendCampaign(db, ask({ expected: await audience(db) }), {
      id: `c${String(i).padStart(2, "0")}`,
      by: OP,
      at: `2026-11-13T10:${String(i).padStart(2, "0")}:00.000Z`,
    });
  const list = await campaigns(db);
  assert.equal(list.length, 20);
  assert.equal(list[0].id, "c20");
  assert.ok(!list.some((c) => c.id === "draft"));
  assert.deepEqual(Object.keys(list[0]).sort(), [
    "by",
    "created_at",
    "failed",
    "id",
    "recipients",
    "sent",
    "status",
    "subject",
  ]);
  const admin = await campaign(db, "old");
  assert.deepEqual([admin.by, admin.status, admin.recipients], ["boss@example.com", "done", 0]);
  assert.equal(await campaign(db, "draft"), null);
  assert.equal(await campaign(db, "nope"), null);
});

test("the test copy goes only to the operator and records nothing; the manifest names the sender", () => {
  const src = SRC("index.ts");
  const route = src.slice(src.indexOf('app.post("/v1/admin-hub/campaigns/test"'));
  const body = route.slice(0, route.indexOf("\n});\n"));
  assert.match(body, /sendNews\(c\.env, \{\s*to: w\.operator,/);
  for (const no of ["sendCampaign", "createAnnouncement", "claim(", "keepOffLink", "mailNews"])
    assert.ok(!body.includes(no), no);
  // Its stop links carry no token, so they cannot turn anybody's news off.
  assert.match(body, /off: `\$\{origin\(c\)\}\/news\/off`,/);
  const manifest = src.slice(src.indexOf('app.get("/v1/admin-hub", '));
  assert.match(manifest.slice(0, 600), /campaigns: \{ from \}/);
  assert.match(manifest.slice(0, 600), /if \(!c\.env\.EMAIL\) return c\.json\(MANIFEST\)/);
});

test("the body's markdown: italic joins bold and links, and raw HTML stays text", () => {
  assert.match(prose("*one* and _two_"), /<i>one<\/i> and <i>two<\/i>/);
  assert.doesNotMatch(prose("snake_case_name and a_b"), /<i>/);
  assert.doesNotMatch(prose("[x](https://a.dev/a_b_c)"), /<i>/);
  assert.match(prose("**bold** *it*"), /<b [^>]*>bold<\/b> <i>it<\/i>/);
  const html = prose('<script>alert(1)</script> <a href="x">y</a>');
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('<a href="x">'));
});

test("a rule is a line of three dashes, with or without blank lines round it; raw <hr> stays text", () => {
  const rule = /<hr style="[^"]*">/g;
  assert.equal(prose("one\n\n---\n\ntwo").match(rule).length, 1);
  assert.match(prose("one\n---\ntwo"), /<p [^>]*>one<\/p><hr [^>]*><p [^>]*>two<\/p>/);
  assert.equal(prose("***\n\n___").match(rule).length, 2);
  assert.doesNotMatch(prose("a -- b --- c"), /<hr/);
  assert.doesNotMatch(prose("<hr>"), /<hr/);
});

test("{{first_name}} is the first word of a name, or there, and a name can't become markup", () => {
  assert.equal(firstName("Ada Lovelace"), "Ada");
  assert.equal(firstName("  Ada  "), "Ada");
  for (const none of ["", "   ", null, undefined, 3]) assert.equal(firstName(none), "there");
  assert.match(prose("Hi {{first_name}}, **{{first_name}}**", "Ada"), /Hi Ada, <b [^>]*>Ada<\/b>/);
  const hostile = prose("Hi {{first_name}}", firstName("<b>x</b> y"));
  assert.ok(!hostile.includes("<b>x</b>"));
  assert.match(hostile, /Hi &lt;b&gt;x&lt;\/b&gt;/);
  // Inside a link's address it is escaped too, so it can't close the attribute.
  assert.doesNotMatch(prose("[go](https://a.dev/?n={{first_name}})", '"><i>'), /"><i>/);
  // Without a name to fill, prose leaves the placeholder for whoever fills it.
  assert.match(prose("Hi {{first_name}}"), /Hi \{\{first_name\}\}/);
});

/** One route's source, from its declaration to the end of its handler. */
const route = (src, decl) => {
  const from = src.slice(src.indexOf(decl));
  return from.slice(0, from.indexOf("\n});\n"));
};

test("the preview is a signed write that renders the recipients' mail and sends or records nothing", () => {
  const src = SRC("index.ts");
  const body = route(src, 'app.post("/v1/admin-hub/campaigns/preview"');
  // Signed first, then the same checks a send goes through, so the same 400s.
  assert.match(body, /^[^\n]*\n\s*const w = await hubWrite\(c\);/);
  assert.match(body, /campaignDraft\(w\.input\)/);
  assert.match(body, /newsMail\(c\.env, \{[^}]*name: w\.input\.first_name,/);
  assert.match(body, /off: `\$\{origin\(c\)\}\/news\/off`,/);
  assert.match(body, /return c\.json\(\{ subject: m\.subject, html: m\.html \}\)/);
  for (const no of ["sendNews", "mailNews", "sendCampaign", "c.env.DB", "keepOffLink", "track("])
    assert.ok(!body.includes(no), no);
  // The mail itself fills the subject, the inbox preview and the text half, and the HTML through prose.
  const mail = SRC("email.ts");
  const fn = mail.slice(
    mail.indexOf("export function newsMail("),
    mail.indexOf("export function sendNews("),
  );
  assert.match(fn, /const first = firstName\(o\.name\)/);
  assert.match(fn, /subject: fill\(o\.subject\)/);
  assert.match(fn, /preview: fill\(copy\.preview\)/);
  assert.match(fn, /body: \[prose\(o\.body, first\)\]/);
  assert.match(fn, /text: copy\.text\.map\(fill\)/);
});

test("each recipient is greeted by their own name; the test send by the operator's account under that email", async () => {
  const db = d1();
  everyone(db);
  db.raw.prepare("UPDATE account SET name = 'Ada Lovelace' WHERE id = 'ada'").run();
  await sendCampaign(db, ask(), { id: "c1", by: OP, at: AT });
  assert.deepEqual(
    (await queued(db)).map((q) => [q.id, q.name]),
    [
      ["ada", "Ada Lovelace"],
      ["ann", ""],
    ],
  );
  await createAnnouncement(db, { id: "n1", subject: "s", body: "b", by: "op", at: AT });
  assert.equal((await nextRecipients(db, "n1"))[0].name, "Ada Lovelace");
  const src = SRC("index.ts");
  assert.match(route(src, "async function mailNews("), /name: to\.name,/);
  const test = route(src, 'app.post("/v1/admin-hub/campaigns/test"');
  assert.match(
    test,
    /SELECT name FROM account WHERE lower\(email\) = lower\(\?\) AND deleted_at = ''/,
  );
  assert.match(test, /\.bind\(w\.operator\)/);
  assert.match(test, /name: me\?\.name,/);
});
