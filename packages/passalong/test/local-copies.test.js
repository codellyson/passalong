import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Nothing about a guide is kept on this machine unless somebody asks for it.
process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-copies-"));
const { fakeServer } = await import("./fake-server.js");
const server = fakeServer();
const passalong = await import("../src/passalong.js");
const store = await import("../src/store.js");
const { parse } = await import("../src/guide.js");

const DOC = (id) =>
  `---\nid: ${id}\ntitle: Note ${id}\nsummary: A note.\nkind: transfer\n---\n\nbody ${id}\n`;
const home = () => readdirSync(process.env.PASSALONG_HOME, { recursive: true }).map(String);

test("share, pull and resolve write nothing, and read the server's copy", async () => {
  await passalong.share(DOC("aaaa2222"));
  // A stale copy left by an older CLI: the server's is what comes back, and it is not rewritten.
  store.save(parse(DOC("aaaa2222").replace("body", "stale")));
  const before = home();
  const repo = mkdtempSync(join(tmpdir(), "passalong-repo-"));
  const r = await passalong.pull("aaaa2222", { cwd: repo });
  assert.match(r.markdown, /body aaaa2222/);
  assert.equal(r.path, null);
  assert.deepEqual(readdirSync(repo), [], "no .passalong/ in the repo");
  assert.deepEqual(home(), before, "nothing new under ~/.passalong");
  await passalong.resolve("aaaa2222", { peek: true });
  assert.ok(server.asked.includes("GET /v1/guides/aaaa2222?peek=1"), "peek asks for no pull");
});

test("pull --save is the one way a guide reaches the disk", async () => {
  const repo = mkdtempSync(join(tmpdir(), "passalong-repo-"));
  const { path } = await passalong.pull("aaaa2222", { cwd: repo, save: true });
  assert.equal(path, join(repo, ".passalong", "aaaa2222.md"));
  assert.ok(existsSync(path));
});

test("signed out, sharing and reading by id say to log in", async () => {
  const token = process.env.PASSALONG_TOKEN;
  delete process.env.PASSALONG_TOKEN;
  try {
    await assert.rejects(passalong.share(DOC("bbbb3333")), /passalong login/);
    await assert.rejects(passalong.resolve("aaaa2222"), /passalong login/);
  } finally {
    process.env.PASSALONG_TOKEN = token;
  }
});

test("tidy drops only what the server returns, once; export takes the server's and the rest", async () => {
  await passalong.share(DOC("cccc4444"));
  await passalong.share(DOC("dddd5555"));
  store.save(parse(DOC("dddd5555")));
  store.save(parse(DOC("eeee6666"))); // from another account: the server does not return it
  assert.equal(await passalong.tidy(), 2, "aaaa2222 and dddd5555 are on the server");
  assert.deepEqual(
    store.list().map((g) => g.meta.id),
    ["eeee6666"],
  );
  const before = server.asked.length;
  assert.equal(await passalong.tidy(), 0);
  assert.equal(server.asked.length, before, "the second run asks nothing");

  const out = join(process.env.PASSALONG_HOME, "out");
  await passalong.exportAll(out);
  assert.deepEqual(readdirSync(out).sort(), [
    "aaaa2222.md",
    "cccc4444.md",
    "dddd5555.md",
    "eeee6666.md",
  ]);
});
