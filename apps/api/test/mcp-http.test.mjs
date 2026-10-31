// The MCP server, over HTTP, exercised through its own transport.
//
// No network and no credential: `handleMcp` takes a Request and a function that stands in for the
// rest of the API, so the protocol wiring can be checked without a database behind it. What this
// proves is the part that would be tedious to debug through a client — that the endpoint speaks
// JSON-RPC, lists the tools it claims to, and hands each call to the route it maps onto.
import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMcp } from "../src/mcp-http.ts";

const PROTOCOL = "2025-06-18";
const VOCAB = { shotTypes: "Accepts image/png, image/jpeg" };

/** docs/WORK.md's seventeen, less `accounts`: over HTTP the bearer token is the account. */
const TOOLS = [
  "add_file",
  "ask",
  "create_work",
  "delete_document",
  "delete_file",
  "find_projects",
  "find_work",
  "hand_in",
  "pass",
  "progress",
  "read_document",
  "read_file",
  "save_document",
  "save_project",
  "take",
  "update_work",
];

/** Stands in for the app: records what a tool asked for, answers what the test wants. */
function recorder(answers = {}) {
  const seen = [];
  const call = async (method, path, body, raw) => {
    seen.push({ method, path, body, raw });
    const answer = answers[`${method} ${path.split("?")[0]}`] ?? { status: 200, text: "{}" };
    return typeof answer === "function" ? answer(body, path) : answer;
  };
  return { call, seen };
}

const rpc = (body) =>
  new Request("https://passalong.dev/v1/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });

const read = async (res) => {
  const text = await res.text();
  // `enableJsonResponse` means one JSON body, not an SSE stream.
  assert.match(res.headers.get("content-type") || "", /application\/json/);
  return JSON.parse(text);
};

/** Call one tool and hand back its result. */
async function tool(call, name, args = {}) {
  const body = await read(
    await handleMcp(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      call,
      VOCAB,
    ),
  );
  return body.result;
}

const textOf = (r) => r.content.map((c) => c.text).join("\n");

async function list() {
  const { call } = recorder();
  const body = await read(
    await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), call, VOCAB),
  );
  return body.result.tools;
}

/** Stub the outside world a client-passed file is fetched from. */
async function withDownload(bytes, type, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(bytes, { status: 200, headers: { "content-type": type } });
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const FILE = {
  download_url: "https://files.example.com/a",
  file_id: "f1",
  file_name: "shot.png",
};

test("it introduces itself around four nouns, and never says guide", async () => {
  const { call } = recorder();
  const body = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
      call,
      VOCAB,
    ),
  );
  assert.equal(body.result.serverInfo.name, "passalong");
  assert.ok(body.result.capabilities.tools, "it must advertise tools");
  const said = body.result.instructions;
  assert.match(said, /A PROJECT IS A PLACE; ITS DOCUMENTS ARE WHAT TO KNOW; WORK IS WHAT TO DO/);
  assert.match(said, /WHAT YOU LEARN GOES INTO THE PROJECT'S DOCUMENTS/);
  assert.match(said, /BEFORE WRITING ANYTHING DOWN, CHECK WHAT IS ALREADY OPEN/);
  assert.match(said, /Ask which, in one line/, "a vague ask is answered with a question");
  assert.doesNotMatch(said, /guide/i);
});

test("it lists the work tools and nothing else, each one an agent could act on", async () => {
  const tools = await list();
  assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 20, `${t.name} needs a description`);
    assert.equal(t.inputSchema.type, "object", `${t.name} needs an input schema`);
  }
  assert.doesNotMatch(JSON.stringify(tools), /guide/i, "no name, description or field says guide");
});

test("every tool says what it does to the world, so a client does not assume the worst", async () => {
  const tools = new Map((await list()).map((t) => [t.name, t]));
  const where = (hint) =>
    [...tools]
      .filter(([, t]) => t.annotations[hint] === true)
      .map(([n]) => n)
      .sort();
  assert.deepEqual(where("readOnlyHint"), [
    "find_projects",
    "find_work",
    "read_document",
    "read_file",
  ]);
  assert.deepEqual(where("destructiveHint"), ["delete_document", "delete_file", "update_work"]);
  assert.deepEqual(where("openWorldHint"), ["add_file", "create_work"], "only these fetch a URL");
  for (const [name, t] of tools) {
    assert.equal(typeof t.annotations.readOnlyHint, "boolean", `${name} declares nothing`);
    assert.ok(t.outputSchema, `${name} declares an output schema`);
    assert.notEqual(t.outputSchema.additionalProperties, false, `${name} leaves room for more`);
  }
});

test("files are declared as file inputs, at the top level, where a client looks for them", async () => {
  const tools = new Map((await list()).map((t) => [t.name, t]));
  assert.deepEqual(tools.get("add_file")._meta["openai/fileParams"], ["file"]);
  assert.deepEqual(tools.get("create_work")._meta["openai/fileParams"], ["files"]);
  const file = tools.get("add_file").inputSchema.properties.file;
  assert.deepEqual(Object.keys(file.properties).sort(), [
    "download_url",
    "file_id",
    "file_name",
    "mime_type",
  ]);
  assert.match(tools.get("add_file").description, /`ran` on hand_in/);
  assert.match(tools.get("add_file").description, /DO NOT WRITE NEW WORK TO CARRY SCREENSHOTS/);
});

// ---- work ----------------------------------------------------------------------------------------

test("take hands over the work with the lead, its parent in front, and where learning goes", async () => {
  const markdown = "---\nid: abc12345\ntitle: x\nsummary: s\nparent: par12345\n---\n\nFix it.\n";
  const { call, seen } = recorder({
    "POST /v1/take": {
      status: 200,
      text: JSON.stringify({
        work: { id: "abc12345", markdown },
        next: [{ tool: "progress", when: "at each milestone", why: "or it stalls" }],
      }),
    },
    "GET /v1/work/abc12345/parent": {
      status: 200,
      text: JSON.stringify({
        work: { id: "par12345", title: "Bigger", state: "open", markdown: "the big one" },
      }),
    },
  });
  const r = await tool(call, "take", { agent: "chat-7f3k2m9q", id: "abc12345" });
  assert.deepEqual(seen[0].body, { agent: "chat-7f3k2m9q", id: "abc12345", repo: "", any: false });
  const out = textOf(r);
  assert.ok(out.indexOf("THIS CAME OUT OF par12345") < out.indexOf("Fix it."), "parent first");
  assert.match(out, /SEARCH THE WHOLE TREE BEFORE YOU CONCLUDE/);
  assert.match(out, /progress abc12345 — when at each milestone/);
  assert.match(out, /project's documents \(find_projects, read_document, save_document\)/);
  assert.doesNotMatch(out, /THIS IS A (BUG|TASK)/, "no kind decides what is said");
});

test("nothing waiting says to stop, and someone else holding it is the route's own refusal", async () => {
  const none = recorder({
    "POST /v1/take": {
      status: 200,
      text: JSON.stringify({ work: null, next: [], say: "Nothing is waiting. Stop." }),
    },
  });
  assert.match(textOf(await tool(none.call, "take", { agent: "chat-7f3k2m9q" })), /Stop\./);
  const held = recorder({
    "POST /v1/take": {
      status: 409,
      text: JSON.stringify({ message: "someone else has it", say: "Tell the user." }),
    },
  });
  const r = await tool(held.call, "take", { agent: "chat-7f3k2m9q", id: "abc12345" });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /someone else has it[\s\S]*Tell the user/);
});

test("progress, pass, ask and hand_in each reach their route with what they carry", async () => {
  const { call, seen } = recorder();
  const agent = "chat-7f3k2m9q";
  await tool(call, "progress", { id: "abc12345", agent, note: "Reading the page." });
  await tool(call, "pass", { id: "abc12345", agent, why: "not mine" });
  await tool(call, "ask", { id: "abc12345", agent, question: "Settings or header?" });
  await tool(call, "hand_in", {
    id: "abc12345",
    agent,
    note: "Added the toggle.",
    evidence: "$ npm test\n41 pass, 0 fail",
    writeup: "Used the existing hook.",
    pr: "https://github.com/o/r/pull/1",
  });
  assert.deepEqual(
    seen.map((s) => `${s.method} ${s.path}`),
    [
      "PUT /v1/work/abc12345/progress",
      "POST /v1/work/abc12345/pass",
      "POST /v1/work/abc12345/ask",
      "POST /v1/work/abc12345/hand_in",
    ],
  );
  assert.deepEqual(seen[1].body, { agent, why: "not mine" });
  assert.deepEqual(seen[3].body, {
    agent,
    note: "Added the toggle.",
    evidence: "$ npm test\n41 pass, 0 fail",
    writeup: "Used the existing hook.",
    pr: "https://github.com/o/r/pull/1",
  });
});

test("create_work writes one document per item, in order, with what each waits on", async () => {
  const { call, seen } = recorder({
    "GET /v1/me": { status: 200, text: JSON.stringify({ teams: [{ slug: "khaime" }] }) },
  });
  const r = await tool(call, "create_work", {
    items: [
      { title: "Schema: add table", summary: "Add the table.", repo: "o/r" },
      { title: "API", summary: "Serve it.", after: [0], to: "khaime/#backend", parent: "par12345" },
    ],
    draft: true,
  });
  assert.equal(r.isError, undefined);
  const puts = seen.filter((s) => s.method === "PUT");
  assert.equal(puts.length, 2);
  const [first, second] = puts.map((p) => p.body.markdown);
  const firstId = puts[0].path.split("/").pop();
  assert.match(first, /^title: "Schema: add table"$/m);
  assert.match(first, /^summary: Add the table\.$/m);
  assert.match(first, /^target_context: o\/r$/m);
  assert.match(first, /^status: draft$/m);
  assert.match(first, /^team: khaime$/m, "the one team you are in, when none is named");
  assert.doesNotMatch(first, /^kind:/m, "work has no kind");
  assert.match(second, new RegExp(`^blocked_by: \\[${firstId}\\]$`, "m"));
  assert.match(second, /^to: "#backend"$/m);
  assert.equal(puts[1].body.parent, "par12345", "the parent rides beside the document");
  assert.equal(puts[0].body.parent, undefined);
  assert.equal(r.structuredContent.work.length, 2);
  assert.match(r.structuredContent.next, /hub\/work/);
});

test("create_work puts each file on the item that names it, and guesses nothing", async () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const answers = {
    "POST /v1/shots": () => ({
      status: 201,
      text: JSON.stringify({ shot: { id: "s1", url: "https://passalong.dev/v1/shots/s1" } }),
    }),
  };
  await withDownload(png, "image/png", async () => {
    const { call, seen } = recorder(answers);
    const r = await tool(call, "create_work", {
      files: [FILE, FILE],
      items: [
        { title: "a", summary: "a", files: [1] },
        { title: "b", summary: "b", files: [0] },
      ],
      to: "khaime",
    });
    assert.equal(r.isError, undefined);
    const docs = seen.filter((s) => s.method === "PUT").map((s) => s.body.markdown);
    assert.match(docs[0], /!\[shot\.png\]\(https:\/\/passalong\.dev\/v1\/shots\/s1\)/);
    assert.match(docs[1], /!\[shot\.png\]/);

    const one = recorder(answers);
    await tool(one.call, "create_work", { files: [FILE], items: [{ title: "a", summary: "a" }] });
    assert.match(one.seen.find((s) => s.method === "PUT").body.markdown, /!\[shot\.png\]/);
  });
  const { call, seen } = recorder();
  const r = await tool(call, "create_work", {
    files: [FILE, FILE],
    items: [
      { title: "a", summary: "a", files: [0] },
      { title: "b", summary: "b" },
    ],
  });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /file 1 belongs to no item/);
  assert.deepEqual(seen, [], "refused before anything is fetched or written");
  const later = await tool(call, "create_work", {
    items: [{ title: "a", summary: "a", after: [0] }],
  });
  assert.match(textOf(later), /can only wait on an earlier one/);
});

test("a failure part-way through says which work already landed", async () => {
  let n = 0;
  const { call } = recorder();
  const failing = async (method, path, body) => {
    if (method === "PUT" && ++n === 2) return { status: 400, text: '{"message":"no summary"}' };
    return call(method, path, body);
  };
  const r = await tool(failing, "create_work", {
    items: [
      { title: "a", summary: "a" },
      { title: "b", summary: "b" },
    ],
    to: "khaime",
  });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /wrote 1 of 2 before failing/);
});

test("find_work reads by id without taking it, with what it came out of in front", async () => {
  const markdown =
    "---\nid: abc12345\ntitle: x\nsummary: s\n---\n\nThe upload button does nothing.\n";
  const { call, seen } = recorder({
    "GET /v1/work/abc12345": { status: 200, text: markdown },
    "GET /v1/work/abc12345/parent": { status: 200, text: '{"work":null}' },
  });
  const r = await tool(call, "find_work", { id: "abc12345" });
  assert.equal(seen[0].path, "/v1/work/abc12345?peek=1", "reading records nothing");
  assert.equal(r.content[0].text, markdown, "the document as it came");
  assert.match(textOf(r), /to work on it, call take abc12345/);
  assert.equal(r.structuredContent.markdown, markdown);
});

test("find_work reads large work by its outline, or one section", async () => {
  const filler = "x".repeat(25_000);
  const markdown = `---\nid: big12345\ntitle: x\nsummary: s\n---\n\n## Background\n${filler}\n\n## What to change\nthe one thing\n`;
  const { call } = recorder({ "GET /v1/work/big12345": { status: 200, text: markdown } });
  const outline = textOf(await tool(call, "find_work", { id: "big12345" }));
  assert.match(outline, /- Background \(/);
  assert.match(outline, /find_work id=big12345 section=/);
  assert.ok(outline.length < 1500);
  const part = textOf(await tool(call, "find_work", { id: "big12345", section: "what to" }));
  assert.match(part, /the one thing/);
  assert.ok(!part.includes(filler));
});

test("find_work with words searches, and answers with work", async () => {
  const { call, seen } = recorder({
    "GET /v1/work": { status: 200, text: '{"work":[{"id":"abc12345","title":"t"}]}' },
  });
  const r = await tool(call, "find_work", { query: "webhook", scope: "mine" });
  assert.match(seen[0].path, /q=webhook/);
  assert.match(seen[0].path, /scope=mine/);
  assert.deepEqual(r.structuredContent, { work: [{ id: "abc12345", title: "t" }] });
});

test("find_work with nothing is the board, drawn as an app where the host can", async () => {
  const task = (id, state, extra = {}) => ({
    id,
    title: `work ${id}`,
    state,
    mine: true,
    url: `https://passalong.dev/w/${id}/k`,
    claim: null,
    ...extra,
  });
  const { call } = recorder({
    "GET /v1/tasks": {
      status: 200,
      text: JSON.stringify({
        tasks: [
          task("d1", "draft"),
          task("s1", "stalled"),
          task("a1", "claimed", { claim: { asking: "Which colour?" } }),
          task("b1", "claimed", { claim: { note: "BLOCKED: need the key" } }),
          task("r1", "ready", { team: "khaime", to: "@ada" }),
          task("r2", "ready", { mine: false }),
          task("x1", "done"),
        ],
      }),
    },
    "GET /v1/working": {
      status: 200,
      text: JSON.stringify({
        working: [
          {
            id: "a1",
            title: "work a1",
            state: "claimed",
            note: "on it",
            url: "u",
            by: { name: "Ada", handle: "ada", you: false },
          },
        ],
      }),
    },
    "GET /v1/teams/khaime": {
      status: 200,
      text: JSON.stringify({ name: "Khaime", members: [{ id: "m1", handle: "ada", name: "Ada" }] }),
    },
    "GET /v1/teams/khaime/groups": {
      status: 200,
      text: JSON.stringify({ groups: [{ slug: "backend", name: "Backend" }] }),
    },
  });
  const b = (await tool(call, "find_work")).structuredContent;
  assert.deepEqual(
    b.needs.map((n) => [n.id, n.why]),
    [
      ["d1", "in Draft: read it and mark it Ready"],
      ["s1", "its agent went quiet"],
      ["a1", "asking you: Which colour?"],
      ["b1", "stuck on you: need the key"],
    ],
  );
  assert.equal(b.needs[0].url, "https://passalong.dev/hub/w/d1");
  assert.deepEqual(b.working, [
    { id: "a1", title: "work a1", who: "Ada", note: "on it", stalled: false, url: "u" },
  ]);
  assert.deepEqual(
    b.ready.map((t) => [t.id, t.team ?? null, t.to]),
    [
      ["r1", "khaime", "@ada"],
      ["r2", null, ""],
    ],
  );
  assert.deepEqual(
    b.teams.khaime.map((c) => c.to),
    ["", "@ada", "#backend"],
  );
  assert.deepEqual(b.counts, { needs: 4, working: 1, open: 3, done: 1 });

  const finder = (await list()).find((t) => t.name === "find_work");
  assert.equal(finder._meta.ui.resourceUri, "ui://passalong/work");
});

test("the board page is served as an MCP App, and calls only find_work and update_work", async () => {
  const { call } = recorder();
  const body = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 3,
        method: "resources/read",
        params: { uri: "ui://passalong/work" },
      }),
      call,
      VOCAB,
    ),
  );
  const [page] = body.result.contents;
  assert.equal(page.mimeType, "text/html;profile=mcp-app");
  assert.match(page.text, /ui\/initialize/);
  assert.match(page.text, /ui\/open-link/);
  assert.doesNotMatch(page.text, /<script[^>]+src=|<link[^>]+href="http/, "self-contained");
  const called = [...page.text.matchAll(/name: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(called)].sort(), ["find_work", "update_work"]);
});

test("update_work moves, gives and rewrites, each through its own route", async () => {
  const { call, seen } = recorder({
    "PUT /v1/work/abc12345": {
      status: 200,
      text: '{"url":"https://passalong.dev/w/abc12345/k"}',
    },
    "POST /v1/work/abc12345/assign": { status: 200, text: '{"id":"abc12345","to":"#backend"}' },
    "PATCH /v1/work/abc12345/status": { status: 200, text: '{"ok":true}' },
  });
  const r = await tool(call, "update_work", {
    id: "abc12345",
    markdown: "---\ntitle: t\nsummary: s\n---\n\nnew\n",
    to: "#backend",
    status: "archived",
  });
  assert.deepEqual(
    seen.map((s) => `${s.method} ${s.path}`),
    ["PUT /v1/work/abc12345", "POST /v1/work/abc12345/assign", "PATCH /v1/work/abc12345/status"],
  );
  assert.deepEqual(seen[2].body, { status: "done" });
  assert.deepEqual(r.structuredContent, {
    id: "abc12345",
    url: "https://passalong.dev/w/abc12345/k",
    to: "#backend",
    status: "archived",
  });
  const team = recorder();
  await tool(team.call, "update_work", { id: "abc12345", to: "" });
  assert.deepEqual(team.seen[0].body, { to: "" }, "an empty `to` is the whole team");
  const nothing = await tool(team.call, "update_work", { id: "abc12345" });
  assert.equal(nothing.isError, true);
});

test("a route's refusal is the tool's error, and a non-object answer is one too", async () => {
  const refusing = recorder({
    "PATCH /v1/work/abc12345/status": { status: 403, text: '{"message":"only its author"}' },
  });
  const r = await tool(refusing.call, "update_work", { id: "abc12345", status: "ready" });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /only its author/);
  const odd = recorder({ "GET /v1/projects": { status: 200, text: "[]" } });
  assert.equal((await tool(odd.call, "find_projects")).isError, true);
});

// ---- projects, documents and files --------------------------------------------------------------

test("projects are found, made and changed through the project routes", async () => {
  const { call, seen } = recorder({
    "POST /v1/projects": { status: 201, text: '{"project":{"id":"f1"},"space":"private"}' },
    "PATCH /v1/projects/f1": { status: 200, text: '{"project":{"id":"f1"}}' },
  });
  await tool(call, "find_projects", { query: "billing" });
  await tool(call, "find_projects", { id: "f1" });
  await tool(call, "save_project", { title: "Billing", description: "Payments", color: "blue" });
  await tool(call, "save_project", { id: "f1", parent: "" });
  assert.deepEqual(
    seen.map((s) => `${s.method} ${s.path}`),
    [
      "GET /v1/projects?q=billing",
      "GET /v1/projects/f1",
      "POST /v1/projects",
      "PATCH /v1/projects/f1",
    ],
  );
  assert.deepEqual(seen[3].body, { parent: "" }, "only what was said changes");
  const moved = await tool(call, "save_project", { id: "f1", team: "khaime" });
  assert.equal(moved.isError, true, "a project's space does not change");
  assert.equal((await tool(call, "save_project", {})).isError, true, "a new one needs a title");
});

test("documents are read with their history, and saved, renamed and moved with their version", async () => {
  const { call, seen } = recorder();
  const project = "f1";
  await tool(call, "read_document", { project, document: "d1" });
  await tool(call, "read_document", { project, document: "d1", history: true });
  await tool(call, "read_document", { project, document: "d1", version: 3 });
  await tool(call, "save_document", { project, name: "Log", body: "- today" });
  await tool(call, "save_document", { project, document: "d1", body: "new", version: 4 });
  await tool(call, "save_document", { project, document: "d1", name: "Billing", move_to: "f2" });
  await tool(call, "delete_document", { project, document: "d1" });
  const doc = "/v1/projects/f1/documents/d1";
  assert.deepEqual(
    seen.map((s) => `${s.method} ${s.path}`),
    [
      `GET ${doc}`,
      `GET ${doc}/revisions`,
      `GET ${doc}/revisions/3`,
      "POST /v1/projects/f1/documents",
      `PUT ${doc}`,
      `PATCH ${doc}`,
      `DELETE ${doc}`,
    ],
  );
  assert.deepEqual(seen[4].body, { version: 4, body: "new" });
  assert.deepEqual(seen[5].body, { name: "Billing", project: "f2" });
  const blind = await tool(call, "save_document", { project, document: "d1", body: "x" });
  assert.equal(blind.isError, true, "an edit without the version read is refused here");
  assert.match(textOf(blind), /version/);
});

test("a project's picture reaches the agent as an image, and files are removed by one route", async () => {
  const { call, seen } = recorder({
    "GET /v1/projects/f1/files/a1/agent": {
      status: 200,
      text: JSON.stringify({ id: "a1", name: "screen.png", type: "image/png", data: "iVBORw==" }),
    },
  });
  const r = await tool(call, "read_file", { project: "f1", file: "a1" });
  assert.deepEqual(r.content[1], { type: "image", data: "iVBORw==", mimeType: "image/png" });
  assert.equal(r.structuredContent.data, undefined, "the bytes are not also in the metadata");
  await tool(call, "delete_file", { project: "f1", file: "a1" });
  assert.equal(seen[1].method, "DELETE");
  assert.equal(seen[1].path, "/v1/projects/f1/files/a1");
});

test("add_file with no file mints a one-time link, for work or for a project", async () => {
  const minted = {
    "POST /v1/uploads": {
      status: 201,
      text: JSON.stringify({
        upload_url: "https://passalong.dev/v1/uploads/up_x",
        expires: "2026-10-29T10:10:00Z",
      }),
    },
  };
  const { call, seen } = recorder(minted);
  const r = await tool(call, "add_file", { name: "error.log", kind: "file" });
  assert.deepEqual(seen[0].body, { name: "error.log", kind: "file" });
  assert.match(
    r.structuredContent.command,
    /curl .*-X PUT --data-binary @FILE_PATH 'https:\/\/passalong\.dev\/v1\/uploads\/up_x'/,
  );
  await tool(call, "add_file", { project: "f1", name: "brief.pdf" });
  assert.deepEqual(seen[1].body, { project: "f1", name: "brief.pdf" });
  const refusing = recorder({ "POST /v1/uploads": { status: 429, text: "Too many upload links" } });
  const no = await tool(refusing.call, "add_file", {});
  assert.equal(no.isError, true);
  assert.match(textOf(no), /Too many upload links/);
});

test("add_file stores a picture as one, anything else as a download, and a project's in it", async () => {
  await withDownload(new Uint8Array([137, 80, 78, 71]), "image/png", async () => {
    const { call, seen } = recorder({
      "POST /v1/shots": {
        status: 201,
        text: JSON.stringify({ shot: { id: "s1", url: "https://passalong.dev/v1/shots/s1" } }),
      },
    });
    const r = await tool(call, "add_file", { file: FILE });
    assert.equal(seen[0].raw.contentType, "image/png");
    assert.equal(seen[0].raw.headers["x-shot-name"], "shot.png");
    assert.equal(seen[0].body.byteLength, 4, "the bytes go up, not a description of them");
    assert.equal(r.structuredContent.markdown, "![shot.png](https://passalong.dev/v1/shots/s1)");
    await tool(call, "add_file", { file: FILE, project: "f1" });
    assert.equal(seen[1].path, "/v1/projects/f1/files");
    assert.equal(seen[1].raw.headers["x-file-name"], "shot.png");
  });
  await withDownload(new Uint8Array([37, 80, 68, 70]), "application/pdf", async () => {
    const { call, seen } = recorder({
      "POST /v1/attachments": {
        status: 201,
        text: JSON.stringify({
          attachment: { id: "t1", url: "https://passalong.dev/v1/attachments/t1" },
        }),
      },
    });
    const r = await tool(call, "add_file", { file: { ...FILE, file_name: "spec.pdf" } });
    assert.equal(seen[0].path, "/v1/attachments");
    assert.equal(
      r.structuredContent.markdown,
      "[spec.pdf](https://passalong.dev/v1/attachments/t1)",
    );
  });
});

test("add_file refuses a URL only the worker could reach, before anything is sent", async () => {
  const { call, seen } = recorder();
  for (const url of [
    "http://files.example.com/a",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://10.0.0.4/a",
    "https://[::1]/a",
  ]) {
    const r = await tool(call, "add_file", { file: { ...FILE, download_url: url } });
    assert.equal(r.isError, true, `${url} should be refused`);
    assert.match(textOf(r), /public https URL[\s\S]*add_file with no `file`/);
  }
  assert.deepEqual(seen, []);
});

test("the route refuses a file, not this server", async () => {
  await withDownload(new Uint8Array([1, 2]), "image/png", async () => {
    const { call } = recorder({ "POST /v1/shots": { status: 415, text: "not an image" } });
    const r = await tool(call, "add_file", { file: FILE });
    assert.equal(r.isError, true);
    assert.match(textOf(r), /not an image/);
  });
});
