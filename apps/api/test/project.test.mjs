// A project's work and history, against a real SQLite with every migration: the rows are the SQL,
// so this runs the SQL. Same small D1 stand-in as needs.test.mjs.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { docChange, projectView, seeAllDocuments, seeDocument, viaOf } from "../src/project.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

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

const NOW = "2026-10-29T09:00:00.000Z";
const ago = (h) => new Date(Date.parse(NOW) - h * 3600e3).toISOString();
const later = new Date(Date.parse(NOW) + 3600e3).toISOString();

function world() {
  const db = d1();
  const x = (s) => db.raw.exec(s);
  x(`INSERT INTO account (id, token_hash, created, name, handle) VALUES
       ('ada', 'h1', '${ago(500)}', 'Ada', 'ada'), ('bo', 'h2', '${ago(500)}', '', 'bo');
     INSERT INTO team (id, slug, name, created_by, created) VALUES ('t', 'acme', 'Acme', 'ada', '${ago(500)}');
     INSERT INTO membership (team_id, account_id, joined) VALUES ('t', 'ada', '${ago(500)}'), ('t', 'bo', '${ago(500)}');
     INSERT INTO team_group (id, team_id, slug, name, created) VALUES ('gw', 't', 'web', 'Web', '${ago(500)}');
     INSERT INTO folder (id, created_by, team_id, title, created, updated) VALUES
       ('p', 'ada', 't', 'Billing', '${ago(400)}', '${ago(1)}'),
       ('sub', 'ada', 't', 'Invoices', '${ago(400)}', '${ago(1)}'),
       ('other', 'ada', 't', 'Website', '${ago(400)}', '${ago(1)}');
     UPDATE folder SET parent_id = 'p' WHERE id = 'sub';`);
  const guide = (id, folder, o = {}) => {
    db.raw
      .prepare(
        `INSERT INTO guide (id, account_id, share_key, title, status, markdown, created, updated, team_id,
                            to_account_id, to_group_id, outcome, summary)
         VALUES (?, 'ada', 'k', ?, ?, '', ?, ?, 't', ?, ?, ?, '')`,
      )
      .run(
        id,
        `work ${id}`,
        o.status ?? "published",
        o.created ?? ago(10),
        o.updated ?? ago(10),
        o.to ?? "",
        o.group ?? "",
        o.outcome ?? "",
      );
    db.raw
      .prepare(
        "INSERT INTO folder_guide (folder_id, guide_id, added_by, added) VALUES (?, ?, 'ada', ?)",
      )
      .run(folder, id, ago(10));
  };
  const ev = (guideId, kind, at, account = "bo", body = "", agent = "") =>
    db.raw
      .prepare(
        "INSERT INTO task_event (guide_id, kind, account_id, agent_id, body, at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(guideId, kind, account, agent, body, at);
  const claim = (guideId, account, agent, claimed, lease) =>
    db.raw
      .prepare(
        `INSERT INTO claim (guide_id, account_id, agent_id, state, claimed_at, lease_until, updated)
         VALUES (?, ?, ?, 'claimed', ?, ?, ?)`,
      )
      .run(guideId, account, agent, claimed, lease, claimed);
  return { db, x, guide, ev, claim };
}

test("a project's work is everything linked into it and its subfolders, as register rows", async () => {
  const { db, x, guide, ev, claim } = world();
  guide("todo", "p", { to: "bo", created: ago(30) });
  guide("grp", "sub", { group: "gw", created: ago(20) });
  guide("draft", "p", { status: "draft", created: ago(40) });
  guide("held", "p");
  claim("held", "bo", "agent-7", ago(3), later);
  guide("quiet", "sub");
  claim("quiet", "bo", "agent-9", ago(8), ago(2));
  guide("ask", "p");
  claim("ask", "ada", "agent-1", ago(5), later);
  ev("ask", "asked", ago(4), "ada", "Which plan?", "agent-1");
  guide("mine", "p");
  claim("mine", "bo", "person-bo", ago(6), ago(5));
  guide("fin", "p", { status: "consumed", outcome: "finished", updated: ago(2) });
  ev("fin", "handed_in", ago(2), "bo", "Done", "agent-7");
  guide("old", "p", { status: "consumed", outcome: "finished", updated: ago(24 * 30) });
  guide("elsewhere", "other");
  x(`INSERT INTO notification (account_id, kind, guide_id, actor_id, at, read_at)
     VALUES ('ada', 'task_finished', 'fin', 'bo', '${ago(2)}', '')`);

  const { open, done } = await projectView(db, "ada", "p", NOW);
  assert.deepEqual(
    open.map((w) => [w.id, w.stage, w.health]),
    [
      ["ask", "working", "asking"],
      ["quiet", "working", "quiet"],
      ["todo", "todo", ""],
      ["grp", "todo", ""],
      ["mine", "working", "working"],
      ["held", "working", "working"],
      ["draft", "draft", ""],
    ],
    "asking, then gone quiet, then the oldest; drafts last",
  );
  const by = Object.fromEntries(open.map((w) => [w.id, w]));
  assert.equal(by.todo.with, "@bo");
  assert.equal(by.grp.with, "#web");
  assert.equal(by.held.with, "agent-7");
  assert.equal(by.held.since, ago(3), "held work is aged from when it was taken");
  assert.equal(by.mine.with, "@bo", "a person's own hold names the person, never goes quiet");
  assert.equal(by.draft.with, "");
  assert.deepEqual(
    done.map((w) => [w.id, w.with, w.since, w.changed]),
    [["fin", "agent-7", ago(2), "task_finished"]],
    "done recently only",
  );
});

test("history merges finished work and document versions, newest first, saying person or agent", async () => {
  const { db, x, guide, ev } = world();
  guide("fin", "sub", { status: "consumed", outcome: "finished", updated: ago(3) });
  ev("fin", "handed_in", ago(3), "bo", "Fixed it", "agent-7");
  x(`INSERT INTO verdict (guide_id, account_id, ok, note, detail, checks, writeup, at) VALUES
       ('fin', 'bo', 1, 'Fixed it', '![s](https://passalong.dev/v1/shots/abc123)', '[{"ok":true}]', 'Fixed the rounding', '${ago(3)}');
     INSERT INTO folder_document (id, folder_id, name, body, version, updated_by, created, updated) VALUES
       ('readme', 'p', 'README', 'v2', 2, 'ada', '${ago(10)}', '${ago(1)}'),
       ('far', 'other', 'Elsewhere', '', 1, 'ada', '${ago(10)}', '${ago(1)}');
     INSERT INTO folder_document_revision (document_id, version, body, saved_by, saved_at, client) VALUES
       ('readme', 1, 'v1', 'bo', '${ago(10)}', ''),
       ('readme', 2, 'v2', 'ada', '${ago(1)}', 'hub'),
       ('far', 1, '', 'ada', '${ago(1)}', 'mcp');`);
  guide("archived", "p", { status: "consumed", outcome: "archived", updated: ago(2) });

  const { history } = await projectView(db, "ada", "p", NOW);
  assert.deepEqual(
    history.map((h) => [h.kind, h.id, h.version, h.by, h.via]),
    [
      ["document", "readme", 2, "Ada", "person"],
      ["finished", "fin", 0, "agent-7", "agent"],
      ["document", "readme", 1, "@bo", ""],
    ],
    "archived work and other projects' documents are not history here",
  );
  const fin = history.find((h) => h.kind === "finished");
  assert.equal(fin.note, "Fixed the rounding");
  assert.equal(fin.shots, 1);
  assert.equal(fin.checks, 1);
  assert.equal(history[0].folder, "p");
  assert.deepEqual(
    history.map((h) => h.changed),
    ["", "", "version 1 by @bo"],
    "your own save is never news; Bo's, never opened, is; finished work's news is its notification",
  );
});

test("a save is a person's from the hub, an agent's from MCP or the CLI, and otherwise unknown", () => {
  assert.equal(viaOf("hub"), "person");
  assert.equal(viaOf("mcp"), "agent");
  assert.equal(viaOf("cli@0.31.0"), "agent");
  assert.equal(viaOf("api"), "");
  assert.equal(viaOf(""), "");
});

test("a document is changed for you until you open it, and only by someone else's save", async () => {
  const { db, x } = world();
  x(`INSERT INTO folder_document (id, folder_id, name, body, version, updated_by, created, updated) VALUES
       ('price', 'p', 'Pricing', 'v3', 3, 'bo', '${ago(10)}', '${ago(1)}'),
       ('mine', 'p', 'Setup', 'v1', 1, 'ada', '${ago(10)}', '${ago(5)}'),
       ('priv', 'sub', 'Notes', 'v1', 1, 'bo', '${ago(10)}', '${ago(5)}');
     INSERT INTO folder_document_revision (document_id, version, body, saved_by, saved_at, client) VALUES
       ('price', 1, 'v1', 'ada', '${ago(10)}', 'hub'),
       ('price', 2, 'v2', 'bo', '${ago(4)}', 'mcp'),
       ('price', 3, 'v3', 'bo', '${ago(1)}', 'mcp'),
       ('mine', 1, 'v1', 'ada', '${ago(5)}', 'hub'),
       ('priv', 1, 'v1', 'bo', '${ago(5)}', 'mcp');`);
  const changed = () =>
    db
      .prepare(`SELECT d.id, ${docChange("?1")} AS changed FROM folder_document d ORDER BY d.id`)
      .bind("ada")
      .all()
      .then((r) => Object.fromEntries(r.results.map((row) => [row.id, row.changed])));

  assert.deepEqual(await changed(), {
    mine: "",
    price: "version 3 by @bo",
    priv: "version 1 by @bo",
  });
  await seeDocument(db, "ada", "price", ago(2));
  assert.equal((await changed()).price, "version 3 by @bo", "looked before Bo's newest version");
  await seeDocument(db, "ada", "price", NOW);
  assert.equal((await changed()).price, "", "opening it clears it");
  await seeAllDocuments(db, "ada", NOW);
  assert.equal((await changed()).priv, "", "Mark all seen clears every document Ada can read");
  const { history } = await projectView(db, "ada", "p", NOW);
  assert.ok(
    history.every((h) => !h.changed),
    "and History agrees",
  );
});
