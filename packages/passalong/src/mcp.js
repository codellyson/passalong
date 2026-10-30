// The Passalong MCP server (stdio). Any MCP-capable agent can take work, hand it in, write work
// down, and read and write a project's documents without leaving its session.
//
//   claude mcp add passalong -- passalong mcp
//
// Seventeen tools, four nouns: work, project, document, file (docs/WORK.md). The same tools are
// served over HTTP by apps/api/src/mcp-http.ts; the two say the same things in the same words.
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as api from "./api.js";
import { refusal, runChecks } from "./checks.js";
import * as passalong from "./passalong.js";
import { outlineText, parse, section as sectionOf, serialize, WORK_WARN } from "./work.js";

/**
 * What the server calls itself in the MCP handshake — read from package.json rather than written
 * here, because a literal drifts. `pnpm release` bumps package.json, so there is one number.
 */
const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const text = (s) => ({ content: [{ type: "text", text: s }] });

/**
 * Where the line `add_file` returns goes, which is not always new work. Proof of a hand-in belongs
 * on the hand-in: six screenshots of a delivered change were once published as a document with six
 * sections wrapped round them, because the upload tool named only one destination.
 * Mirrors WHERE_THE_LINE_GOES in apps/api/src/mcp-http.ts.
 */
const WHERE_THE_LINE_GOES =
  "WHERE THE LINE GOES DEPENDS ON WHAT THE FILE IS EVIDENCE OF. Proof that work you are handing in " +
  "holds — a screen that renders right, a total that matches — goes in that check's `ran` on " +
  "hand_in, and nothing new is written: a check answered with a picture is shown, which is what " +
  "the hand-in asks for. A picture that is part of the work itself — the screenshot of a bug, a " +
  "diagram it explains — goes in its text (create_work, or update_work), because work travels as " +
  "its text and a file beside it does not travel at all. DO NOT WRITE NEW WORK TO CARRY " +
  "SCREENSHOTS: six images and a caption each is a hand-in. With `project`, the file is kept in " +
  "that project instead. Pictures (png, jpg, webp, gif) are drawn where they are named; anything " +
  "else is a file to download.";

/**
 * What a screenshot has to be a screenshot OF. An agent short of a picture once built a page to
 * photograph, shot it, deleted it, and offered the shots as evidence the real screen rendered.
 * Mirrors SHOOT_THE_REAL_THING in apps/api/src/mcp-http.ts.
 */
const SHOOT_THE_REAL_THING =
  "SHOOT THE RUNNING THING, NOT SOMETHING YOU BUILT TO SHOOT. A screenshot is worth what the sc" +
  "reen behind it is worth: the real route in the real app, reached the way a reader would reac" +
  "h it. A scratch page, a story, a harness or a component rendered on its own is a picture of " +
  "your scaffolding, and it can look right while the thing the work is about does not. If the " +
  "only way you could get a picture was to build something, that is not evidence the real scree" +
  "n works — say what you built and why in `writeup`, and leave the check to the commands that " +
  "do hold. NEVER DELETE WHAT YOUR EVIDENCE POINTS AT: a shot of a page you removed afterwards " +
  "is one nobody can take again, including you.\n\n";

const KEEP_EVIDENCE =
  "KEEP YOUR EVIDENCE AS YOU GO. hand_in needs it: the commands you ran and what came back, the " +
  "test summary, the link to the change. Copy each one when it happens — at the end you will be " +
  "writing from memory, which is the thing evidence is here to replace.\n\n";

/**
 * The failure this stops: an agent lists one directory, or opens the one file it expected, and
 * reports that a thing is absent, or that it found the only occurrence. Confident and wrong, and
 * nothing downstream can tell. Mirrors SEARCH_WIDE in apps/api/src/mcp-http.ts.
 */
const SEARCH_WIDE =
  "SEARCH THE WHOLE TREE BEFORE YOU CONCLUDE. Listing a directory, or reading the one file you " +
  "expected, tells you what is in that directory — not whether the thing exists, and not whether " +
  "you have found all of it. Before you report that something is absent, is the only one, or is " +
  'already handled, search across the repository and let the output be your reason. "I looked" ' +
  "is a claim; the search and what it printed is evidence.\n\n";

/** Said in front of every piece of work an agent takes. Mirrors LEAD in apps/api/src/mcp-http.ts. */
const LEAD = SEARCH_WIDE + SHOOT_THE_REAL_THING + KEEP_EVIDENCE;

/**
 * An answer a client can read as data as well as prose. The spec asks for both: structured content
 * "SHOULD also return the serialized JSON in a TextContent block" for clients that only read text.
 */
const json = (data) => ({
  ...text(JSON.stringify(data, null, 2)),
  ...(data && typeof data === "object" && !Array.isArray(data) ? { structuredContent: data } : {}),
});

/**
 * What the four calls that answer with a record return. Declared only for those: `outputSchema`
 * puts a MUST on the server, so it is a promise, and promising a shape this server does not
 * control would be worse than staying quiet. Every field is optional and the objects are open —
 * the object itself goes to registerTool, never its `.shape`, which is rebuilt closed and
 * advertised as `additionalProperties: false`.
 */
const openObject = (shape) => z.object(shape).partial().passthrough();
const progressOut = openObject({ id: z.string(), lease_until: z.string(), note: z.string() });
const handInOut = openObject({ id: z.string(), state: z.string() });
const passOut = openObject({ id: z.string(), passed: z.boolean() });
const askOut = openObject({ id: z.string(), lease_until: z.string() });

/**
 * What each tool does to the world, said out loud. MCP's defaults for a tool that says nothing are
 * the worst case, and clients act on them. These are hints, not permissions.
 */
const READS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ADDS = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
// Removes or replaces something that cannot be brought back. Only a person's request should lead here.
const REMOVES = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const fail = (err) => ({ content: [{ type: "text", text: err.message }], isError: true });

/**
 * The server's `next` and `say`, as the last thing an agent reads. See steps() in
 * apps/api/src/claims.ts: the answer to the call it just made is the one place it is sure to look.
 */
export function nextNote({ next = [], say = "" } = {}, id = "") {
  const lines = next.map(
    (s) =>
      `  ${s.tool}${id && s.tool !== "take" ? ` ${id}` : ""} — when ${s.when} (${s.why})` +
      // What the call has to carry, under the call it belongs to.
      (s.with ? `\n      with ${s.with}` : ""),
  );
  if (say) lines.unshift(`  ${say}`);
  return lines.length ? `<!-- passalong: next:\n${lines.join("\n")}\n-->` : "";
}

/**
 * What the person said to this agent since it last heard, in front of everything else: a reply is
 * the thing the agent stopped for. See claims.deliver() in apps/api/src/claims.ts.
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

/** One call, its answer as JSON, its refusal as an error. */
const run = (fn) => async (args) => {
  try {
    return json(await fn(args));
  } catch (err) {
    return fail(err);
  }
};

const CWD = z
  .string()
  .optional()
  .describe("the worktree you are working in; default is the server's cwd");

const STATUS = { ready: "ready", draft: "draft", archived: "done" };

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
        "Passalong keeps a team's work and what it knows, as four things. WORK is something " +
        "someone must still do: one thing, with no kinds, sections or templates — a title, a " +
        "summary for a person, and whatever text, pictures and files the next reader needs, in " +
        "whatever shape fits. Read it and work out what done means; nothing tells you in advance. " +
        "A PROJECT is a place for one product or body of work; its DOCUMENTS are what to know " +
        "about it — a README saying what it is, who uses it and how it is built, a page per area, " +
        "a Log of what changed. FILES are pictures and other files, on work or in a project.\n" +
        "DOING WORK. take (with an id, or none for the next thing waiting here) says you are doing " +
        "it and returns it; nobody else can take it while you hold it, and whoever sent it sees " +
        "you are on it. progress, with a one-line note at each milestone — 30 minutes of silence " +
        "marks it stalled. hand_in when it is done. pass, with the reason, when it is not yours or " +
        "you are stuck. ask, with a question, when you need the person's answer: you keep it, stop " +
        "and wait, and take it again once they have replied. Every answer ends with `next`: what " +
        "to call now. Follow it, and when it says to stop, stop. OPEN WORK YOU MEAN TO DO WITH " +
        "take, NOT find_work: find_work only reads, and nobody learns you are on it. If take says " +
        "somebody else has it, tell the user instead of doing the work twice.\n" +
        "EVERY HAND-IN CARRIES EVIDENCE: what you ran and what came back — the command and the " +
        "lines that decided it, a test summary, a link to the change, or a screenshot url. " +
        "Collect it as you work rather than writing it from memory at the end. hand_in without " +
        "it is refused, because your note is your word for your own work and evidence is the " +
        "part a person can check.\n" +
        "WRITING WORK DOWN. create_work takes one piece of work or several. Each says what it is " +
        "to a person in `summary` — one or two plain sentences, 400 characters at most, no ids, " +
        "paths or jargon, saying what this is and whether anybody has to act. It is what the " +
        "person sees first; the text behind it is for agents: exact, dense, full of ids and " +
        "paths. New work is Ready: it reaches whoever it is for at once. Pass `draft: true` when " +
        "a person should read it first — a plan of several pieces, or something you are unsure " +
        "of — and tell them. A tag such as bug, feature or question may describe it; nothing " +
        "turns on one. BEFORE WRITING ANYTHING DOWN, CHECK WHAT IS ALREADY OPEN: find_work with " +
        "nothing shows the board and what this worktree holds. If this session's work answers " +
        "something you hold, hand_in that — never write a second piece of work about it. Defects " +
        "you found and are not fixing go in one create_work call, each its own item, so each can " +
        "be taken on its own. AN IMAGE THE USER SHOWED YOU IS EVIDENCE, NOT CONTEXT: add_file it " +
        "and put the line it returns in the text — a screenshot described instead of attached is " +
        "the most useful thing in the report, thrown away. update_work changes work that exists: " +
        "Ready, Draft or archived, who it is for, or its text.\n" +
        "WHAT YOU LEARN GOES INTO THE PROJECT'S DOCUMENTS. When the user asks you to pass this " +
        "along, hand it off, capture it, or share what was just done, write what the next person " +
        "needs to know into the project's documents: find_projects, read_document its README and " +
        "the page for that area, and save_document to update the page that already covers it " +
        "rather than adding a new one each time, with a line on its Log. Never hand knowledge to " +
        'one person as a piece of work. "Update the passalong", "add this to passalong" and the ' +
        "like are ambiguous — hand in what you hold, update the documents, or write new work? Ask " +
        "which, in one line, rather than writing and leaving the user to undo it.\n" +
        "A PROJECT IS A PLACE; ITS DOCUMENTS ARE WHAT TO KNOW; WORK IS WHAT TO DO. Sort " +
        "everything before writing it. If someone still has to act on it — a defect still open, " +
        "work not yet done, a check nobody has run — it is work: it has an owner, a state and an " +
        "answer. A document has none of those and tells nobody, so open work recorded only as a " +
        "document is lost. If it is what someone needs to know — an overview, a decision, a " +
        "finding, something already fixed with its commit — it is a document. WHERE A PROJECT " +
        "LIVES is in the `space` field find_projects and save_project return: private, or a named " +
        "team. Tell the person that, never what you meant to do; a project made without `team` " +
        "is private, and one made inside another takes its space. Call find_projects before " +
        "save_project, so you do not make a duplicate; a short request is enough to name one and " +
        "write its first document. read_document gives a document's text and version; " +
        "save_document with that version, and on a stale-version refusal read it again before " +
        "retrying, so nobody's writing is lost. Every version is kept, and read_document with " +
        "`history` lists them, so a bad edit can be put back. delete_document and delete_file " +
        "only when the person asked for that one to go: neither can be undone, and no tool " +
        "deletes a whole project.\n" +
        "SEVERAL ACCOUNTS. When this machine has more than one signed in and none is chosen, " +
        "every call is refused until accounts with `use` says which. Ask the person; never choose.",
    },
  );

  /** An answer as JSON, with the server's next move after it, and a reply in front of it. */
  const answer = (r, id) => {
    const { next, say, ...rest } = r || {};
    const note = nextNote({ next, say }, id);
    const said = repliesNote(rest.replies);
    return {
      ...text(
        `${said ? `${said}\n` : ""}${JSON.stringify(rest, null, 2)}${note ? `\n${note}` : ""}`,
      ),
      structuredContent: rest,
    };
  };
  const verb = (fn) => async (args) => {
    try {
      return answer(await fn(args), args.id);
    } catch (err) {
      return failWith(err);
    }
  };

  // ---- work: take, progress, hand_in, pass, ask ---------------------------------------------

  server.registerTool(
    "take",
    {
      title: "Take work",
      annotations: ADDS,
      description:
        "Say you are doing it, and get it. With `id`, that piece of work. With no id, the next " +
        "thing waiting here — always something new, never what you hold. While you hold it no " +
        "other agent can take it, and whoever sent it sees you are on it. You may hold several; " +
        "the person watches them on the board. If somebody else has it, the answer says who — " +
        "tell the user rather than doing the work twice. Every answer ends with what to call next.",
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe("passalong id or share link; leave out for the next one"),
        cwd: CWD,
        any: z
          .boolean()
          .optional()
          .describe("work for another repo, or none — only when the user asks"),
      },
    },
    async ({ id, cwd, any }) => {
      try {
        const r = await passalong.take(id, { cwd: cwd || process.cwd(), any: Boolean(any) });
        if (!r.work) return text(nextNote(r) || "Nothing is waiting for this agent here.");
        const from = await passalong.parentWork(parse(r.work.markdown).meta);
        const held =
          `<!-- passalong: ${r.work.id} is yours` +
          `${r.work.resumed ? " (you already held it — carry on from where it was left)" : ""}. -->`;
        const said = repliesNote(r.replies);
        return text(
          `${said ? `${said}\n\n` : ""}${from}${LEAD}${r.work.markdown}` +
            `\n\n${held}\n${nextNote(r, r.work.id)}\n${passalong.AFTER}`,
        );
      } catch (err) {
        const h = err.body?.holder;
        if (h)
          return fail({
            message:
              `${err.message}. Somebody else is on it${h.agent ? ` (agent ${h.agent}${h.host ? ` on ${h.host}` : ""})` : ""}${h.note ? ` (last said: "${h.note}")` : ""}. ` +
              "Tell the user before doing this work too; find_work reads it without taking it.",
          });
        return failWith(err);
      }
    },
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
        cwd: CWD,
      },
    },
    verb(({ id, note, cwd }) => passalong.progress(id, note || "", { cwd: cwd || process.cwd() })),
  );

  server.registerTool(
    "hand_in",
    {
      title: "Hand it in",
      outputSchema: handInOut,
      annotations: ADDS,
      description:
        "Finished here, with proof. IT IS FINAL: the work goes to Done with what you showed, and " +
        "nobody reviews it after you (anyone can reopen it with a reason). So SHOW IT: a " +
        "screenshot for anything with a screen — before and after, for a defect — or, for " +
        "backend work, the one command and the line of its output that shows it works. Send " +
        "`checks`: one entry per thing the work asked for, each with that line and the evidence " +
        "for it. That is what a person reads, line against line, AND IT IS HOW YOU KNOW YOU ARE " +
        "DONE: every line has one. Give a check `cmd` when a command proves it: the command is " +
        "run here before the hand-in lands, a non-zero exit refuses it, and what it printed is " +
        "recorded instead of your account of it. Use `ran` for a check no command can settle — " +
        "add_file the screenshot and put the line it returns there. `evidence` as one block works " +
        "too. DO NOT write new work to carry your evidence: it belongs on this call. What you had " +
        "to adapt goes in `writeup`; what you learned about the project goes into its documents " +
        "(save_document).",
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
            // A bare string is a check line with nothing behind it. Let it through to the server's
            // refusal, which says what to send, rather than a schema error that says only "expected
            // object".
            z.preprocess(
              (v) => (typeof v === "string" ? { check: v } : v),
              z.object({
                check: z
                  .string()
                  .describe("what the work asked for that this answers, in its own words"),
                says: z
                  .string()
                  .optional()
                  .describe(
                    'what happened, in one plain sentence for a PERSON: "Swagger lists all six ' +
                      'endpoints, each with request and response schemas." It is the row they read; ' +
                      "the evidence stays folded behind it",
                  ),
                ran: z
                  .string()
                  .optional()
                  .describe(
                    "what you ran for it, and what came back; not needed when `cmd` is set",
                  ),
                cmd: z
                  .string()
                  .optional()
                  .describe(
                    "the shell command that proves this line, run here before the hand-in lands — " +
                      "its exit code decides the check and its output is recorded as the evidence. " +
                      "Non-zero refuses the hand-in. Leave it out for a check nobody can run, like " +
                      '"the badge reads 3" — then SHOW it with add_file and put the line it returns in `ran`; a check is run or shown, and describing what you saw is refused',
                  ),
              }),
            ),
          )
          .optional()
          .describe(
            "one entry per thing the work asked for, in the order you worked them. Each is RUN " +
              "(`cmd`) or SHOWN (an add_file line in `ran`). Pasting a command you typed into " +
              "`ran` is not running it and is refused",
          ),
        note: z
          .string()
          .describe(
            "one plain sentence, in the first person, saying what you did and how it went: " +
              '"Added the toggle to Settings; it survives a reload." It is the first thing the ' +
              "person reads, and the evidence is behind it",
          ),
        writeup: z
          .string()
          .optional()
          .describe(
            "what you had to adapt to make it work here — a version, a name, a step the work did " +
              "not mention. 500 characters at most; anything longer belongs in the change. " +
              "Optional: leave it out when it went as written",
          ),
        risk: z
          .string()
          .optional()
          .describe(
            "what this could break, in one line: a shared helper changed, a migration that " +
              "cannot be undone, a route other clients call. Optional; leave it out when there is " +
              'nothing specific, rather than writing "low risk"',
          ),
        pr: z.string().optional().describe("PR, branch or commit link, when there is one"),
        cwd: CWD,
      },
    },
    async ({ id, note, evidence, checks, writeup, risk, pr, cwd }) => {
      try {
        // A check that names a command is run here, before anything is recorded, and its exit
        // code decides it rather than the agent's account of it. A failure is refused with the
        // command's own output: the claim is still held, nothing is written.
        const at = cwd || process.cwd();
        const done = runChecks(checks || [], { cwd: at });
        if (done.failed)
          return fail({
            message: refusal(done.failed, { ran: done.ran, total: checks.length }),
          });
        const r = await passalong.handIn(id, {
          note,
          evidence: evidence || "",
          checks: done.checks,
          writeup: writeup || "",
          risk: risk || "",
          pr: pr || "",
          cwd: at,
        });
        return answer(r, id);
      } catch (err) {
        return failWith(err);
      }
    },
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
        cwd: CWD,
      },
    },
    verb(({ id, why, cwd }) => passalong.pass(id, why, { cwd: cwd || process.cwd() })),
  );

  server.registerTool(
    "ask",
    {
      title: "Ask the person",
      outputSchema: askOut,
      annotations: ADDS,
      description:
        "You need the person's answer before you can go on. Ask one clear question, with the " +
        "context it needs to be answered without opening your terminal. You keep what you hold " +
        "and nobody else can take it. Then STOP and tell the user you are waiting: do not carry " +
        "on guessing. When they have replied, call take with this id and their reply comes back " +
        "with it. Use `pass` instead when the work is not yours.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        question: z
          .string()
          .describe(
            "one clear question in the first person, a few sentences at most, plain text: " +
              '"Should the dark-mode toggle live in Settings or the header? The header is ' +
              'crowded on mobile." What you were about to do, if they just say yes, helps',
          ),
        cwd: CWD,
      },
    },
    verb(({ id, question, cwd }) => passalong.ask(id, question, { cwd: cwd || process.cwd() })),
  );

  // ---- work: create_work, find_work, update_work ---------------------------------------------

  server.registerTool(
    "create_work",
    {
      title: "Write work down",
      annotations: ADDS,
      description:
        "Write down work someone must still do: one piece, or several at once — a plan broken " +
        "into steps, or every defect a test run turned up, each its own item so each can be " +
        "taken on its own. Check what is open first (find_work): if this session answers " +
        "something you hold, hand_in that instead. Each item is Ready at once and reaches whoever " +
        "it is for; `draft: true` holds them all for a person to read first. A picture belongs " +
        "in the text: add_file it and put the line it returns in `body`. Knowledge is not work: " +
        "what someone needs to know goes into a project's documents (save_document).",
      inputSchema: {
        items: z
          .array(
            z.object({
              title: z.string().describe("what it is, in a few words"),
              summary: z
                .string()
                .describe(
                  "one or two plain sentences for a PERSON, no ids or paths: what this is and " +
                    "whether anybody has to act. 400 characters at most",
                ),
              body: z
                .string()
                .optional()
                .describe(
                  "markdown for whoever does it: what is wrong or wanted, what you found, what " +
                    "done looks like if you know — in whatever shape fits",
                ),
              to: z
                .string()
                .optional()
                .describe("who it is for, when not the same as the top-level `to`"),
              parent: z
                .string()
                .optional()
                .describe("id of the work this comes out of — a bigger piece, a customer request"),
              after: z
                .array(z.number().int())
                .optional()
                .describe("positions (from 0) of earlier items this one needs done first"),
              repo: z
                .string()
                .optional()
                .describe("owner/repo it is for; default is the repo you are in, '' for none"),
              tags: z
                .array(z.string())
                .optional()
                .describe(
                  "words that describe it, e.g. bug, feature, question; nothing turns on one",
                ),
            }),
          )
          .min(1)
          .max(20),
        to: z
          .string()
          .optional()
          .describe(
            "team slug, team/@handle for one teammate, team/@ada,@bola for several, or " +
              "team/#group for the people who do a thing; default is your current team",
          ),
        draft: z
          .boolean()
          .optional()
          .describe("hold it all in Draft for a person to read and make Ready"),
        cwd: z.string().optional().describe("the repo you are writing from"),
      },
    },
    async ({ items, to, draft, cwd }) => {
      try {
        const made = await passalong.createWork(items, {
          draft: Boolean(draft),
          to,
          cwd: cwd || process.cwd(),
        });
        return json({
          work: made,
          // Nothing in Draft reaches anybody, and an agent that reports "sent it" has told the
          // user something untrue. Said in the result so it is said to them.
          ...(draft
            ? {
                next: `in Draft: ask the user to read it and mark it Ready at ${api.baseUrl()}/hub/work, or run \`passalong ready --all\``,
              }
            : {}),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "find_work",
    {
      title: "Find work",
      annotations: READS,
      description:
        "READ work without taking it. With `id`, that piece of work — its markdown, read only; " +
        "work over 20,000 characters comes back as an outline unless you ask for `section` or " +
        "`full`. With `query`, the work whose words match. With neither, the board: what needs " +
        "the person, who is on what, what is ready, and what this worktree holds. To DO the work, " +
        "call take instead: it is the only way anyone learns somebody picked it up.",
      inputSchema: {
        id: z.string().optional().describe("passalong id (e.g. k3mq2xa7) or share link"),
        query: z.string().optional().describe("words to look for in titles, tags and text"),
        scope: z
          .string()
          .optional()
          .describe('with query: "mine", "all" (default), or a team slug'),
        section: z
          .string()
          .optional()
          .describe("with id: only the part under this heading; see the outline"),
        full: z.boolean().optional().describe("with id: the whole text, however long"),
      },
    },
    async ({ id, query, scope, section, full }) => {
      try {
        if (id) {
          const { work } = await passalong.resolve(id, { peek: true });
          const markdown = serialize(work);
          const ref = work.meta.id || id;
          if (section) {
            const part = sectionOf(markdown, section);
            return text(
              part
                ? `${part.text}\n\n<!-- passalong: ${ref}, "${part.heading}" only; ask with full: true for all of it -->`
                : `No heading matching "${section}".\n\n${outlineText(markdown, { id: ref })}`,
            );
          }
          if (!full && markdown.length > WORK_WARN) return text(outlineText(markdown, { id: ref }));
          return text(
            `${await passalong.parentWork(work.meta)}${markdown}\n\n` +
              `<!-- passalong: reading it does not make it yours: to work on it, call take ${ref}. -->`,
          );
        }
        if (query !== undefined && query !== "")
          return json({ work: await passalong.list(query, { scope: scope || "" }) });
        const [board, now] = await Promise.all([
          passalong.board(),
          passalong.now().catch(() => ({ held: [] })),
        ]);
        return json({ ...board, held: now.held });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "update_work",
    {
      title: "Change work",
      // Destructive because `markdown` replaces the text that was there.
      annotations: REMOVES,
      description:
        "Change work that exists, when the person asks or when you wrote it. `status`: ready " +
        "(whoever it is for may take it), draft (held for a person to read), or archived (off the " +
        "board; it comes back to Draft). `to`: who it is for — @handle, several as @ada,@bola, " +
        '#group, or "" for the whole team; whoever held it and is left out has it taken back and ' +
        "is told. `markdown`: its whole text, frontmatter first, as find_work gave it — say " +
        "what changed, keep what did not.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        status: z.enum(["ready", "draft", "archived"]).optional(),
        to: z.string().optional().describe('"@handle", "@ada,@bola", "#group", or "" for the team'),
        markdown: z
          .string()
          .optional()
          .describe("the whole document, frontmatter first, to replace its text"),
        cwd: z.string().optional().describe("the repo you are working in"),
      },
    },
    async ({ id, status, to, markdown, cwd }) => {
      try {
        if (!markdown && !status && to === undefined)
          throw new Error("say what to change: status, to, or markdown");
        const done = { id };
        if (markdown)
          done.url = (await passalong.updateText(id, markdown, { cwd: cwd || process.cwd() })).url;
        if (to !== undefined) done.to = (await passalong.assign(id, to)).to ?? to;
        if (status) {
          await passalong.setStatus(id, STATUS[status]);
          done.status = status;
        }
        return json(done);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ---- projects and documents -----------------------------------------------------------------

  server.registerTool(
    "find_projects",
    {
      title: "Find projects",
      annotations: READS,
      description:
        "With `id`, one project: its documents, files and the projects inside it. With `query`, " +
        "the projects whose name, description or any document mentions those words, each naming " +
        "its matching documents. With neither, every project you can see. Each answer's `space` " +
        'says where it lives: private, or a named team; `repo` is the repo it is built from, "" ' +
        "when it has none. Read that repo when you write or check its documents.",
      inputSchema: {
        id: z.string().optional().describe("project id"),
        query: z.string().optional().describe("words to look for in projects and their documents"),
        scope: z.string().optional().describe('"all" (default), "mine", or a team slug'),
      },
    },
    run(({ id, query, scope }) =>
      id ? api.project(id) : api.projects(scope || "all", query || ""),
    ),
  );

  server.registerTool(
    "save_project",
    {
      title: "Save a project",
      annotations: ADDS,
      description:
        "With no `id`, make a project, after find_projects shows none fits: a `title` and a short " +
        "`description`, and its `repo` when it has one. Leave out `team` for a private one, and " +
        "pass a team slug only when the person wants it shared; `parent` puts it inside another, " +
        'in that one\'s space. With `id`, change its title, description, repo ("" for none), ' +
        'colour or place (`parent` "" for the top level); ' +
        "its space never changes. The answer's `space` says where it is: tell the person.",
      inputSchema: {
        id: z.string().optional().describe("the project to change; leave out to make one"),
        title: z.string().optional().describe("name of the product or body of work"),
        description: z.string().optional().describe("what it is for, in a line"),
        team: z.string().optional().describe("new project only: team slug; omit for private"),
        parent: z.string().optional().describe('project to put it inside; "" for the top level'),
        color: z.enum(["", "coral", "amber", "green", "blue", "violet"]).optional(),
        repo: z
          .string()
          .optional()
          .describe('the repo it is built from, e.g. github.com/acme/billing; "" for none'),
      },
    },
    run(({ id, title, description, team, parent, color, repo }) => {
      if (!id) {
        if (!title) throw new Error("a new project needs a `title`");
        return api.createProject(
          title,
          description || "",
          team || "",
          parent || "",
          color || "",
          repo || "",
        );
      }
      if (team) throw new Error("a project's space does not change; leave out `team`");
      const changes = Object.fromEntries(
        Object.entries({ title, description, parent, color, repo }).filter(
          ([, v]) => v !== undefined,
        ),
      );
      return api.updateProject(id, changes);
    }),
  );

  server.registerTool(
    "read_document",
    {
      title: "Read a document",
      annotations: READS,
      description:
        "One document's Markdown and its `version`, which save_document needs. `history: true` " +
        "lists its earlier versions, newest first; `version` returns that version's text. To " +
        "bring one back, save it over the current version.",
      inputSchema: {
        project: z.string().describe("project id"),
        document: z.string().describe("document id"),
        history: z.boolean().optional().describe("list its earlier versions"),
        version: z.number().int().positive().optional().describe("read this earlier version"),
      },
    },
    run(({ project, document, history, version }) =>
      history || version
        ? api.projectDocumentHistory(project, document, version || 0)
        : api.projectDocument(project, document),
    ),
  );

  server.registerTool(
    "save_document",
    {
      title: "Save a document",
      annotations: ADDS,
      description:
        "Write what someone needs to know into a project. With no `document`, a new one: `name` " +
        "and `body`. With `document`, change it: `body` with the `version` read_document gave you " +
        "— a newer edit is refused, so nobody's writing is lost — and/or `name` to rename it, " +
        "and/or `move_to` another project in the same space. Its id and history stay. Update the " +
        "page that already covers something rather than adding another. A document has no owner " +
        "and no state and tells nobody: anything someone must still act on is work (create_work).",
      inputSchema: {
        project: z.string().describe("project id"),
        document: z.string().optional().describe("the document to change; leave out for a new one"),
        name: z
          .string()
          .optional()
          .describe("its name: required for a new one, a rename otherwise"),
        body: z.string().optional().describe("the whole Markdown text"),
        version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("with `body` on an existing document: the version you read"),
        move_to: z.string().optional().describe("a project id in the same space to move it into"),
      },
    },
    run(async ({ project, document, name, body, version, move_to }) => {
      if (!document) {
        if (!name || body === undefined) throw new Error("a new document needs `name` and `body`");
        return api.createProjectDocument(project, name, body);
      }
      let saved;
      if (body !== undefined) {
        if (!version) throw new Error("send the `version` read_document gave you with `body`");
        saved = await api.saveProjectDocument(project, document, version, body);
      }
      if (name || move_to)
        saved = await api.patchProjectDocument(project, document, {
          ...(name ? { name } : {}),
          ...(move_to ? { project: move_to } : {}),
        });
      if (!saved)
        throw new Error("say what to change: `body` with `version`, `name`, or `move_to`");
      return saved;
    }),
  );

  server.registerTool(
    "delete_document",
    {
      title: "Delete a document",
      annotations: REMOVES,
      description:
        "Delete one document, with its earlier versions. It cannot be brought back, so do it only " +
        "when the person asked for that document to go; to change what it says, use save_document.",
      inputSchema: { project: z.string(), document: z.string() },
    },
    run(({ project, document }) => api.deleteProjectDocument(project, document)),
  );

  // ---- files ----------------------------------------------------------------------------------

  server.registerTool(
    "add_file",
    {
      title: "Add a file",
      annotations: { ...ADDS, openWorldHint: true },
      description:
        "Upload a picture or any other file — a path in `file`, or a picture's bytes in `data` " +
        "when you have the image and no file — and get back the markdown line that points at it. " +
        "Files up to 10MB, pictures up to 5MB. " +
        WHERE_THE_LINE_GOES,
      inputSchema: {
        file: z.string().optional().describe("path to the file on this machine"),
        data: z
          .string()
          .optional()
          .describe(
            "a picture itself, base64 (a data: URL is fine), for when a tool handed you the image " +
              "and never wrote it to disk",
          ),
        type: z
          .string()
          .optional()
          .describe("media type of `data`: image/png, image/jpeg, image/webp or image/gif"),
        name: z.string().optional().describe("label for it; defaults to its filename"),
        project: z.string().optional().describe("keep it in this project instead"),
      },
    },
    async ({ file, data, type, name, project }) => {
      try {
        if (project) {
          if (!file) throw new Error("a file for a project needs `file`, a path on this machine");
          return json(await api.addProjectFile(project, file, name || ""));
        }
        if (!file && !data)
          throw new Error(
            "send `file` (a path on this machine) or `data` (a picture, base64). If your " +
              "screenshot is a tool result you cannot write out, capture it to a file instead — a " +
              "headless browser's page.screenshot({ path }) or your platform's capture command.",
          );
        const got = data
          ? await passalong.attachBytes(data, { name: name || "", type: type || "image/png" })
          : await passalong.attachAny(file, { name: name || "" });
        return text(
          `${JSON.stringify({ id: got.id, url: got.url, bytes: got.bytes }, null, 2)}\n\n` +
            `The line that points at it:\n${got.markdown}`,
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "read_file",
    {
      title: "Read a file",
      annotations: READS,
      description:
        "Read a picture or a small text file kept in a project into this conversation. Other " +
        "files stay downloads in the hub.",
      inputSchema: { project: z.string(), file: z.string().describe("file id") },
    },
    async ({ project, file }) => {
      try {
        const got = await api.projectFile(project, file);
        const { data, text: body, ...meta } = got;
        return {
          content: data
            ? [
                { type: "text", text: got.name },
                { type: "image", data, mimeType: got.type },
              ]
            : [{ type: "text", text: `${got.name}\n\n${body || ""}` }],
          structuredContent: meta,
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "delete_file",
    {
      title: "Delete a file",
      annotations: REMOVES,
      description:
        "Delete one file from a project. It cannot be brought back, so do it only when the person " +
        "asked for that file to go.",
      inputSchema: { project: z.string(), file: z.string().describe("file id") },
    },
    run(({ project, file }) => api.deleteProjectFile(project, file)),
  );

  // ---- account ----------------------------------------------------------------------------------

  server.registerTool(
    "accounts",
    {
      title: "Accounts on this machine",
      // Read-only to the world: `use` is this process remembering a name until it exits, and
      // nothing on disk or on the server changes, so the machine's default stays where it was.
      annotations: { ...READS, idempotentHint: true },
      description:
        "The Passalong accounts signed in on this machine, which one this session is using, and " +
        "whether it still has to be chosen. With two or more and nothing chosen, every other call " +
        "is refused until `use` says which: ask the PERSON, in plain words, and pass their " +
        "answer. It lasts until this session ends and never moves the machine's default.",
      inputSchema: {
        use: z.string().optional().describe("an account name from the list, as the person said it"),
      },
    },
    run(async ({ use }) => {
      if (use) {
        api.chooseAccount(use);
        const who = await api.me();
        return {
          using: use,
          account: who.account,
          handle: who.handle || "",
          email: who.email || "",
          teams: (who.teams || []).map((t) => t.slug),
        };
      }
      return {
        accounts: api.accountList(),
        in_use: api.accountInUse(),
        must_choose: api.needsChoice(),
        ...(api.needsChoice() ? { next: api.choiceMessage() } : {}),
      };
    }),
  );

  return server;
}

/** The stdio server: `passalong mcp`, and what `passalong setup` registers with a client. */
export async function serve() {
  passalong.tidy().catch(() => {});
  await buildServer().connect(new StdioServerTransport());
}
