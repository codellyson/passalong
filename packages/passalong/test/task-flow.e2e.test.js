// Work end to end, through the CLI's own operations against a running server.
//
// Skipped unless PASSALONG_E2E_API names one, so `npm test` stays offline:
//
//   PASSALONG_E2E_API=http://localhost:3001 node --test test/task-flow.e2e.test.js
//
// The account it makes has to be allowed to sync, and a fresh one is not when FREE_SIGNUP is off,
// so it is put on the solo plan in the *local* D1 with `wrangler d1 execute --local`. That only
// works against a local server whose database is apps/web's — never point this at a real one.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const API = process.env.PASSALONG_E2E_API;
// What the CLI sends on every call. A test calling the API with Node's own fetch looks exactly like
// a CLI from before the header existed, and the server refuses those once its floor passes 0.11.0.
const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web");

/** One account allowed to sync, and the CLI's operations pointed at it. Made once per file. */
let ready;
function setup() {
  ready ??= (async () => {
    assert.match(
      API,
      /^http:\/\/(?:localhost|127\.0\.0\.1)[:/]/,
      "only ever against a local server",
    );
    const { token, account } = await newAccount();
    await sql(`UPDATE account SET plan = 'solo' WHERE id = '${account}'`);
    process.env.PASSALONG_API = API;
    process.env.PASSALONG_TOKEN = token;
    process.env.PASSALONG_HOME = mkdtempSync(join(tmpdir(), "passalong-e2e-"));
    const guide = await import("../src/guide.js");
    const p = await import("../src/passalong.js");
    return { account, p, ...guide };
  })();
  return ready;
}

/**
 * Upload a screenshot as whoever is signed in, and the markdown that shows it: "it works" is
 * refused without a screenshot of it working. PNG is the 1×1 image declared further down.
 */
async function proof() {
  const api = await import("../src/api.js");
  const shot = await api.uploadShot(PNG, "image/png", "it-works.png");
  return `![it works](${shot.url})`;
}

/** Work as markdown: a title, a summary, and plain text. Ready unless `extra` says otherwise. */
const work = (serialize, title, extra = {}, body = "The hub follows the OS setting.") =>
  serialize({ meta: { title, summary: "Said to a person for the test.", ...extra }, body });

/** A request to the API as the signed-in account, for routes no CLI command calls. */
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
      "x-passalong-version": VERSION,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // The HTTP status wins: a body may carry a field called status too (a work item's own).
  return { ...(await res.json()), status: res.status };
}

/** What the signed-in account has been told, newest first, as text. */
const heard = async () =>
  (await call("GET", "/v1/notifications?limit=50")).notifications.map((n) => n.text).join("\n");

/** A state on the board, by id. */
const stateOf = async (id) =>
  (await call("GET", "/v1/tasks")).tasks.find((t) => t.id === id)?.state;

/** A fresh worktree of this account's own repo, and ready work for it. */
async function readyTask({ account, p, serialize }, title) {
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:e2e/${account}.git`]);
  const md = work(serialize, title, { status: "draft", target_context: `e2e/${account}` });
  const id = (await p.publish(md, { cwd: dir })).guide.meta.id;
  await p.ready(id);
  return { id, dir };
}

const skip = !API && "PASSALONG_E2E_API not set";

/** What every hand-in carries: the run, not the agent's word for it. */
const PROOF = "npm test -w apps/api → 285 pass, 0 fail";

test("an agent can create a folder and upload an asset with a scoped one-time link", {
  skip,
}, async () => {
  await setup();
  const api = await import("../src/api.js");
  const { folder } = await api.createFolder("Tutorial video", "Script and screens");
  const minted = await fetch(`${API}/v1/uploads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-passalong-version": VERSION,
      authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
    },
    body: JSON.stringify({ folder: folder.id, name: "screen.png" }),
  });
  if (minted.status !== 201)
    throw new Error(`upload link: ${minted.status} ${await minted.text()}`);
  const { upload_url, kind } = await minted.json();
  assert.equal(kind, `folder:${folder.id}`);
  const wrong = await fetch(upload_url, { method: "PUT", body: new Uint8Array([0, 1, 2]) });
  assert.equal(wrong.status, 415, "invalid bytes do not spend the link");
  const uploaded = await fetch(upload_url, { method: "PUT", body: PNG });
  if (uploaded.status !== 201)
    throw new Error(`asset upload: ${uploaded.status} ${await uploaded.text()}`);
  const { asset } = await uploaded.json();
  assert.equal(asset.name, "screen.png");
  assert.equal((await api.folder(folder.id)).assets[0].id, asset.id);
  assert.equal((await fetch(upload_url, { method: "PUT", body: PNG })).status, 410);
});

test("nested folders keep their space, color and subtree when moved", { skip }, async () => {
  await setup();
  const api = await import("../src/api.js");
  const { folder: root } = await api.createFolder(
    "Video series",
    "Scripts and footage",
    "",
    "",
    "blue",
  );
  // Where it landed is said in the answer, so an agent reports that rather than what it meant.
  assert.match(root.space, /^private/);
  const { folder: script } = await api.createFolder("Episode one", "Draft script", "", root.id);
  assert.match(script.space, /^private/);
  assert.match((await api.folder(script.id)).folder.space, /^private/);
  const { folder: scenes0 } = await api.createFolder("Cutaways", "", "", script.id);
  await api.createFolderDocument(script.id, "Outline", "");
  // A grouping folder says what each folder inside it holds, so it does not read as empty.
  const child = (await api.folder(root.id)).children.find((c) => c.id === script.id);
  assert.equal(child.documents, 1);
  assert.equal(child.subfolders, 1);
  assert.ok(scenes0.id);
  const { folder: scenes } = await api.createFolder("Scenes", "Screens and cuts", "", script.id);
  assert.equal(script.parent_id, root.id);
  assert.equal(scenes.parent_id, script.id);
  assert.equal(
    (await api.folder(script.id)).breadcrumbs.map((part) => part.id).join("/"),
    `${root.id}/${script.id}`,
  );
  assert.equal((await api.folders()).folders.find((part) => part.id === root.id).color, "blue");

  const moved = await api.updateFolder(script.id, { color: "coral", parent: "" });
  assert.equal(moved.folder.parent_id, "");
  assert.equal(moved.folder.color, "coral");
  assert.equal(
    (await api.folder(scenes.id)).breadcrumbs.map((part) => part.id).join("/"),
    `${script.id}/${scenes.id}`,
  );

  await assert.rejects(api.updateFolder(script.id, { parent: scenes.id }), /inside itself/);
  const deleted = await fetch(`${API}/v1/folders/${encodeURIComponent(script.id)}`, {
    method: "DELETE",
    headers: {
      "x-passalong-version": VERSION,
      authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
    },
  });
  assert.equal(deleted.status, 200);
  await assert.rejects(api.folder(scenes.id), /isn't available/);
});

test("a folder's share link opens it and what is inside it, and nothing else", {
  skip,
}, async () => {
  await setup();
  const api = await import("../src/api.js");
  const { folder: root } = await api.createFolder("Launch kit", "Everything for the launch");
  const { folder: inner } = await api.createFolder("Screens", "", "", root.id);
  const { folder: other } = await api.createFolder("Unrelated", "Not shared");
  await api.createFolderDocument(
    root.id,
    "Brief",
    "# Launch brief\n\n> [!NOTE]\n> Read this first.",
  );
  const file = join(mkdtempSync(join(tmpdir(), "passalong-share-")), "home.png");
  writeFileSync(file, PNG);
  const { asset } = await api.addFolderAsset(inner.id, file);

  const { url } = await call("POST", `/v1/folders/${root.id}/share`);
  const [, id, key] = new URL(url).pathname.match(/^\/f\/([a-z0-9]+)\/([a-z0-9]+)$/) || [];
  assert.equal(id, root.id);
  // Asking again returns the same link rather than breaking the one already sent.
  assert.equal((await call("POST", `/v1/folders/${root.id}/share`)).url, url);

  const read = (path) => fetch(`${API}${path}`);
  const page = await (await read(`/api/folder/${id}/${key}`)).json();
  assert.equal(page.folder.title, "Launch kit");
  assert.deepEqual(
    page.children.map((c) => c.title),
    ["Screens"],
  );
  assert.match(page.document.html, /markdown-alert-note/);
  // A folder inside the shared one opens with the same key, and its files download.
  const insidePage = await (await read(`/api/folder/${id}/${key}?in=${inner.id}`)).json();
  assert.deepEqual(
    insidePage.files.map((f) => f.id),
    [asset.id],
  );
  const download = await read(`/f/${id}/${key}/files/${asset.id}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition") || "", /^attachment/);

  // The key opens nothing outside its subtree, and a wrong key opens nothing at all.
  assert.equal((await read(`/api/folder/${id}/${key}?in=${other.id}`)).status, 404);
  assert.equal((await read(`/api/folder/${id}/${"x".repeat(22)}`)).status, 404);
  assert.equal((await read(`/api/folder/${other.id}/${key}`)).status, 404);

  // Stopping clears it: the old link dies, and a new share is a different link.
  const stopped = await fetch(`${API}/v1/folders/${root.id}/share`, {
    method: "DELETE",
    headers: {
      "x-passalong-version": VERSION,
      authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
    },
  });
  assert.equal(stopped.status, 200);
  assert.equal((await read(`/api/folder/${id}/${key}`)).status, 404);
  assert.equal((await read(`/f/${id}/${key}/files/${asset.id}`)).status, 404);
  assert.notEqual((await call("POST", `/v1/folders/${root.id}/share`)).url, url);
});

test("a document moves between folders with its history, and only within its space", {
  skip,
}, async () => {
  await setup();
  const api = await import("../src/api.js");
  const { folder: from } = await api.createFolder("Drafts", "Unsorted");
  const { folder: to } = await api.createFolder("Episode one", "Scripts");
  const { document } = await api.createFolderDocument(from.id, "Script", "v1");
  await api.saveFolderDocument(from.id, document.id, 1, "v2");

  const moved = await api.patchFolderDocument(from.id, document.id, { folder: to.id });
  assert.equal(moved.document.id, document.id);
  assert.equal((await api.folder(from.id)).documents.length, 0);
  assert.deepEqual(
    (await api.folder(to.id)).documents.map((d) => d.id),
    [document.id],
  );
  // Its versions came with it.
  assert.deepEqual(
    (await api.folderDocumentHistory(to.id, document.id)).revisions.map((r) => r.version),
    [2, 1],
  );

  // Back again under a new name; and a name the target already has is refused.
  await api.patchFolderDocument(to.id, document.id, { folder: from.id, name: "Script, rough" });
  assert.equal((await api.folder(from.id)).documents[0].name, "Script, rough");
  await api.createFolderDocument(to.id, "Script, rough", "");
  await assert.rejects(
    api.patchFolderDocument(from.id, document.id, { folder: to.id }),
    /already in the project/,
  );
  // A folder this account cannot see is refused the same way as one that does not exist.
  await assert.rejects(
    api.patchFolderDocument(from.id, document.id, { folder: "nosuchfolder" }),
    /isn't available/,
  );
});

test("an agent finds projects by words, renames, recovers and removes", {
  skip,
}, async () => {
  await setup();
  const api = await import("../src/api.js");
  const { folder } = await api.createFolder("Checkout research", "Payments notes");
  const { document } = await api.createFolderDocument(folder.id, "Notes", "The 50%_off coupon");

  // Words in a document's text find its folder and name the document; LIKE's own wildcards in the
  // words are taken literally, so "0%_o" matches only the text that says exactly that.
  const found = (await api.folders("all", "0%_o")).folders;
  assert.deepEqual(
    found.map((f) => f.id),
    [folder.id],
  );
  assert.deepEqual(found[0].matches, [{ id: document.id, name: "Notes" }]);
  assert.equal((await api.folders("all", "50xxoff")).folders.length, 0);

  // A bad edit is put back from history.
  await api.saveFolderDocument(folder.id, document.id, 1, "Rewritten by mistake");
  const history = await api.folderDocumentHistory(folder.id, document.id);
  assert.deepEqual(
    history.revisions.map((r) => r.version),
    [2, 1],
  );
  const first = await api.folderDocumentHistory(folder.id, document.id, 1);
  await api.saveFolderDocument(folder.id, document.id, 2, first.revision.body);
  assert.equal(
    (await api.folderDocument(folder.id, document.id)).document.body,
    "The 50%_off coupon",
  );

  // A rename keeps the id and history, and refuses a name the folder already has.
  const renamed = await api.patchFolderDocument(folder.id, document.id, { name: "Coupon notes" });
  assert.equal(renamed.document.id, document.id);
  assert.equal(renamed.document.name, "Coupon notes");
  await api.createFolderDocument(folder.id, "Other", "");
  await assert.rejects(
    api.patchFolderDocument(folder.id, document.id, { name: "Other" }),
    /already/,
  );

  await api.deleteFolderDocument(folder.id, document.id);
  await assert.rejects(api.folderDocument(folder.id, document.id), /isn't in this project/);
});

test("work goes round: taken, taken back, done, reopened", { skip }, async () => {
  const env = await setup();
  const { account, p } = env;
  const worktree = () => {
    const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", [
      "-C",
      dir,
      "remote",
      "add",
      "origin",
      `git@github.com:e2e/${account}.git`,
    ]);
    return dir;
  };
  const [a, b] = [worktree(), worktree()];
  const { id } = await readyTask(env, "Add dark mode");

  // One worktree takes it, says where it is, and it is taken back from it.
  assert.equal((await p.take(id, { cwd: a })).guide.id, id);
  await p.progress(id, "safari fix in progress", { cwd: a });
  await p.release(id);
  assert.equal(await stateOf(id), "ready");
  await assert.rejects(p.progress(id, "still going", { cwd: a }), (e) => e.status === 409);

  // Another picks it up with a pointer to where it was left, and finishes: Done at once.
  const second = await p.take(id, { cwd: b });
  assert.match(second.guide.markdown, /safari fix in progress/);
  await p.handIn(id, { note: "Dark mode works.", evidence: PROOF, cwd: b });
  assert.equal(await stateOf(id), "done");

  // It is not right after all: back in To do with why, for whoever takes it next.
  await p.reopen(id, "toggle does nothing on Safari");
  assert.equal(await stateOf(id), "ready");
  assert.match((await p.take(id, { cwd: a })).guide.markdown, /toggle does nothing on Safari/);
  await p.pass(id, "testing the round", { cwd: a });
});

test("blocked_by holds work until what it waits on is Done", { skip }, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const first = await readyTask(env, "Schema first");
  const waits = work(serialize, "API on the schema", {
    status: "draft",
    target_context: `e2e/${account}`,
    blocked_by: [first.id],
  });
  const second = (await p.publish(waits, { cwd: first.dir })).guide.meta.id;
  await p.ready(second);
  assert.equal(await stateOf(second), "blocked");

  await p.take(first.id, { cwd: first.dir });
  await p.handIn(first.id, { note: "The table is there.", evidence: PROOF, cwd: first.dir });
  assert.equal(await stateOf(second), "ready");
});

test("every draft you wrote can be made ready at once", { skip }, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const draft = async (title) =>
    (await p.publish(work(serialize, title, { status: "draft", target_context: `e2e/${account}` })))
      .guide.meta.id;
  const ids = [await draft("Plan step one"), await draft("Plan step two")];
  const made = await p.readyDrafts();
  for (const id of ids) assert.ok(made.includes(id), `${id} was made ready`);
  assert.deepEqual([await stateOf(ids[0]), await stateOf(ids[1])], ["ready", "ready"]);
  assert.deepEqual(await p.readyDrafts(), [], "nothing left in Draft");
});

test("an account with no email cannot be minted without a real invite code", { skip }, async () => {
  const res = await fetch(`${API}/v1/accounts`, {
    method: "POST",
    headers: { "x-passalong-version": VERSION },
  });
  assert.equal(res.status, 400);
});

test("signing in from the browser: the CLI shows a code, a person approves it, the CLI is handed a token", {
  skip,
}, async () => {
  const headers = { "content-type": "application/json", "x-passalong-version": VERSION };
  const email = `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const signup = await fetch(`${API}/v1/auth/signup`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signup.status, 201);
  const cookie = (signup.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const bad = await fetch(`${API}/v1/device/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({ challenge: "not a hash" }),
  });
  assert.equal(bad.status, 400, "a challenge that is not a sha256 is refused");

  const home = mkdtempSync(join(tmpdir(), "passalong-device-"));
  const env = { ...process.env, PASSALONG_API: API, PASSALONG_HOME: home };
  delete env.PASSALONG_TOKEN;
  const cli = new URL("../bin/passalong", import.meta.url).pathname;
  const child = spawn(process.execPath, [cli, "login"], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let said = "";
  const code = await new Promise((resolve, reject) => {
    child.stderr.on("data", (d) => {
      said += d;
      const m = /code ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(said);
      if (m) resolve(m[1]);
    });
    child.on("exit", () => reject(new Error(`the CLI ended before showing a code: ${said}`)));
  });
  assert.match(said, /Open http/);

  const shown = await fetch(`${API}/v1/device/${code}`, { headers: { ...headers, cookie } });
  assert.equal(shown.status, 200);
  assert.match((await shown.json()).label, / cli$/, "the page can say what is asking");
  const done = await fetch(`${API}/v1/device/approve`, {
    method: "POST",
    headers: { ...headers, cookie },
    body: JSON.stringify({ code }),
  });
  assert.equal(done.status, 200);

  const exit = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(exit, 0, said);
  const { token } = JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
  assert.match(token, /^pa_/);
  const me = await fetch(`${API}/v1/me`, {
    headers: { ...headers, authorization: `Bearer ${token}` },
  });
  assert.equal(me.status, 200, "the token the CLI was handed works");

  const again = await fetch(`${API}/v1/device/approve`, {
    method: "POST",
    headers: { ...headers, cookie },
    body: JSON.stringify({ code }),
  });
  assert.equal(again.status, 404, "a code that was used cannot be approved again");
});

test("one invite link brings in a whole group: each new person mints through it, and all join", {
  skip,
}, async () => {
  const headers = { "content-type": "application/json", "x-passalong-version": VERSION };
  const owner = await newAccount();
  const asOwner = { ...headers, authorization: `Bearer ${owner.token}` };
  await sql(`UPDATE account SET plan = 'solo' WHERE id = '${owner.account}'`);
  const made = await fetch(`${API}/v1/teams`, {
    method: "POST",
    headers: asOwner,
    body: JSON.stringify({ name: `Group ${Date.now()}` }),
  });
  assert.equal(made.status, 201, await made.clone().text());
  const { slug } = await made.json();
  const inv = await fetch(`${API}/v1/teams/${slug}/invites`, {
    method: "POST",
    headers: asOwner,
    body: "{}",
  });
  assert.equal(inv.status, 201);
  const { code } = await inv.json();

  // Three people open the same link, one after another, none of them signed in.
  for (let i = 0; i < 3; i++) {
    let mint;
    for (let tries = 0; tries < 12; tries++) {
      mint = await fetch(`${API}/v1/accounts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ invite: code }),
      });
      if (mint.status !== 429) break;
      await new Promise((r) => setTimeout(r, 10_000));
    }
    assert.equal(mint.status, 201, `person ${i + 1} can mint through a link the others used`);
    const { token } = await mint.json();
    const joined = await fetch(`${API}/v1/invites/${code}/accept`, {
      method: "POST",
      headers: { ...headers, authorization: `Bearer ${token}` },
    });
    assert.equal(joined.status, 200, `person ${i + 1} joins`);
  }
  const team = await fetch(`${API}/v1/teams/${slug}`, { headers: asOwner });
  assert.equal((await team.json()).members.length, 4, "the owner and the three who joined");
});

test("two accounts on one machine: an agent is refused until told which, and --as says", {
  skip,
}, async () => {
  const a = await newAccount();
  const b = await newAccount();
  const home = mkdtempSync(join(tmpdir(), "passalong-two-"));
  const login = (x, handle) => ({
    token: x.token,
    api: API,
    account: x.account,
    handle,
    email: "",
  });
  writeFileSync(
    join(home, "config.json"),
    JSON.stringify({
      api: API,
      token: a.token,
      active: "first",
      accounts: { first: login(a, "first"), second: login(b, "second") },
    }),
  );
  const env = { ...process.env, PASSALONG_HOME: home, PASSALONG_API: API };
  delete env.PASSALONG_TOKEN;
  delete env.PASSALONG_ACCOUNT;
  const cli = new URL("../bin/passalong", import.meta.url).pathname;
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });

  const refused = run("me");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /More than one Passalong account.*first.*second/s);

  const asSecond = run("me", "--as", "second");
  assert.equal(asSecond.status, 0, asSecond.stderr);
  assert.match(asSecond.stdout, new RegExp(`account +${b.account}`));
  const asFirst = run("me", "--as", "first");
  assert.match(asFirst.stdout, new RegExp(`account +${a.account}`));

  const viaEnv = spawnSync(process.execPath, [cli, "me"], {
    env: { ...env, PASSALONG_ACCOUNT: "second" },
    encoding: "utf8",
  });
  assert.match(viaEnv.stdout, new RegExp(`account +${b.account}`), "PASSALONG_ACCOUNT says it too");
});

/** Another account on the same local server, allowed to sync. Returns its token. */
/**
 * A fresh account. Sign-up is rate-limited per address (ACCOUNT_LIMIT: 5 a minute), and this suite
 * makes more than five, so a 429 waits and tries again rather than handing the tests an undefined
 * token — which the server then reports as "That token isn't recognized", far from the cause.
 */
async function newAccount() {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const headers = { "content-type": "application/json", "x-passalong-version": VERSION };
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${API}/v1/auth/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }
    if (!res.ok) throw new Error(`could not make an account: ${res.status} ${await res.text()}`);
    const { account } = await res.json();
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const minted = await fetch(`${API}/v1/tokens`, {
      method: "POST",
      headers: { ...headers, cookie },
      body: JSON.stringify({ name: "e2e" }),
    });
    if (!minted.ok)
      throw new Error(`could not make a token: ${minted.status} ${await minted.text()}`);
    return { account, token: (await minted.json()).token };
  }
  throw new Error("could not make an account: still rate-limited after two minutes");
}

async function secondAccount() {
  const { token, account } = await newAccount();
  await sql(`UPDATE account SET plan = 'solo' WHERE id = '${account}'`);
  return { token, account };
}

/**
 * A statement against the local D1, through wrangler. Resolved when wrangler prints success and its
 * whole process group is gone: `wrangler d1 execute --local` can finish its write and not exit, and
 * waiting for it to exit on its own hung the suite. Killing `npx` alone left wrangler running as its
 * child, and a wrangler that outlived the test could write the database back later — dropping rows
 * the server had written meanwhile, like a token minted a moment before ("That token isn't
 * recognized"). So it runs in its own group, and the group is killed outright once the write is
 * reported: it is committed by then, and nothing after it is wanted. Anything else — a failure, or
 * no answer in 90s — throws.
 */
function sql(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["wrangler", "d1", "execute", "passalong", "--local", "--command", command],
      { cwd: WEB, stdio: ["ignore", "pipe", "pipe"], detached: true },
    );
    let out = "";
    let settled = false;
    let failure = null;
    const stop = (err) => {
      if (settled) return;
      settled = true;
      failure = err || null;
      clearTimeout(timer);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => stop(new Error(`no answer from wrangler: ${command}`)), 90_000);
    child.stdout.on("data", (b) => {
      out += b;
      if (/"success":\s*true/.test(out)) stop();
    });
    child.stderr.on("data", (b) => {
      out += b;
    });
    // Only once the group is gone does the test carry on.
    child.on("close", (code) => {
      if (!settled) stop(code ? new Error(`wrangler exited ${code}: ${out.slice(-400)}`) : null);
      failure ? reject(failure) : resolve();
    });
  });
}

/**
 * The same, for a question rather than a write: the rows come back.
 *
 * `--json` prints the whole answer as one array, so the read is done the moment that array parses
 * — at which point the process group goes, for the reason sql() explains. A statement that never
 * prints a parsable answer in 90s throws.
 */
function rows(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["wrangler", "d1", "execute", "passalong", "--local", "--json", "--command", command],
      { cwd: WEB, stdio: ["ignore", "pipe", "pipe"], detached: true },
    );
    let out = "";
    let settled = false;
    let answer = null;
    let failure = null;
    const stop = (err) => {
      if (settled) return;
      settled = true;
      failure = err || null;
      clearTimeout(timer);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => stop(new Error(`no answer from wrangler: ${command}`)), 90_000);
    child.stdout.on("data", (b) => {
      out += b;
      const from = out.indexOf("[");
      if (from < 0) return;
      try {
        answer = JSON.parse(out.slice(from))[0]?.results ?? [];
        stop();
      } catch {
        // Still arriving.
      }
    });
    child.stderr.on("data", (b) => {
      out += b;
    });
    child.on("close", (code) => {
      if (!settled) stop(code ? new Error(`wrangler exited ${code}: ${out.slice(-400)}`) : null);
      if (failure) reject(failure);
      else if (!answer) reject(new Error(`no rows parsed from wrangler: ${out.slice(-400)}`));
      else resolve(answer);
    });
  });
}

/** A 1x1 PNG, as bytes the shots route will accept. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a task's evidence can arrive against the line it answers", { skip }, async () => {
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Evidence per line");
  await p.take(id, { cwd: dir });
  await p.handIn(id, {
    note: "Done, and it holds.",
    // A real command, run here by the CLI's own runner before the hand-in leaves this process:
    // its exit code decides the check and what it printed is recorded. It used to be a command
    // pasted into `ran`, which is the agent typing a string that looks like a run — indistinguishable
    // in the text from this, and proof of nothing.
    checks: [
      {
        check: "the hub follows the OS setting",
        cmd: "node -e \"console.log('58 pass, 0 fail')\"",
      },
    ],
    cwd: dir,
  });
  // Finishing is final: Done, and what was run stays on the work as what it was finished with.
  assert.equal(await stateOf(id), "done");
  const ctx = await (
    await fetch(`${API}/v1/guides/${id}/context`, {
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "x-passalong-version": VERSION,
      },
    })
  ).json();
  const shown = ctx.verdicts.find((v) => v.ok);
  assert.match(shown.detail, /the hub follows the OS setting/, "filed under the line it answers");
  assert.match(shown.detail, /58 pass, 0 fail/, "and kept its output, not an account");
});

test("a check with nothing behind it is refused, like any other claim", { skip }, async () => {
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Evidence per line, refused");
  await p.take(id, { cwd: dir });
  await assert.rejects(
    p.handIn(id, {
      note: "Done.",
      checks: [{ check: "the hub follows the OS setting", ran: "it works" }],
      cwd: dir,
    }),
    /what you ran and what came back/,
  );
});

test("a check answered in words is refused, however much it says", { skip }, async () => {
  // Long enough to clear the length rule and still nothing that ran or was shown. This is the one
  // the product was letting through: "a Sales Order PDF renders with the store's brand colour",
  // answered with a paragraph about what the agent saw, and nothing in the system had looked.
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Described, not shown");
  await p.take(id, { cwd: dir });
  await assert.rejects(
    p.handIn(id, {
      note: "Done.",
      checks: [
        {
          check: "the PDF renders with the store's brand colour",
          ran: "Opened SO-00026 in the viewer and the header bar is #1f6feb, which matches.",
        },
      ],
      cwd: dir,
    }),
    /Run it or show it/,
  );
});

test("work is never handed over alone: what it came out of comes with it", { skip }, async () => {
  const { p, serialize } = await setup();
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  const parent = (
    await p.publish(work(serialize, "Store Hours UI", {}, "open/close per day"), { cwd: dir })
  ).guide.meta.id;
  const child = (await p.publish(work(serialize, "Confirmation email"), { cwd: dir, parent })).guide
    .meta.id;

  const lead = await p.parentWork({ id: child, parent });
  assert.match(lead, new RegExp(`^THIS CAME OUT OF ${parent}: Store Hours UI — open\\.`));
  assert.match(lead, /open\/close per day/, "the parent's own text comes with it");

  // Where the parent has got to, because that is what says whether this can be acted on.
  await call("POST", "/v1/take", { agent: "e2e-parent-aaaa", repo: "e2e/parent", id: parent });
  assert.match(await p.parentWork({ id: child, parent }), /— held/);

  // Work that came out of nothing hands over nothing.
  assert.equal(await p.parentWork({ id: parent }), "");
});

test("a screenshot handed in as evidence belongs to the guide, so the nightly sweep leaves it", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Evidence with a picture");

  const { shot } = await (
    await fetch(`${API}/v1/shots`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.PASSALONG_TOKEN}`,
        "x-passalong-version": VERSION,
        "content-type": "image/png",
      },
      body: PNG,
    })
  ).json();
  assert.ok(shot.id, "the screenshot uploaded");
  // Unclaimed on upload: it belongs to nothing until a document points at it.
  assert.deepEqual(await rows(`SELECT guide_id FROM shot WHERE id = '${shot.id}'`), [
    { guide_id: "" },
  ]);

  await p.take(id, { cwd: dir });
  await p.handIn(id, {
    note: "Done, and it holds.",
    evidence: `$ npm test\n> 3 pass, 0 fail\n\n![the refusal](${shot.url})`,
    cwd: dir,
  });

  // Claimed by the task it answers. Evidence is not markdown and lives on the claim, so nothing
  // used to claim it — and sweepOrphans() deleted it a day later, leaving a broken image where the
  // one part of a hand-in a reviewer cannot reconstruct used to be.
  assert.deepEqual(await rows(`SELECT guide_id FROM shot WHERE id = '${shot.id}'`), [
    { guide_id: id },
  ]);
});

test("in a team, each side hears what the other did to work — and anyone in it moves it", {
  skip,
}, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };

  const team = await api.createTeam(`tasks ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const mate = await secondAccount();
  as(mate.token);
  await api.join(code);
  await api.updateMe({ handle: `mate${Date.now().toString(36)}` });

  as(owner);
  const md = (title) =>
    work(serialize, title, { status: "draft", target_context: `e2e/${account}` });
  const id = (await p.publish(md("Team work"), { to: team.slug })).guide.meta.id;
  await p.ready(id);
  const draft = (await p.publish(md("Still a draft"), { to: team.slug })).guide.meta.id;

  // The teammate can take it, but cannot archive it by status: that is its author's or an admin's.
  as(mate.token);
  await assert.rejects(api.setStatus(id, "consumed"), (e) => e.status === 403);
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:e2e/${account}.git`]);
  await p.take(id, { cwd: dir });
  await p.handIn(id, { note: "It is done.", evidence: PROOF, cwd: dir });
  // A team's board is anyone's in it to move: the teammate can mark the owner's draft ready.
  await p.ready(draft);

  as(owner);
  const told = await heard();
  assert.match(told, /agent took "Team work"/);
  assert.match(told, /agent finished "Team work"/);
  await p.reopen(id, "needs a test");

  as(mate.token);
  assert.match(await heard(), /reopened "Team work": needs a test/);
  as(owner);
});

test("a plan becomes draft work, each piece waiting on the ones it names", { skip }, async () => {
  const env = await setup();
  const { p, account } = env;
  const repo = `e2e/${account}`;
  const made = await p.createWork(
    [
      { title: "Plan: schema", summary: "Said to a person for the test.", repo },
      { title: "Plan: API", summary: "Said to a person for the test.", repo, after: [0] },
      { title: "Plan: UI", summary: "Said to a person for the test.", repo, after: [0, 1] },
    ],
    { draft: true },
  );
  const ids = made.map((m) => m.id);
  assert.deepEqual(
    await Promise.all(ids.map(stateOf)),
    ["draft", "draft", "draft"],
    "a plan is read before it runs",
  );
  await p.readyDrafts();
  assert.deepEqual(await Promise.all(ids.map(stateOf)), ["ready", "blocked", "blocked"]);
});

test("work takes tasks one after another until the queue is empty", { skip }, async () => {
  const env = await setup();
  const { p, account } = env;
  const repo = `e2e/${account}-work`;
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:${repo}.git`]);
  const ids = (
    await p.createWork(
      [
        { title: "Work: one", summary: "Said to a person for the test.", repo },
        { title: "Work: two", summary: "Said to a person for the test.", repo },
      ],
      { cwd: dir },
    )
  ).map((m) => m.id);
  const agent = `node ${join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fake-agent.mjs")}`;

  const run = await p.work({ cwd: dir, agent });
  assert.deepEqual(run.finished, ids);
  assert.equal(run.stopped, "empty");
  assert.deepEqual(await Promise.all(ids.map(stateOf)), ["done", "done"]);
});

test("work stops when an agent exits without finishing, instead of looping on it", {
  skip,
}, async () => {
  const env = await setup();
  const { p, account } = env;
  const repo = `e2e/${account}-quit`;
  const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", `git@github.com:${repo}.git`]);
  const [{ id }] = await p.createWork(
    [{ title: "Work: quits", summary: "Said to a person for the test.", repo }],
    { cwd: dir },
  );
  const agent = `node ${join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fake-agent.mjs")}`;
  process.env.FAKE_AGENT_GIVES_UP = "1";
  try {
    const run = await p.work({ cwd: dir, agent });
    assert.deepEqual(run.finished, []);
    assert.equal(run.stopped, "unfinished");
    assert.equal(run.task, id);
  } finally {
    delete process.env.FAKE_AGENT_GIVES_UP;
  }
  assert.equal(await stateOf(id), "claimed", "still this worktree's");
});

test("one set of verbs for all work: take, progress, hand_in, pass, each saying what is next", {
  skip,
}, async () => {
  const { p, serialize } = await setup();
  const h = (await p.publish(work(serialize, "Stream the PDF"))).guide.meta.id;
  const a = { agent: "e2e-agent-aaaa", repo: "e2e/one", host: "mac", worktree: "/w/a" };
  const b = { agent: "e2e-agent-bbbb", repo: "e2e/one" };
  const c = { agent: "e2e-agent-cccc", repo: "e2e/two" };

  const took = await call("POST", "/v1/take", { ...a, id: h });
  assert.equal(took.guide.kind, undefined, "work has no kind");
  assert.match(took.guide.markdown, /Stream the PDF/);
  assert.deepEqual(
    took.next.map((s) => s.tool),
    ["progress", "hand_in", "pass"],
  );

  const clash = await call("POST", "/v1/take", { ...b, id: h });
  assert.equal(clash.status, 409);
  assert.equal(
    clash.holder.worktree,
    "a",
    "the refusal says who has it, by its folder's name and not its whole path",
  );
  assert.equal(
    (await call("POST", "/v1/take", { ...c, id: h })).status,
    409,
    "one holder at a time, whatever the repo",
  );

  const said = await call("PUT", `/v1/guides/${h}/progress`, { ...a, note: "halfway" });
  assert.equal(said.note, "halfway");
  assert.ok(said.next.length);

  // Your own work can be finished too — nothing reviews it — but never without proof.
  assert.equal(
    (await call("POST", `/v1/guides/${h}/hand_in`, { ...a, note: "Done." })).status,
    400,
  );
  const passed = await call("POST", `/v1/guides/${h}/pass`, { ...a, why: "wrong repo after all" });
  assert.deepEqual(
    passed.next.map((s) => s.tool),
    ["take"],
  );
  const gone = await call("PUT", `/v1/guides/${h}/progress`, { ...a, note: "still going" });
  assert.equal(gone.status, 409);
  assert.match(gone.say, /stop/i, "an agent that lost its claim is told to stop");
  assert.equal((await call("POST", "/v1/take", { ...b, id: h })).guide.agent, b.agent);
});

test("the CLI's verbs: take, progress, hand_in and pass", { skip }, async () => {
  const env = await setup();
  const { p, serialize } = env;
  const { dir } = await readyTask(env, "Verbs on work");

  // No id: the next thing waiting in this repo — oldest first, so maybe work an earlier test left
  // ready. The document comes back in the answer; asked to, it is saved in the worktree.
  const took = await p.take(undefined, { cwd: dir, save: true });
  const id = took.guide.id;
  assert.match(readFileSync(took.path, "utf8"), new RegExp(took.guide.title));
  assert.deepEqual(
    took.next.map((s) => s.tool),
    ["progress", "hand_in", "pass"],
  );

  assert.equal((await p.progress(id, "halfway", { cwd: dir })).note, "halfway");
  await assert.rejects(
    p.handIn(id, { note: "Done.", cwd: dir }),
    /what you ran and what came back/,
    "a hand-in with no evidence is refused",
  );
  const handed = await p.handIn(id, { note: "Done, and it holds.", evidence: PROOF, cwd: dir });
  assert.equal(handed.state, "done", "finishing is final");
  assert.deepEqual(
    handed.next.map((s) => s.tool),
    ["take"],
  );

  // Another by id: taken, then passed with the reason, and free for the next agent.
  const h = (await p.publish(work(serialize, "Another"), { cwd: dir })).guide.meta.id;
  assert.equal((await p.take(h, { cwd: dir })).guide.id, h);
  await assert.rejects(p.pass(h, "", { cwd: dir }), /why/);
  assert.deepEqual(
    (await p.pass(h, "not mine", { cwd: dir })).next.map((s) => s.tool),
    ["take"],
  );
});

test("now says what this worktree holds, for the session-start and stop hooks", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { dir } = await readyTask(env, "Held across a restart");
  const took = await p.take(undefined, { cwd: dir });
  const now = await p.now({ cwd: dir });
  assert.equal(now.held[0]?.id, took.guide.id);
  await p.pass(took.guide.id, "testing now", { cwd: dir });
  assert.equal((await p.now({ cwd: dir })).held.length, 0);
});

test("the hook commands: a session is told what it holds, and stopped once before ending", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { dir } = await readyTask(env, "Hooked");
  const took = await p.take(undefined, { cwd: dir });
  const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "passalong");
  const run = (hook, input = "") =>
    execFileSync(process.execPath, [bin, "now", "--hook", hook], {
      cwd: dir,
      input,
      env: process.env,
    }).toString();

  const started = JSON.parse(run("session"));
  assert.equal(started.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(
    started.hookSpecificOutput.additionalContext,
    new RegExp(`This worktree holds ${took.guide.id}`),
  );

  const stop = JSON.parse(run("stop", JSON.stringify({ stop_hook_active: false })));
  assert.equal(stop.decision, "block");
  assert.equal(run("stop", JSON.stringify({ stop_hook_active: true })), "", "never twice");

  await p.pass(took.guide.id, "testing the hooks", { cwd: dir });
  assert.equal(run("stop", "{}"), "", "nothing held: free to stop");

  // A repo that never took anything is not given a .passalong/ folder for being asked.
  const bare = mkdtempSync(join(tmpdir(), "passalong-bare-"));
  execFileSync("git", ["init", "-q", bare]);
  execFileSync(process.execPath, [bin, "now", "--hook", "session"], {
    cwd: bare,
    env: process.env,
  });
  assert.equal(existsSync(join(bare, ".passalong")), false);
});

test("an agent cannot hand in work it does not hold", { skip }, async () => {
  const { p, serialize } = await setup();
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const team = await api.createTeam(`agent hand-in ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const mate = await secondAccount();
  process.env.PASSALONG_TOKEN = mate.token;
  await api.join(code);
  process.env.PASSALONG_TOKEN = owner;
  const id = (await p.publish(work(serialize, "Check the invoice PDF"), { to: team.slug })).guide
    .meta.id;
  process.env.PASSALONG_TOKEN = mate.token;
  try {
    const agent = { agent: "e2e-hand-in-agent", repo: "e2e/hand-in" };
    const answer = (who) =>
      call("POST", `/v1/guides/${id}/hand_in`, {
        ...who,
        evidence: PROOF,
        note: "Done, it holds.",
      });
    const verdicts = () => rows(`SELECT ok FROM verdict WHERE guide_id = '${id}'`);

    assert.equal((await answer(agent)).status, 409);
    assert.deepEqual(await verdicts(), []);

    assert.equal((await call("POST", "/v1/take", { ...agent, id })).status, 200);
    assert.equal((await answer({ ...agent, agent: "e2e-other-agent" })).status, 409);
    assert.deepEqual(await verdicts(), []);

    assert.equal((await answer(agent)).status, 200);
    assert.deepEqual(await verdicts(), [{ ok: 1 }], "what it was finished with stays on it");
    assert.equal((await answer(agent)).status, 409);
  } finally {
    process.env.PASSALONG_TOKEN = owner;
  }
});

test("a CLI below the server's floor is refused with what to run; the rest are served", {
  skip,
}, async () => {
  await setup();
  const me = (headers) =>
    fetch(`${API}/v1/me`, {
      headers: { authorization: `Bearer ${process.env.PASSALONG_TOKEN}`, ...headers },
    });
  const old = await me({ "x-passalong-version": "0.9.0" });
  assert.equal(old.status, 426);
  assert.match((await old.json()).message, /npm i -g passalong@latest/);
  assert.equal((await me({ "x-passalong-version": VERSION })).status, 200);
  // Node's own fetch with no version is every CLI up to 0.11.0, which is below the floor.
  assert.equal((await me({})).status, 426);
});

test("the status line shows what this worktree holds, from a cache it refreshes itself", {
  skip,
}, async () => {
  const env = await setup();
  const { p } = env;
  const { dir } = await readyTask(env, "Shown in the status line");
  const took = await p.take(undefined, { cwd: dir });
  const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "passalong");
  const input = JSON.stringify({ workspace: { current_dir: dir } });
  // The refresh is what the status line starts in the background; run it in the foreground here.
  execFileSync(process.execPath, [bin, "now", "--statusline-refresh", dir], { env: process.env });
  const line = execFileSync(process.execPath, [bin, "now", "--statusline"], {
    input,
    env: process.env,
  }).toString();
  assert.match(line, new RegExp(`▸ ${took.guide.id}`));
  assert.doesNotMatch(line, /\n/);
  await p.pass(took.guide.id, "testing the status line", { cwd: dir });
});

test("reassigning work: only the assignee's agents get it, and whoever is left out is told", {
  skip,
}, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };
  const worktree = () => {
    const dir = mkdtempSync(join(tmpdir(), "passalong-wt-"));
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", [
      "-C",
      dir,
      "remote",
      "add",
      "origin",
      `git@github.com:e2e/${account}.git`,
    ]);
    return dir;
  };

  const team = await api.createTeam(`assign ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const mate = await secondAccount();
  const handle = `mate${Date.now().toString(36)}`;
  as(mate.token);
  await api.join(code);
  await api.updateMe({ handle });

  as(owner);
  const task = work(serialize, "Assigned work", {
    status: "draft",
    target_context: `e2e/${account}`,
  });
  const id = (await p.publish(task, { to: team.slug })).guide.meta.id;
  await p.ready(id);
  assert.equal((await p.assign(id, `@${handle}`)).to, `@${handle}`);

  // Not the owner's agent any more: the queue skips it, and taking it by id says why.
  const mine = worktree();
  const skipped = await p.take(undefined, { cwd: mine });
  assert.notEqual(skipped.guide?.id, id);
  if (skipped.guide) await p.pass(skipped.guide.id, "not this one", { cwd: mine });
  await assert.rejects(p.take(id, { cwd: mine }), /assigned to someone else/);

  // The assignee's agent gets it.
  as(mate.token);
  const theirs = worktree();
  assert.equal((await p.take(id, { cwd: theirs })).guide.id, id);

  // To the whole team: nobody is left out, so the mate keeps it.
  as(owner);
  assert.equal((await p.assign(id, "team")).taken_back, 0);
  // To the owner instead: the mate's agent loses it, and the mate is told.
  const me = `own${Date.now().toString(36)}`;
  await api.updateMe({ handle: me });
  const back = await p.assign(id, `@${me}`);
  assert.equal(back.to, `@${me}`);
  assert.equal(back.taken_back, 1);
  await assert.rejects(p.assign(id, "@nobody-here"), (e) => e.status === 400);
  as(mate.token);
  assert.match(await heard(), /gave "Assigned work" to someone else/);
  as(owner);
});

test("whoever it is assigned to can pass it on, even to a teammate with no @name, and the author hears", {
  skip,
}, async () => {
  const env = await setup();
  const { p, serialize, account } = env;
  const api = await import("../src/api.js");
  const owner = process.env.PASSALONG_TOKEN;
  const as = (token) => {
    process.env.PASSALONG_TOKEN = token;
  };

  const team = await api.createTeam(`delegate ${Date.now()}`);
  await sql(`UPDATE team SET plan = 'team', seats = 5 WHERE slug = '${team.slug}'`);
  const { code } = await api.invite(team.slug);
  const ada = await secondAccount();
  const handle = `ada${Date.now().toString(36)}`;
  as(ada.token);
  await api.join(code);
  await api.updateMe({ handle });
  // A teammate who never chose an @name: addressed by their account id.
  as(owner);
  const { code: code2 } = await api.invite(team.slug);
  const quiet = await secondAccount();
  as(quiet.token);
  await api.join(code2);

  as(owner);
  const task = work(serialize, "Delegated work", {
    status: "draft",
    target_context: `e2e/${account}`,
  });
  const id = (await p.publish(task, { to: team.slug })).guide.meta.id;
  await p.ready(id);
  await p.assign(id, `@${handle}`);

  // Ada, the assignee, passes it on to the teammate with no @name.
  as(ada.token);
  const passed = await p.assign(id, `@${quiet.account}`);
  assert.equal(passed.to, `@${quiet.account}`);

  // The author hears who it went to. Ada is still in the team, so she can still move it: a team's
  // board is anyone's in it to move.
  as(owner);
  assert.match(await heard(), /gave "Delegated work" to someone else/);
  as(ada.token);
  assert.equal((await p.assign(id, `@${handle}`)).to, `@${handle}`);
  as(owner);
});

test("an image held as bytes attaches, and answers the check it was taken for", {
  skip,
}, async () => {
  // The door that was missing. Uploads took a path on this machine, so an agent whose
  // browser hands images back inline and never writes a file had no way to show anything — and,
  // refused for describing what it saw, it swapped to grep checks and put the observation in
  // `writeup`: "a grep proves the code changed, not that the screen renders right."
  const env = await setup();
  const { p } = env;
  const { id, dir } = await readyTask(env, "Evidence from bytes");

  const shot = await p.attachBytes(PNG.toString("base64"), { name: "the rendered header" });
  assert.ok(shot.id, "the bytes uploaded");
  assert.match(shot.markdown, /^!\[the rendered header\]\(/);
  assert.match(shot.url, /\/v1\/shots\//);
  // A data: URL is what several browser tools hand back, so it goes in without being stripped first.
  const asUrl = await p.attachBytes(`data:image/png;base64,${PNG.toString("base64")}`, {});
  assert.ok(asUrl.id);

  // And it is what makes a check showable rather than described: the same check refused a
  // paragraph a moment ago.
  await p.take(id, { cwd: dir });
  await p.handIn(id, {
    note: "Done, and it holds.",
    checks: [{ check: "the header renders in the brand colour", ran: `here it is: ${shot.url}` }],
    cwd: dir,
  });
  assert.equal(await stateOf(id), "done", "a shown check is proof, and finishing is final");
});

test("the server refuses a kind, takes new work Ready, and never starts it archived", {
  skip,
}, async () => {
  await setup();
  const rid = () => `k${Math.random().toString(36).slice(2, 9)}`;
  const put = (md, id = rid()) => call("PUT", `/v1/guides/${id}`, { markdown: md });
  const front = (extra) =>
    `---\ntitle: Some work\nsummary: Said to a person for the test.\n${extra}---\n\nFix it.\n`;

  const kinded = await put(front("kind: task\n"));
  assert.equal(kinded.status, 400, "a kind is refused by name: work has none");
  assert.match(kinded.message, /kind/);

  assert.equal((await put(front(""))).status, 201, "new work is Ready unless it says draft");
  const shelved = await put(front("status: consumed\n"));
  assert.equal(shelved.status, 409, "but it cannot start archived");
  assert.match(shelved.message, /can't start archived/);

  // A draft is stored as one, then a person moves it to Ready.
  const id = rid();
  assert.equal((await put(front("status: draft\n"), id)).status, 201);
  assert.deepEqual(await rows(`SELECT status FROM guide WHERE id = '${id}'`), [
    { status: "draft" },
  ]);
  assert.equal(
    (await call("PATCH", `/v1/guides/${id}/status`, { status: "published" })).status,
    200,
  );
  assert.deepEqual(await rows(`SELECT status FROM guide WHERE id = '${id}'`), [
    { status: "published" },
  ]);
});

test("a webhook URL with ?team= files onto that team's board; a team it can't use still files", {
  skip,
}, async () => {
  // A PostHog alert arrived as a draft only its account could see, and never reached the board.
  const { account } = await setup();
  const api = await import("../src/api.js");
  const team = (await api.createTeam(`hooks-${Date.now()}`)).slug;
  const key = `e2ehook${Date.now().toString(36)}`;
  await sql(
    `INSERT INTO inbound (account_id, key, created) VALUES ('${account}', '${key}', '${new Date().toISOString()}')`,
  );
  const hook = (query, title) =>
    fetch(`${API}/v1/in/${key}${query}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, id: title }),
    });
  assert.equal((await hook(`?team=${team}`, "Team alert")).status, 200);
  assert.equal((await hook("?team=no-such-team", "Stray alert")).status, 200);
  const filed = await rows(
    `SELECT g.title, COALESCE(t.slug, '') AS team, g.status FROM guide g LEFT JOIN team t ON t.id = g.team_id
      WHERE g.account_id = '${account}' AND g.title IN ('Team alert', 'Stray alert') ORDER BY g.title`,
  );
  assert.deepEqual(filed, [
    { title: "Stray alert", team: "", status: "published" },
    { title: "Team alert", team, status: "published" },
  ]);
});
