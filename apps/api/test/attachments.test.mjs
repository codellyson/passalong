// Files that are not pictures: what is kept, how it is told apart, who owns it, and how it is served.
//
// A shot is served to be drawn and a file to be saved, so the danger runs the other way: not what a
// page fetches but what a file could do on our origin if anything ever opened it. Most of what is
// pinned here is that the bytes decide what a file is, never what the sender called it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ATTACH_TYPES,
  attachmentIds,
  attachmentKey,
  holdAttachments,
  safeName,
  sniffAttachment,
  sweepAttachments,
} from "../src/attachments.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const T0 = "2026-09-21T10:00:00.000Z";
const bytes = (...b) => new Uint8Array(b);
const text = (s) => new TextEncoder().encode(s);

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
    async batch(stmts) {
      sql.exec("BEGIN");
      try {
        const out = [];
        for (const st of stmts) out.push(await st.run());
        sql.exec("COMMIT");
        return out;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function seed(db) {
  const acct = db.raw.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)");
  for (const id of ["me", "them"]) acct.run(id, `hash-${id}`, T0);
  db.raw
    .prepare(
      `INSERT INTO guide (id, account_id, share_key, title, status, source_context, tags, stack,
                          markdown, created, updated, kind, target)
       VALUES ('g1', 'me', 'k', 'A task', 'published', '', '[]', '[]', '', ?, ?, 'task', 'o/r')`,
    )
    .run(T0, T0);
  return (id, account, guide = "", created = T0) =>
    db.raw
      .prepare(
        "INSERT INTO attachment (id, account_id, guide_id, name, type, created) VALUES (?, ?, ?, 'a.pdf', 'application/pdf', ?)",
      )
      .run(id, account, guide, created);
}

test("the bytes decide what a file is, and the sender's word does not", () => {
  const pdf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
  assert.equal(sniffAttachment(pdf), "application/pdf");
  assert.equal(
    sniffAttachment(pdf, "text/html", "evil.html"),
    "application/pdf",
    "named something else",
  );
  assert.equal(sniffAttachment(bytes(0x50, 0x4b, 0x03, 0x04, 0, 0)), "application/zip");
  // A Windows executable, however it is labelled, is not on the list.
  const exe = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00);
  assert.equal(sniffAttachment(exe, "application/pdf", "report.pdf"), null);
  assert.equal(sniffAttachment(bytes(0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0)), null, "an ELF binary");
  assert.equal(sniffAttachment(new Uint8Array()), null, "nothing");
});

test("text is text only when it is valid text, and is filed as the kind it says it is", () => {
  assert.equal(sniffAttachment(text("a,b\n1,2\n"), "text/csv", "x.csv"), "text/csv");
  assert.equal(
    sniffAttachment(text("a,b\n1,2\n"), "application/octet-stream", "x.csv"),
    "text/csv",
    "by name",
  );
  assert.equal(sniffAttachment(text('{"a":1}'), "application/json"), "application/json");
  assert.equal(sniffAttachment(text("# hi"), "text/markdown"), "text/markdown");
  assert.equal(
    sniffAttachment(text("2026-10-01 ERROR boom"), "text/x-log", "run.log"),
    "text/plain",
  );
  // Markup is kept as text, never as what it looks like: it is downloaded and never drawn.
  assert.equal(
    sniffAttachment(text("<svg onload=alert(1)/>"), "image/svg+xml", "x.svg"),
    "text/plain",
  );
  assert.equal(sniffAttachment(text("<script>1</script>"), "text/html", "x.html"), "text/plain");
  // A NUL, or bytes that are not UTF-8, is a binary posing as a log.
  assert.equal(sniffAttachment(bytes(0x68, 0x69, 0x00, 0x21), "text/plain", "x.txt"), null);
  assert.equal(sniffAttachment(bytes(0xff, 0xfe, 0xfa, 0x80, 0x81), "text/plain", "x.txt"), null);
  for (const type of ["text/plain", "text/csv", "text/markdown", "application/json"])
    assert.ok(ATTACH_TYPES[type], `${type} is stored`);
  assert.equal(ATTACH_TYPES["text/html"], undefined, "html is never a stored type");
  assert.equal(ATTACH_TYPES["image/svg+xml"], undefined);
});

test("a name is safe to put in a header and never empty", () => {
  assert.equal(safeName("report.pdf"), "report.pdf");
  assert.equal(safeName("../../etc/passwd"), "etcpasswd");
  assert.equal(safeName('a"b\r\nSet-Cookie: x=1.txt'), "abSet-Cookie x=1.txt".replace(":", ""));
  assert.equal(safeName("shot [1] (final).pdf"), "shot 1 final.pdf");
  assert.equal(safeName(".hidden"), "hidden");
  assert.equal(safeName("", "application/pdf"), "file.pdf");
  assert.equal(safeName("x".repeat(500)).length, 120);
  assert.ok(!/[\r\n"\\/]/.test(safeName('a"\r\n\\/b')));
});

test("the ids a document points at, from the path wherever it appears", () => {
  assert.deepEqual(
    attachmentIds(
      "see [a.pdf](https://passalong.dev/v1/attachments/abc123xyz) and /v1/attachments/def456uvw, again /v1/attachments/abc123xyz",
    ),
    ["abc123xyz", "def456uvw"],
  );
  assert.deepEqual(
    attachmentIds("![shot](https://passalong.dev/v1/shots/abc123xyz)"),
    [],
    "a shot is not a file",
  );
  assert.equal(
    attachmentKey("abc", "application/pdf"),
    "files/abc.pdf",
    "its own prefix, never a shot's key",
  );
});

test("only the uploader claims a file, and an edit that drops it lets it go", async () => {
  const db = d1();
  const add = seed(db);
  add("aaa111", "me");
  add("bbb222", "them");
  await holdAttachments(db, {
    account: "me",
    guide: "g1",
    mine: ["aaa111", "bbb222"],
    carried: ["aaa111", "bbb222"],
  });
  const owner = (id) =>
    db.raw.prepare("SELECT guide_id FROM attachment WHERE id = ?").get(id).guide_id;
  assert.equal(owner("aaa111"), "g1");
  assert.equal(
    owner("bbb222"),
    "",
    "naming somebody else's id takes nothing: the account is in the WHERE",
  );
  // The guide stops pointing at it from anywhere: it is let go, and not deleted by a write.
  await holdAttachments(db, { account: "me", guide: "g1", mine: [], carried: [] });
  assert.equal(owner("aaa111"), "");
  // Pointed at from elsewhere on the same guide, it is kept.
  await holdAttachments(db, { account: "me", guide: "g1", mine: ["aaa111"], carried: ["aaa111"] });
  await holdAttachments(db, { account: "me", guide: "g1", mine: [], carried: ["aaa111"] });
  assert.equal(owner("aaa111"), "g1");
});

test("the sweep takes files nothing claimed, and only those, and stops if the bucket refuses", async () => {
  const db = d1();
  const add = seed(db);
  add("old111", "me", "", "2026-09-20T10:00:00.000Z");
  add("new111", "me", "", new Date().toISOString());
  add("kept11", "me", "g1", "2026-09-20T10:00:00.000Z");
  const gone = [];
  const ok = { delete: async (keys) => gone.push(...keys) };
  assert.deepEqual(await sweepAttachments({ DB: db, SHOTS: ok }), { swept: 1, deferred: 0 });
  assert.deepEqual(gone, ["files/old111.pdf"]);
  const left = db.raw
    .prepare("SELECT id FROM attachment ORDER BY id")
    .all()
    .map((r) => r.id);
  assert.deepEqual(left, ["kept11", "new111"], "claimed and recent are untouched");

  add("old222", "me", "", "2026-09-20T10:00:00.000Z");
  const refusing = {
    delete: async () => {
      throw new Error("bucket down");
    },
  };
  assert.deepEqual(await sweepAttachments({ DB: db, SHOTS: refusing }), { swept: 0, deferred: 1 });
  assert.ok(
    db.raw.prepare("SELECT 1 FROM attachment WHERE id = 'old222'").get(),
    "the row stays so tomorrow retries",
  );
});

test("a file is a download that needs a credential, never a page", async () => {
  // Pinned in the source because the Hono app is not importable from a test (see hosts.ts). What
  // matters is the rule: nothing here may be opened on our origin or read without a credential.
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const at = src.indexOf('app.get("/v1/attachments/:id"');
  assert.ok(at > 0);
  const route = src.slice(at, src.indexOf("\napp.", at + 10));
  assert.match(route, /content-disposition": `attachment;/);
  assert.match(route, /x-content-type-options": "nosniff"/);
  assert.match(route, /content-security-policy": "default-src 'none'; sandbox"/);
  assert.match(route, /private, no-store/);
  assert.match(
    route,
    /readableGuide\(c, row\.guide_id\)/,
    "read by whoever can read the guide it is on",
  );
  assert.match(route, /return c\.notFound\(\)/, "told it does not exist, not that it is forbidden");
  // Unlike a screenshot it is not public: a picture is evidence in a document that travels by link.
  assert.doesNotMatch(src, /publicShot[\s\S]{0,200}attachments/);
  assert.doesNotMatch(src, /const PUBLIC[\s\S]{0,400}\/v1\/attachments/);
  // Uploading sniffs the bytes and refuses what it does not keep.
  const up = src.slice(src.indexOf('app.post("/v1/attachments"'), at);
  assert.match(up, /sniffAttachment\(/);
  assert.match(up, /err\(\s*c,\s*415/);
});
