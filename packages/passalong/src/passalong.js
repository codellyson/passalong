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
import * as runner from "./runner.js";
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
    throw new PassalongError("`to:` needs a team: address it as team/@handle");
  const errors = [
    ...unheldFields(markdown).map(
      (k) =>
        `frontmatter "${k}" holds more than a string or a list of strings, and it would be dropped: move it into the body (a fenced yaml block keeps it as written)`,
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
      `${what} needs sync: work lives on the server (run \`passalong login\`)`,
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
    "send `evidence`: what you ran and what came back, with the command and the lines that decided " +
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

/**
 * Not this agent's to do: what it held is open again, and `why` goes to whoever is next. `runner`
 * says the runner is giving it back, unfinished: the server then clears its Safe to run alone tick,
 * so it waits for a person rather than going straight back to an unattended agent.
 */
export async function pass(id, why, { cwd = process.cwd(), runner = false } = {}) {
  needsSync("passing work");
  if (!String(why || "").trim())
    throw new PassalongError("say why you are passing it, so whoever is next knows");
  const fence = fenceFor(id, cwd);
  return api.pass(id, {
    agent: agent(cwd).agent,
    why,
    ...(fence === undefined ? {} : { fence }),
    ...(runner ? { runner: true } : {}),
  });
}

/**
 * Ask the person a question and wait, keeping what you hold. Not `pass`, which gives the work back,
 * and not `progress`, which says carry on: the answer to this one is "stop, and take it again when
 * they have replied", and the reply comes back with that `take`.
 */
export async function ask(id, question, { cwd = process.cwd(), choices } = {}) {
  needsSync("asking");
  if (!String(question || "").trim())
    throw new PassalongError("say what you need to know, so the person can answer it");
  const fence = fenceFor(id, cwd);
  return api.ask(id, {
    agent: agent(cwd).agent,
    question,
    ...(fence === undefined ? {} : { fence }),
    // Options the person picks from with a tap in the hub; the pick comes back as the reply.
    ...(Array.isArray(choices) && choices.length ? { choices } : {}),
  });
}

/** Why a piece of work needs its author, or "" when it does not. Mirrors needsWhy() in mcp-http.ts. */
export function needsWhy(t) {
  if (!t.mine) return "";
  if (t.state === "draft") return "in Draft: read it and mark it Ready";
  if (t.state === "stalled") return "its agent went quiet";
  if (t.state === "review") return "the runner finished it: ready for your review";
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
    throw new PassalongError(`pictures must be ${[...allowed].join(", ")}: ${type} is not one`);
  // A data: URL is what several browser tools hand back, so it is accepted rather than made the
  // caller's problem to strip.
  const bytes = Buffer.from(String(data).replace(/^data:[^,]*,/, ""), "base64");
  if (!bytes.length) throw new PassalongError("`data` decoded to nothing");
  // The server's own ceiling, checked here so a large paste fails before it is sent.
  if (bytes.length > 5 * 1024 * 1024)
    throw new PassalongError(
      `that image is ${Math.round(bytes.length / 1024 / 1024)}MB and the limit is 5MB: write it to a file and pass its path`,
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
      `pictures must be ${[...new Set(Object.values(SHOT_TYPES))].join(", ")}: ${ext || file} is not one`,
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
      `${file} is ${Math.round(bytes.length / 1024 / 1024)}MB and the limit is 10MB: send a link instead`,
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
  "<!-- passalong: what you learn doing this (how something works, a decision and why) goes " +
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
/**
 * What to know before starting, as the server hands it over on take: each project the work is filed
 * in, its README and the names of its other documents — or "" when it is in none. It sits in front
 * of the work, after the work it came out of. Mirrors projectsNote in apps/api/src/mcp-http.ts.
 */
export function projectsNote(projects) {
  if (!Array.isArray(projects) || !projects.length) return "";
  const blocks = projects.map((p) => {
    const name = p.title || p.id;
    const where = `${name} (${p.id})${p.repo ? `, built from ${p.repo}` : ""}`;
    const about = p.description ? ` ${p.description}` : "";
    const lead = p.readme
      ? `WHAT TO KNOW FIRST: this work is filed in the project ${where}.${about} Its README is ` +
        "below: read it before you start."
      : `WHAT TO KNOW FIRST: this work is filed in the project ${where}.${about} It has no README yet.`;
    const readme = p.readme
      ? `\n\n--- README of ${name}: document ${p.readme.id} ---\n${p.readme.body.trimEnd()}\n` +
        (p.readme.cut ? `…it goes on: read_document ${p.readme.id} for the rest.\n` : "")
      : "\n";
    const docs = p.documents?.length
      ? "Its other documents: open the ones that bear on this with read_document: " +
        `${p.documents.map((d) => `"${d.name}" (${d.id})`).join(", ")}` +
        `${p.more ? `, and ${p.more} more (find_projects id ${p.id})` : ""}.\n`
      : "";
    return `${lead}${readme}${docs}`;
  });
  return `${blocks.join("\n")}\n`;
}

export async function parentWork(meta = {}, { parent = api.parent, loggedIn = api.loggedIn } = {}) {
  if (!meta.id || !meta.parent || !loggedIn()) return "";
  try {
    const { work } = await parent(meta.id, { markdown: true });
    if (!work?.id) return "";
    const who = work.by?.name || (work.by?.handle ? `@${work.by.handle}` : "");
    const state = work.state === "held" && who ? `held by ${who}` : work.state || "open";
    return (
      `THIS CAME OUT OF ${work.id}: ${work.title || "untitled"} (${state}). It is part of that ` +
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
    `tool progress with id ${t.id} and a one-line status at each milestone; 30 minutes of`,
    "silence stalls it. When it is done, commit what you changed as one commit whose message",
    `starts with "${t.id}: ": several pieces of work share this worktree, and a person reads each`,
    `one's change on its own. Then call hand_in with id ${t.id}, \`pr\` set to that commit's hash,`,
    "`note`: one plain sentence saying what you did, and `evidence`: what you ran and what came",
    "back, with the commands and the lines that decided it, the test summary, the commit. Keep that",
    "as you go; at the end you would be writing it from memory. What you learned about the",
    "project goes into its documents (save_document). If a call says you no longer hold it, stop.",
    "",
    "Nobody reads what you print: this session runs unattended. If something only a person can",
    "do stands between you and done (a permission, a secret, a decision), call",
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
 * The runner, which takes work marked safe to run alone with nobody watching, is watch() below.
 */
export async function work({
  cwd = process.cwd(),
  agent = process.env.PASSALONG_AGENT || "claude -p",
  any = false,
  once = false,
  onTask = () => {},
} = {}) {
  needsSync("working the queue");
  const [command, ...args] = agent.trim().split(/\s+/);
  const finished = [];
  for (;;) {
    const t = await nextWork({ cwd, any });
    if (!t) return { finished, stopped: "empty" };
    onTask(t);
    const run = spawnSync(command, [...args, workPrompt(t)], {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PASSALONG_TASK: t.id },
    });
    const state = (await api.tasks()).tasks.find((x) => x.id === t.id)?.state;
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
 * The runner (src/runner.js, docs/LOOP.md §1a): work a person ticked Safe to run alone, each piece in
 * a git worktree of its own beside its checkout, on its own branch, by an agent that finishes with
 * a pull request. Up to `atOnce` at a time, with no count a day; a run that ends without the work
 * done passes it back to its author. Runs until stopped; `sleep` is how the tests stop it.
 *
 * When the agent's usage runs out (runner.usageOut) its work is not given back: it stays held here
 * with its worktree, the runner takes nothing new, and once the usage is back (when the agent said,
 * or every `USAGE_RETRY_MS`) it carries on where it stopped.
 *
 * Started inside a checkout it serves that repo. Started in a folder of checkouts it serves every
 * one with an `origin` remote, so one terminal does what six used to. The folder is checked before
 * anything is said (`onStart`), so a runner that cannot run says why instead of what it will do.
 *
 * Work is asked for before a worktree is made: the agent's id is minted first and written into the
 * worktree once there is work for it, so a runner serving many repos does not make and remove a
 * worktree in each of them every minute. What the agent does is read as it goes (runner.describe)
 * and sent to the hub every few seconds as steps, and to `onStep` for the terminal.
 */
export async function watch({
  cwd = process.cwd(),
  agent: command,
  every = 60,
  atOnce = runner.LIMITS.atOnce,
  minutes = runner.LIMITS.minutes,
  cli,
  git = runner.git,
  runAgent = runner.runAgent,
  now = () => Date.now(),
  countFile = join(store.HOME, "runner.json"),
  machine = runner.machineName,
  onStart = () => {},
  onTask = () => {},
  onStep = () => {},
  onIdle = () => {},
  onPaused = () => {},
  onDone = () => {},
  untilIdle = false,
  onFinished = () => {},
  onPassed = () => {},
  onWaiting = () => {},
  onResumed = () => {},
  onTrouble = () => {},
  report = api.runnerStatus,
  postSteps = api.workSteps,
  stepEvery = 5,
  signals = false,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  needsSync("running work");
  const inside = context(cwd).root;
  const { found, skipped } = runner.checkoutsIn(cwd, { git });
  if (inside && !found.length)
    throw new PassalongError(
      "this checkout has no `origin` remote: the runner pushes each change to a branch there",
    );
  if (!found.length)
    throw new PassalongError(
      `there's no git checkout in ${cwd} or the folders under it` +
        (skipped.length ? ` with an \`origin\` remote (${skipped.length} without one)` : "") +
        ". Start the runner inside a repo, or in the folder that holds your repos.",
    );
  const checkouts = found.map(({ root, remote }) => {
    const runs = runner.runsDirOf(root);
    mkdirSync(runs, { recursive: true });
    return { root, runs, repo: context(root).repo || remote, forge: runner.forgeOf(remote) };
  });
  const repos = checkouts.map((k) => k.repo);
  const name = machine();
  onStart({ repos, skipped });

  // What it is on, said to the hub once a minute and whenever it changes (PUT /v1/runner), so
  // nobody has to look at this terminal to know. A failed report never stops a run.
  const onNow = new Map();
  const say = (stopped = false) =>
    Promise.resolve(
      report({
        host: name,
        repo: checkouts.length === 1 ? repos[0] : `${basename(cwd)}/`,
        repos,
        running: [...onNow].map(([id, title]) => ({ id, title })),
        runs_today: runner.runsToday(countFile, runner.dayOf(now())),
        per_day: 0,
        at_once: atOnce,
        stopped,
      }),
    ).catch(() => {});
  // Ctrl-C: the hub hears it stopped. Agents running then stop with it, since they share the
  // terminal; what they held stays held, and the sweep puts it back once it goes quiet.
  if (signals)
    process.once("SIGINT", async () => {
      await Promise.race([say(true), new Promise((r) => setTimeout(r, 2000))]);
      process.exit(130);
    });
  /**
   * The agent's command for one run: `--agent` as given, else Claude Code with what the server's
   * brief allows it (runner-brief.ts on the server), or this package's own list without one.
   */
  const agentRun = (brief) =>
    command
      ? { command: command.trim().split(/\s+/)[0], args: command.trim().split(/\s+/).slice(1) }
      : runner.claudeCommand({
          cli,
          ...(brief?.permissions?.allow ? { permissions: brief.permissions } : {}),
        });

  /**
   * Make the worktree a taken piece of work runs in, as the agent whose id took it. Work sent back
   * from review starts where its last run left off: on its pushed branch, not from scratch, which
   * would also leave the agent unable to push over its own earlier commits.
   */
  function worktreeFor(k, dir, id, workId) {
    try {
      git(["-C", k.root, "fetch", "--quiet", "origin"]);
    } catch {}
    let base = "HEAD";
    try {
      base = git(["-C", k.root, "rev-parse", "--verify", "--quiet", "origin/HEAD"])
        ? "origin/HEAD"
        : base;
    } catch {}
    try {
      const earlier = `origin/${runner.branchOf(workId)}`;
      if (git(["-C", k.root, "rev-parse", "--verify", "--quiet", earlier])) base = earlier;
    } catch {}
    git(["-C", k.root, "worktree", "add", "--detach", "--quiet", dir, base]);
    writeFileSync(join(localDir(dir), "agent.json"), `${JSON.stringify({ id }, null, 2)}\n`);
  }

  /**
   * One slot: a piece of work taken for one of the repos, its worktree made and its agent started.
   * `null` when nothing waits in any of them. The run itself is handed back unawaited, so several
   * go at once. Repos are asked in turn, starting after the last one that had work.
   */
  let turn = 0;
  async function startOne(n) {
    let t = null;
    let k = null;
    let dir = "";
    let id = "";
    for (let i = 0; i < checkouts.length && !t; i++) {
      k = checkouts[(turn + i) % checkouts.length];
      dir = join(k.runs, `run-${now()}-${n}`);
      id = randomBytes(12).toString("hex");
      try {
        const got = await api.nextTask({
          agent: id,
          host: hostname(),
          repo: k.repo,
          worktree: dir,
          alone: true,
          // So the server's brief ends the run the way this checkout's host takes changes, and
          // knows a CI job can't wait for an answer.
          forge: k.forge,
          ...(untilIdle ? { ci: true } : {}),
        });
        // The brief rides with the work: what to tell its agent, from the server (1.4.0's).
        t = got?.task ? { ...got.task, brief: got.runner || null } : null;
      } catch (err) {
        onTrouble(err);
      }
      if (t) turn = (turn + i + 1) % checkouts.length;
    }
    if (!t || !k) return null;
    // Its branch, or a fresh one beside it when that one is still checked out in the worktree of
    // an earlier run that didn't finish (kept for its author), as when a person ticks it again.
    let branch = runner.branchOf(t.id);
    try {
      worktreeFor(k, dir, id, t.id);
      try {
        git(["-C", dir, "switch", "--quiet", "-C", branch]);
      } catch {
        branch = `${branch}-${now().toString(36)}`;
        git(["-C", dir, "switch", "--quiet", "-c", branch]);
      }
    } catch (err) {
      // Taken and then stuck before any agent started: never left held with nobody on it.
      const why = runner.passBack({ minutes, failed: err.message.split("\n")[0], dir, branch });
      await pass(t.id, why, { cwd: existsSync(dir) ? dir : k.root, runner: true }).catch((e) =>
        onTrouble(e, t),
      );
      onPassed(t, { why, dir, log: "" });
      return { run: Promise.resolve() };
    }
    runner.countRun(countFile, runner.dayOf(now()));
    onNow.set(t.id, t.title || t.id);
    onTask(t, { dir, branch, repo: k.repo });
    say();
    return {
      run: finish(t, k, dir, branch).finally(() => {
        // A paused run is still on: the hub keeps showing it, with its last step saying why.
        if (!paused.has(t.id)) onNow.delete(t.id);
        say();
      }),
    };
  }

  async function finish(t, k, dir, branch, { resumed = false } = {}) {
    const log = join(k.runs, `${t.id}.log`);
    // Steps go to the hub every few seconds rather than one request each: an agent can take a
    // dozen in a second. Whatever is left goes when the run ends.
    const pending = [];
    const flush = async () => {
      if (!pending.length) return;
      await postSteps(t.id, pending.splice(0)).catch(() => {});
    };
    const step = (text) => {
      pending.push({ at: new Date(now()).toISOString(), text });
      onStep(t, text);
    };
    step(
      resumed === "usage"
        ? `Carrying on now that Claude's usage is back, on ${name}`
        : resumed
          ? `Carrying on after your answer, on ${name}`
          : `Started on ${name} in ${k.repo}, on branch ${branch}`,
    );
    const timer = setInterval(flush, stepEvery * 1000);
    // The server's words when it sent them, with this run's branch filled in; else this package's.
    const told = (said) => (typeof said === "string" ? said.replaceAll("{branch}", branch) : "");
    const prompt =
      resumed === "usage"
        ? told(t.brief?.paused) || runner.pausedPrompt(t, branch, { forge: k.forge })
        : resumed
          ? told(t.brief?.resume) || runner.resumePrompt(t, branch, { forge: k.forge })
          : told(t.brief?.start) || runner.runnerPrompt(t, branch, { forge: k.forge });
    const ran = await runAgent({
      ...agentRun(t.brief),
      prompt,
      ...(t.brief?.usage ? { usage: t.brief.usage } : {}),
      cwd: dir,
      log,
      minutes,
      env: { ...process.env, PASSALONG_TASK: t.id },
      onStep: step,
    }).finally(() => clearInterval(timer));
    if (ran.timedOut) step(`Stopped: it ran out of its ${minutes} minutes`);
    let held = null;
    try {
      held = (await api.tasks()).tasks.find((x) => x.id === t.id) || null;
    } catch {}
    // Handed in: Done, or (from 1.4.0's server on) waiting for a person to approve it or send it
    // back. Either way this run is over and its branch is pushed.
    const handedIn = held?.state === "done" || held?.state === "review";
    // Let go of already: its agent passed it, somebody pressed Stop, or it was taken back. Giving
    // it back again would be refused, and it is no longer this runner's to describe.
    if (!handedIn && !held?.claim) {
      step("It was no longer held here when the agent stopped, so the runner left it as it is");
      await flush();
      onTrouble(new Error("no longer held here when its agent stopped; left as it is"), t);
      return;
    }
    // The last step says how the run ended, while the work is still held here: once it is passed
    // back, its steps are no longer this runner's to write.
    // Its usage ran out: not given up. It stays held here, and carries on once the usage is back.
    if (ran.usage && held.state !== "done" && !held.claim?.asking) {
      pauseUntil = Math.max(pauseUntil, ran.usage.until || now() + runner.USAGE_RETRY_MS);
      const when = ran.usage.until ? `at ${runner.clockOf(pauseUntil)}` : "when it's back";
      step(`Paused: Claude's usage ran out. It carries on here ${when}, with nothing lost.`);
      await flush();
      paused.set(t.id, { t, k, dir, branch });
      onPaused(t, { until: ran.usage.until ? pauseUntil : 0 });
      return;
    }
    if (!handedIn && !held.claim?.asking)
      step("Gave it back unfinished, with the reason on the work. Nothing it changed is lost.");
    if (held.state === "review")
      step(
        "Handed in. It's ready for your review: approve it, or send it back with what to change",
      );
    if (held.claim?.asking) step("Waiting for your answer, then it carries on");
    await flush();
    if (handedIn) {
      try {
        git(["-C", k.root, "worktree", "remove", "--force", dir]);
      } catch {}
      onFinished(t, { branch, log });
      return;
    }
    // It stopped to ask, and the question is waiting on a person: not given up. The work stays held
    // here with its worktree, and the run picks up again once they answer (resumeAnswered).
    if (held?.claim?.asking) {
      waiting.set(t.id, { t, k, dir, branch });
      onWaiting(t, { question: held.claim.asking, dir });
      return;
    }
    const why = runner.passBack({
      minutes,
      ...ran,
      note: held?.claim?.note || "",
      said: ran.said || runner.lastLine(log),
      branch,
      machine: name,
    });
    try {
      await pass(t.id, why, { cwd: dir, runner: true });
      onPassed(t, { why, dir, log });
    } catch (err) {
      onTrouble(err, t);
    }
  }

  const running = new Set();
  /** Runs stopped on a question, by work id: their checkout, worktree and branch, to resume in. */
  const waiting = new Map();
  /** Runs stopped because the agent's usage ran out, the same way: they carry on at `pauseUntil`. */
  const paused = new Map();
  let pauseUntil = 0;
  /** Start an agent again where it stopped: the same worktree, branch and claim. */
  function resume(t, k, dir, branch, { afterPause = false } = {}) {
    runner.countRun(countFile, runner.dayOf(now()));
    onNow.set(t.id, t.title || t.id);
    onResumed(t, { dir, branch, afterPause });
    say();
    const run = finish(t, k, dir, branch, { resumed: afterPause ? "usage" : true })
      .catch((err) => onTrouble(err, t))
      .finally(() => {
        if (!paused.has(t.id)) onNow.delete(t.id);
        running.delete(run);
        say();
      });
    running.add(run);
  }

  /**
   * Questions answered since the last look start their run again, while there is a slot and the
   * day's allowance lasts. Work that was finished, taken back or given away meanwhile is let go.
   */
  async function resumeAnswered() {
    if (!waiting.size) return;
    let rows = [];
    try {
      rows = (await api.tasks()).tasks;
    } catch (err) {
      return onTrouble(err);
    }
    for (const [id, w] of [...waiting]) {
      const row = rows.find((x) => x.id === id);
      if (row?.state === "done") {
        waiting.delete(id);
        try {
          git(["-C", w.k.root, "worktree", "remove", "--force", w.dir]);
        } catch {}
        onFinished(w.t, { branch: w.branch, log: join(w.k.runs, `${id}.log`) });
        continue;
      }
      if (!row?.claim) {
        waiting.delete(id);
        onTrouble(new Error(`no longer held here; its worktree is kept in ${w.dir}`), w.t);
        continue;
      }
      if (row.claim.asking) continue;
      if (running.size >= atOnce || paused.size) return;
      waiting.delete(id);
      resume(w.t, w.k, w.dir, w.branch);
    }
  }

  // A runner started again finds what its earlier runs left held: their worktrees are still beside
  // their checkouts. One waiting on a question waits on; any other (paused when the usage ran out,
  // or stopped with the runner) carries on straight away.
  try {
    for (const row of (await api.tasks()).tasks) {
      const leaf = basename(row.claim?.worktree || "");
      if (!leaf.startsWith("run-") || row.state === "done") continue;
      const k = checkouts.find((x) => existsSync(join(x.runs, leaf)));
      if (!k) continue;
      const dir = join(k.runs, leaf);
      let branch = runner.branchOf(row.id);
      try {
        branch = git(["-C", dir, "branch", "--show-current"]) || branch;
      } catch {}
      (row.claim?.asking ? waiting : paused).set(row.id, {
        t: { id: row.id, title: row.title, markdown: "" },
        k,
        dir,
        branch,
      });
    }
  } catch {}

  /**
   * While the agent's usage is out: keep each paused run's hold alive (an empty report of steps
   * renews it, so the hub doesn't call it gone quiet), and once the time comes, carry them on. If
   * the usage is still out they pause again at once, which costs nothing.
   */
  async function carryOnPaused() {
    if (!paused.size) return;
    if (now() < pauseUntil) {
      for (const id of paused.keys()) await postSteps(id, []).catch(() => {});
      return;
    }
    pauseUntil = 0;
    for (const [id, p] of [...paused]) {
      if (running.size >= atOnce) break;
      paused.delete(id);
      resume(p.t, p.k, p.dir, p.branch, { afterPause: true });
    }
  }

  let n = 0;
  for (;;) {
    await carryOnPaused();
    await resumeAnswered();
    // Nothing new while the usage is out: it would only start and stop at once.
    while (running.size < atOnce && !paused.size && now() >= pauseUntil) {
      let slot;
      try {
        slot = await startOne(++n);
      } catch (err) {
        onTrouble(err);
        break;
      }
      if (!slot) {
        if (!running.size) onIdle(repos);
        break;
      }
      const run = slot.run.catch((err) => onTrouble(err)).finally(() => running.delete(run));
      running.add(run);
    }
    // In a CI job (`untilIdle`): once nothing is running, the job is over. It takes what is
    // waiting, finishes it, and ends, and the next scheduled job looks again. A run paused for
    // usage or waiting on an answer can't wait in a job that ends: its work stays held, and a later
    // job takes it up once the hold is put back in the queue.
    if (untilIdle && !running.size) {
      // Paused for usage: let it go, so the next job tries it again (from its pushed branch).
      for (const id of paused.keys()) await api.release(id).catch((err) => onTrouble(err));
      await say(true);
      onDone({ paused: paused.size, waiting: waiting.size });
      return { stopped: "idle" };
    }
    // Wait for a run to end or for the next look, whichever is first. In a CI job whose runs have
    // all ended meanwhile, there is nothing to wait for: look again now, and end.
    await say();
    if (untilIdle && !running.size) continue;
    await Promise.race([sleep(Math.max(10, every) * 1000), ...running]);
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
