/**
 * The API, described for an agent that does not speak MCP.
 *
 * `passalong mcp` is stdio, so it reaches anything that can run a local process — an editor, a
 * terminal agent — and nothing that can only call an HTTP endpoint. ChatGPT actions and Gemini
 * function calling are the second kind, and they already have everything they need: `/v1/*` takes
 * a bearer token and a share link is plain markdown. What was missing was a description, so
 * pointing one of them at Passalong meant hand-writing schemas.
 *
 * WHAT IS AND IS NOT IN HERE. This describes the surface the MCP server exposes — read guides,
 * file bugs, answer with a verdict, and take, report on and finish tasks — and deliberately not
 * account administration, or the task review gate (approve, reject, release), which is a person's to
 * do and has no MCP tool for the same reason. Signup, login,
 * password reset and token management are real routes and stay undescribed: an action schema is a
 * list of things you are inviting a model to call, and "reset this account's password" does not
 * belong on it. Anyone automating those has the source.
 *
 * Served rather than committed as a static file, because `servers[0].url` has to be the host that
 * answered — Passalong runs on more than one, and a document naming the wrong one produces calls
 * that 404 with no explanation.
 */

const GUIDE = {
  type: "object",
  description:
    "One guide. A transfer guide is finished work to repeat; a bug is a defect to fix; a task is work nobody has done yet. `kind` says which.",
  properties: {
    id: { type: "string", example: "k3mq2xa7" },
    title: { type: "string" },
    kind: {
      type: "string",
      enum: ["transfer", "bug", "task"],
      description:
        "transfer: follow its Steps. bug: fix what Problem describes — Reproduce shows the defect and must not be run as a remedy. task: reach Goal within Constraints; done when Acceptance holds.",
    },
    status: {
      type: "string",
      enum: ["draft", "published", "consumed", "promoted"],
      description:
        "`promoted` is read-only: guides that carry it keep it, and no write can set it.",
    },
    url: {
      type: "string",
      description: "The share link. Append `.md` for the markdown, no account needed.",
    },
    created: { type: "string", format: "date-time" },
    pulls: { type: "integer", description: "How many times it has been taken." },
    mine: { type: "boolean" },
    from: { type: "string", description: "Handle of whoever shared it." },
    from_name: {
      type: "string",
      description: "Whoever sent it, as a person reads them: their name, else @handle, else @id.",
    },
    team: { type: "string" },
    team_name: { type: "string", description: "The team's display name, or empty." },
    to: { type: "string", description: "Handle it was addressed to, if anyone." },
    to_name: { type: "string", description: "Who it was sent to, by name, or empty." },
    to_group: {
      type: "string",
      description:
        "Group inside the team it was handed to, if any. Reaches every member; the first to " +
        "take it clears it from the others.",
    },
    to_group_name: { type: "string", description: "That group's display name, or empty." },
    for_me: { type: "boolean", description: "You were named, rather than being in the team." },
    source_context: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    stack_assumptions: { type: "array", items: { type: "string" } },
    report: { type: "string", description: "The report this issue was filed under, if any." },
    area: { type: "string", description: "Bugs only: which surface it is on." },
    severity: { type: "string", enum: ["s1", "s2", "s3", "s4"] },
    failing: { type: "boolean", description: "Someone tried it and said it does not work." },
    verdict: {
      type: ["object", "null"],
      properties: {
        ok: { type: "boolean" },
        by: { type: "string" },
        by_name: { type: "string" },
        note: { type: "string" },
        at: { type: "string", format: "date-time" },
      },
    },
    taken_by: {
      type: "array",
      items: { type: "string" },
      description: "Handles of the people who said they are on it.",
    },
    taken_by_names: {
      type: "array",
      items: { type: "string" },
      description: "The same people as taken_by, in the same order, by name.",
    },
    declined: {
      type: "array",
      description: "Who handed it back, and why. Only its author can re-home it.",
      items: {
        type: "object",
        properties: {
          by: { type: "string" },
          by_name: { type: "string" },
          note: { type: "string" },
          at: { type: "string", format: "date-time" },
        },
      },
    },
  },
} as const;

const REPORT = {
  type: "object",
  description: "A set of bugs filed together. Each issue inside it is a guide in its own right.",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    environment: { type: "string", example: "staging" },
    team: { type: "string" },
    to: { type: "string" },
    issues: { type: "integer" },
    failing: { type: "integer" },
    areas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string" },
          issues: { type: "array", items: { $ref: "#/components/schemas/Guide" } },
        },
      },
    },
  },
} as const;

/** One task on the queue, as GET /v1/tasks and POST /v1/tasks/next answer it. */
const TASK = {
  type: "object",
  description:
    "A task: work nobody has done yet, queued for an agent. `state` is where it is; `claim` is who has it.",
  properties: {
    id: { type: "string", example: "3cxbzebv" },
    title: { type: "string" },
    target: { type: "string", description: "owner/repo the task is for; empty for no repo." },
    state: {
      type: "string",
      enum: ["draft", "ready", "blocked", "claimed", "stalled", "review", "done"],
      description:
        "stalled: claimed, and nothing heard for 30 minutes. Still locked to the agent that took it.",
    },
    mine: { type: "boolean", description: "You wrote it, so its review is yours." },
    url: { type: "string", description: "Share link." },
    claim: {
      type: ["object", "null"],
      properties: {
        agent: { type: "string" },
        note: { type: "string", description: "The latest progress line." },
        report: { type: "string", description: "Id of the transfer guide it was finished with." },
        pr: { type: "string", description: "A PR link or a commit hash." },
        lease_until: { type: "string", format: "date-time" },
      },
    },
  },
};

/** Who is asking for work: the same `agent` name on every call is what makes it the same agent. */
const AGENT = {
  type: "string",
  pattern: "^[a-z0-9-]{8,64}$",
  description:
    "A name for you, the same on every task call. A local agent's is in its worktree's .passalong/agent.json.",
};
/** What every verb's answer ends with: the calls that make sense from here. See steps() in claims.ts. */
const NEXT = {
  type: "object",
  description:
    "What to do now. `next` is the calls that make sense from this state, with when and why. `say` is set when the right move is no call at all — you no longer hold it, or nothing is waiting: stop, and tell the user.",
  properties: {
    next: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: { type: "string", enum: ["take", "progress", "hand_in", "pass"] },
          when: { type: "string" },
          why: { type: "string" },
          with: { type: "string", description: "What that call has to carry." },
        },
      },
    },
    say: { type: "string" },
  },
};

/** A verb's answer: its own fields, and what to call next. */
const withNext = (props: Record<string, unknown>) => ({
  allOf: [{ type: "object", properties: props }, { $ref: "#/components/schemas/Next" }],
});

const json200 = (description: string, schema: unknown) => ({
  description,
  content: { "application/json": { schema } },
});

const agentBody = (props: Record<string, unknown> = {}, required: string[] = []) => ({
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["agent", ...required],
        properties: { agent: AGENT, ...props },
      },
    },
  },
});

const NOT_HELD = {
  description:
    "You do not hold that task: a person took it back, or it was never yours. Stop working on it.",
};

const guideList = {
  200: {
    description: "Guides.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: { guides: { type: "array", items: { $ref: "#/components/schemas/Guide" } } },
        },
      },
    },
  },
};

export function openapi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Passalong",
      version: "1.0.0",
      description:
        "Hand work between contexts as guides: markdown with frontmatter, in three kinds. A " +
        "transfer guide is finished work to repeat — follow its Steps. A bug is a defect to fix — " +
        "Reproduce shows you the problem and is not a procedure to apply, and Verification is the " +
        "behaviour that should have happened. A task (the default) is work nobody has done yet. " +
        "Every kind is worked with four calls: POST /v1/take, PUT /v1/guides/{id}/progress, " +
        "POST /v1/guides/{id}/hand_in and POST /v1/guides/{id}/pass. Each answer ends with " +
        "`next`, what to call now, and `say` when the move is to stop. Read `kind` before acting " +
        "on any guide.",
    },
    servers: [{ url: origin }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "An API token, minted in the hub under Settings.",
        },
      },
      schemas: { Guide: GUIDE, Report: REPORT, Task: TASK, Next: NEXT },
    },
    paths: {
      "/v1/me": {
        get: {
          operationId: "whoami",
          summary: "Who this token belongs to, and which teams they are in.",
          responses: { 200: { description: "The account." } },
        },
      },
      "/v1/guides": {
        get: {
          operationId: "searchGuides",
          summary: "Search guides by words in the title, tags, stack, or body.",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Search words." },
            {
              name: "scope",
              in: "query",
              schema: { type: "string" },
              description: "`all` (default), `mine`, or a team slug.",
            },
          ],
          responses: guideList,
        },
      },
      "/v1/guides/{id}": {
        get: {
          operationId: "getGuide",
          summary: "One guide's full markdown.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "The guide.", content: { "text/markdown": {} } },
            404: { description: "No such guide." },
          },
        },
        put: {
          operationId: "publishGuide",
          summary: "Publish or update a guide. The body is the whole document.",
          description:
            "Frontmatter carries the addressing: `team:` and `to:` hand it over, `kind: bug` " +
            "makes it a bug report, `report:` files it under a report. A bug's repro belongs " +
            "under `## Reproduce`, never `## Steps`. `parent:` names the guide this one came out of " +
            "— or send `parent` beside `markdown` and it is written into the frontmatter for you. " +
            "Choose a new id only for a new guide. To change one, PUT to the id it was published " +
            "under: a different id publishes a second copy, and each counts against the synced limit.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              // JSON first, because the tools that read this document can only send JSON. The
              // markdown body is what the CLI uses and stays the honest shape: the guide is the
              // body.
              "application/json": {
                schema: {
                  type: "object",
                  required: ["markdown"],
                  properties: {
                    markdown: {
                      type: "string",
                      description: "The whole document, frontmatter first.",
                    },
                    parent: {
                      type: "string",
                      description:
                        "Optional id of the guide this one came out of. Written into the " +
                        "frontmatter as `parent:`, so the stored document is the same either way.",
                    },
                  },
                },
              },
              "text/markdown": { schema: { type: "string" } },
            },
          },
          responses: {
            200: { description: "Updated." },
            201: { description: "Created." },
            400: { description: "The document or its addressing is not valid." },
          },
        },
      },
      "/v1/guides/{id}/children": {
        get: {
          operationId: "listFollowUps",
          summary: "The guides that came out of this one, one level down.",
          description:
            "Guides whose `parent:` names this one — its follow-ups, more context for it — " +
            "filtered to what you can read. One level: walk it for more. Newest first, up to 100, " +
            "as summaries. With `markdown=1`, each summary also carries the follow-up's `markdown`, " +
            "oldest first (context reads in the order it was added), at most 20, and any one over " +
            "32 KB is cut with a marker saying so. Neither form counts as opening the follow-ups.",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            {
              name: "markdown",
              in: "query",
              required: false,
              description:
                "1 to include each follow-up's markdown, oldest first, capped at 20 and 32 KB each",
              schema: { type: "string", enum: ["1"] },
            },
          ],
          responses: {
            200: { description: "The follow-ups.", content: { "application/json": {} } },
            404: { description: "No such guide." },
          },
        },
      },
      "/v1/guides/{id}/ack": {
        put: {
          operationId: "sayWhetherYouAreTakingIt",
          summary: "Answer for a guide handed to you: are you doing it?",
          description:
            "The first word back, before any work. Passing must say why — `taken: false` with no " +
            "note is refused, because an unanswered handoff is indistinguishable from an " +
            "unnoticed one. The guide's own author is refused: there is nothing to tell yourself.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["taken"],
                  properties: {
                    taken: { type: "boolean" },
                    note: { type: "string", maxLength: 280 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Recorded." },
            400: {
              description:
                "Passing needs a reason. Or it is a task, which is not taken this way: use POST /v1/take.",
            },
            403: { description: "It is your own guide." },
          },
        },
      },
      "/v1/guides/{id}/verdict": {
        put: {
          operationId: "sayWhetherItWorked",
          summary: "Answer for a guide you took: did it work?",
          description:
            "The single most valuable thing to report back. A failure must say why — `ok: false` " +
            "with no note is refused.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok"],
                  properties: {
                    ok: { type: "boolean" },
                    note: { type: "string", maxLength: 280 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Recorded." },
            400: {
              description:
                "A failure needs a reason. Or it is a task, which is not answered this way: hand it in with POST /v1/guides/{id}/hand_in.",
            },
          },
        },
      },
      // The task queue, the agent's half of it. Approve, reject and release are the review gate — a
      // person's calls — and stay undescribed for the reason account routes do: a description is a
      // list of things a model is invited to call, and approving work is not one of them.
      // The four verbs every guide is worked with, and who is on what. See docs/V2.md §11.
      "/v1/take": {
        post: {
          operationId: "take",
          summary: "Say you are doing it, and get it: a guide by id, or the next one waiting.",
          description:
            "Any kind. While you hold it nobody else can take it there: a task has one taker, " +
            "anything else one per repo. You hold one thing at a time — taking what you hold " +
            "resumes it. When somebody else has it the 409 names them in `holder`: tell the user " +
            "rather than doing the work twice. With no id, the next ready task for `repo`, or " +
            "`guide: null` and `say` when nothing is waiting.",
          requestBody: agentBody({
            id: { type: "string", description: "The guide to take. Leave out for the next one." },
            repo: { type: "string", description: "owner/repo you are in; omit for no repo." },
            host: { type: "string" },
            worktree: { type: "string" },
            any: { type: "boolean", description: "A task for another repo. Only when asked to." },
          }),
          responses: {
            200: json200(
              "What you now hold, with its markdown — or null — and what to call next.",
              withNext({
                guide: {
                  oneOf: [
                    {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        kind: { type: "string" },
                        markdown: { type: "string" },
                        resumed: { type: "boolean" },
                        lease_until: { type: "string", format: "date-time" },
                      },
                    },
                    { type: "null" },
                  ],
                },
              }),
            ),
            400: { description: "No `agent`, or a task taken from outside the repo it is for." },
            404: { description: "No such guide that you can see." },
            409: {
              description:
                "Somebody has it here (`holder` says who), you already hold something else, or it is a draft, blocked or done.",
            },
          },
        },
      },
      "/v1/guides/{id}/progress": {
        put: {
          operationId: "progress",
          summary: "Still on it: renews your hold, and `note` is the line the hub shows.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: agentBody({ note: { type: "string", maxLength: 280 } }),
          responses: {
            200: json200(
              "Renewed.",
              withNext({ id: { type: "string" }, note: { type: "string" } }),
            ),
            409: NOT_HELD,
          },
        },
      },
      "/v1/guides/{id}/hand_in": {
        post: {
          operationId: "handIn",
          summary: "Done here.",
          description:
            "Done here, with proof. `evidence` is required whatever the kind: what you ran and what came back. A task also takes `report`, the id of a transfer guide you published about the work; its author reviews it against Acceptance. A handoff or a bug takes `ok`, whether its Verification held, and `note` when it did not.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: agentBody(
            {
              report: { type: "string", description: "Task: the write-up's id." },
              pr: { type: "string", description: "Task: PR or branch link, or a commit hash." },
              ok: { type: "boolean", description: "Handoff or bug: did its Verification hold." },
              note: { type: "string", maxLength: 280 },
              evidence: {
                type: "string",
                maxLength: 4000,
                description:
                  "What you ran and what came back: the command and the lines that decided it, a test summary, a link to the change, or a screenshot url. A verdict on your own work is not evidence.",
              },
            },
            ["evidence"],
          ),
          responses: {
            200: json200("Handed in.", withNext({ id: { type: "string" } })),
            400: { description: "A task without `report`, or a failure without a note." },
            403: { description: "Your own guide: there is nobody to hand it in to." },
            409: NOT_HELD,
          },
        },
      },
      "/v1/guides/{id}/pass": {
        post: {
          operationId: "pass",
          summary: "Not yours, or stuck: give it back with the reason.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: agentBody({ why: { type: "string", maxLength: 1000 } }, ["why"]),
          responses: {
            200: json200(
              "Open again; the reason goes to whoever is next.",
              withNext({ id: { type: "string" } }),
            ),
            400: { description: "No reason given." },
            409: NOT_HELD,
          },
        },
      },
      "/v1/guides/{id}/assign": {
        post: {
          operationId: "assign",
          summary: "Give a guide or task you wrote to someone else in its team.",
          description:
            "`to` is `@handle` for one person (or `@<account id>` for a teammate with no @name), `#group` for the people who do a thing, or empty for the whole team. Its author may, and so may whoever it is assigned to — the person, or anyone in the group; the author is told. Whoever held it and is left out has it taken back and is told; a task then only goes to the new assignee's agents.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["to"],
                  properties: { to: { type: "string" } },
                },
              },
            },
          },
          responses: {
            200: json200("Reassigned.", {
              type: "object",
              properties: {
                id: { type: "string" },
                to: { type: "string" },
                taken_back: { type: "integer", description: "How many holds were taken back." },
              },
            }),
            400: { description: "Not in a team, or nobody by that @handle or #group in it." },
            403: { description: "Neither its author nor whoever it is assigned to." },
          },
        },
      },
      "/v1/working": {
        get: {
          operationId: "working",
          summary: "Who is working on what: every guide somebody holds right now that you can see.",
          responses: {
            200: json200("Most recently heard from first. One row per taker.", {
              type: "object",
              properties: {
                working: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      kind: { type: "string" },
                      state: { type: "string", enum: ["claimed", "stalled"] },
                      by: {
                        type: "object",
                        properties: {
                          handle: { type: "string" },
                          name: { type: "string" },
                          you: { type: "boolean" },
                        },
                      },
                      repo: { type: "string" },
                      host: { type: "string" },
                      note: { type: "string" },
                      lease_until: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            }),
          },
        },
      },
      "/v1/tasks": {
        get: {
          operationId: "listTasks",
          summary: "Every task you can see, with where it is and who has it.",
          responses: {
            200: {
              description: "Oldest first.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      tasks: { type: "array", items: { $ref: "#/components/schemas/Task" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/tasks/next": {
        post: {
          operationId: "takeNextTask",
          summary:
            "Take the oldest ready task for a repo. No other agent can have it while you do.",
          description:
            "If you already hold a task, that one comes back instead (`resumed: true`) — one at a " +
            "time. A task waits until every task in its `blocked_by` is approved. Answers " +
            "`{ task: null }` when nothing is ready.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agent"],
                  properties: {
                    agent: AGENT,
                    repo: {
                      type: "string",
                      description: "owner/repo you are in; omit for tasks for no repo.",
                    },
                    host: { type: "string" },
                    worktree: { type: "string" },
                    any: {
                      type: "boolean",
                      description: "Take a task for any repo. Only when asked to.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "The task you now hold, with its markdown, or null.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      task: {
                        oneOf: [
                          {
                            allOf: [
                              { $ref: "#/components/schemas/Task" },
                              {
                                type: "object",
                                properties: {
                                  markdown: { type: "string" },
                                  resumed: { type: "boolean" },
                                },
                              },
                            ],
                          },
                          { type: "null" },
                        ],
                      },
                    },
                  },
                },
              },
            },
            400: { description: "`agent` is missing or not 8–64 of a-z, 0-9 and -." },
          },
        },
      },
      "/v1/tasks/{id}/progress": {
        put: {
          operationId: "reportTaskProgress",
          summary:
            "Say you are still on it, with a one-line status. 30 minutes without one stalls it.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agent"],
                  properties: {
                    agent: AGENT,
                    note: {
                      type: "string",
                      maxLength: 280,
                      description: 'e.g. "migrating schema, 2 of 5"',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "The lease runs 30 minutes from now." },
            409: NOT_HELD,
          },
        },
      },
      "/v1/tasks/{id}/finish": {
        post: {
          operationId: "finishTask",
          summary: "Hand a finished task in for review, with a transfer guide about the work.",
          description:
            "Only once every Acceptance line holds. Publish the transfer guide first (PUT " +
            "/v1/guides/{id}) and pass its id as `report`: the reviewer reads it against " +
            "Acceptance. `pr` is a PR link or the hash of the commit you made.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["agent", "report"],
                  properties: {
                    agent: AGENT,
                    report: {
                      type: "string",
                      description: "Id of the transfer guide about this work.",
                    },
                    pr: { type: "string" },
                    note: { type: "string", maxLength: 280 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "In review. A person approves it or sends it back." },
            400: { description: "`report` is missing, not yours, or is itself a task." },
            409: NOT_HELD,
          },
        },
      },
      "/v1/inbox": {
        get: {
          operationId: "inbox",
          summary: "Handed to you and not yet taken.",
          responses: guideList,
        },
      },
      "/v1/board": {
        get: {
          operationId: "board",
          summary: "What is waiting on you and what you handed over, in buckets.",
          responses: { 200: { description: "The board." } },
        },
      },
      "/v1/log": {
        get: {
          operationId: "log",
          summary: "What you did, newest first.",
          description:
            "Your own acts on guides — published, pulled, and the verdicts and acks you gave — " +
            "each with a rendered `text` line and the guide's repo. The opposite of " +
            "notifications, which is what other people did. It records what was passed along, " +
            "not what was worked on: work that never became a guide has no entry here.",
          parameters: [
            {
              name: "repo",
              in: "query",
              schema: { type: "string" },
              description: "Narrow to guides whose source repo matches.",
            },
            {
              name: "since",
              in: "query",
              schema: { type: "string" },
              description:
                "On or after a date: `2026`, `2026-09`, `2026-09-11`, or a full ISO instant.",
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer" },
              description: "Up to 200; 100 by default.",
            },
          ],
          responses: {
            200: { description: "The log." },
            400: { description: "`since` is not a date." },
          },
        },
      },
      "/v1/reports": {
        get: {
          operationId: "listReports",
          summary: "Bug reports you filed, newest first.",
          responses: { 200: { description: "Reports." } },
        },
        post: {
          operationId: "openReport",
          summary: "Open a report for a set of bugs.",
          description:
            "Returns an id. Put it in each issue's `report:` frontmatter, then publish the issues " +
            "with publishGuide — one guide each, so any of them can be taken and answered for on " +
            "its own.",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", example: "Checkout regression pass, 8 Sep build" },
                    environment: { type: "string", example: "staging" },
                    team: { type: "string" },
                    to: { type: "string", description: "A handle on that team." },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Opened." } },
        },
      },
      "/v1/reports/{id}": {
        get: {
          operationId: "getReport",
          summary: "One report and its issues, grouped by product area.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "The report.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { report: { $ref: "#/components/schemas/Report" } },
                  },
                },
              },
            },
            404: { description: "No such report." },
          },
        },
        patch: {
          operationId: "updateReport",
          summary: "Change a report's title, environment, or who it went to.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 204: { description: "Updated." } },
        },
      },
      "/v1/shots": {
        post: {
          operationId: "uploadScreenshot",
          summary: "Store a screenshot and get a URL to put in a guide's markdown.",
          description:
            "Raw image bytes with a content-type; png, jpeg, webp or gif, up to 5MB. Reference " +
            "the returned url as a markdown image so the evidence outlives wherever it came from.",
          requestBody: {
            required: true,
            content: { "image/png": {}, "image/jpeg": {}, "image/webp": {}, "image/gif": {} },
          },
          responses: {
            201: { description: "Stored." },
            415: { description: "Not an image type we store." },
            501: { description: "This deployment has no screenshot storage." },
          },
        },
      },
      "/v1/uploads": {
        post: {
          operationId: "createUploadLink",
          summary: "Get a one-time link that takes a screenshot's bytes without a credential.",
          description:
            "For something that holds an image as a file but cannot send your token with it, " +
            "such as an agent's code sandbox. The link works once and expires in 10 minutes.",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { type: "object", properties: { name: { type: "string" } } },
              },
            },
          },
          responses: {
            201: { description: "The link, as upload_url, and when it expires." },
            429: { description: "Too many unused links are open." },
          },
        },
      },
      "/v1/uploads/{token}": {
        put: {
          operationId: "sendToUploadLink",
          summary: "Send an image's raw bytes to an upload link. POST works too.",
          description:
            "png, jpeg, webp or gif, up to 5MB, recognised from the bytes. Returns the shot and " +
            "the markdown line to put in a guide.",
          security: [],
          parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/octet-stream": {} } },
          responses: {
            201: { description: "Stored." },
            410: { description: "The link expired or was already used." },
            415: { description: "Not an image type we store." },
          },
        },
      },
      "/g/{id}/{key}.md": {
        get: {
          operationId: "readSharedGuide",
          summary: "A guide's markdown from its share link. No account needed.",
          description:
            "The key in the share URL is the whole authorization. Reading one records a pull, " +
            "which is how the sender learns the transfer landed.",
          security: [],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "key", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "The markdown.", content: { "text/markdown": {} } },
            404: { description: "No such guide." },
          },
        },
      },
    },
  };
}
