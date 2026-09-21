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
 * file bugs, answer with a verdict — and deliberately not account administration. Signup, login,
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
      type: "object",
      nullable: true,
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
        "Hand work between contexts as guides: markdown with frontmatter, in two kinds. A " +
        "transfer guide is finished work to repeat — follow its Steps. A bug is a defect to fix — " +
        "Reproduce shows you the problem and is not a procedure to apply, and Verification is the " +
        "behaviour that should have happened. Read `kind` before acting on any guide.",
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
      schemas: { Guide: GUIDE, Report: REPORT },
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
            400: { description: "Passing needs a reason." },
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
            400: { description: "A failure needs a reason." },
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
