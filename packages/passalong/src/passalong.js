// The operations Passalong exposes. Both surfaces (bin/passalong and the MCP server) call these,
// so anything an agent can do through MCP a human can do from the terminal and vice versa.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, join } from "node:path";
import * as api from "./api.js";
import { context } from "./capture.js";
import { refusal, runChecks } from "./checks.js";
import * as store from "./store.js";
import { ID_RE, parse, STATUSES, serialize, stamp, unheldFields, validate } from "./work.js";

export class PassalongError extends Error {}

/**
 * Split `--to` into a team and who inside it: "team", "team/@handle", or "team/#group".
 *
 * Only the `@` is stripped. The `#` is load-bearing and travels into the frontmatter as written —
 * it is the sigil the server reads to tell a person from a group, and dropping it here would turn
 * work for six people into a lookup for a teammate who does not exist.
 */
export function parseTarget(to) {
  if (!to) return {};
  const [team, who] = String(to).split("/");
  return { team: team.trim(), to: who ? who.trim().replace(/^@/, "") : undefined };
}

/**
 * Store a piece of work from its markdown: fill in what is missing, validate, and send it. `to`
 * addresses it: "team", "team/@handle", or "team/#group"; with no team it goes to the account's
 * current one. `parent` names the work it came out of. Returns { work, url, notified }.
 */
export async function publish(markdown, { cwd = process.cwd(), to, parent } = {}) {
  const c = context(cwd);
  let work = stamp(parse(markdown), {
    author: c.author,
    source_context: c.branch && c.branch !== "HEAD" ? `${c.name}@${c.branch}` : c.name,
  });
  const target = parseTarget(to);
  if (target.team) work.meta.team = target.team;
  if (target.to) work.meta.to = target.to;
  if (!work.meta.team && api.loggedIn()) {
    const team = api.currentTeam();
    if (team) work.meta.team = team;
  }
  // An id is used as it is; a link or a file is read for the id in its own frontmatter. `validate()`
  // below is what refuses work that names itself.
  if (parent) work.meta.parent = await resolveId(String(parent).trim());
  if (work.meta.to && !work.meta.team)
    throw new PassalongError("`to:` needs a team — address it as team/@handle");
  const errors = [
    ...unheldFields(markdown).map(
      (k) =>
        `frontmatter "${k}" holds more than a string or a list of strings, and it would be dropped — move it into the body (a fenced yaml block keeps it as written)`,
    ),
    ...validate(work),
  ];
  if (errors.length)
    throw new PassalongError(`this is not ready to send:\n  - ${errors.join("\n  - ")}`);

  needsSync("sending work");
  const res = await api.publish(work.meta.id, serialize(work));
  work = { ...work, meta: { ...work.meta, url: res.url } };
  return { work, url: res.url, notified: Boolean(res.notified) };
}

/**
 * One piece of work or several, written from fields rather than markdown: what an agent hands over
 * when it writes work down. Each may name the earlier ones it needs by position (`after: [0, 1]`),
 * and those become its `blocked_by`, so they are handed out in an order that works and the
 * independent ones run side by side.
 *
 * Only earlier ones: work that waits on itself or on a later one never finishes, and it is refused
 * before anything is written rather than discovered as a queue that never moves. `draft` holds them
 * all in Draft, for a plan a person should read before any of it runs.
 */
export async function createWork(items, { draft = false, to, cwd = process.cwd() } = {}) {
  if (!Array.isArray(items) || !items.length)
    throw new PassalongError("say what the work is: at least one item");
  items.forEach((item, i) => {
    for (const j of item.after || [])
      if (!Number.isInteger(j) || j < 0 || j >= i)
        throw new PassalongError(
          `item ${i} ("${item.title}") can only wait on an earlier one, not ${j}`,
        );
  });
  const repo = context(cwd).repo;
  const made = [];
  for (const item of items) {
    const meta = {
      title: item.title,
      summary: item.summary,
      ...(draft ? { status: "draft" } : {}),
      target_context: item.repo ?? repo,
      ...(item.tags?.length ? { tags: item.tags } : {}),
    };
    const after = (item.after || []).map((j) => made[j].id);
    if (after.length) meta.blocked_by = after;
    const { work, url } = await publish(serialize({ meta, body: item.body || "" }), {
      cwd,
      to: item.to || to,
      parent: item.parent,
    });
    made.push({ id: work.meta.id, title: work.meta.title, status: work.meta.status, url });
  }
  return made;
}

/**
 * Replace a piece of work's text, by its id: the whole document, frontmatter first, as `find_work`
 * handed it over. What it is called and what it says are both in there.
 */
export async function updateText(id, markdown, { cwd = process.cwd() } = {}) {
  const g = parse(markdown);
  if (g.meta.id && g.meta.id !== id)
    throw new PassalongError(`the document says it is ${g.meta.id}, not ${id}`);
  return publish(serialize({ meta: { ...g.meta, id }, body: g.body }), { cwd });
}

/**
 * Resolve a reference (id, share URL, or local file path) to a piece of work. An id is the server's
 * to answer: nothing keeps a copy on this machine. `peek` reads without recording a pull.
 */
export async function resolve(ref, { peek = false } = {}) {
  if (/^https?:\/\//.test(ref)) {
    const md = await api.fetchShared(ref);
    return { work: parse(md), from: "link" };
  }
  if (ref.endsWith(".md") && existsSync(ref)) {
    return { work: parse(readFileSync(ref, "utf8")), from: "file" };
  }
  if (!ID_RE.test(ref))
    throw new PassalongError(`"${ref}" is not a passalong id, share link, or .md file`);
  needsSync("reading work by id");
  try {
    return { work: parse(await api.get(ref, { peek })), from: "sync" };
  } catch (err) {
    if (err.status === 404) throw new PassalongError(`no work "${ref}"`);
    throw err;
  }
}

/**
 * Resolve a reference to its id alone, without fetching it. A write needs an id and nothing else,
 * and `GET /v1/work/:id` records a pull; a link or a file carries the id in its own frontmatter.
 * A bare id is not checked here: the route the write goes to answers that.
 */
export async function resolveId(ref) {
  if (/^https?:\/\//.test(ref)) return parse(await api.fetchShared(ref)).meta.id;
  if (ref.endsWith(".md") && existsSync(ref)) return parse(readFileSync(ref, "utf8")).meta.id;
  if (ID_RE.test(ref)) return ref;
  throw new PassalongError(`"${ref}" is not a passalong id, share link, or .md file`);
}

/** Write a piece of work into `.passalong/<id>.md` under `cwd`, when somebody asked for a file. */
function saveTo(cwd, id, markdown) {
  const path = join(localDir(cwd), `${id}.md`);
  writeFileSync(path, markdown);
  return path;
}

/**
 * `.passalong/` in a working directory, made if it is missing.
 *
 * Work saved there carries its own share URL in the frontmatter, and that URL needs no account to
 * read. Committing this directory would publish it to anyone who can see the repo, so the directory
 * ignores itself. Delete its .gitignore if you do want it in the repo.
 */
function localDir(cwd) {
  const dir = join(cwd, ".passalong");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  return dir;
}

/**
 * Who this worktree is to the queue, minted the first time it asks.
 *
 * A claim belongs to an agent, not an account: one person runs several, and "no two agents on one
 * piece of work" means nothing if the server cannot tell them apart. The id lives in the worktree's
 * own `.passalong/agent.json`, so a restarted session in the same worktree is the same agent and
 * gets its work back, and a second worktree of the same repo is a different agent.
 */
export function agent(cwd = process.cwd()) {
  const c = context(cwd);
  const root = c.root || cwd;
  const file = join(localDir(root), "agent.json");
  let id = "";
  try {
    id = String(JSON.parse(readFileSync(file, "utf8")).id || "");
  } catch {}
  if (!/^[a-z0-9]{8,64}$/.test(id)) {
    id = randomBytes(12).toString("hex");
    writeFileSync(file, `${JSON.stringify({ id }, null, 2)}\n`);
  }
  return { agent: id, host: hostname(), repo: c.repo, worktree: root };
}

/** This worktree's agent if it has one, without creating it. `agent` is "" when there is none. */
function knownAgent(cwd = process.cwd()) {
  const c = context(cwd);
  const root = c.root || cwd;
  let id = "";
  try {
    id = String(JSON.parse(readFileSync(join(root, ".passalong", "agent.json"), "utf8")).id || "");
  } catch {}
  return { agent: /^[a-z0-9]{8,64}$/.test(id) ? id : "", repo: c.repo };
}

function needsSync(what) {
  if (!api.loggedIn())
    throw new PassalongError(
      `${what} needs sync — work lives on the server (run \`passalong login\`)`,
    );
}

/**
 * Take the next piece of work for this worktree's repo — always a new one, since an agent may hold
 * several. `null` when there is nothing to do. `alone` asks only for work a person marked safe to
 * run unattended (the runner).
 */
export async function nextWork({ cwd = process.cwd(), any = false, alone = false } = {}) {
  needsSync("taking work");
  const { task } = await api.nextTask({ ...agent(cwd), any, ...(alone ? { alone: true } : {}) });
  return task || null;
}

/**
 * The claim generation this worktree was given when it took a piece of work, kept in
 * `.passalong/held.json` beside `agent.json`. See apps/api/migrations/0029_claim_fence.sql.
 *
 * The agent never sees this number and is never asked for it — a model echoing an integer back
 * three calls later is not a lock. `take` writes it, and every call that writes to the claim sends
 * it, so a hand-in belonging to a claim that was released and re-taken is refused by the server
 * rather than landing on somebody else's work.
 */
function fenceFile(cwd) {
  return join(localDir(agent(cwd).worktree), "held.json");
}

function heldFences(cwd) {
  try {
    const held = JSON.parse(readFileSync(fenceFile(cwd), "utf8"));
    return held && typeof held === "object" ? held : {};
  } catch {
    return {};
  }
}

/** The number this worktree holds for a piece of work, or undefined when it has none to send. */
function fenceFor(id, cwd) {
  const n = heldFences(cwd)[id];
  return Number.isInteger(n) ? n : undefined;
}

function rememberFence(id, fence, cwd) {
  if (!Number.isInteger(fence)) return;
  const held = heldFences(cwd);
  held[id] = fence;
  writeFileSync(fenceFile(cwd), `${JSON.stringify(held, null, 2)}\n`);
}

/** A check a runner executed: the command it ran, and what the process returned. See checks.js. */
const verified = (c) => Boolean(c?.cmd) && (typeof c?.exit === "number" || c?.exit === null);

/**
 * What a hand-in has to carry, checked before it is sent. The rule and the wording are the
 * server's — see evidenceProblem() in apps/api/src/claims.ts.
 */
function requireEvidence(evidence) {
  const said = String(evidence || "").trim();
  if (said.length >= 16) return;
  throw new PassalongError(
    "send `evidence`: what you ran and what came back — the command and the lines that decided " +
      "it, a test summary, a link to the change, or a screenshot url. " +
      `"${said || "nothing"}" is a claim, not evidence.`,
  );
}

/**
 * The calls every piece of work answers to. Each answer carries `next`, the calls that make sense
 * from here, and `say` when the move is to stop.
 *
 * take: this worktree's agent takes work `id` (an id, a share link or a saved .md), or with no id
 * the next one waiting for it. The document comes back in the answer, and is written to
 * `.passalong/<id>.md` only when `save` asks.
 */
export async function take(id, { cwd = process.cwd(), any = false, save = false } = {}) {
  needsSync("taking work");
  const who = agent(cwd);
  const r = await api.take({ ...who, ...(id ? { id: await resolveId(id) } : {}), any });
  if (!r.work?.markdown) return r;
  rememberFence(r.work.id, r.work.fence, cwd);
  return { ...r, path: save ? saveTo(who.worktree, r.work.id, r.work.markdown) : null };
}

/** Word from the agent that holds it: the lease starts again, and `note` is what the hub shows. */
export async function progress(id, note, { cwd = process.cwd() } = {}) {
  needsSync("reporting progress");
  const fence = fenceFor(id, cwd);
  return api.progress(id, {
    agent: agent(cwd).agent,
    ...(note ? { note } : {}),
    ...(fence === undefined ? {} : { fence }),
  });
}

/**
 * Finished here: the work goes to Done with what was shown. Every hand-in carries `evidence` or
 * `checks` — what was run and what came back — because the note is the agent's word for its own
 * work and evidence is the part a person can check. `writeup` is what had to be adapted.
 */
export async function handIn(
  id,
  {
    note = "",
    evidence = "",
    checks = [],
    writeup = "",
    risk = "",
    pr = "",
    cwd = process.cwd(),
  } = {},
) {
  needsSync("handing work in");
  // A check that names a command is run here, before anything is sent. Checks that already carry
  // an exit came from the MCP server's own runner and are left alone, so nothing runs twice.
  const pending = checks.filter((c) => c?.cmd && typeof c?.exit !== "number" && c?.exit !== null);
  if (pending.length) {
    const done = runChecks(pending, { cwd });
    const byCheck = new Map(done.checks.map((c) => [c.check, c]));
    checks = checks.map((c) => byCheck.get(c.check) ?? c);
    if (done.failed) {
      throw new Error(refusal(done.failed, { ran: done.ran, total: checks.length }));
    }
  }
  // Checks are evidence, sorted against what they answer: bringing them is bringing it. A check
  // whose command was actually run is exempt from the length rule — its exit code is the evidence.
  if (checks.length) checks.forEach((c) => (verified(c) ? null : requireEvidence(c?.ran)));
  else requireEvidence(evidence);
  const fence = fenceFor(id, cwd);
  return api.handIn(id, {
    agent: agent(cwd).agent,
    note,
    evidence,
    ...(fence === undefined ? {} : { fence }),
    ...(checks.length
      ? {
          checks: checks.map((c) => ({
            check: c.check,
            ran: c.ran,
            // What the agent says happened, in plain words, for the person's table.
            ...(c.says ? { says: c.says } : {}),
            // Only present on a check that was run. The server keeps them apart the same way.
            ...(verified(c) ? { cmd: c.cmd, exit: c.exit, ok: c.ok } : {}),
          })),
        }
      : {}),
    // Each left out when there is nothing to say, rather than sent as "".
    ...(writeup ? { writeup } : {}),
    ...(risk ? { risk } : {}),
    ...(pr ? { pr } : {}),
  });
}

/**
 * Give work to someone else in its team: `@handle` for one person, `#group` for the people who do
 * a thing, or "team" (or empty) for everyone. Whoever held it and is left out has it taken back and
 * is told.
 */
export async function assign(ref, to) {
  needsSync("giving work to someone");
  const id = await resolveId(ref);
  const target = !to || to === "team" || to === "everyone" ? "" : String(to).trim();
  return api.assign(id, target);
}

/** Not this agent's to do: what it held is open again, and `why` goes to whoever is next. */
export async function pass(id, why, { cwd = process.cwd() } = {}) {
  needsSync("passing work");
  if (!String(why || "").trim())
    throw new PassalongError("say why you are passing it, so whoever is next knows");
  const fence = fenceFor(id, cwd);
  return api.pass(id, {
    agent: agent(cwd).agent,
    why,
    ...(fence === undefined ? {} : { fence }),
  });
}

/**
 * Ask the person a question and wait, keeping what you hold. Not `pass`, which gives the work back,
 * and not `progress`, which says carry on: the answer to this one is "stop, and take it again when
 * they have replied", and the reply comes back with that `take`.
 */
export async function ask(id, question, { cwd = process.cwd() } = {}) {
  needsSync("asking");
  if (!String(question || "").trim())
    throw new PassalongError("say what you need to know, so the person can answer it");
  const fence = fenceFor(id, cwd);
  return api.ask(id, {
    agent: agent(cwd).agent,
    question,
    ...(fence === undefined ? {} : { fence }),
  });
}

/** Why a piece of work needs its author, or "" when it does not. Mirrors needsWhy() in mcp-http.ts. */
export function needsWhy(t) {
  if (!t.mine) return "";
  if (t.state === "draft") return "in Draft: read it and mark it Ready";
  if (t.state === "stalled") return "its agent went quiet";
  if (t.claim?.asking) return `asking you: ${t.claim.asking}`;
  if (/^BLOCKED:/i.test(t.claim?.note || ""))
    return `stuck on you: ${t.claim.note.replace(/^BLOCKED:\s*/i, "")}`;
  return "";
}

/**
 * The work board, the way `find_work` with nothing hands it over and `passalong board` prints it:
 * what needs you, who is on what, and what is ready to take. Built from `/v1/tasks` (every piece of
 * work you can see, with its state) and `/v1/working` (everything someone holds).
 */
export async function board() {
  needsSync("the board");
  const [{ tasks }, { working }] = await Promise.all([api.tasks(), api.working()]);
  const hub = `${api.baseUrl()}/hub`;
  const who = (b = {}) => (b.you ? "You" : b.name || (b.handle ? `@${b.handle}` : "A teammate"));
  const needs = tasks
    .map((t) => ({ id: t.id, title: t.title, why: needsWhy(t), url: `${hub}/w/${t.id}` }))
    .filter((t) => t.why);
  return {
    hub,
    counts: {
      needs: needs.length,
      working: working.length,
      open: tasks.filter((t) => ["ready", "blocked", "draft"].includes(t.state)).length,
      done: tasks.filter((t) => t.state === "done").length,
    },
    needs,
    working: working.map((w) => ({
      id: w.id,
      title: w.title,
      who: who(w.by),
      note: w.note,
      stalled: w.state === "stalled",
      url: w.url,
    })),
    ready: tasks
      .filter((t) => t.state === "ready")
      .map((t) => ({
        id: t.id,
        title: t.title,
        target: t.target || "",
        to: t.to || "",
        url: t.url,
      })),
  };
}

/**
 * What this worktree's agent holds right now, and what is waiting: what the session-start and stop
 * hooks read (src/hooks.js). Counts are best effort — a hook must never fail a session over one.
 */
export async function now({ cwd = process.cwd() } = {}) {
  needsSync("seeing what you hold");
  // Read, never minted: the hooks run in every repo a session opens, and a worktree that has never
  // taken anything has no agent — and should not be given a .passalong/ project for asking.
  const who = knownAgent(cwd);
  const [w, t] = await Promise.allSettled([api.working(), api.tasks()]);
  if (w.status === "rejected") throw w.reason;
  const held = who.agent ? w.value.working.filter((x) => x.agent === who.agent && x.by?.you) : [];
  const tasks = t.status === "fulfilled" ? t.value.tasks : [];
  return {
    held,
    ready: tasks.filter((x) => x.state === "ready" && x.target === who.repo).length,
    needs: tasks.filter((x) => needsWhy(x)).length,
    agent: who.agent,
  };
}

/** Finished work back to To do, with why. */
export async function reopen(id, why) {
  needsSync("reopening work");
  if (!String(why || "").trim())
    throw new PassalongError("say why: whoever takes it next reads it");
  return api.reopen(await resolveId(id), why);
}

/** Take it back from whoever is holding it. */
export async function release(id) {
  needsSync("taking work back");
  return api.release(await resolveId(id));
}

/**
 * The image types work can carry. Mirrors SHOT_TYPES in apps/api/src/shots.ts — the server is the
 * authority and refuses anything else; this is what lets a local caller find out before spending an
 * upload on it.
 */
export const SHOT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * The same upload as `attach()`, for an agent that has the image and not a path to it: a browser
 * pane hands an image back as a tool result and never writes a file. Base64 in a tool call is fine
 * here, where this server is a local process talking to the same upload the file path uses.
 */
export async function attachBytes(data, { name = "", type = "image/png" } = {}) {
  needsSync("adding a file");
  const allowed = new Set(Object.values(SHOT_TYPES));
  if (!allowed.has(type))
    throw new PassalongError(`pictures must be ${[...allowed].join(", ")} — ${type} is not one`);
  // A data: URL is what several browser tools hand back, so it is accepted rather than made the
  // caller's problem to strip.
  const bytes = Buffer.from(String(data).replace(/^data:[^,]*,/, ""), "base64");
  if (!bytes.length) throw new PassalongError("`data` decoded to nothing");
  // The server's own ceiling, checked here so a large paste fails before it is sent.
  if (bytes.length > 5 * 1024 * 1024)
    throw new PassalongError(
      `that image is ${Math.round(bytes.length / 1024 / 1024)}MB and the limit is 5MB — write it to a file and pass its path`,
    );
  const label = name || "screenshot";
  const shot = await api.uploadShot(bytes, type, label);
  return { ...shot, markdown: `![${label}](${shot.url})` };
}

/**
 * Upload a picture from disk, and return the markdown that points at it. It belongs *in* the work's
 * text or a hand-in check: `claimShots` binds the upload to whichever document names it, which is
 * why this returns a line to paste rather than taking an id.
 */
export async function attach(file, { name = "" } = {}) {
  needsSync("adding a file");
  if (!existsSync(file)) throw new PassalongError(`no file at ${file}`);
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  const type = SHOT_TYPES[ext];
  if (!type)
    throw new PassalongError(
      `pictures must be ${[...new Set(Object.values(SHOT_TYPES))].join(", ")} — ${ext || file} is not one`,
    );
  const shot = await api.uploadShot(readFileSync(file), type, name || basename(file));
  return { ...shot, markdown: `![${name || basename(file)}](${shot.url})` };
}

/**
 * What a file's extension suggests it is. A hint only: the server reads the bytes and decides, and
 * refuses what it does not keep.
 */
const FILE_HINTS = {
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".md": "text/markdown",
};

/** The most the server keeps of one file. Mirrors ATTACH_MAX in apps/api/src/attachments.ts. */
const FILE_MAX = 10 * 1024 * 1024;

/**
 * Upload a file that is not a picture — a log, a PDF, a CSV, a zip — and return the markdown line
 * that points at it. It is private: whoever can read the work can download it, and nobody else.
 */
export async function attachFile(file, { name = "" } = {}) {
  needsSync("adding a file");
  if (!existsSync(file)) throw new PassalongError(`no file at ${file}`);
  const bytes = readFileSync(file);
  if (!bytes.length) throw new PassalongError(`${file} is empty`);
  if (bytes.length > FILE_MAX)
    throw new PassalongError(
      `${file} is ${Math.round(bytes.length / 1024 / 1024)}MB and the limit is 10MB — send a link instead`,
    );
  const ext = file.includes(".") ? file.slice(file.lastIndexOf(".")).toLowerCase() : "";
  const label = (name || basename(file)).replace(/[[\]()]/g, "");
  const attachment = await api.uploadFile(bytes, FILE_HINTS[ext] || "", name || basename(file));
  return { ...attachment, markdown: `[${label}](${attachment.url})` };
}

/** A picture or any other file from disk, whichever it is, as the line that points at it. */
export function attachAny(file, opts = {}) {
  const isImage = Object.keys(SHOT_TYPES).some((x) => file.toLowerCase().endsWith(x));
  return (isImage ? attach : attachFile)(file, opts);
}

/**
 * Write to whoever holds a piece of work, or leave a note on one nobody holds yet. `files` are
 * paths, each uploaded and added as a line of the message. The server decides who may write and
 * whether anyone is listening, and says so in words.
 */
export async function reply(ref, text, { files = [] } = {}) {
  needsSync("replying");
  const lines = [];
  for (const file of files) lines.push((await attachAny(file)).markdown);
  const body = [String(text || "").trim(), ...lines].filter(Boolean).join("\n");
  if (!body) throw new PassalongError("say something, or attach a file");
  return api.reply(await resolveId(ref), body);
}

/**
 * What an agent is told after the work it opened: where what it learns goes. Knowledge belongs in
 * the project's documents, where the next person finds it; work somebody else should now do is new
 * work. Neither is a second document handed to one person. Mirrors AFTER in apps/api/src/mcp-http.ts.
 */
export const AFTER =
  "<!-- passalong: what you learn doing this — how something works, a decision and why — goes " +
  "into the project's documents (find_projects, read_document, save_document), not into a new " +
  "piece of work. Work somebody else should now do is create_work with `parent` set to this id. " +
  "What you did and how you checked it goes on hand_in. -->";

/**
 * The work this one came out of, formatted to go in front of it — or "" when there is none.
 *
 * A piece of work read on its own can look like the whole job when it is one part of a bigger one,
 * and where the bigger one has got to is part of the context. Injectable for testing, and never
 * worth failing the call over: the work itself is what was asked for. Mirrors parentOf() in
 * apps/api/src/mcp-http.ts.
 */
export async function parentWork(meta = {}, { parent = api.parent, loggedIn = api.loggedIn } = {}) {
  if (!meta.id || !meta.parent || !loggedIn()) return "";
  try {
    const { work } = await parent(meta.id, { markdown: true });
    if (!work?.id) return "";
    const who = work.by?.name || (work.by?.handle ? `@${work.by.handle}` : "");
    const state = work.state === "held" && who ? `held by ${who}` : work.state || "open";
    return (
      `THIS CAME OUT OF ${work.id}: ${work.title || "untitled"} — ${state}. It is part of that ` +
      "work, which is below; read it first. If this depends on " +
      `${work.id} being done and it is not, say so rather than starting.\n\n` +
      `--- the work it came out of: ${work.id} ---\n${String(work.markdown ?? "").trimEnd()}\n\n`
    );
  } catch {
    return "";
  }
}

/** Work on the server this account can see, newest first, optionally filtered. */
export async function list(query = "", { scope = "" } = {}) {
  needsSync("finding work");
  return (await api.list(query, scope)).work;
}

/** Archive a piece of work (`done`), make it Ready, or put it in Draft. */
export async function setStatus(id, status) {
  if (!STATUSES.includes(status))
    throw new PassalongError(`status must be one of ${STATUSES.join(", ")}`);
  needsSync("changing work");
  return api.setStatus(await resolveId(id), status);
}

/** Move work from Draft to Ready: a person has read it, and whoever it is for may take it now. */
export async function ready(id) {
  const { work } = await resolve(id, { peek: true });
  if (work.meta.status !== "draft")
    throw new PassalongError(`${work.meta.id} is not in Draft (status: ${work.meta.status})`);
  await setStatus(work.meta.id, "ready");
  return work.meta.id;
}

/** What an agent started by `work()` is told. The work itself goes in too, so it cannot start blind. */
export function workPrompt(t) {
  return [
    `You hold passalong work ${t.id}, and no other agent can take it while you do. Here it is:`,
    "",
    t.markdown.trim(),
    "",
    "Do it in this repo: read it, work out what done means, and get there. Call the passalong MCP",
    `tool progress with id ${t.id} and a one-line status at each milestone — 30 minutes of`,
    "silence stalls it. When it is done, commit what you changed as one commit whose message",
    `starts with "${t.id}: " — several pieces of work share this worktree, and a person reads each`,
    `one's change on its own. Then call hand_in with id ${t.id}, \`pr\` set to that commit's hash,`,
    "`note`: one plain sentence saying what you did, and `evidence`: what you ran and what came",
    "back — the commands and the lines that decided it, the test summary, the commit. Keep that",
    "as you go; at the end you would be writing it from memory. What you learned about the",
    "project goes into its documents (save_document). If a call says you no longer hold it, stop.",
    "",
    "Nobody reads what you print: this session runs unattended. If something only a person can",
    "do stands between you and done — a permission, a secret, a decision — call",
    `progress with id ${t.id} and a note starting "BLOCKED: " that says exactly what you`,
    "need, leave it unfinished and uncommitted, and stop. The board shows that note.",
  ].join("\n");
}

/**
 * Work the queue from this worktree: take the next piece of work, hand it to an agent, and when the
 * agent has finished it take the next, until there is nothing left.
 *
 * The agent runs in this worktree, so it is the same agent to the queue — its progress and
 * hand_in land on the claim this took. `agent` is a command the prompt is appended to;
 * `claude -p` by default, or whatever PASSALONG_AGENT says.
 *
 * An agent that exits without finishing stops the loop, rather than piling up half-done work. It
 * stays held here, for a person to see on the board and resume (take it) or release.
 *
 * `watch` is the runner (docs/LOOP.md §1a): left running on an always-on machine with the repo
 * checked out, it takes only work a person marked safe to run alone, waits `every` seconds when
 * there is none, and keeps going past work its agent did not finish — that stays held here, the
 * sweep puts it back in the queue once it goes quiet, and a second time a person is told it is
 * stuck. Nobody is watching, so nothing stops for a person.
 */
export async function work({
  cwd = process.cwd(),
  agent = process.env.PASSALONG_AGENT || "claude -p",
  any = false,
  once = false,
  watch = false,
  every = 60,
  onTask = () => {},
  onIdle = () => {},
  onUnfinished = () => {},
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  needsSync("working the queue");
  const [command, ...args] = agent.trim().split(/\s+/);
  const finished = [];
  for (;;) {
    const t = await nextWork({ cwd, any, alone: watch });
    if (!t && watch) {
      onIdle();
      await sleep(Math.max(10, every) * 1000);
      continue;
    }
    if (!t) return { finished, stopped: "empty" };
    onTask(t);
    const run = spawnSync(command, [...args, workPrompt(t)], {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PASSALONG_TASK: t.id },
    });
    const state = (await api.tasks()).tasks.find((x) => x.id === t.id)?.state;
    if (state !== "done" && watch) {
      onUnfinished(t, state, run.status ?? run.error?.message);
      continue;
    }
    if (state !== "done")
      return {
        finished,
        stopped: "unfinished",
        task: t.id,
        state,
        exit: run.status ?? run.error?.message,
      };
    finished.push(t.id);
    if (once) return { finished, stopped: "once" };
  }
}

/**
 * Make every piece of work you wrote that is still in Draft ready, and return their ids. For the
 * moment a planner has written several and you have read them all. Only your own: sending work on
 * is its author's call.
 */
export async function readyDrafts() {
  const drafts = (await list("", { scope: "mine" })).filter((g) => g.status === "draft");
  for (const g of drafts) await setStatus(g.id, "ready");
  return drafts.map((g) => g.id);
}

export async function remove(id) {
  // Server first: if it refuses (not the author), the local copy must survive too.
  if (api.loggedIn()) {
    try {
      await api.remove(id);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  store.remove(id);
}

/**
 * Write every piece of work to a directory as plain markdown: signed in, every one the server lets
 * this account read, and the local store's own besides. Returns the paths written.
 */
export async function exportAll(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const paths = new Map();
  if (api.loggedIn()) {
    let after = "";
    do {
      const page = await api.exportPage(after);
      for (const g of page.work) paths.set(g.id, g.markdown);
      after = page.next;
    } while (after);
  }
  for (const g of store.list()) if (!paths.has(g.meta.id)) paths.set(g.meta.id, serialize(g));
  return [...paths].map(([id, md]) => {
    const p = join(dir, `${id}.md`);
    writeFileSync(p, md);
    return p;
  });
}

// The host this product answered on before passalong.dev. It serves the same data, so a copy
// whose url names it belongs to the default API.
const OLD_HOST = "passalong.kreativekorna.com";
const hostOf = (url) => {
  try {
    const { host, hostname } = new URL(url);
    if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return "";
    return host === OLD_HOST ? new URL(api.DEFAULT_API).host : host;
  } catch {
    return "";
  }
};
// Raised whenever tidy learns to remove something it used to keep, so machines that tidied run it once more.
const TIDIED = 2;

/**
 * Once per machine, signed in: drop the local copies the server says it holds. They were written
 * by every share, pull and take before `keep()`, and nothing ever removed one. Every login on the
 * machine is asked, since a copy may be any of theirs. A copy whose `url:` is on a login's own host
 * and that the server answers 404 for was since deleted, and goes too. Anything else — no url,
 * localhost, another host, or an answer that was neither 200 nor 404 — is left where it is, and an
 * export that failed leaves the flag unset so the next start tries again.
 */
export async function tidy() {
  const logins = api.logins();
  if (!logins.length || store.readConfig().tidied === TIDIED) return 0;
  const local = new Map(store.list().map((g) => [g.meta.id, hostOf(g.meta.url)]));
  let removed = 0;
  let sure = true;
  const drop = (id) => {
    if (!local.delete(id)) return;
    store.remove(id);
    removed++;
  };
  for (const as of logins) {
    try {
      let after = "";
      do {
        const page = await api.exportPage(after, as);
        for (const g of page.work) drop(g.id);
        after = page.next;
      } while (after && local.size);
    } catch {
      sure = false;
    }
  }
  const said = new Map();
  for (const as of logins) {
    const host = hostOf(as.api);
    const ids = [...local].filter(([, h]) => h && h === host).map(([id]) => id);
    // Eight at a time: a few hundred copies is a few seconds, not a few hundred open requests.
    for (let i = 0; i < ids.length; i += 8)
      await Promise.all(
        ids.slice(i, i + 8).map(async (id) => {
          const status = await api.get(id, { peek: true, as }).then(
            () => 200,
            (err) => err.status ?? 0,
          );
          said.set(id, [...(said.get(id) ?? []), status]);
        }),
      );
  }
  for (const [id, statuses] of said)
    if (statuses.includes(200) || statuses.every((s) => s === 404)) drop(id);
  if (sure) store.writeConfig({ tidied: TIDIED });
  return removed;
}
