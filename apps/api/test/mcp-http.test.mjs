// The MCP server, over HTTP, exercised through its own transport.
//
// No network and no credential: `handleMcp` takes a Request and a function that stands in for the
// rest of the API, so the protocol wiring can be checked without a database behind it. What this
// proves is the part that would be tedious to debug through a client — that the endpoint speaks
// JSON-RPC, lists the tools it claims to, and hands a route's answer back unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMcp } from "../src/mcp-http.ts";

const PROTOCOL = "2025-06-18";
const VOCAB = { areas: "web, mobile", severities: "s1 blocker, s3 minor" };

/** Stands in for the app: records what a tool asked for, answers what the test wants. */
function recorder(answers = {}) {
  const seen = [];
  const call = async (method, path, body) => {
    seen.push({ method, path, body });
    const answer = answers[`${method} ${path.split("?")[0]}`] ?? { status: 200, text: "{}" };
    return typeof answer === "function" ? answer(body) : answer;
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
  // `enableJsonResponse` means one JSON body, not an SSE stream — assert that, since a stream here
  // would mean the transport was configured differently than intended.
  assert.match(res.headers.get("content-type") || "", /application\/json/);
  return JSON.parse(text);
};

test("it introduces itself with a protocol version and its tools", async () => {
  const { call } = recorder();
  const res = await handleMcp(
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
  );
  assert.equal(res.status, 200);
  const body = await read(res);
  assert.equal(body.result.serverInfo.name, "passalong");
  assert.ok(body.result.capabilities.tools, "it must advertise tools");
  assert.match(body.result.instructions, /kind: bug is a defect to FIX/);
});

test("every tool it lists is one an agent could act on", async () => {
  const { call } = recorder();
  const res = await handleMcp(
    rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    call,
    VOCAB,
  );
  const body = await read(res);
  const names = body.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "board",
    "file_bugs",
    "get_guide",
    "get_report",
    "inbox",
    "publish_guide",
    "search_guides",
    "verify_guide",
  ]);
  for (const tool of body.result.tools) {
    assert.ok(tool.description && tool.description.length > 20, `${tool.name} needs a description`);
    assert.equal(tool.inputSchema.type, "object", `${tool.name} needs an input schema`);
  }
});

test("a tool call reaches the route it maps onto, and relays what it said", async () => {
  const { call, seen } = recorder({
    "GET /v1/guides": { status: 200, text: '{"guides":[]}' },
  });
  const res = await handleMcp(
    rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "search_guides", arguments: { q: "webhook", scope: "mine" } },
    }),
    call,
    VOCAB,
  );
  const body = await read(res);
  assert.equal(body.result.content[0].text, '{"guides":[]}');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, "GET");
  assert.match(seen[0].path, /^\/v1\/guides\?/);
  assert.match(seen[0].path, /q=webhook/);
  assert.match(seen[0].path, /scope=mine/);
});

test("a bug is announced as one before its markdown is handed over", async () => {
  const markdown = "---\ntitle: x\nkind: bug\n---\n\n## Problem\np\n\n## Reproduce\n1. x\n";
  const { call } = recorder({ "GET /v1/guides/abc12345": { status: 200, text: markdown } });
  const res = await handleMcp(
    rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "get_guide", arguments: { id: "abc12345" } },
    }),
    call,
    VOCAB,
  );
  const body = await read(res);
  const out = body.result.content[0].text;
  // The warning has to arrive before the document: an agent keys on headings, and a repro under a
  // heading it is told to follow is how it reproduces the bug and reports the guide as broken.
  assert.ok(out.startsWith("THIS IS A BUG REPORT"));
  assert.ok(out.indexOf("THIS IS A BUG REPORT") < out.indexOf("## Reproduce"));
  assert.ok(out.endsWith(markdown));
});

test("a transfer guide is handed over untouched", async () => {
  const markdown = "---\ntitle: x\n---\n\n## Problem\np\n\n## Steps\n1. x\n";
  const { call } = recorder({ "GET /v1/guides/abc12345": { status: 200, text: markdown } });
  const res = await handleMcp(
    rpc({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "get_guide", arguments: { id: "abc12345" } },
    }),
    call,
    VOCAB,
  );
  const body = await read(res);
  assert.equal(body.result.content[0].text, markdown);
});

test("a route's refusal is the tool's error, not a new one", async () => {
  const { call } = recorder({
    "PUT /v1/guides/abc12345": { status: 400, text: '{"message":"frontmatter needs a title"}' },
  });
  const res = await handleMcp(
    rpc({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "publish_guide", arguments: { id: "abc12345", markdown: "---\n---\n" } },
    }),
    call,
    VOCAB,
  );
  const body = await read(res);
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /frontmatter needs a title/);
});

test("file_bugs opens the report first, then files each issue under it", async () => {
  const { call, seen } = recorder({
    "POST /v1/reports": { status: 201, text: '{"report":{"id":"rep12345"}}' },
  });
  const res = await handleMcp(
    rpc({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "file_bugs",
        arguments: {
          title: "sweep",
          environment: "staging",
          issues: [
            { title: "one", problem: "p1", reproduce: "1. a", area: "web", severity: "s1" },
            { title: "two", problem: "p2", reproduce: "1. b" },
          ],
        },
      },
    }),
    call,
    VOCAB,
  );
  const body = await read(res);
  assert.equal(body.result.isError, undefined);

  assert.equal(seen[0].path, "/v1/reports");
  assert.equal(seen.length, 3, "the report, then one write per issue");

  const first = seen[1].body.markdown;
  assert.match(first, /^kind: bug$/m);
  assert.match(first, /^report: rep12345$/m);
  assert.match(first, /^severity: s1$/m);
  assert.match(first, /^## Reproduce$/m);
  assert.ok(!/^## Steps$/m.test(first), "a bug must never carry a Steps section");
  assert.match(first, /^> \*\*Bug report\.\*\*/m);
  // Unstated severity has a default rather than being left off the document.
  assert.match(seen[2].body.markdown, /^severity: s3$/m);
});

test("a failure part-way through says which issues already landed", async () => {
  let writes = 0;
  const { call } = recorder({
    "POST /v1/reports": { status: 201, text: '{"report":{"id":"rep12345"}}' },
  });
  const counting = async (method, path, body) => {
    if (method === "PUT" && ++writes === 2) return { status: 402, text: '{"message":"limit"}' };
    return call(method, path, body);
  };
  const res = await handleMcp(
    rpc({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "file_bugs",
        arguments: {
          issues: [
            { title: "one", problem: "p", reproduce: "1. a" },
            { title: "two", problem: "p", reproduce: "1. b" },
          ],
        },
      },
    }),
    counting,
    VOCAB,
  );
  const body = await read(res);
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /filed 1 of 2 issues/);
});
