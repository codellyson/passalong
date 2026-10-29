/**
 * The API, described for an agent that does not speak MCP.
 *
 * `passalong mcp` is stdio, so it reaches anything that can run a local process — an editor, a
 * terminal agent — and nothing that can only call an HTTP endpoint. ChatGPT actions and Gemini
 * function calling are the second kind, and they already have everything they need: `/v1/*` takes
 * a bearer token and a share link is plain markdown. What was missing was a description, so
 * pointing one of them at Passalong meant hand-writing schemas.
 *
 * WHAT IS AND IS NOT IN HERE. This describes the surface the MCP server exposes — read and write
 * work, edit project-folder documents, and take, report on and finish work — and deliberately not
 * account administration, or a person's calls on work (release, reopen), which have no MCP tool
 * for the same reason. Signup, login,
 * password reset and token management are real routes and stay undescribed: an action schema is a
 * list of things you are inviting a model to call, and "reset this account's password" does not
 * belong on it. Anyone automating those has the source.
 *
 * Served rather than committed as a static file, because `servers[0].url` has to be the host that
 * answered — Passalong runs on more than one, and a document naming the wrong one produces calls
 * that 404 with no explanation.
 */

const SCOPE_PARAMETER = {
  name: "scope",
  in: "query",
  schema: { type: "string" },
  description: "`all` (default), `mine`, or a team slug.",
};

const GUIDE = {
  type: "object",
  description:
    "One piece of work: what to do, in plain words, with whatever came with it. It has no kinds and no required sections; read it and work out what done means.",
  properties: {
    id: { type: "string", example: "k3mq2xa7" },
    title: { type: "string" },
    summary: { type: "string", description: "What it is, in a sentence or two, for a person." },
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
    for_me: {
      type: "boolean",
      description: "Addressed to you: by handle, or to a group you are in, rather than the team.",
    },
    stage: {
      type: "string",
      enum: ["draft", "todo", "working", "done"],
      description: "Its column on the team board, the same for everyone who sees it.",
    },
    held_by: {
      type: "array",
      description: "Who holds it.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          agent: { type: "string", description: "The agent's name; empty for a person." },
          you: { type: "boolean" },
          health: { type: "string", enum: ["working", "quiet", "asking", "person"] },
          since: { type: "string", format: "date-time", description: "Last heard from." },
        },
      },
    },
    answered_elsewhere: {
      type: "boolean",
      description:
        "Someone else took it, holds it or finished it, so it is not waiting on you. Never true " +
        "when it names you by handle or you said you are on it.",
    },
    source_context: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    stack_assumptions: { type: "array", items: { type: "string" } },
    parent: { type: "string", description: "The work this came out of, if any." },
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

/** One piece of work on the queue, as GET /v1/tasks and POST /v1/tasks/next answer it. */
const TASK = {
  type: "object",
  description: "Work queued for an agent. `state` is where it is; `claim` is who has it.",
  properties: {
    id: { type: "string", example: "3cxbzebv" },
    title: { type: "string" },
    target: { type: "string", description: "owner/repo it is for; empty for no repo." },
    state: {
      type: "string",
      enum: ["draft", "ready", "blocked", "claimed", "stalled", "done"],
      description:
        "stalled: claimed, and nothing heard for 30 minutes. Still locked to the agent that took it.",
    },
    mine: { type: "boolean", description: "You wrote it." },
    url: { type: "string", description: "Share link." },
    claim: {
      type: ["object", "null"],
      properties: {
        agent: { type: "string" },
        note: { type: "string", description: "The latest progress line." },
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
    "A name for you, the same on every call. A local agent's is in its worktree's .passalong/agent.json.",
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
    "You do not hold that: a person took it back, or it was never yours. Stop working on it.",
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
        "Work for a team and its agents: markdown with frontmatter, saying what to do in plain " +
        "words. Work has no kinds and no required sections — read it and work out what done " +
        "means. It is worked with four calls: POST /v1/take, PUT /v1/guides/{id}/progress, " +
        "POST /v1/guides/{id}/hand_in and POST /v1/guides/{id}/pass. Each answer ends with " +
        "`next`, what to call now, and `say` when the move is to stop.",
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
      schemas: { Guide: GUIDE, Task: TASK, Next: NEXT },
    },
    paths: {
      "/v1/me": {
        get: {
          operationId: "whoami",
          summary: "Who this token belongs to, and which teams they are in.",
          responses: { 200: { description: "The account." } },
        },
      },
      "/v1/folders": {
        get: {
          operationId: "listFolders",
          summary: "List project folders this account can use.",
          parameters: [SCOPE_PARAMETER],
          responses: { 200: { description: "Visible folders." } },
        },
        post: {
          operationId: "createFolder",
          summary: "Create a private or team project folder.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    team: { type: "string", description: "Team slug; omit for a private folder." },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "The new folder." } },
        },
      },
      "/v1/folders/{folder}": {
        get: {
          operationId: "getFolder",
          summary: "List a folder's documents, assets and linked guides.",
          parameters: [{ name: "folder", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Folder contents." },
            404: { description: "Unavailable folder." },
          },
        },
      },
      "/v1/folders/{folder}/documents": {
        post: {
          operationId: "createFolderDocument",
          summary: "Add a Markdown document to a folder.",
          parameters: [{ name: "folder", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "body"],
                  properties: { name: { type: "string" }, body: { type: "string" } },
                },
              },
            },
          },
          responses: { 201: { description: "The new document and its version." } },
        },
      },
      "/v1/folders/{folder}/documents/{document}": {
        get: {
          operationId: "getFolderDocument",
          summary: "Read a folder document and its current version.",
          parameters: [
            { name: "folder", in: "path", required: true, schema: { type: "string" } },
            { name: "document", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Document Markdown and version." } },
        },
        put: {
          operationId: "saveFolderDocument",
          summary: "Save a new version, refusing a stale editor with 409.",
          parameters: [
            { name: "folder", in: "path", required: true, schema: { type: "string" } },
            { name: "document", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["body", "version"],
                  properties: { body: { type: "string" }, version: { type: "integer" } },
                },
              },
            },
          },
          responses: {
            200: { description: "The saved document." },
            409: { description: "A newer version exists." },
          },
        },
      },
      "/v1/folders/{folder}/assets/{asset}/agent": {
        get: {
          operationId: "getFolderAsset",
          summary: "Read a bounded image or text asset for agent context.",
          parameters: [
            { name: "folder", in: "path", required: true, schema: { type: "string" } },
            { name: "asset", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Image as base64, or text." } },
        },
      },
      "/v1/folders/{folder}/guides": {
        post: {
          operationId: "linkFolderGuide",
          summary: "Link an existing guide to a folder without changing the guide.",
          parameters: [{ name: "folder", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["guide"],
                  properties: { guide: { type: "string" } },
                },
              },
            },
          },
          responses: { 201: { description: "The linked guide id." } },
        },
      },
      "/v1/guides": {
        get: {
          operationId: "searchGuides",
          summary: "Search guides by words in the title, tags, stack, or body.",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Search words." },
            SCOPE_PARAMETER,
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
            "Frontmatter carries `title:`, `summary:` and the addressing: `team:` and `to:` hand it " +
            "over. `kind:` is refused: work has no kinds. `parent:` names the work this came out of " +
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
      // The four verbs all work is done with, and who is on what. See docs/WORK.md. Release and
      // reopen are a person's calls and stay undescribed for the reason account routes do: a
      // description is a list of things a model is invited to call.
      "/v1/take": {
        post: {
          operationId: "take",
          summary: "Say you are doing it, and get it: work by id, or the next one waiting.",
          description:
            "While you hold it nobody else can take it. You may hold several — taking what you " +
            "hold resumes it. When somebody else has it the 409 names them in `holder`: tell the " +
            "user rather than doing the work twice. With no id, the next ready work for `repo`, or " +
            "`guide: null` and `say` when nothing is waiting.",
          requestBody: agentBody({
            id: { type: "string", description: "The work to take. Leave out for the next one." },
            repo: { type: "string", description: "owner/repo you are in; omit for no repo." },
            host: { type: "string" },
            worktree: { type: "string" },
            any: { type: "boolean", description: "Work for another repo. Only when asked to." },
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
            400: { description: "No `agent`, or work taken from outside the repo it is for." },
            404: { description: "No such work that you can see." },
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
            "Done, with proof: it goes to Done, and nobody reviews it after. `note` is one plain sentence saying what you did. `evidence` (or `checks`) is what you ran and what came back. `writeup` is anything you had to adapt, and why.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: agentBody(
            {
              note: { type: "string", maxLength: 280 },
              writeup: { type: "string", maxLength: 500 },
              pr: { type: "string", description: "PR or branch link, or a commit hash." },
              evidence: {
                type: "string",
                maxLength: 4000,
                description:
                  "What you ran and what came back: the command and the lines that decided it, a test summary, a link to the change, or a screenshot url. A verdict on your own work is not evidence.",
              },
            },
            ["note", "evidence"],
          ),
          responses: {
            200: json200("Done.", withNext({ id: { type: "string" } })),
            400: { description: "No note, no evidence, or a write-up over 500 characters." },
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
      "/v1/guides/{id}/ask": {
        post: {
          operationId: "ask",
          summary: "Ask the person a question and wait, keeping what you hold.",
          description:
            "Not `pass` (which gives the work back) and not `progress` (which says carry on). The claim stays and nobody else can take the work; its lease is extended to a day. Stop after this, tell the user you are waiting, and call `take` with this id once they have answered: the answer comes back as `replies`.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: agentBody({ question: { type: "string", maxLength: 1000 } }, ["question"]),
          responses: {
            200: json200(
              "Sent. Stop and wait.",
              withNext({ id: { type: "string" }, lease_until: { type: "string" } }),
            ),
            400: { description: "No question given." },
            409: NOT_HELD,
          },
        },
      },
      "/v1/guides/{id}/reply": {
        post: {
          operationId: "reply",
          summary: "A person writes to whoever holds a piece of work.",
          description:
            "Only while it is held, and only from its author, whoever it is assigned to, or its holder. Plain text, 1000 characters. The agent is told on its next `progress` or `take`.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["body"],
                  properties: { body: { type: "string", maxLength: 1000 } },
                },
              },
            },
          },
          responses: {
            200: json200("Written.", { id: { type: "string" } }),
            403: { description: "Not its author, assignee or holder." },
            409: { description: "Nobody holds it, so there is nobody to tell." },
          },
        },
      },
      "/v1/guides/{id}/assign": {
        post: {
          operationId: "assign",
          summary: "Give work to someone else in its team.",
          description:
            "`to` is `@handle` for one person (or `@<account id>` for a teammate with no @name), `#group` for the people who do a thing, or empty for the whole team. Anyone in its team may; the author is told. Whoever held it and is left out has it taken back and is told; the queue then only hands it to the new assignee's agents.",
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
          summary: "Who is working on what: everything somebody holds right now that you can see.",
          parameters: [SCOPE_PARAMETER],
          responses: {
            200: json200("Most recently heard from first.", {
              type: "object",
              properties: {
                working: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
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
          summary: "All work you can see, with where it is and who has it.",
          parameters: [SCOPE_PARAMETER],
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
            "Take the oldest ready work for a repo. No other agent can have it while you do.",
          description:
            "Work waits until everything in its `blocked_by` is Done. `alone: true` takes only " +
            "work a person marked safe to run with nobody watching. Answers `{ task: null }` when " +
            "nothing is ready.",
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
                      description: "owner/repo you are in; omit for work for no repo.",
                    },
                    host: { type: "string" },
                    worktree: { type: "string" },
                    any: {
                      type: "boolean",
                      description: "Take work for any repo. Only when asked to.",
                    },
                    alone: {
                      type: "boolean",
                      description: "Only work a person marked safe to run alone.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "The work you now hold, with its markdown, or null.",
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
            "Your own acts on work — published, pulled, finished, and the ones you passed on — " +
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
          summary: "Get a one-time link that takes a screenshot, file or folder asset.",
          description:
            "For an agent's code sandbox that holds a file but cannot send your token with it. " +
            "Set folder to an accessible folder id to store an image or file there. " +
            "The link works once and expires in 10 minutes.",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    kind: { type: "string", enum: ["image", "file"] },
                    folder: {
                      type: "string",
                      description: "Store the upload in this folder instead.",
                    },
                  },
                },
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
          summary: "Send raw bytes to an upload link. POST works too.",
          description:
            "The minted link decides whether to store a screenshot (5 MB), a guide file (10 MB), " +
            "or a folder asset (10 MB). Types are checked from the bytes. Returns the stored item.",
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
            "which is how the sender learns it landed.",
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
