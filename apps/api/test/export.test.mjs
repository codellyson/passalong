// The app is not importable under type stripping, so the route is read as source and its query run
// against a database with every migration, as follow-ups.test.mjs does for its routes.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const route = index.slice(
  index.indexOf('app.get("/v1/export"'),
  index.indexOf("\n});\n", index.indexOf('app.get("/v1/export"')),
);
const SQL = route.match(/`(SELECT id, markdown FROM guide[\s\S]*?)`/)[1];
const PAGE = Number(index.match(/const EXPORT_PAGE = (\d+);/)[1]);

test("export is a backup, not a reading: it records no pull", () => {
  assert.ok(route.length > 0, "found the route");
  assert.doesNotMatch(route, /recordPull|INSERT INTO pull|pulls = pulls/);
});

test("export pages through everything the account can read, and nothing else", () => {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  const at = "2026-10-14T00:00:00Z";
  const acct = db.prepare("INSERT INTO account (id, token_hash, created) VALUES (?, ?, ?)");
  for (const id of ["me", "mate", "stranger"]) acct.run(id, `h-${id}`, at);
  db.exec(`INSERT INTO team (id, slug, name, created_by, created) VALUES ('t', 't', 'T', 'mate', '${at}');
    INSERT INTO membership (team_id, account_id, joined) VALUES ('t', 'me', '${at}'), ('t', 'mate', '${at}');`);
  const guide = db.prepare(
    `INSERT INTO guide (id, account_id, team_id, share_key, title, status, source_context, tags, stack,
                        markdown, created, updated, kind)
     VALUES (?, ?, ?, 'k', 't', 'published', '', '[]', '[]', ?, ?, ?, 'transfer')`,
  );
  const mine = [];
  for (let i = 0; i < PAGE + 5; i++) {
    const id = `m${String(i).padStart(4, "0")}`;
    guide.run(id, "me", "", `# ${id}`, at, at);
    mine.push(id);
  }
  guide.run("team0001", "mate", "t", "# team", at, at);
  guide.run("priv0001", "mate", "", "# private", at, at);
  guide.run("strg0001", "stranger", "", "# stranger", at, at);

  const page = (after) => {
    const rows = db.prepare(SQL).all("me", after, PAGE);
    return { rows, next: rows.length === PAGE ? rows.at(-1).id : "" };
  };
  const seen = [];
  let after = "";
  do {
    const p = page(after);
    seen.push(...p.rows.map((r) => r.id));
    after = p.next;
  } while (after);
  assert.deepEqual(seen.sort(), [...mine, "team0001"].sort());
  assert.equal(new Set(seen).size, seen.length, "no guide twice across pages");
});
