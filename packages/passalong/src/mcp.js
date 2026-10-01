// The Passalong MCP server (stdio). This is the rail that makes Passalong tool-agnostic: any
// MCP-capable agent can search, pull, and publish guides without leaving its session. With a
// team, the same tools see the team's guides and the user's inbox.
//
//   claude mcp add passalong -- passalong mcp
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as api from "./api.js";
import { refusal, runChecks } from "./checks.js";
import { AREAS, BUG_SECTIONS, parse, SECTIONS, TASK_SECTIONS, template } from "./guide.js";
import * as passalong from "./passalong.js";

/**
 * What the server calls itself in the MCP handshake — read from package.json rather than written
 * here, because a literal drifts. This one said 0.2.0 for two releases while the package was
 * 0.2.2, and the one thing a version string in a handshake is for is telling a client which build
 * it is talking to. `pnpm release` bumps package.json, so there is only one number to bump.
 */
const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const text = (s) => ({ content: [{ type: "text", text: s }] });

/**
 * Said in front of every guide an agent opens, whatever its kind: the hand-in needs evidence, and
 * evidence is collected while the work happens, not reconstructed from memory once it is done.
 * Mirrors KEEP_EVIDENCE in apps/api/src/mcp-http.ts.
 */
const WHERE_THE_LINE_GOES =
  "WHERE THE LINE GOES DEPENDS ON WHAT THE IMAGE IS EVIDENCE OF. Proof that work you are handing i" +
  "n holds — a screen that renders right, a total that matches — goes in that check's `ran` on han" +
  "d_in, and nothing is published: a check answered with a picture is shown, which is what the han" +
  "d-in asks for. Only an image that is part of a DOCUMENT goes in a guide body — the screenshot i" +
  "n a bug report, a diagram a guide is explaining — and then it must be in the markdown, because " +
  "a guide travels as markdown to whoever holds its link and evidence beside the document does not" +
  " travel at all; publishing claims whatever the markdown names, so attach first and publish afte" +
  "r. DO NOT PUBLISH A GUIDE TO CARRY SCREENSHOTS. Six images and a caption each is a hand-in, not" +
  " a document, and wrapping them in Problem / Solution shape / Decisions / Steps / Verification t" +
  "o make them publishable is how a set of pictures becomes fifteen hundred words nobody asked for" +
  ". png, jpg, webp or gif.";

/**
 * What a screenshot has to be a screenshot OF.
 *
 * "A check is run or shown" made a picture mandatory, and an agent short of one built a page to
 * photograph: it added `src/app/notes-preview`, shot that, then `rm -rf`'d it and published the
 * shots as evidence that the real screen rendered. The rule was satisfied and almost nothing was
 * proved — the measure had become the target, and the page the picture showed no longer existed.
 *
 * Mirrors SHOOT_THE_REAL_THING in apps/api/src/mcp-http.ts.
 */
const SHOOT_THE_REAL_THING =
  "SHOOT THE RUNNING THING, NOT SOMETHING YOU BUILT TO SHOOT. A screenshot is worth what the sc" +
  "reen behind it is worth: the real route in the real app, reached the way a reader would reac" +
  "h it. A scratch page, a story, a harness or a component rendered on its own is a picture of " +
  "your scaffolding, and it can look right while the thing the guide is about does not. If the " +
  "only way you could get a picture was to build something, that is not evidence the real scree" +
  "n works — say what you built and why in `writeup`, and leave the check to the commands that " +
  "do hold. NEVER DELETE WHAT YOUR EVIDENCE POINTS AT: a shot of a page you removed afterwards " +
  "is one nobody can take again, including you.";

const KEEP_EVIDENCE =
  "KEEP YOUR EVIDENCE AS YOU GO. hand_in needs it: the commands you ran and what came back, the " +
  "test summary, the link to the change. Copy each one when it happens — at the end you will be " +
  "writing from memory, which is the thing evidence is here to replace.\n\n";

/**
 * Said in front of every guide an agent has to locate things in for itself — a bug and a task.
 *
 * The failure it is here to stop: an agent lists one directory, or opens the one file it expected,
 * and concludes from that. It then reports that a thing is absent, or that it found the only
 * occurrence, having never looked past the place it happened to start. The conclusion is confident
 * and wrong, and nothing downstream can tell, because the evidence it brings is real — it is just
 * evidence of a search that was too small.
 *
 * Mirrors SEARCH_WIDE in apps/api/src/mcp-http.ts.
 */
const SEARCH_WIDE =
  "SEARCH THE WHOLE TREE BEFORE YOU CONCLUDE. Listing a directory, or reading the one file you " +
  "expected, tells you what is in that directory — not whether the thing exists, and not whether " +
  "you have found all of it. Before you report that something is absent, is the only one, or is " +
  'already handled, search across the repository and let the output be your reason. "I looked" ' +
  "is a claim; the search and what it printed is evidence.\n\n";

/**
 * What to say in front of a guide whose kind changes what the reader should do with it.
 *
 * The heading text is what an agent keys on, and a bug's or a task's headings are close enough to
 * a transfer guide's to be treated as one by an agent that never opened the frontmatter. So the
 * kind is stated before the document, in the imperative. A transfer guide needs nothing: following
 * it is what an agent does with an unmarked document anyway.
 */
function leadFor(meta) {
  if (meta.kind === "bug")
    return (
      "THIS IS A BUG REPORT, NOT WORK TO REPEAT. Do not follow Reproduce as instructions " +
      "— those steps produce the defect. Fix what Problem describes, then check " +
      "Verification and answer with hand_in.\n\n" +
      SEARCH_WIDE +
      SHOOT_THE_REAL_THING +
      KEEP_EVIDENCE
    );
  if (meta.kind === "task")
    return (
      "THIS IS A TASK: WORK NOBODY HAS DONE YET. There are no Steps to follow — work out how to " +
      "reach Goal within Constraints, and leave Out of scope alone. It is done when every check " +
      "under Acceptance holds. Opening it here does not make it yours: to work on it, call take " +
      "with its id in the repo it is for, so no other agent can. Then progress, and hand_in " +
      "with a write-up.\n\n" +
      SEARCH_WIDE +
      SHOOT_THE_REAL_THING +
      KEEP_EVIDENCE
    );
  // A transfer guide is handed over untouched: it is a document to follow, and anything in front
  // of it is one more thing that is not the document. The reminder still reaches the agent on the
  // answer's `next` line, which is where every other instruction from the server rides.
  return "";
}

/**
 * The rest of the report this issue came from.
 *
 * A QA pass files six bugs at once, and they arrive in an inbox as six unrelated guides — which
 * is how the same root cause gets fixed three times, or how someone fixes one of a pair and calls
 * the sweep done. Naming the siblings costs one request and only happens for a guide that has a
 * parent. A failure here is not worth failing the pull over: the issue itself is what was asked
 * for, and it is already in hand.
 */
async function related(meta) {
  if (!meta.report) return "";
  try {
    const { report } = await api.report(meta.report);
    const others = (report.areas || [])
      .flatMap((a) => a.issues.map((i) => ({ ...i, area: a.area })))
      .filter((i) => i.id !== meta.id);
    if (!others.length) return "";
    const lines = others.map(
      (i) => `  ${i.id}  [${i.severity || "--"}] ${i.area || "no area"} — ${i.title}`,
    );
    return (
      `\n\n<!-- passalong: filed with ${others.length} other issue${others.length === 1 ? "" : "s"}` +
      `${report.title ? ` in "${report.title}"` : ""}. Fix only this one unless asked; the others are\n` +
      `${lines.join("\n")}\n-->`
    );
  } catch {
    return "";
  }
}
/**
 * An answer a client can read as data as well as prose.
 *
 * `structuredContent` is the same JSON the text block holds; the spec asks for both, because a
 * tool "that returns structured content SHOULD also return the serialized JSON in a TextContent
 * block" for clients that only read text. Only an object goes in the structured field — the spec
 * allows any JSON value there, but a bare array or string tells a client nothing it could key on.
 */
const json = (data) => ({
  ...text(JSON.stringify(data, null, 2)),
  ...(data && typeof data === "object" && !Array.isArray(data) ? { structuredContent: data } : {}),
});

/**
 * What each tool does to the world, said out loud. Mirrors the same block in
 * apps/api/src/mcp-http.ts, which had these and this server did not — the same four jobs described
 * to a client two different ways, on the surface most agents actually reach.
 *
 * MCP's defaults for a tool that says nothing are the worst case — it writes, it may destroy, it
 * reaches outside — and a client acts on them: over HTTP, ChatGPT badged every tool here, `inbox`
 * included, as a destructive public write. The spec is equally clear that these are hints and
 * nothing more: "clients MUST consider tool annotations to be untrusted unless they come from
 * trusted servers". They are a description, not a permission.
 *
 * `openWorldHint` is false for everything that stays inside Passalong. Only attach_screenshot
 * reaches outside it, for a file on this machine that Passalong did not put there.
 */
/**
 * What the three verbs that answer with JSON return. Declared only for those: `outputSchema` puts
 * the obligation on the server — "Servers MUST provide structured results that conform to this
 * schema", while a client only SHOULD check — so it is a promise, and promising a shape this
 * server does not control would be worse than staying quiet. `take` is the reason for the rule
 * rather than an exception to it: it answers with the guide's markdown and a lead-in to read, not
 * with a record.
 *
 * Every field is optional and the objects are open. The four calls serve three kinds of guide and
 * the routes add fields freely, so a required key here would be a promise broken by a kind that
 * does not carry it.
 */
// The object itself is handed to registerTool, not its `.shape`: a shape is rebuilt into a closed
// object and advertised as `additionalProperties: false`, which would be this server promising that
// an answer carries nothing else — and then breaking that promise the first time a route adds a
// field. Passing the object through keeps it open.
const openObject = (shape) => z.object(shape).partial().passthrough();
const progressOut = openObject({
  id: z.string(),
  lease_until: z.string(),
  note: z.string(),
});
const handInOut = openObject({
  id: z.string(),
  state: z.string(),
  report: z.string(),
  ok: z.boolean(),
});
const passOut = openObject({ id: z.string(), passed: z.boolean() });

const READS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ADDS = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const fail = (err) => ({ content: [{ type: "text", text: err.message }], isError: true });

/**
 * The server's `next` and `say`, as the last thing an agent reads. See steps() in
 * apps/api/src/claims.ts: the answer to the call it just made is the one place it is sure to look.
 */
export function nextNote({ next = [], say = "" } = {}, id = "") {
  const lines = next.map(
    (s) =>
      `  ${s.tool}${id && s.tool !== "take" ? ` ${id}` : ""} — when ${s.when} (${s.why})` +
      // What the call has to carry, under the call it belongs to: an agent that reads this at the
      // end of a long session should not have to remember hand_in takes evidence.
      (s.with ? `\n      with ${s.with}` : ""),
  );
  if (say) lines.unshift(`  ${say}`);
  return lines.length ? `<!-- passalong: next:\n${lines.join("\n")}\n-->` : "";
}

/**
 * What the person said to this agent since it last heard, in front of everything else: a reply is
 * the thing the agent stopped for, and burying it under the guide it already knows is how it gets
 * missed. See claims.deliver() in apps/api/src/claims.ts.
 */
export function repliesNote(replies = []) {
  if (!Array.isArray(replies) || !replies.length) return "";
  const lines = replies.map((r) => `  - ${String(r.body).replace(/\n/g, "\n    ")}`);
  const files = replies.some((r) => String(r.body).includes("/v1/attachments/"))
    ? "\n  Attached files are private: fetch one with your passalong token, e.g. " +
      'curl -H "authorization: Bearer $PASSALONG_TOKEN (or the token in ~/.passalong/config.json)" -o <name> <url>.'
    : "";
  return `<!-- passalong: the person replied:\n${lines.join("\n")}${files}\n-->`;
}

/** A refusal that carries the server's own next move, when it sent one. */
const failWith = (err) => {
  const said = nextNote(err.body || {});
  return {
    content: [{ type: "text", text: said ? `${err.message}\n${said}` : err.message }],
    isError: true,
  };
};

/**
 * The server, built but not connected. Split out so the tool surface can be read without a
 * transport — `test/mcp-surface.test.js` lists the tools over an in-memory pair and checks what
 * each one says about itself. apps/api/src/mcp-http.ts is shaped the same way.
 */
export function buildServer() {
  const server = new McpServer(
    { name: "passalong", version: VERSION },
    {
      instructions:
        "Passalong hands work between contexts as guides: markdown with frontmatter, in three " +
        "kinds, and `kind:` in the frontmatter says which. READ IT BEFORE ACTING — each asks " +
        "for different behaviour. Every kind is worked with the same four calls:\n" +
        "take (with an id, or none for the next thing waiting for you) says you are doing it and " +
        "returns it; nobody else can take it here while you hold it, and its sender sees you are " +
        "on it. progress, with a one-line note at each milestone — 30 minutes of silence marks it " +
        "stalled. hand_in when done here. pass, with the reason, when it is not yours or you are " +
        "stuck. ask, with a question, when you need an answer from the person: you keep what you " +
        "hold, stop and wait, and take it again once they have replied. Every answer ends with " +
        "`next`: what to call now. Follow it, and when it says to " +
        "stop, stop. OPEN A GUIDE YOU MEAN TO ACT ON WITH take, NOT get_guide: get_guide only " +
        "reads, and the sender learns nothing. If take says somebody else has it, tell the user " +
        "instead of doing the work twice.\n" +
        "EVERY HAND-IN CARRIES EVIDENCE: what you ran and what came back — the command and the " +
        "lines that decided it, a test summary, a link to the change, or a screenshot url. " +
        "Collect it as you work rather than writing it from memory at the end. hand_in without " +
        "it is refused, because the write-up and the verdict are both your word for your own " +
        "work and evidence is the part the person reviewing it can check.\n" +
        "SAY WHICH KIND IT IS. There is no default: a guide with no `kind:` line is refused, and so " +
        "is a spelling that is not one of the three. " +
        `kind: task is work nobody has done yet. Sections: ${TASK_SECTIONS.join(", ")}. ` +
        "It has no Steps: work out how to reach Goal within Constraints, leave Out of scope " +
        "alone, and treat Acceptance as the definition of done. hand_in with `markdown`: a " +
        "transfer guide about what you did (guide_template kind transfer shows the shape) — its " +
        "author reviews it against Acceptance.\n" +
        `kind: transfer (or no kind: line) is a finished implementation to repeat here. Sections: ${SECTIONS.join(", ")}. ` +
        "Follow its Steps, adapting anything marked ASSUMES to this codebase; run its " +
        "Verification, then hand_in with ok and, when it failed, a note saying what went wrong.\n" +
        `kind: bug is a defect to FIX here. Sections: ${BUG_SECTIONS.join(", ")}. ` +
        "It has no Steps and nothing in it is a procedure to apply: Reproduce is how to see the " +
        "bug and running it produces the bug, Verification is the behaviour that should have " +
        "happened. Fix the defect, then check Verification and hand_in — ok true once the " +
        "behaviour it describes actually holds. A bug report is not broken because you " +
        "reproduced it. " +
        "When you find defects you are not fixing — a test run, a QA pass, a review — call " +
        "file_bugs with all of them at once; each becomes a guide someone can take on its own. " +
        "AN IMAGE THE USER SHOWED YOU IS EVIDENCE, NOT CONTEXT. Before filing or publishing, " +
        "attach it with attach_screenshot and pass what it returns as `evidence` — a screenshot " +
        "you described instead of attaching is the most useful thing in the report, thrown away. " +
        "A guide already filed without one is not stuck: get_guide it, add the markdown line to " +
        "the body, and publish_guide the same id — publishing claims whatever the markdown names. " +
        "\n" +
        "When the user asks you to write a task, or to queue work for an agent, call plan_tasks — " +
        "one step for one task — with every section filled from the conversation and the code, " +
        "Acceptance as checks a person can run; it fills in the repo you are in. When the user " +
        "asks you to plan or break down a larger goal, call plan_tasks with the steps in order, " +
        "`after` naming the earlier steps each needs. Tasks land in Draft, not the queue: tell the " +
        "user to read them and run `passalong ready <id>` or `passalong ready --all`.\n" +
        "When the user asks to pass along, hand off, or share what was just done, distill the " +
        "session into a guide (guide_template kind transfer shows the shape) and call " +
        "publish_guide, with `to` as team, team/@handle for one teammate, or team/#group for the " +
        "people who do a thing. " +
        "BEFORE PUBLISHING ANYTHING, CHECK WHAT IS ALREADY OPEN: call take with no id, or read the " +
        "inbox, and see what you hold. If this session's work answers something you hold, hand_in " +
        "that — never publish a second guide about it. A transfer guide is for work that has to " +
        "cross a boundary: another repo, another machine, a teammate without your branch. Work you " +
        "committed and pushed where the team can already see it has crossed no boundary, and a " +
        "guide about it is one more thing for somebody to read and review; what is worth " +
        "publishing from a session like that is what is still open, as a bug or a task. " +
        '"Update the passalong", "add this to passalong" and the like are ambiguous — hand in ' +
        "what you hold, add a follow-up, or publish something new? Ask which, in one line, rather " +
        "than publishing and leaving the user to undo it. " +
        "At the start of work, inbox shows guides teammates have handed to this user — take one " +
        "to start it — and activity shows whether the guides they handed off have landed. When " +
        "the user asks what they have been working on, or wants a standup or a summary of a " +
        "period, call log — but say that it holds what they passed along and not everything they " +
        "did. Gotchas are the highest-value section: record what failed and why.\n" +
        "A FOLLOW-UP IS MORE CONTEXT FOR A GUIDE, WRITTEN AS ITS OWN GUIDE. When a guide needs " +
        "more context — a missing detail, a step that needed explaining, what changed since, what " +
        "you found doing it — publish that context with publish_guide `parent` set to the guide's " +
        "id. It is listed under the original, and anyone who opens the original, person or agent, " +
        "gets it too. get_guide and take return a guide's follow-ups after it; read them " +
        "before acting. They also return the guide it follows, in front of it: a follow-up is a " +
        "note on a bigger piece of work, not the work. If it needs that guide done and it is " +
        "not, say so rather than starting.",
    },
  );

  // ---- the four verbs (docs/V2.md §11) --------------------------------------------------------
  // One implementation each. The older tool names above call these too, so an agent following an
  // old prompt gets exactly what one following a new prompt gets.

  /** An answer as JSON, with the server's next move after it. */
  const answer = (r, id) => {
    const { next, say, ...rest } = r || {};
    const note = nextNote({ next, say }, id);
    // The note is what the agent acts on and it is prose, so it stays in the text half only. The
    // structured half is the answer itself, which is what `outputSchema` below describes.
    // A reply goes first, in prose: it is what the agent stopped for, and inside the JSON it reads
    // as one more field.
    const said = repliesNote(rest.replies);
    return {
      ...text(
        `${said ? `${said}\n` : ""}${JSON.stringify(rest, null, 2)}${note ? `\n${note}` : ""}`,
      ),
      structuredContent: rest,
    };
  };

  async function doTake({ id, cwd, any }) {
    const dir = cwd || process.cwd();
    try {
      // Without sync there is no claim to make; a guide by id can still be read and worked from.
      if (!api.loggedIn() && id) {
        const r = await passalong.pull(id, { cwd: dir });
        return text(
          `${leadFor(parse(r.markdown).meta)}${r.markdown}\n\n<!-- passalong: not logged in, so ` +
            "nobody was told you took it; written to " +
            `${r.path} -->`,
        );
      }
      const r = await passalong.take(id, { cwd: dir, any: Boolean(any) });
      if (!r.guide) return text(nextNote(r) || "Nothing is waiting for this agent here.");
      const meta = parse(r.guide.markdown).meta;
      const siblings = await related(meta);
      const context = await passalong.followUps(meta);
      const from = await passalong.parentGuide(meta);
      const held =
        `<!-- passalong: ${r.guide.id} is yours` +
        `${r.guide.resumed ? " (you already held it — carry on from where it was left)" : ""}; ` +
        `written to ${r.path}. -->`;
      const said = repliesNote(r.replies);
      return text(
        `${said ? `${said}\n\n` : ""}${from}${leadFor(meta)}${r.guide.markdown}${siblings}${context ? `\n\n${context}` : ""}` +
          `\n\n${held}\n${nextNote(r, r.guide.id)}\n${passalong.followUpNote(meta)}`,
      );
    } catch (err) {
      const h = err.body?.holder;
      if (h)
        return fail({
          message:
            `${err.message}. Somebody else is on it here${h.note ? ` (last said: "${h.note}")` : ""}. ` +
            "Tell the user before doing this work too; get_guide reads it without taking it.",
        });
      return failWith(err);
    }
  }

  async function doProgress({ id, note, cwd }) {
    try {
      return answer(await passalong.progress(id, note || "", { cwd: cwd || process.cwd() }), id);
    } catch (err) {
      return failWith(err);
    }
  }

  async function doHandIn({ id, ok, note, evidence, checks, writeup, markdown, report, pr, cwd }) {
    try {
      // A check that names a command is run here, before anything is recorded, and its exit code
      // decides it rather than the agent's account of it. A failure is refused with the command's
      // own output: the claim is still held, nothing is written, and the agent has what it needs
      // to fix. Checks with no `cmd` pass straight through to the prose rule.
      const at = cwd || process.cwd();
      const done = runChecks(checks || [], { cwd: at });
      if (done.failed)
        return {
          content: [
            { type: "text", text: refusal(done.failed, { ran: done.ran, total: checks.length }) },
          ],
          isError: true,
        };
      const r = await passalong.handIn(id, {
        ok,
        note: note || "",
        evidence: evidence || "",
        checks: done.checks,
        writeup: writeup || "",
        markdown,
        report,
        pr: pr || "",
        cwd: at,
      });
      return answer(r, id);
    } catch (err) {
      return failWith(err);
    }
  }

  async function doAsk({ id, question, cwd }) {
    try {
      return answer(await passalong.ask(id, question, { cwd: cwd || process.cwd() }), id);
    } catch (err) {
      return failWith(err);
    }
  }

  async function doPass({ id, why, cwd }) {
    try {
      return answer(await passalong.pass(id, why, { cwd: cwd || process.cwd() }), id);
    } catch (err) {
      return failWith(err);
    }
  }

  server.registerTool(
    "assign",
    {
      title: "Give it to someone else",
      annotations: ADDS,
      description:
        "Reassign a guide or task the user wrote, or one assigned to them, to someone else in its team, when the user asks: " +
        '`to` is @handle for one person, #group for the people who do a thing, or "team" for ' +
        "everyone. Whoever held it and is left out has it taken back and is told; a task then only " +
        "goes to the new assignee's agents. Its author, or whoever it is assigned to, can do this.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        to: z.string().describe('"@handle", "#group", or "team"'),
      },
    },
    async ({ id, to }) => {
      try {
        return json(await passalong.assign(id, to));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "search_guides",
    {
      title: "Search guides",
      annotations: READS,
      description:
        "Search transfer guides by words in the title, tags, stack, or body: the user's own " +
        "(local and synced) plus every team they belong to. Empty query lists everything, newest first.",
      inputSchema: {
        query: z.string().default(""),
        scope: z.string().optional().describe('"mine", "all" (default), or a team slug'),
      },
    },
    async ({ query, scope }) => {
      try {
        const rows = await passalong.list(query, { scope: scope || "" });
        return json({ guides: rows, warning: rows.warning });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "inbox",
    {
      title: "Inbox",
      annotations: READS,
      description:
        "Guides handed to this user (or to their teams) that they have not pulled yet. Call it " +
        "when starting work so handoffs are not missed. Needs sync (passalong login).",
      inputSchema: {},
    },
    async () => {
      try {
        return json({ guides: await passalong.inbox() });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "board",
    {
      title: "Board",
      annotations: READS,
      description:
        "The state of this user's transfers as queues: waiting on you (handed to you, not " +
        "pulled), not working (someone gave it a failing verdict — the most urgent), in flight " +
        "(handed over, nobody has taken it — `stale` means it has sat over a week), and landed " +
        "(someone else has it). Use it to answer 'what is outstanding?'.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await passalong.board());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "log",
    {
      title: "What this user did",
      annotations: READS,
      description:
        "This user's own acts on guides, newest first: what they published, what they took " +
        "delivery of, and every verdict and ack they gave. Each item has a rendered `text` line " +
        "and the guide's repo. Use it to answer 'what have I been working on', to write a " +
        "standup or a weekly summary, or to find work from a repo by when it happened rather " +
        "than by what it was called. This is the opposite of `activity`, which is what other " +
        "people did. IMPORTANT: it records what was passed along, not what was worked on — work " +
        "that never became a guide has no entry, so never present it as a complete record of " +
        "this user's work, and never infer that a quiet period was an idle one.",
      inputSchema: {
        repo: z.string().default("").describe("narrow to guides whose source repo matches this"),
        since: z
          .string()
          .default("")
          .describe("only what happened on or after this date: 2026, 2026-09, or 2026-09-11"),
      },
    },
    async ({ repo, since }) => {
      try {
        return json({ log: await passalong.log({ repo: repo || "", since: since || "" }) });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "activity",
    {
      title: "Activity",
      annotations: READS,
      description:
        "What has happened to this user's guides and handoffs: who pulled one, who archived one, " +
        "who was handed what, who joined a team. Each item has a ready-made `text` line. This only " +
        "reads; clear_activity is what marks the feed seen.",
      inputSchema: {
        all: z.boolean().default(false).describe("include what the user has already seen"),
      },
    },
    async ({ all }) => {
      try {
        return json(await passalong.activity({ all }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /**
   * Split out of `activity`, which took `mark_read` and so read on one call and wrote on the next.
   *
   * An annotation cannot say "sometimes": `readOnlyHint` was false for a tool that almost always
   * only reads, which is a client being told the cautious lie on every call rather than the truth
   * on the one that matters. Two tools, each true about itself.
   */
  server.registerTool(
    "clear_activity",
    {
      title: "Mark activity seen",
      annotations: ADDS,
      description:
        "Clear the user's unread feed, after they have been shown what is in it. Read it with " +
        "activity first — clearing what nobody was told about loses it.",
      inputSchema: {},
    },
    async () => {
      try {
        const res = await passalong.activity({ all: false });
        if (!res.unread) return json({ cleared: 0, unread: 0 });
        await passalong.seen();
        return json({ cleared: res.unread, unread: 0 });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "plan_tasks",
    {
      title: "Plan a goal as tasks",
      annotations: ADDS,
      description:
        "Write tasks for agents: one step for a single task, or a larger goal broken into steps " +
        "an agent can each finish and a person can each check, written as drafts in order. The " +
        "tool for any task, rather than publish_guide. Give each step a Goal and an Acceptance " +
        "a person can run. " +
        "`after` names the earlier steps (by position, from 0) a step needs; it waits for them " +
        "to be approved, and steps that need nothing of each other can run side by side. Keep a " +
        "step to one sitting of work in one repo. Nothing runs until the user makes them ready.",
      inputSchema: {
        steps: z
          .array(
            z.object({
              title: z.string(),
              goal: z.string().describe("what is true when this step is done"),
              acceptance: z.string().describe("checks a person can run, one per line"),
              context: z.string().optional(),
              constraints: z.string().optional(),
              out_of_scope: z.string().optional(),
              target_context: z
                .string()
                .optional()
                .describe("owner/repo it is for; default is the repo you are in, '' for none"),
              after: z.array(z.number().int()).optional().describe("earlier steps this one needs"),
            }),
          )
          .min(1)
          .max(20),
        cwd: z.string().optional().describe("the repo you are planning from"),
      },
    },
    async ({ steps, cwd }) => {
      try {
        const ids = await passalong.planTasks(steps, { cwd: cwd || process.cwd() });
        return json({
          drafts: ids.map((id, i) => ({ id, title: steps[i].title, after: steps[i].after || [] })),
          next: "all in Draft: ask the user to read them, then run `passalong ready --all`",
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "take",
    {
      title: "Take work",
      annotations: ADDS,
      description:
        "Say you are doing it, and get it. With `id`, that guide — any kind: a task, a bug, a " +
        "handoff. With no id, the next thing waiting for this worktree's agent. While you hold it " +
        "no other agent can take it here, and its sender sees you are on it. One thing at a time: " +
        "if you already hold something, finish or pass that first. If somebody else has it, the " +
        "answer says who — tell the user rather than doing the work twice. Every answer ends with " +
        "what to call next.",
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe("passalong id or share link; leave out for the next one"),
        cwd: z
          .string()
          .optional()
          .describe("the worktree you are working in; default is the server's cwd"),
        any: z
          .boolean()
          .optional()
          .describe("a task for another repo, or none — only when the user asks"),
      },
    },
    async (args) => doTake(args),
  );

  server.registerTool(
    "progress",
    {
      title: "Report progress",
      outputSchema: progressOut,
      annotations: ADDS,
      description:
        "Say you are still on what you hold, with a one-line note the hub shows. 30 minutes " +
        "without one marks it stalled. If the answer says you no longer hold it, stop.",
      inputSchema: {
        id: z.string().describe("the id of what you hold"),
        note: z
          .string()
          .optional()
          .describe(
            'one plain sentence in the first person, as you would tell the person: "Reading ' +
              'the settings page to find where the toggle goes." Start it with BLOCKED: when ' +
              "you are stopped and need an answer",
          ),
        cwd: z
          .string()
          .optional()
          .describe("the worktree you are working in; default is the server's cwd"),
      },
    },
    async (args) => doProgress(args),
  );

  server.registerTool(
    "hand_in",
    {
      title: "Hand it in",
      outputSchema: handInOut,
      annotations: ADDS,
      description:
        "Done here, with proof, sorted against the line it answers. Send `checks`: one entry per " +
        "line the guide asks for — `## Acceptance` on a task, `## Verification` on a handoff or a " +
        "bug — each with that line and the evidence for it. That is what its author reads, line " +
        "against line, instead of hunting through a wall of output for the part that answers each " +
        "one, AND IT IS HOW YOU KNOW YOU ARE DONE: every line has one. Give a check `cmd` when a " +
        "command proves it: the command is run here before the hand-in lands, a non-zero exit " +
        "refuses it, and what it printed is recorded instead of your account of it. Use `ran` for " +
        "a check no command can settle. `evidence` as one block is the older shape and still " +
        "works. A task also takes `markdown`, a transfer guide about what you did and decided — " +
        "this publishes it and attaches it. A handoff or a bug takes `ok`, whether its " +
        "Verification held here, and `note` saying what went wrong when it did not. DO NOT " +
        "publish a guide to carry your evidence: it belongs on this call, and a second document " +
        'titled "Hand-in evidence" is the thing `checks` exists to replace. If it worked but you ' +
        "had to adapt something, that goes in `writeup` and the next reader of the guide is shown " +
        "it — that is its home. A follow-up guide is for work somebody else should now do, not " +
        "for answering.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        evidence: z
          .string()
          .optional()
          .describe(
            "what you ran and what came back: the command and the lines that decided it, a test " +
              'summary, a link to the change, or a screenshot url. "it works" is a claim, not evidence',
          ),
        checks: z
          .array(
            z.object({
              check: z
                .string()
                .describe(
                  "the line this answers, in the guide's own words: an Acceptance line on a task, " +
                    "a Verification line on a handoff or a bug",
                ),
              ran: z
                .string()
                .optional()
                .describe("what you ran for it, and what came back; not needed when `cmd` is set"),
              cmd: z
                .string()
                .optional()
                .describe(
                  "the shell command that proves this line, run here before the hand-in lands — " +
                    "its exit code decides the check and its output is recorded as the evidence. " +
                    "Non-zero refuses the hand-in. Leave it out for a check nobody can run, like " +
                    '"the badge reads 3" — then SHOW it with attach_screenshot and put the line it returns in `ran`; a check is run or shown, and describing what you saw is refused',
                ),
            }),
          )
          .optional()
          .describe(
            "one entry per line the guide asks for — Acceptance on a task, Verification on a " +
              "handoff or a bug — in the order you worked them. Each is RUN (`cmd`) or SHOWN (an " +
              "attach_screenshot line in `ran`). Pasting a command you typed into `ran` is not " +
              "running it and is refused",
          ),
        ok: z.boolean().optional().describe("handoff or bug: did its Verification hold"),
        note: z
          .string()
          .describe(
            "one plain sentence, in the first person, saying what you did and how it went: " +
              '"Added the toggle to Settings; it survives a reload." It is the first thing the ' +
              "person reads, and the evidence is behind it. Say what went wrong when ok is false",
          ),
        writeup: z
          .string()
          .optional()
          .describe(
            "handoff or bug: what you had to adapt to make it work here — a version, a name, a " +
              "step that needed something the guide does not mention. Prose, and optional: leave " +
              "it out when it worked as written. The next person to open the guide is shown it, " +
              "which is why it does not need to be a guide of its own",
          ),
        markdown: z
          .string()
          .optional()
          .describe("task: the write-up; start from guide_template kind transfer"),
        report: z
          .string()
          .optional()
          .describe("task, instead of markdown: id of a write-up already published"),
        pr: z.string().optional().describe("task: PR or branch link, when there is one"),
        cwd: z
          .string()
          .optional()
          .describe("the worktree you are working in; default is the server's cwd"),
      },
    },
    async (args) => doHandIn(args),
  );

  server.registerTool(
    "ask",
    {
      title: "Ask the person",
      outputSchema: openObject({ id: z.string(), lease_until: z.string() }),
      annotations: ADDS,
      description:
        "You need the person's answer before you can go on. Ask one clear question, with the " +
        "context it needs to be answered without opening your terminal. You keep what you hold " +
        "and nobody else can take it. Then STOP and tell the user you are waiting: do not carry " +
        "on guessing. When they have replied, call take with this id and their reply comes back " +
        "with it. Use `pass` instead when the work is not yours; a progress note starting " +
        "BLOCKED: is the older way of saying this, and is not heard as a question.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        question: z
          .string()
          .describe(
            "one clear question in the first person, a few sentences at most, plain text: " +
              '"Should the dark-mode toggle live in Settings or the header? The header is ' +
              'crowded on mobile." What you were about to do, if they just say yes, helps',
          ),
        cwd: z
          .string()
          .optional()
          .describe("the worktree you are working in; default is the server's cwd"),
      },
    },
    async (args) => doAsk(args),
  );

  server.registerTool(
    "pass",
    {
      title: "Pass it",
      outputSchema: passOut,
      annotations: ADDS,
      description:
        "Not yours to do, or you are stuck: give it back with the reason. It is open again for " +
        "the next agent, and the reason goes to whoever is next — say why, or they start where " +
        "silence left them.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        why: z.string().describe("one line: why it is not yours, or where you got stuck"),
        cwd: z
          .string()
          .optional()
          .describe("the worktree you are working in; default is the server's cwd"),
      },
    },
    async (args) => doPass(args),
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get guide",
      annotations: READS,
      description:
        "READ a transfer guide by passalong id or share link and return its full markdown. Also " +
        "writes it to .passalong/<id>.md in the working directory so it survives the session. " +
        "Pulling a teammate's guide tells them the transfer landed. Use this to look at a guide " +
        "you have not committed to. If you are about to DO the work, call take instead: " +
        "it does this and takes it in one call, which is the only way the sender learns " +
        "somebody picked it up.",
      inputSchema: {
        ref: z.string().describe("passalong id (e.g. k3mq2xa7) or share URL"),
        cwd: z
          .string()
          .optional()
          .describe("directory to write .passalong/<id>.md into; default is the server's cwd"),
      },
    },
    async ({ ref, cwd }) => {
      try {
        const { markdown, path, from } = await passalong.pull(ref, { cwd: cwd || process.cwd() });
        const meta = parse(markdown).meta;
        const lead = leadFor(meta);
        const siblings = await related(meta);
        // Follow-ups are more context for this guide, so they come with it — after the document,
        // never inside it, so the guide an agent writes back out is still only the guide.
        const context = await passalong.followUps(meta);
        // The guide this one came out of, in front of the document: a follow-up read on its own
        // looks like a small piece of work and is a note on a bigger one.
        const follows = await passalong.parentGuide(meta);
        // After the document, with the other trailing comments, not in front of it. An
        // instruction that arrives with the payload is what gets read — but anything before the
        // opening `---` stops the frontmatter being frontmatter, and this fires on every guide
        // anyone was handed rather than only on bugs. The bug lead stays where it is: it is a
        // warning against executing the document, so being read first is its whole job.
        return text(
          `${follows}${lead}${markdown}${siblings}${context ? `\n\n${context}` : ""}` +
            `\n\n<!-- passalong: ${from}; written to ${path} -->` +
            `\n${passalong.handoffNudge(meta)}` +
            `\n${passalong.followUpNote(meta)}`,
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "attach_screenshot",
    {
      title: "Attach a screenshot",
      annotations: { ...ADDS, openWorldHint: true },
      description:
        "Upload an image as evidence — a path in `file`, or the bytes in `data` when you have " +
        "the image and no file — and get back the markdown line that points at it. " +
        WHERE_THE_LINE_GOES,
      inputSchema: {
        file: z
          .string()
          .default("")
          .describe("path to the image on this machine; leave out when sending `data`"),
        data: z
          .string()
          .default("")
          .describe(
            "the image itself, base64 (a data: URL is fine), for when you have the bytes and no " +
              "file — a browser tool that hands back an image inline and never writes to disk. " +
              "5MB; larger belongs in create_upload",
          ),
        type: z
          .string()
          .default("image/png")
          .describe("media type of `data`: image/png, image/jpeg, image/webp or image/gif"),
        name: z.string().default("").describe("label for the image; defaults to its filename"),
      },
    },
    async ({ file, data, type, name }) => {
      try {
        if (!file && !data) {
          return fail(
            new Error(
              "send `file` (a path on this machine) or `data` (the image, base64). If your " +
                "screenshot is a tool result you cannot write out, capture it to a file instead " +
                "— a headless browser's page.screenshot({ path }) or your platform's capture " +
                "command — and pass that path.",
            ),
          );
        }
        const shot = data
          ? await passalong.attachBytes(data, { name: name || "", type: type || "image/png" })
          : await passalong.attach(file, { name: name || "" });
        return text(
          `${JSON.stringify({ id: shot.id, url: shot.url, bytes: shot.bytes }, null, 2)}\n\n` +
            `Put this in the guide body:\n${shot.markdown}`,
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "attach_file",
    {
      title: "Attach a file",
      annotations: { ...ADDS, openWorldHint: true },
      description:
        "Upload a file that is not a picture — a log, a PDF, a CSV, a zip, up to 10MB — and get " +
        "back the markdown line that points at it. For a guide body or a bug report: put the " +
        "line there and publishing claims the file. It is private, so only people who can read " +
        "that guide can download it; for something a reviewer must SEE, use attach_screenshot. " +
        "Pictures belong to attach_screenshot, not here.",
      inputSchema: {
        file: z.string().describe("path to the file on this machine"),
        name: z.string().default("").describe("label for the file; defaults to its filename"),
      },
    },
    async ({ file, name }) => {
      try {
        const got = await passalong.attachFile(file, { name: name || "" });
        return text(
          `${JSON.stringify({ id: got.id, url: got.url, bytes: got.bytes }, null, 2)}\n\n` +
            `Put this in the guide body:\n${got.markdown}`,
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "reply",
    {
      title: "Write to the agent",
      annotations: ADDS,
      description:
        "A person's tool, for someone driving their work from an assistant: write to whoever " +
        "holds a guide — an answer to a question it asked, or something you thought of since — " +
        "or, when nobody holds it yet and it is yours, leave a note for whoever takes it. Plain " +
        "text, 1000 characters. `files` are paths on this machine: a picture is drawn in the " +
        "thread and anything else is a file to download. Only its author, whoever it is " +
        "assigned to, or whoever holds it can write; the agent reads it the next time it " +
        "checks in. Agents answering their own questions do not use this: they use ask and take.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        text: z.string().default("").describe("what to say; may be empty when attaching a file"),
        files: z
          .array(z.string())
          .max(3)
          .default([])
          .describe("paths to up to three files or pictures to attach"),
      },
    },
    async ({ id, text: said, files }) => {
      try {
        const r = await passalong.reply(id, said, { files });
        return text(
          r?.noted
            ? `Nobody holds ${id} yet, so this is a note: whoever takes it is handed it first.`
            : `Sent to whoever holds ${id}. It reads this the next time it checks in.`,
        );
      } catch (err) {
        return failWith(err);
      }
    },
  );

  server.registerTool(
    "publish_guide",
    {
      title: "Publish guide",
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      description:
        "Publish a guide from markdown (frontmatter + sections). Check what you hold first (take " +
        "with no id): if this session answers something you hold, hand_in that instead, and if the " +
        "work never left a branch the team can see, publish what is still open as a bug or a task " +
        "rather than a write-up of the fix. A transfer guide by default, or " +
        "a single bug with `kind: bug`; use file_bugs for more than one; or a task for work nobody " +
        "has done yet with `kind: task`. Missing id, created, " +
        "author, and source_context are filled in. A screenshot belongs in the markdown: attach it " +
        "with attach_screenshot and put the line it returns in the body, because publishing claims " +
        "whatever the markdown names. " +
        '`to` addresses it to a team ("khaime") or a ' +
        'teammate ("khaime/lukman"), who is notified. Returns the id and share link.',
      inputSchema: {
        markdown: z.string().describe("full guide markdown; start from guide_template"),
        to: z
          .string()
          .optional()
          .describe("team slug, team/@handle for one teammate, or team/#group for a set of them"),
        cwd: z
          .string()
          .optional()
          .describe("directory the work happened in, used to infer source_context"),
        parent: z
          .string()
          .optional()
          .describe(
            "id or share link of the guide this one adds context to — set it and this is " +
              "published as that guide's follow-up: listed under it, and read by whoever opens it",
          ),
      },
    },
    async ({ markdown, to, cwd, parent }) => {
      try {
        const { guide, url, synced, notified, path } = await passalong.share(markdown, {
          cwd: cwd || process.cwd(),
          to,
          follows: parent,
        });
        return json({
          id: guide.meta.id,
          title: guide.meta.title,
          url,
          synced,
          team: guide.meta.team || "",
          to: guide.meta.to || "",
          parent: guide.meta.parent || "",
          notified,
          path,
          // A task does not go live on publish, and an agent that reports "queued it" has told
          // the user something untrue. Said in the result so it is said to them.
          ...(guide.meta.kind === "task" && guide.meta.status === "draft"
            ? {
                status: "draft",
                next: `in Draft: ask the user to read it, then run \`passalong ready ${guide.meta.id}\``,
              }
            : {}),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "file_bugs",
    {
      title: "File bugs",
      annotations: ADDS,
      description:
        "File one or more bugs you found but are not fixing, as a set. Opens a report and " +
        "publishes each issue as its own guide — its own id, share link, and verdict — so a " +
        "reviewer can hand any one of them to whoever fixes it. Use this after a test run, a QA " +
        "pass, or a review that turned up defects; use publish_guide instead for work you " +
        "finished and want repeated elsewhere. If there is a screenshot of any of this, it is " +
        "evidence: call attach_screenshot first and pass what it returns as that issue's " +
        "`evidence`. Describing a screenshot instead of attaching it throws away the most useful " +
        "thing in the report. Needs sync (`passalong login`).",
      inputSchema: {
        title: z
          .string()
          .optional()
          .describe('what the sweep was, e.g. "Checkout regression pass, 8 Sep build"'),
        environment: z
          .string()
          .optional()
          .describe("production, staging or development — where you saw these"),
        to: z
          .string()
          .optional()
          .describe("team slug, team/@handle for one teammate, or team/#group for a set of them"),
        issues: z
          .array(
            z.object({
              evidence: z
                .array(z.string())
                .default([])
                .describe(
                  "screenshot URLs from attach_screenshot, or the markdown lines it returned; " +
                    "they go under Problem, where a reader looks first",
                ),
              title: z.string().describe("what is broken, in one line"),
              problem: z
                .string()
                .describe(
                  "what is broken and what it stops someone doing; the error if there is one",
                ),
              reproduce: z
                .string()
                .describe(
                  "numbered steps that show the bug — these produce it, they are not a fix",
                ),
              verification: z
                .string()
                .optional()
                .describe(
                  "the behaviour that should have happened, as something a fixer can check",
                ),
              gotchas: z
                .string()
                .optional()
                .describe("anything already ruled out, or that made it hard to pin down"),
              area: z
                .string()
                .optional()
                .describe(`which surface it is on — known: ${AREAS.map((a) => a.slug).join(", ")}`),
              severity: z
                .string()
                .optional()
                .describe("s1 blocker, s2 major, s3 minor, s4 cosmetic (default s3)"),
            }),
          )
          .min(1)
          .describe("one entry per defect; file them together rather than one call each"),
        cwd: z.string().optional().describe("directory the bugs were found in"),
      },
    },
    async ({ title, environment, to, issues, cwd }) => {
      try {
        const filed = await passalong.fileBugs(
          { title: title || "", environment: environment || "", issues },
          { cwd: cwd || process.cwd(), to },
        );
        return json(filed);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "guide_template",
    {
      title: "Guide template",
      annotations: READS,
      description:
        "The empty guide skeleton with guidance comments for each section. By default a task " +
        "brief: Goal, Context, Constraints, Acceptance, Out of scope. `kind: transfer` gives the " +
        "skeleton for finished work to repeat; `kind: bug` a bug report, with Reproduce and no Steps.",
      inputSchema: {
        kind: z
          .enum(["transfer", "bug", "task"])
          .optional()
          .describe(
            "task (default) for work nobody has done yet; transfer for finished work to repeat; " +
              "bug for a defect to fix",
          ),
      },
    },
    async ({ kind }) => text(template(kind ? { kind } : {})),
  );

  server.registerTool(
    "set_guide_status",
    {
      title: "Set guide status",
      annotations: ADDS,
      description:
        "Archive a guide (`consumed`) or put it back on the board (`published`). Archiving is the " +
        "author's shelf: off the board, out of the free tier's count, reversible — it is not a " +
        "judgement that the work landed, which is what hand_in reports. `promoted` was " +
        "retired and the server refuses it.",
      inputSchema: { id: z.string(), status: z.enum(["published", "consumed"]) },
    },
    async ({ id, status }) => {
      try {
        const g = await passalong.setStatus(id, status);
        return json(passalong.summary(g));
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}

/** The stdio server: `passalong mcp`, and what `passalong setup` registers with a client. */
export async function serve() {
  await buildServer().connect(new StdioServerTransport());
}
