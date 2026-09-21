// The operations Passalong exposes. Both surfaces (bin/passalong and the MCP server) call these,
// so anything an agent can do through MCP a human can do from the terminal and vice versa.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, join } from "node:path";
import * as api from "./api.js";
import { context } from "./capture.js";
import {
  bugGuide,
  ID_RE,
  parse,
  STATUSES,
  serialize,
  stamp,
  stripPlaceholders,
  validate,
} from "./guide.js";
import * as store from "./store.js";

export class PassalongError extends Error {}

/** "team" or "team/handle" → { team, to }. */
/**
 * Split `--to` into a team and who inside it: "team", "team/@handle", or "team/#group".
 *
 * Only the `@` is stripped. The `#` is load-bearing and travels into the frontmatter as written —
 * it is the sigil the server reads to tell a person from a group, and dropping it here would turn
 * a handoff to six people into a lookup for a teammate who does not exist.
 */
export function parseTarget(to) {
  if (!to) return {};
  const [team, who] = String(to).split("/");
  return { team: team.trim(), to: who ? who.trim().replace(/^@/, "") : undefined };
}

/**
 * Publish a guide from markdown: fill in defaults, validate, store locally, and sync when
 * logged in. `to` addresses it: "team", "team/@handle", or "team/#group". Returns
 * { guide, path, url, synced }.
 */
export async function share(markdown, { cwd = process.cwd(), to, follows } = {}) {
  const c = context(cwd);
  const raw = parse(markdown);
  let guide = stamp(
    { meta: raw.meta, body: stripPlaceholders(raw.body) },
    {
      author: c.author,
      source_context: c.branch && c.branch !== "HEAD" ? `${c.name}@${c.branch}` : c.name,
    },
  );
  const target = parseTarget(to);
  if (target.team) guide.meta.team = target.team;
  if (target.to) guide.meta.to = target.to;
  // `follows` names the guide this one came out of: an id, a share link, or a pulled .md file. An id
  // is used as it is; a link or a file is read for the id in its own frontmatter. `validate()` below
  // is what refuses a guide that names itself.
  if (follows) guide.meta.parent = await resolveId(String(follows).trim());
  if (guide.meta.to && !guide.meta.team)
    throw new PassalongError("`to:` needs a team — address a handoff as team/handle");
  const errors = validate(guide);
  if (errors.length)
    throw new PassalongError(`guide is not ready to share:\n  - ${errors.join("\n  - ")}`);
  // A task stays a draft when it is shared. Draft is the column a task waits in until a person
  // says it is ready for an agent — `ready()` — and an agent that drafts one over MCP comes
  // through here too, so publishing on share would let a task queue itself with nobody reading it.
  if (guide.meta.status === "draft" && guide.meta.kind !== "task")
    guide = { ...guide, meta: { ...guide.meta, status: "published" } };

  let url = guide.meta.url || null;
  let synced = false;
  let notified = false;
  if (api.loggedIn()) {
    const res = await api.publish(guide.meta.id, serialize(guide));
    url = res.url;
    synced = true;
    notified = Boolean(res.notified);
    guide = { ...guide, meta: { ...guide.meta, url } };
  } else if (guide.meta.team) {
    throw new PassalongError("sharing to a team needs sync — run `passalong login` first");
  }
  const path = store.save(guide);
  return { guide, path, url, synced, notified };
}

/**
 * File a set of bugs as one report.
 *
 * The report is opened first because each issue's frontmatter names it, and the issues go up one
 * at a time — a partial failure that has filed three of five should say which three, since the
 * three that landed are real guides someone can already act on.
 *
 * Unlike `share()`, this needs sync: a report is a server-side parent, and there is nothing local
 * for a set to belong to. One bug on its own does not — that is just `share()` with a bug
 * document, and it works offline like any other guide.
 */
export async function fileBugs(
  { title = "", environment = "", issues = [] },
  { cwd = process.cwd(), to } = {},
) {
  if (!issues.length) throw new PassalongError("a report needs at least one issue");
  if (!api.loggedIn())
    throw new PassalongError("filing a report needs sync — run `passalong login` first");
  const target = parseTarget(to);
  const { report } = await api.createReport({
    title,
    environment,
    team: target.team || "",
    to: target.to || "",
  });

  const filed = [];
  try {
    for (const issue of issues) {
      const markdown = bugGuide({ ...issue, report: report.id, environment });
      const { guide, url } = await share(markdown, { cwd, to });
      filed.push({
        id: guide.meta.id,
        title: guide.meta.title,
        area: guide.meta.area || "",
        severity: guide.meta.severity || "",
        url,
      });
    }
  } catch (err) {
    if (!filed.length) throw err;
    throw new PassalongError(
      `filed ${filed.length} of ${issues.length} issues (${filed
        .map((f) => f.id)
        .join(", ")}) before failing: ${err.message}`,
    );
  }
  return { report: { id: report.id, title, environment }, issues: filed };
}

/** Resolve a reference (id, share URL, or local file path) to a guide. */
export async function resolve(ref) {
  if (/^https?:\/\//.test(ref)) {
    const md = await api.fetchShared(ref);
    return { guide: parse(md), from: "link" };
  }
  if (ref.endsWith(".md") && existsSync(ref)) {
    return { guide: parse(readFileSync(ref, "utf8")), from: "file" };
  }
  if (!ID_RE.test(ref))
    throw new PassalongError(`"${ref}" is not a passalong id, share link, or .md file`);
  const local = store.get(ref);
  if (local) return { guide: local, from: "local" };
  if (api.loggedIn()) {
    try {
      const md = await api.get(ref);
      const guide = parse(md);
      store.save(guide); // cache so the next pull is offline
      return { guide, from: "sync" };
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  throw new PassalongError(
    `no guide "${ref}" (not local${api.loggedIn() ? " or synced" : "; not logged in, so sync was not checked"})`,
  );
}

/**
 * Resolve a reference to its id alone, without fetching the guide.
 *
 * The reader's two answers — an ack and a verdict — are writes that take an id and nothing else,
 * so the guide body they used to fetch on the way was never read. That fetch was not free:
 * `GET /v1/guides/:id` records a pull, which is how somebody saying "not me" on a handoff
 * registered as taking delivery of it — inflating the guide's pull count and moving it into the
 * sender's "landed" queue. An id needs no lookup at all, and a link or a file carries the id in
 * its own frontmatter.
 *
 * Unlike `resolve()`, a bare id is not checked for existence here. The server answers that when
 * the write lands, and "no such guide" from the route the write went to is the same news one
 * round trip earlier.
 */
export async function resolveId(ref) {
  if (/^https?:\/\//.test(ref)) return parse(await api.fetchShared(ref)).meta.id;
  if (ref.endsWith(".md") && existsSync(ref)) return parse(readFileSync(ref, "utf8")).meta.id;
  if (ID_RE.test(ref)) return ref;
  throw new PassalongError(`"${ref}" is not a passalong id, share link, or .md file`);
}

/**
 * Pull a guide into a working directory: writes .passalong/<id>.md there and returns the guide
 * so the caller can put the text straight into an agent's context. A pull of someone else's
 * guide is also recorded server-side, which is how the sender sees the transfer landed.
 */
export async function pull(ref, { cwd = process.cwd(), write = true } = {}) {
  const { guide, from } = await resolve(ref);
  // A locally cached copy of a teammate's guide still counts as a pull for them.
  if (from === "local" && api.loggedIn() && guide.meta.team) {
    api.get(guide.meta.id).catch(() => {});
  }
  let path = null;
  if (write) {
    path = join(localDir(cwd), `${guide.meta.id}.md`);
    writeFileSync(path, serialize(guide));
  }
  return { guide, from, path, markdown: serialize(guide) };
}

/**
 * `.passalong/` in a working directory, made if it is missing.
 *
 * A pulled guide carries its own share URL in the frontmatter, and that URL needs no account to
 * read. Committing this directory would publish the guide to anyone who can see the repo, so the
 * directory ignores itself. Delete its .gitignore if you do want guides in the repo.
 */
function localDir(cwd) {
  const dir = join(cwd, ".passalong");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  return dir;
}

/**
 * Who this worktree is to the task queue, minted the first time it asks.
 *
 * A claim belongs to an agent, not an account: one person runs several, and "no two agents on one
 * task" means nothing if the server cannot tell them apart. The id lives in the worktree's own
 * `.passalong/agent.json`, so a restarted session in the same worktree is the same agent and gets
 * its task back, and a second worktree of the same repo is a different agent. Per machine would
 * let two worktrees on one laptop share a lock; per session would lose the task on every restart.
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

function needsSync(what) {
  if (!api.loggedIn())
    throw new PassalongError(
      `${what} needs sync — the queue lives on the server (run \`passalong login\`)`,
    );
}

/** Every task you can see, with where it is and who has it. */
export async function tasks() {
  needsSync("the task queue");
  return (await api.tasks()).tasks;
}

/**
 * Take the next task for this worktree's repo, or get back the one this worktree already holds.
 * `null` when there is nothing to do. The guide is written to `.passalong/<id>.md` like a pull.
 */
export async function nextTask({ cwd = process.cwd(), any = false } = {}) {
  needsSync("taking a task");
  const { task } = await api.nextTask({ ...agent(cwd), any });
  if (!task) return null;
  const guide = parse(task.markdown);
  const path = join(localDir(agent(cwd).worktree), `${task.id}.md`);
  writeFileSync(path, task.markdown);
  store.save(guide);
  return { ...task, path };
}

/** Word from the agent holding a task: renews its lease, and `note` becomes the board's line. */
export async function taskProgress(id, note, { cwd = process.cwd() } = {}) {
  needsSync("reporting progress");
  const { agent: a } = agent(cwd);
  return api.taskProgress(id, note ? { agent: a, note } : { agent: a });
}

/**
 * The work is done: the task moves to review with a transfer guide about it attached.
 *
 * Pass `markdown` and this writes that guide too, with `parent:` naming the task, so the write-up
 * and the finish are one step and neither can be skipped or pointed at the wrong guide. Pass
 * `report` instead when the guide is already published.
 */
export async function finishTask(
  id,
  { report, markdown, pr = "", note = "", cwd = process.cwd() } = {},
) {
  needsSync("finishing a task");
  if (!report && markdown) {
    const g = parse(markdown);
    report = (await share(serialize({ meta: { ...g.meta, parent: id }, body: g.body }), { cwd }))
      .guide.meta.id;
  }
  if (!report)
    throw new PassalongError(
      "finishing needs the write-up: `markdown` for a transfer guide about the work, or `report` with the id of one",
    );
  return api.finishTask(id, { agent: agent(cwd).agent, report, pr, note });
}

/**
 * The gate, a person's three answers to a task. Approve: the work in review is done. Reject: it
 * goes back to Ready with `why` on it for the next agent. Release: a task an agent holds, live or
 * stalled, goes back to Ready with a note saying where that agent left it.
 *
 * The local copy is dropped after each, so the next read of the task fetches what the server made
 * of it — a reject or a release rewrites the document, and a stale copy would hide exactly the
 * line the next reader needs.
 */
export async function approveTask(id) {
  needsSync("approving a task");
  const r = await api.approveTask(id);
  store.remove(id);
  return r;
}

export async function rejectTask(id, why) {
  needsSync("rejecting a task");
  if (!String(why || "").trim()) throw new PassalongError("say why: the next agent reads it");
  const r = await api.rejectTask(id, why);
  store.remove(id);
  return r;
}

export async function releaseTask(id) {
  needsSync("releasing a task");
  const r = await api.releaseTask(id);
  store.remove(id);
  return r;
}

/**
 * Pull a guide *and* take the handoff: the two halves of starting work, in one call.
 *
 * `pull` says the guide arrived. `ack` says somebody is doing it, which is the thing the sender
 * cannot find out any other way — and the two are deliberately separate, because reading a guide
 * to decide it is not yours is exactly what `pass` is for. Fetching is not committing.
 *
 * For an agent the distinction is real but the ordering never varies: it reads a guide because it
 * is about to follow it. So this is the path an agent takes when it means to do the work, and it
 * is one call rather than two — the mandated thing has to be the cheap thing or it gets skipped.
 * `pull` alone remains the way to read one without answering for it.
 *
 * The ack is best-effort and never costs the caller the markdown, which is what they came for:
 *
 *   - the author's own guide is a 403 (`ack` is the reader's answer and an author is not a party
 *     to it), and that is a no-op, not a failure — an agent working in its own user's repo hits
 *     this constantly;
 *   - logged out, there is nobody to tell;
 *   - anything else is reported in `ack_error` rather than swallowed, because an ack that quietly
 *     did not land leaves the sender in the silence the whole feature exists to end.
 */
export async function start(ref, { cwd = process.cwd(), write = true } = {}) {
  const pulled = await pull(ref, { cwd, write });
  const id = pulled.guide.meta.id;
  if (!api.loggedIn()) return { ...pulled, took: false, ack_error: "", own: false };
  try {
    await api.ack(id, true, "");
    return { ...pulled, took: true, ack_error: "", own: false };
  } catch (err) {
    if (err.status === 403) return { ...pulled, took: false, ack_error: "", own: true };
    return { ...pulled, took: false, ack_error: err.message, own: false };
  }
}

/**
 * The one line `get_guide` adds to a guide it is handing an agent, or "" when there is nothing to
 * say. Separate from the tool so it can be tested without a server.
 *
 * Only a guide that was addressed to somebody can be taken — one nobody was handed has no handoff
 * to answer for, and nudging about it is noise that teaches an agent to ignore the nudge.
 *
 * It goes after the document, not in front of it. Anything before the opening `---` stops the
 * frontmatter being frontmatter, and an agent that writes what it was handed back out to a file
 * would lose the id along with it.
 */
export function handoffNudge(meta = {}) {
  if (!meta.to && !meta.team) return "";
  return (
    "<!-- passalong: this guide was handed to someone. If you are about to do the work, call " +
    "start_guide instead of get_guide — it takes the handoff so the sender stops guessing. " +
    "If you are only reading, or it turns out not to be yours, answer with ack_guide taken=false " +
    "and a reason. -->"
  );
}

/**
 * The image types a guide can carry as evidence. Mirrors SHOT_TYPES in apps/api/src/shots.ts —
 * the server is the authority and refuses anything else; this is what lets a local caller find
 * out before spending an upload on it.
 */
export const SHOT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Attach a screenshot from disk, and return the markdown that points at it.
 *
 * Evidence belongs *in* the document: a guide travels as markdown to anyone holding its link, so
 * an image beside it would not travel at all. `claimShots` binds the upload to whichever guide's
 * markdown names it at publish, which is why this returns a line to paste rather than taking a
 * guide id — there is nothing to attach it to until the document says so.
 *
 * Local because it reads a path. An agent in a terminal has one; a hosted assistant does not, and
 * reaches the same route through `attach_screenshot` on the HTTP server instead.
 */
export async function attach(file, { name = "" } = {}) {
  if (!api.loggedIn())
    throw new PassalongError("attaching evidence needs sync — run `passalong login` first");
  if (!existsSync(file)) throw new PassalongError(`no file at ${file}`);
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  const type = SHOT_TYPES[ext];
  if (!type)
    throw new PassalongError(
      `screenshots must be ${[...new Set(Object.values(SHOT_TYPES))].join(", ")} — ${ext || file} is not one`,
    );
  const shot = await api.uploadShot(readFileSync(file), type, name || basename(file));
  return { ...shot, markdown: `![${name || basename(file)}](${shot.url})` };
}

/**
 * The line a guide arrives with, saying what a follow-up is and how to write one.
 *
 * A follow-up is more context for a guide, written as its own guide with `parent` naming the
 * original — a missing detail, a step that needed explaining, what changed since, what someone
 * found doing it. Whoever opens the original, person or agent, gets its follow-ups with it, which
 * is why context belongs there rather than in a one-line verdict note.
 *
 * Trailing, like the handoff nudge, so it never sits in front of the frontmatter. It is here and
 * not only in the server's instructions because an agent reads the payload it is working from and
 * skims everything else — the same reason the bug lead is inside the document. For a bug, the
 * context worth adding is usually the fix, when it is worth repeating somewhere else: that is a
 * transfer guide, and the bug is what it adds context to.
 */
export function followUpNote(meta = {}) {
  if (!meta.id) return "";
  if (meta.kind === "bug")
    return (
      "<!-- passalong: once this is fixed, if the fix is worth repeating somewhere else, that is " +
      "more context for this bug: publish it as a transfer guide with publish_guide " +
      `parent=${meta.id}, and whoever opens this bug gets it too. -->`
    );
  return (
    "<!-- passalong: a follow-up is more context for this guide, written as its own guide. If " +
    "this guide needs more — a missing detail, a step that needed explaining, what changed since, " +
    `what you found doing it — publish that with publish_guide parent=${meta.id}, and whoever ` +
    "opens this guide gets it too. -->"
  );
}

/** What heads a guide's follow-ups when they are handed to an agent. Same words on both servers. */
export const FOLLOW_UPS_LEAD =
  "FOLLOW-UPS — more context added to this guide, oldest first. Read them before acting; where " +
  "one contradicts the original, the follow-up is newer.";

/**
 * A guide's follow-ups as the server lists them, oldest first, or [] when there are none, when
 * sync is off, or when anything goes wrong. Context is never worth failing a pull over: the guide
 * itself is what was asked for, and it is already in hand.
 *
 * Only with sync, because follow-ups live on the server and are scoped to what this account can
 * read — the same condition `resolve()` uses to look a guide up there. Fetching them records no
 * pull on them: reading context for a guide is not opening those guides.
 *
 * `markdown` asks for each one's content too (capped server-side). The api calls are injectable
 * so this can be tested without a network.
 */
export async function followUpGuides(
  meta = {},
  { markdown = false, children = api.children, loggedIn = api.loggedIn } = {},
) {
  if (!meta.id || !loggedIn()) return [];
  try {
    const { guides = [] } = await children(meta.id, { markdown });
    const listed = (Array.isArray(guides) ? guides : []).filter((g) => g?.id);
    // With content the server already sends oldest first; the plain listing is newest first.
    return markdown ? listed : listed.reverse();
  } catch {
    return [];
  }
}

/**
 * A guide's follow-ups with their content, formatted to go after the document for an agent — the
 * same shape the remote server's get_guide returns — or "" when there are none.
 */
export async function followUps(meta = {}, deps = {}) {
  const guides = (await followUpGuides(meta, { ...deps, markdown: true })).filter(
    (g) => typeof g.markdown === "string",
  );
  if (!guides.length) return "";
  return [
    FOLLOW_UPS_LEAD,
    ...guides.map(
      (g) => `--- follow-up ${g.id}: ${g.title || "untitled"} ---\n${g.markdown.trimEnd()}`,
    ),
  ].join("\n\n");
}

/** Local guides merged with synced ones (by id), newest first, optionally filtered. */
export async function list(query = "", { remote = true, scope = "" } = {}) {
  const local = scope && scope !== "all" && scope !== "mine" ? [] : store.search(query);
  const seen = new Set(local.map((g) => g.meta.id));
  const rows = local.map((g) => ({ ...summary(g), where: "local" }));
  if (remote && api.loggedIn()) {
    try {
      const res = await api.list(query, scope);
      for (const r of res.guides) {
        const row = seen.has(r.id) ? rows.find((x) => x.id === r.id) : null;
        if (row) Object.assign(row, r, { where: "synced" });
        else rows.push({ ...r, where: "synced" });
      }
    } catch (err) {
      rows.warning = `sync unavailable: ${err.message}`;
    }
  }
  return rows.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
}

/** Guides handed to you (or your teams) that you have not pulled yet. Needs sync. */
export async function inbox() {
  const res = await api.inbox();
  return res.guides;
}

/**
 * The state of your transfers as four queues: waiting on you, in flight (handed over, untouched),
 * and landed (someone else has it). Needs sync.
 */
export const board = () => api.board();

/**
 * What you did, newest first: what you published, what you took delivery of, and every verdict and
 * ack you gave. The other half of `activity` — that one is what other people did to your guides and
 * it clears when you read it; this is your own record and it never clears.
 *
 * It is a record of what you passed along, not of what you worked on. Work that never became a
 * guide has no row, so anything printing this has to say so. Needs sync.
 */
export async function log({ repo = "", since = "" } = {}) {
  const res = await api.log({ repo, since });
  return res.log;
}

/**
 * What happened while you were away: your guides being pulled and shipped, guides handed to you,
 * invites taken up. Each item carries a rendered `text` line so every surface says the same thing.
 */
export async function activity({ all = false, limit = 50 } = {}) {
  return api.notifications({ unread: !all, limit });
}

/**
 * Report whether a guide actually works. This is the reader's answer, not the author's status:
 * `done` says "I implemented it", a verdict says "I tried it and it holds up" — or does not.
 * A failing verdict needs a note; "it doesn't work" without a reason helps nobody.
 */
export async function verdict(id, ok, note = "") {
  if (!api.loggedIn()) throw new PassalongError("verdicts need sync — run `passalong login` first");
  if (!ok && !note.trim())
    throw new PassalongError("say what went wrong: passalong failed <id> <what happened>");
  return api.verdict(await resolveId(id), ok, note.trim());
}

/**
 * Say whether you are taking a guide someone handed you — before doing any of it.
 *
 * The hop the product had no signal for: until this, a handoff nobody had answered looked exactly
 * like one nobody had noticed. Passing needs a reason for the same cause a failing verdict does —
 * "not me" without "why" leaves the sender where the silence did.
 */
export async function ack(id, taken, note = "") {
  if (!api.loggedIn()) throw new PassalongError("acks need sync — run `passalong login` first");
  if (!taken && !note.trim())
    throw new PassalongError("say why you are passing: pass a note with taken=false");
  return api.ack(await resolveId(id), taken, note.trim());
}

/** Mark notifications seen. No ids means everything unread. */
export const seen = (ids = []) => api.markRead(ids);

export function summary(g) {
  return {
    id: g.meta.id,
    title: g.meta.title,
    status: g.meta.status,
    created: g.meta.created,
    source_context: g.meta.source_context,
    tags: g.meta.tags || [],
    stack_assumptions: g.meta.stack_assumptions || [],
    url: g.meta.url || null,
    team: g.meta.team || "",
    to: g.meta.to || "",
    mine: true,
  };
}

/** Archive a guide (`consumed`) or put it back (`published`). The server refuses `promoted`. */
export async function setStatus(id, status) {
  if (!STATUSES.includes(status))
    throw new PassalongError(`status must be one of ${STATUSES.join(", ")}`);
  const { guide } = await resolve(id);
  const next = { ...guide, meta: { ...guide.meta, status } };
  // The server first. Saved the other way round, a refusal left the local copy saying what the
  // server had just refused — a teammate's `ready` on someone else's task read as done here.
  if (api.loggedIn() && guide.meta.url) await api.setStatus(id, status);
  store.save(next);
  return next;
}

/**
 * Move a task from Draft to Ready: a person has read it and an agent may take it.
 *
 * Only tasks. Every other kind is published the moment it is shared, so "ready" on one would
 * either do nothing or reopen something archived under a name that does not say so.
 */
export async function ready(id) {
  const { guide } = await resolve(id);
  if (guide.meta.kind !== "task")
    throw new PassalongError(`${guide.meta.id || id} is not a task — ready is for tasks in Draft`);
  if (guide.meta.status !== "draft")
    throw new PassalongError(`${guide.meta.id} is not in Draft (status: ${guide.meta.status})`);
  return setStatus(guide.meta.id, "published");
}

/**
 * One goal as several tasks, written as drafts in order. Each step may name the earlier steps it
 * needs by position (`after: [0, 1]`), and those become its `blocked_by`, so the queue hands them
 * out in an order that works and runs the independent ones side by side.
 *
 * Only earlier steps: a step that waits on itself or on a later one is a plan that never finishes,
 * and it is refused before anything is written rather than discovered as a queue that never moves.
 * Every step lands in Draft — a wrong decomposition is several agents building the wrong thing at
 * once, so a person reads the plan before any of it runs.
 */
export async function planTasks(steps, { cwd = process.cwd() } = {}) {
  if (!Array.isArray(steps) || !steps.length)
    throw new PassalongError("a plan needs at least one step");
  steps.forEach((step, i) => {
    for (const j of step.after || [])
      if (!Number.isInteger(j) || j < 0 || j >= i)
        throw new PassalongError(
          `step ${i} ("${step.title}") can only wait on an earlier step, not ${j}`,
        );
  });
  const repo = context(cwd).repo;
  const ids = [];
  for (const step of steps) {
    const section = (name, text) =>
      String(text || "").trim() ? [`## ${name}`, String(text).trim(), ""] : [];
    const body = [
      ...section("Goal", step.goal),
      ...section("Context", step.context),
      ...section("Constraints", step.constraints),
      ...section("Acceptance", step.acceptance),
      ...section("Out of scope", step.out_of_scope),
    ].join("\n");
    const meta = { title: step.title, kind: "task", target_context: step.target_context ?? repo };
    const after = (step.after || []).map((j) => ids[j]);
    if (after.length) meta.blocked_by = after;
    ids.push((await share(serialize({ meta, body }), { cwd })).guide.meta.id);
  }
  return ids;
}

/** What an agent started by `work()` is told. The task itself goes in too, so it cannot start blind. */
export function workPrompt(t) {
  return [
    `You hold passalong task ${t.id}, and no other agent can take it while you do.`,
    `It is written to ${t.path}; here it is:`,
    "",
    t.markdown.trim(),
    "",
    "Do it in this repo. There are no Steps: work out how to reach Goal within Constraints, and",
    "leave Out of scope alone. Call the passalong MCP tool task_progress with id",
    `${t.id} and a one-line status at each milestone — 30 minutes of silence stalls the task.`,
    "When every Acceptance check holds, commit what you changed as one commit whose message",
    `starts with "${t.id}: " — several tasks share this worktree, and a reviewer reads each one's`,
    "change on its own. Then call finish_task with id",
    `${t.id}, \`pr\` set to that commit's hash, and \`markdown\`: a transfer guide saying what you`,
    "did, what you decided and why, and how you checked each Acceptance line. If either call",
    "says you no longer hold the task, stop.",
    "",
    "Nobody reads what you print: this session runs unattended. If something only a person can",
    "do stands between you and an Acceptance line — a permission, a secret, a decision — call",
    `task_progress with id ${t.id} and a note starting "BLOCKED: " that says exactly what you`,
    "need, leave the task unfinished and uncommitted, and stop. The board shows that note.",
  ].join("\n");
}

/**
 * Work the queue from this worktree: take the next task, hand it to an agent, and when the agent
 * has finished it take the next, until there is nothing left.
 *
 * The agent runs in this worktree, so it is the same agent to the queue — its task_progress and
 * finish_task land on the claim this took. `agent` is a command the prompt is appended to;
 * `claude -p` by default, or whatever PASSALONG_AGENT says.
 *
 * An agent that exits without finishing stops the loop. Asking for the next task would hand the
 * same one back, since a worktree holds one task at a time, and the loop would run the agent on it
 * forever. The task stays claimed here, for the next run to resume or a person to release.
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
    const t = await nextTask({ cwd, any });
    if (!t) return { finished, stopped: "empty" };
    onTask(t);
    const run = spawnSync(command, [...args, workPrompt(t)], {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PASSALONG_TASK: t.id, PASSALONG_TASK_PATH: t.path },
    });
    const state = (await tasks()).find((x) => x.id === t.id)?.state;
    if (state !== "review")
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
 * Make every task you wrote that is still in Draft ready, and return their ids. For the moment a
 * planner has written several and you have read them all. Only your own: moving a task into the
 * queue is its author's call.
 */
export async function readyDrafts() {
  const drafts = (await tasks()).filter((t) => t.mine && t.state === "draft");
  for (const t of drafts) await ready(t.id);
  return drafts.map((t) => t.id);
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

/** Write every local guide to a directory as plain markdown. Returns the paths written. */
export function exportAll(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const paths = [];
  for (const g of store.list()) {
    const p = join(dir, `${g.meta.id}.md`);
    writeFileSync(p, serialize(g));
    paths.push(p);
  }
  return paths;
}
