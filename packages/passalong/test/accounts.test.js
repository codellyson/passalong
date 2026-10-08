// Several accounts on one machine: how they are kept, who a call is made as, and that an agent is
// refused rather than left to guess. Each test file runs in its own process, so setting
// PASSALONG_HOME before the modules load is what points them at a scratch directory.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const HOME = mkdtempSync(join(tmpdir(), "passalong-accounts-"));
process.env.PASSALONG_HOME = HOME;
delete process.env.PASSALONG_TOKEN;
delete process.env.PASSALONG_ACCOUNT;
process.env.PASSALONG_API = "http://127.0.0.1:9"; // nothing listens: a refusal must come before any fetch

const store = await import("../src/store.js");
const api = await import("../src/api.js");
const CLI = new URL("../bin/passalong", import.meta.url).pathname;

const reset = () => writeFileSync(join(HOME, "config.json"), "{}\n");
const entry = (account, handle, extra = {}) => ({
  token: `pa_${account}`,
  api: "https://passalong.dev",
  account,
  handle,
  email: `${handle}@example.test`,
  ...extra,
});

test("the first login is the default and is mirrored where older readers look", () => {
  reset();
  const name = store.saveAccount(entry("a1", "Lukman"));
  assert.equal(name, "lukman", "named for its handle, in lower case");
  const cfg = store.readConfig();
  assert.equal(cfg.active, "lukman");
  assert.equal(cfg.token, "pa_a1", "an older CLI reading `token` still finds the default");
  assert.equal(api.token(), "pa_a1");
});

test("a second login is added beside the first and does not take over the default", () => {
  reset();
  store.saveAccount(entry("a1", "work"));
  const second = store.saveAccount(entry("a2", "personal"));
  assert.equal(second, "personal");
  assert.equal(store.readConfig().active, "work", "a default that changes by itself is the bug");
  assert.equal(api.token(), "pa_a1");
  assert.deepEqual(Object.keys(store.readAccounts()), ["work", "personal"]);
});

test("signing in to an account that is already here updates it, and a clash gets a number", () => {
  reset();
  store.saveAccount(entry("a1", "work"));
  store.saveAccount({ ...entry("a1", "work"), token: "pa_fresh" });
  assert.equal(Object.keys(store.readAccounts()).length, 1, "the same account is not added twice");
  assert.equal(store.readConfig().token, "pa_fresh", "and the default carries the new token");
  const other = store.saveAccount(entry("a9", "work"));
  assert.equal(other, "work-2", "a different account wanting the same name gets another");
});

test("with several accounts and nobody saying which, an agent is refused before anything is sent", async () => {
  reset();
  store.saveAccount(entry("a1", "work"));
  store.saveAccount(entry("a2", "personal"));
  assert.equal(api.needsChoice(), true, "no terminal here, so nobody can be asked");
  await assert.rejects(api.me(), (e) => {
    assert.match(e.message, /More than one Passalong account/);
    assert.match(e.message, /work \(work@example\.test\), personal \(personal@example\.test\)/);
    assert.match(e.message, /use_account/);
    assert.match(e.message, /Do not choose one yourself/);
    assert.notEqual(e.status, 0, "refused here, not a network failure");
    return true;
  });
});

test("a session's choice, an env var and PASSALONG_TOKEN each end the question", () => {
  reset();
  store.saveAccount(entry("a1", "work"));
  store.saveAccount(entry("a2", "personal"));
  assert.equal(api.needsChoice(), true);

  api.chooseAccount("personal");
  assert.equal(api.needsChoice(), false);
  assert.equal(api.token(), "pa_a2", "the chosen account's token");
  assert.equal(store.readConfig().active, "work", "and nothing on disk moved");
  assert.equal(api.accountInUse(), "personal");

  assert.throws(() => api.chooseAccount("nobody"), /no account called "nobody".*work, personal/);
  api.forgetChoice();
  assert.equal(api.needsChoice(), true, "and a choice can be taken back");
});

test("the team belongs to the account, not the machine", () => {
  reset();
  store.saveAccount(entry("a1", "work"));
  store.saveAccount(entry("a2", "personal"));
  api.setTeam("khaime");
  assert.equal(api.currentTeam(), "khaime", "set on the default account");
  assert.equal(store.readConfig().team, "khaime", "and mirrored for older readers");
  store.setActive("personal");
  assert.equal(api.currentTeam(), "", "the other account has none");
  assert.equal(store.readConfig().team, "");
  store.setActive("work");
  assert.equal(api.currentTeam(), "khaime");
});

test("forgetting the default hands it to the next account, and the last one clears the file", () => {
  reset();
  store.saveAccount(entry("a1", "work"));
  store.saveAccount(entry("a2", "personal"));
  assert.deepEqual(store.removeAccount("work"), { removed: true, active: "personal" });
  assert.equal(store.readConfig().token, "pa_a2");
  assert.deepEqual(store.removeAccount("nobody"), { removed: false, active: "personal" });
  assert.deepEqual(store.removeAccount("personal"), { removed: true, active: "" });
  const cfg = store.readConfig();
  assert.equal(cfg.token, undefined);
  assert.equal(cfg.accounts, undefined);
});

test("the CLI lists accounts, switches the default, and refuses an agent without --as", () => {
  reset();
  store.saveAccount(entry("a1", "work"));
  store.saveAccount(entry("a2", "personal"));
  const env = { ...process.env, PASSALONG_HOME: HOME };
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" });

  const listed = run("accounts");
  assert.match(listed.stdout, /\* work {2}@work/);
  assert.match(listed.stdout, / {2}personal {2}@personal/);

  const refused = run("me");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /More than one Passalong account/, "no terminal here: refused");

  const named = run("me", "--as", "nobody");
  assert.match(named.stderr, /no account called "nobody"/);

  assert.equal(run("use", "personal").status, 0);
  assert.equal(JSON.parse(readFileSync(join(HOME, "config.json"), "utf8")).active, "personal");
  assert.match(run("accounts").stdout, /\* personal/);

  assert.equal(run("logout", "personal").status, 0);
  assert.match(run("accounts").stdout, /\* work/);
  assert.equal(run("logout", "nobody").status, 1);
});

test("the session-start hook tells the agent to ask, when it would have to guess", () => {
  reset();
  store.saveAccount(entry("a1", "work"));
  store.saveAccount(entry("a2", "personal"));
  const out = execFileSync(process.execPath, [CLI, "now", "--hook", "session"], {
    env: { ...process.env, PASSALONG_HOME: HOME },
    encoding: "utf8",
  });
  const said = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(said, /^Passalong: More than one Passalong account/);
  assert.match(said, /Ask the person which one/);

  reset();
  store.saveAccount(entry("a1", "work"));
  assert.equal(
    execFileSync(process.execPath, [CLI, "now", "--hook", "session"], {
      env: { ...process.env, PASSALONG_HOME: HOME, PASSALONG_API: "http://127.0.0.1:9" },
      encoding: "utf8",
    }),
    "",
    "with one account there is nothing to say, as before",
  );
});

test("over MCP, an agent sees it must choose, is refused until it does, and cannot choose a name nobody has", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { buildServer } = await import("../src/mcp.js");
  reset();
  api.forgetChoice();
  store.saveAccount(entry("a1", "work"));
  store.saveAccount(entry("a2", "personal"));
  const [left, right] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([buildServer().connect(right), client.connect(left)]);
  const text = (r) => r.content.map((c) => c.text).join("");

  const seen = JSON.parse(text(await client.callTool({ name: "accounts", arguments: {} })));
  assert.equal(seen.must_choose, true);
  assert.deepEqual(
    seen.accounts.map((a) => a.name),
    ["work", "personal"],
  );
  assert.match(seen.next, /Ask the person which one/);

  const refused = await client.callTool({ name: "board", arguments: {} });
  assert.equal(refused.isError, true);
  assert.match(text(refused), /More than one Passalong account/);

  const nobody = await client.callTool({ name: "use_account", arguments: { name: "nobody" } });
  assert.equal(nobody.isError, true);
  assert.match(text(nobody), /no account called "nobody"/);
  await client.close();
});
