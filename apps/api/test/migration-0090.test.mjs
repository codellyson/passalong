// 0090 revokes every public link to work: nobody chose to make it public (2026-11-22).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const DIR = new URL("../migrations/", import.meta.url).pathname;
const T = "2026-11-22T10:00:00.000Z";

test("0090 clears every work key and points each document's url: at its hub page", () => {
  const sql = new DatabaseSync(":memory:");
  const files = readdirSync(DIR).sort();
  const at = files.findIndex((f) => f.startsWith("0090_"));
  for (const f of files.slice(0, at)) sql.exec(readFileSync(join(DIR, f), "utf8"));

  const md = (id, key) =>
    `---\nid: ${id}\nurl: https://passalong.dev/w/${id}/${key}\n---\n\nBody.\n`;
  sql.exec(`INSERT INTO account (id, token_hash, created) VALUES ('me', 'h1', '${T}')`);
  const put = sql.prepare(
    "INSERT INTO work (id, account_id, share_key, title, status, markdown, created, updated) VALUES (?, 'me', ?, 't', 'ready', ?, ?, ?)",
  );
  put.run("w1", "abcdefghijklmnopqrstuv", md("w1", "abcdefghijklmnopqrstuv"), T, T);
  put.run("w2", "", "---\nid: w2\n---\n", T, T);
  sql.exec(readFileSync(join(DIR, files[at]), "utf8"));

  const rows = sql.prepare("SELECT id, share_key, markdown FROM work ORDER BY id").all();
  assert.deepEqual(
    rows.map((r) => r.share_key),
    ["", ""],
  );
  assert.equal(
    rows[0].markdown,
    "---\nid: w1\nurl: https://passalong.dev/hub/w/w1\n---\n\nBody.\n",
  );
  assert.equal(rows[1].markdown, "---\nid: w2\n---\n");
});
