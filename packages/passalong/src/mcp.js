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
      "Verification and answer with verify_guide.\n\n"
    );
  if (meta.kind === "task")
    return (
      "THIS IS A TASK: WORK NOBODY HAS DONE YET. There are no Steps to follow — work out how to " +
      "reach Goal within Constraints, and leave Out of scope alone. It is done when every check " +
      "under Acceptance holds. Opening it here does not make it yours: to work on it, take it " +
      "with next_task in the repo it is for, so no other agent can. Then report with " +
      "task_progress and hand it in with finish_task, not verify_guide.\n\n"
    );
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
const json = (data) => text(JSON.stringify(data, null, 2));
const fail = (err) => ({ content: [{ type: "text", text: err.message }], isError: true });

export async function serve() {
  const server = new McpServer(
    { name: "passalong", version: VERSION },
    {
      instructions:
        "Passalong hands work between contexts as guides: markdown with frontmatter, in three " +
        "kinds, and `kind:` in the frontmatter says which. READ IT BEFORE ACTING — each asks " +
        "for different behaviour.\n" +
        `kind: transfer (or absent) is a finished implementation to repeat here. Sections: ${SECTIONS.join(", ")}. ` +
        "Follow its Steps, adapting anything marked ASSUMES to this codebase; run its " +
        "Verification before declaring done, then verify_guide with the result.\n" +
        "OPEN A GUIDE YOU MEAN TO ACT ON WITH start_guide, NOT get_guide. Both return the same " +
        "markdown; start_guide also says you are on it, and that is the only signal the sender " +
        "gets between handing work over and hearing it worked. get_guide is for reading one you " +
        "have not committed to. Taking your own guide is a no-op, so there is no case where " +
        "start_guide is the wrong call on work you are about to do. If it turns out not to be " +
        "yours, hand it back with ack_guide taken=false and a reason — say why, or the sender is " +
        "left exactly where silence left them.\n" +
        `kind: bug is a defect to FIX here. Sections: ${BUG_SECTIONS.join(", ")}. ` +
        "It has no Steps and nothing in it is a procedure to apply: Reproduce is how to see the " +
        "bug and running it produces the bug, Verification is the behaviour that should have " +
        "happened. Fix the defect, then check Verification and verify_guide with the result — " +
        "ok true once the behaviour it describes actually holds. A bug report is not broken " +
        "because you reproduced it. " +
        "When you find defects you are not fixing — a test run, a QA pass, a review — call " +
        "file_bugs with all of them at once; each becomes a guide someone can take on its own. " +
        "AN IMAGE THE USER SHOWED YOU IS EVIDENCE, NOT CONTEXT. Before filing or publishing, " +
        "attach it with attach_screenshot and pass what it returns as `evidence` — a screenshot " +
        "you described instead of attaching is the most useful thing in the report, thrown away. " +
        "A guide already filed without one is not stuck: get_guide it, add the markdown line to " +
        "the body, and publish_guide the same id — publishing claims whatever the markdown names. " +
        "\n" +
        `kind: task is work nobody has done yet. Sections: ${TASK_SECTIONS.join(", ")}. ` +
        "It has no Steps: work out how to reach Goal within Constraints, leave Out of scope " +
        "alone, and treat Acceptance as the definition of done. A task has its own tools, and the " +
        "guide ones do not work on it: take it with next_task (never start_guide or ack_guide), " +
        "report with task_progress, and hand it in with finish_task (never verify_guide). " +
        "When the user asks you to write a task, or to queue work for an agent, call plan_tasks — " +
        "one step for one task — with every section filled from the conversation and the code, " +
        "Acceptance as checks a person can run; it fills in the repo you are in. Tasks land in " +
        "Draft, not the queue: tell the user to read them and run `passalong ready <id>`.\n" +
        "When the user asks you to plan or break down a larger goal, call plan_tasks with the " +
        "steps in order — each a task with Goal and Acceptance, and `after` naming the earlier " +
        "steps it needs. They land in Draft; tell the user to read them and run " +
        "`passalong ready --all`.\n" +
        "When the user asks you to take work from the queue, call next_task: it claims the oldest " +
        "ready task for this repo, and no other agent can have it while you do. Call " +
        "task_progress with a one-line status at each milestone — silence for 30 minutes stalls " +
        "the task. When Acceptance holds, call finish_task with `markdown`: a transfer guide about " +
        "what you did (guide_template shows the shape), which it publishes and attaches; the task " +
        "goes to a person for review, who reads it against Acceptance. If " +
        "task_progress or finish_task says you no longer hold the task, stop working on it.\n" +
        "When the user asks to pass along, hand off, or " +
        "share what was just done, distill the session into a guide (guide_template shows the " +
        "shape) and call publish_guide, with `to` as team, team/@handle for one teammate, or " +
        "team/#group for the people who do a thing. " +
        "At the start of work, inbox shows guides teammates have handed to this user — open one " +
        "with start_guide — and activity " +
        "shows whether the guides they handed off have landed. When the user asks what they have " +
        "been working on, or wants a standup or a summary of a period, call log — but say that it " +
        "holds what they passed along and not everything they did. Gotchas are " +
        "the highest-value section: record what failed and why.\n" +
        "A FOLLOW-UP IS MORE CONTEXT FOR A GUIDE, WRITTEN AS ITS OWN GUIDE. When a guide needs " +
        "more context — a missing detail, a step that needed explaining, what changed since, what " +
        "you found doing it — publish that context with publish_guide `parent` set to the guide's " +
        "id. It is listed under the original, and anyone who opens the original, person or agent, " +
        "gets it too. get_guide and start_guide return a guide's follow-ups after it; read them " +
        "before acting.",
    },
  );

  server.registerTool(
    "search_guides",
    {
      title: "Search guides",
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
    "ack_guide",
    {
      title: "Say whether you are taking it",
      description:
        "The first word back on a guide handed to you, before any work: take it, or pass it " +
        "back. Passing must say why — an unanswered handoff is indistinguishable from one nobody " +
        "has noticed, and the sender finds out in a week instead of a minute. Answer this when " +
        "you pick up an inbox; verify_guide comes later, once you have actually run it.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        taken: z.boolean().describe("true if you are doing it; false hands it back"),
        note: z
          .string()
          .default("")
          .describe("why it is not yours (required when taken is false); one line, max 280 chars"),
      },
    },
    async ({ id, taken, note }) => {
      try {
        return json(await passalong.ack(id, taken, note || ""));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "verify_guide",
    {
      title: "Report whether a guide works",
      description:
        "After following a guide's Verification section, report the result. This is the only way " +
        "the author learns their handoff did not land — `set_guide_status consumed` says it was " +
        "implemented, this says it actually works. A failing verdict must say what went wrong. " +
        "If the guide needs more context than a one-line note holds — a missing detail, a step " +
        "that needed explaining, what you found doing it — publish that as a follow-up: its own " +
        "guide, with publish_guide `parent` set to this id. Whoever opens this guide then gets it too.",
      inputSchema: {
        id: z.string().describe("passalong id"),
        ok: z.boolean().describe("true if the Verification steps passed"),
        note: z
          .string()
          .default("")
          .describe("what went wrong (required when ok is false); one line, max 280 chars"),
      },
    },
    async ({ id, ok, note }) => {
      try {
        return json(await passalong.verdict(id, ok, note || ""));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "activity",
    {
      title: "Activity",
      description:
        "What has happened to this user's guides and handoffs: who pulled one, who marked one " +
        "consumed, who was handed what, who joined a team. Each item has a ready-made `text` " +
        "line. Read-only by default — it does not clear the user's unread feed unless asked.",
      inputSchema: {
        all: z.boolean().default(false).describe("include what the user has already seen"),
        mark_read: z.boolean().default(false).describe("clear the unread feed after reading"),
      },
    },
    async ({ all, mark_read }) => {
      try {
        const res = await passalong.activity({ all });
        if (mark_read && res.unread) await passalong.seen();
        return json(res);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "start_guide",
    {
      title: "Start work on a guide",
      description:
        "Take a guide handed to you AND fetch it, in one call — use this the moment you are going " +
        "to do the work. Same markdown as get_guide, plus the handoff is answered: until somebody " +
        "says they are on it, a guide nobody has noticed and a guide somebody is deep in look " +
        "identical to the sender, who finds out in a week instead of a minute. Taking your own " +
        "guide is a no-op, not an error, so this is always safe to call. If the work turns out " +
        "not to be yours after reading, hand it back with ack_guide taken=false and a reason.",
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
        const r = await passalong.start(ref, { cwd: cwd || process.cwd() });
        const meta = parse(r.markdown).meta;
        const lead = leadFor(meta);
        // What actually happened to the ack, said plainly. An agent that reports "took it" when
        // nothing was sent is the failure this tool exists to prevent, one step further along.
        const took = r.took
          ? "handoff taken; the sender has been told"
          : r.own
            ? "your own guide — nothing to take, and nobody to tell"
            : r.ack_error
              ? `NOT taken (${r.ack_error}) — retry with ack_guide before reporting that you have it`
              : "not logged in, so no handoff was taken";
        const siblings = await related(meta);
        const context = await passalong.followUps(meta);
        return text(
          `${lead}${r.markdown}${siblings}${context ? `\n\n${context}` : ""}` +
            `\n\n<!-- passalong: ${r.from}; written to ${r.path}; ${took} -->` +
            `\n${passalong.followUpNote(meta)}`,
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "plan_tasks",
    {
      title: "Plan a goal as tasks",
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
    "next_task",
    {
      title: "Take the next task",
      description:
        "Claim the oldest ready task for the repo this worktree is in, and return it. While you " +
        "hold it no other agent can take it. If this worktree already holds one, that one comes " +
        "back instead — one task at a time. Returns nothing to do when the queue is empty.",
      inputSchema: {
        cwd: z
          .string()
          .optional()
          .describe("the worktree you are working in; default is the server's cwd"),
        any: z
          .boolean()
          .optional()
          .describe("take a task for any repo, or for none — only when the user asks for that"),
      },
    },
    async ({ cwd, any }) => {
      try {
        const t = await passalong.nextTask({ cwd: cwd || process.cwd(), any: Boolean(any) });
        if (!t)
          return text(
            "No task ready for this repo. Nothing to do — tell the user the queue is empty.",
          );
        const how =
          `\n\n<!-- passalong: task ${t.id} is yours${t.resumed ? " (you already held it — carry on from where it was left)" : ""}; ` +
          `written to ${t.path}. Call task_progress with a one-line status at each milestone; ` +
          "30 minutes without one stalls it. When every Acceptance check holds: finish_task with id " +
          `${t.id} and \`markdown\`, a transfer guide about what you did. -->`;
        return text(`${leadFor({ kind: "task" })}${t.markdown}${how}`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "task_progress",
    {
      title: "Report progress on a task",
      description:
        "Say you are still working on the task you hold, with a one-line status the board shows. " +
        "Renews the claim; 30 minutes without this stalls the task. If it answers that you do " +
        "not hold the task, a person released it: stop working on it.",
      inputSchema: {
        id: z.string().describe("the task's id"),
        note: z.string().optional().describe('one line, e.g. "migrating schema, 2 of 5 steps"'),
        cwd: z.string().optional().describe("the worktree you are working in"),
      },
    },
    async ({ id, note, cwd }) => {
      try {
        return json(await passalong.taskProgress(id, note || "", { cwd: cwd || process.cwd() }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "finish_task",
    {
      title: "Finish a task",
      description:
        "Hand a finished task to a person for review. Only once every Acceptance check holds. " +
        "`markdown` is a transfer guide about the work — this publishes it and attaches it, so " +
        "there is nothing to publish first. The reviewer reads it against Acceptance: say what " +
        "you did, what you decided and why, and how you checked each Acceptance line.",
      inputSchema: {
        id: z.string().describe("the task's id"),
        markdown: z
          .string()
          .optional()
          .describe("the transfer guide about this work; start from guide_template"),
        report: z
          .string()
          .optional()
          .describe("instead of markdown: id of a transfer guide already published about it"),
        pr: z.string().optional().describe("PR or branch link, when there is one"),
        note: z.string().optional().describe("one line for the board"),
        cwd: z.string().optional().describe("the worktree you are working in"),
      },
    },
    async ({ id, markdown, report, pr, note, cwd }) => {
      try {
        return json(
          await passalong.finishTask(id, { markdown, report, pr, note, cwd: cwd || process.cwd() }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get guide",
      description:
        "READ a transfer guide by passalong id or share link and return its full markdown. Also " +
        "writes it to .passalong/<id>.md in the working directory so it survives the session. " +
        "Pulling a teammate's guide tells them the transfer landed. Use this to look at a guide " +
        "you have not committed to. If you are about to DO the work, call start_guide instead: " +
        "it does this and takes the handoff in one call, which is the only way the sender learns " +
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
        // After the document, with the other trailing comments, not in front of it. An
        // instruction that arrives with the payload is what gets read — but anything before the
        // opening `---` stops the frontmatter being frontmatter, and this fires on every guide
        // anyone was handed rather than only on bugs. The bug lead stays where it is: it is a
        // warning against executing the document, so being read first is its whole job.
        return text(
          `${lead}${markdown}${siblings}${context ? `\n\n${context}` : ""}` +
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
      description:
        "Upload an image from this machine as evidence, and get back the markdown line that " +
        "points at it. Put that line in the guide body — a guide travels as markdown to whoever " +
        "holds its link, so evidence beside the document does not travel at all. Publishing " +
        "claims whatever the markdown names, so attach first and publish after. png, jpg, webp " +
        "or gif.",
      inputSchema: {
        file: z.string().describe("path to the image on this machine"),
        name: z.string().default("").describe("label for the image; defaults to its filename"),
      },
    },
    async ({ file, name }) => {
      try {
        const shot = await passalong.attach(file, { name: name || "" });
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
    "publish_guide",
    {
      title: "Publish guide",
      description:
        "Publish a guide from markdown (frontmatter + sections) — a transfer guide by default, or " +
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
      description:
        "The empty guide skeleton with guidance comments for each section. `kind: bug` gives the " +
        "bug report skeleton instead, which has a Reproduce section and no Steps. `kind: task` " +
        "gives a task brief: Goal, Context, Constraints, Acceptance, Out of scope.",
      inputSchema: {
        kind: z
          .enum(["transfer", "bug", "task"])
          .optional()
          .describe(
            "transfer (default) for finished work to repeat; bug for a defect to fix; task for " +
              "work nobody has done yet",
          ),
      },
    },
    async ({ kind }) => text(template(kind === "bug" || kind === "task" ? { kind } : {})),
  );

  server.registerTool(
    "set_guide_status",
    {
      title: "Set guide status",
      description:
        "Archive a guide (`consumed`) or put it back on the board (`published`). Archiving is the " +
        "author's shelf: off the board, out of the free tier's count, reversible — it is not a " +
        "judgement that the work landed, which is what verify_guide reports. `promoted` was " +
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

  await server.connect(new StdioServerTransport());
}
