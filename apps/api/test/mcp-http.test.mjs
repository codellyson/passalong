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
const VOCAB = {
  areas: "web, mobile",
  severities: "s1 blocker, s3 minor",
  shotTypes: "Accepts image/png, image/jpeg",
};

/** Stands in for the app: records what a tool asked for, answers what the test wants. */
function recorder(answers = {}) {
  const seen = [];
  const call = async (method, path, body, raw) => {
    seen.push({ method, path, body, raw });
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
    "ack_guide",
    "attach_screenshot",
    "board",
    "create_upload",
    "file_bugs",
    "finish_task",
    "get_guide",
    "get_report",
    "hand_in",
    "inbox",
    "log",
    "next_task",
    "pass",
    "progress",
    "publish_guide",
    "search_guides",
    "take",
    "task_progress",
    "verify_guide",
    "work",
  ]);
  for (const tool of body.result.tools) {
    assert.ok(tool.description && tool.description.length > 20, `${tool.name} needs a description`);
    assert.equal(tool.inputSchema.type, "object", `${tool.name} needs an input schema`);
  }
});

// create_upload is how an agent holding the image as a file hands it over: Claude's sandbox has the
// file and no file input to put it in, so it gets somewhere to send the bytes instead.
test("create_upload mints a link and hands back the command that uses it", async () => {
  const link = `https://passalong.dev/v1/uploads/pa_up_${"a".repeat(32)}`;
  const { call, seen } = recorder({
    "POST /v1/uploads": {
      status: 201,
      text: JSON.stringify({ upload_url: link, expires: "2026-09-15T12:10:00.000Z" }),
    },
  });
  const body = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: { name: "create_upload", arguments: { name: "shot.png" } },
      }),
      call,
      VOCAB,
    ),
  );
  assert.equal(body.result.isError, undefined);
  assert.deepEqual(
    seen.map((s) => `${s.method} ${s.path}`),
    ["POST /v1/uploads"],
  );
  assert.deepEqual(seen[0].body, { name: "shot.png" });
  const { upload_url, command } = body.result.structuredContent;
  assert.equal(upload_url, link);
  // PUT and the file's bytes, to that link. No content-type in it: the route reads the bytes.
  assert.equal(command, `curl -sS --fail-with-body -X PUT --data-binary @IMAGE_PATH '${link}'`);
  assert.match(body.result.content[0].text, /IMAGE_PATH/);
});

test("create_upload passes the route's refusal on", async () => {
  const { call } = recorder({
    "POST /v1/uploads": { status: 429, text: '{"message":"Too many upload links are open."}' },
  });
  const body = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: { name: "create_upload", arguments: {} },
      }),
      call,
      VOCAB,
    ),
  );
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /Too many upload links/);
});

test("a local path passed as a download URL is pointed at create_upload", async () => {
  const { call, seen } = recorder();
  const body = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 14,
        method: "tools/call",
        params: {
          name: "attach_screenshot",
          arguments: {
            file: { download_url: "/mnt/user-data/uploads/shot.png", file_id: "shot.png" },
          },
        },
      }),
      call,
      VOCAB,
    ),
  );
  // What Claude did: it had the file in its sandbox and passed the path. The refusal says what works.
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /create_upload/);
  assert.deepEqual(seen, []);
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

test("acking maps onto the route, and passing carries its reason", async () => {
  const { call, seen } = recorder({
    "PUT /v1/guides/k3mq2xa7/ack": { status: 200, text: '{"id":"k3mq2xa7","taken":false}' },
  });
  const res = await handleMcp(
    rpc({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "ack_guide",
        arguments: { id: "k3mq2xa7", taken: false, note: "no context on payments" },
      },
    }),
    call,
    VOCAB,
  );
  assert.equal(res.status, 200);
  const sent = seen[0];
  assert.equal(sent.method, "PUT");
  assert.equal(sent.path, "/v1/guides/k3mq2xa7/ack");
  assert.deepEqual(sent.body, { taken: false, note: "no context on payments" });
});

test("every tool says what it does to the world, so a client does not assume the worst", async () => {
  const { call } = recorder();
  const body = await read(
    await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), call, VOCAB),
  );
  // Left unsaid, readOnlyHint defaults to false and destructiveHint and openWorldHint to true, and
  // ChatGPT badged `inbox` as a destructive public write.
  for (const t of body.result.tools) {
    for (const hint of ["readOnlyHint", "destructiveHint", "openWorldHint"]) {
      assert.equal(typeof t.annotations?.[hint], "boolean", `${t.name} must set ${hint}`);
    }
  }
  const by = (pred) =>
    body.result.tools
      .filter(pred)
      .map((t) => t.name)
      .sort();
  assert.deepEqual(
    by((t) => t.annotations.readOnlyHint),
    ["board", "get_report", "inbox", "log", "search_guides", "work"],
  );
  assert.deepEqual(
    by((t) => t.annotations.destructiveHint),
    ["publish_guide"],
  );
  assert.deepEqual(
    by((t) => t.annotations.openWorldHint),
    ["attach_screenshot", "file_bugs", "publish_guide"],
  );
});

test("every tool declares an output schema that leaves room for fields it does not name", async () => {
  const { call } = recorder();
  const body = await read(
    await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), call, VOCAB),
  );
  for (const t of body.result.tools) {
    assert.equal(t.outputSchema?.type, "object", `${t.name} needs an output schema`);
    // A closed object would make every field a route adds a validation error in the client.
    assert.notEqual(t.outputSchema.additionalProperties, false, `${t.name} must stay open`);
  }
});

test("a relayed answer comes back as data as well as text", async () => {
  const guides = { guides: [{ id: "k3mq2xa7", title: "x", kind: "bug", extra: 1 }] };
  const { call } = recorder({ "GET /v1/inbox": { status: 200, text: JSON.stringify(guides) } });
  const body = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "inbox", arguments: {} },
      }),
      call,
      VOCAB,
    ),
  );
  assert.equal(body.result.isError, undefined);
  assert.deepEqual(
    body.result.structuredContent,
    guides,
    "fields the schema does not name survive",
  );
  assert.equal(body.result.content[0].text, JSON.stringify(guides));
});

test("a route that answers with something other than an object is a tool error", async () => {
  const { call } = recorder({ "GET /v1/board": { status: 200, text: "<html>" } });
  const body = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "board", arguments: {} },
      }),
      call,
      VOCAB,
    ),
  );
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /unexpected response from \/v1\/board/);
});

test("get_guide hands back the document and its follow-ups as data, without the notes", async () => {
  const markdown = "---\ntitle: x\nkind: bug\n---\n\n## Problem\np\n";
  const { call } = recorder({
    "GET /v1/guides/abc12345": { status: 200, text: markdown },
    "GET /v1/guides/abc12345/children": {
      status: 200,
      text: JSON.stringify({ guides: [{ id: "f1", title: "More", markdown: "# more\n" }] }),
    },
  });
  const body = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "get_guide", arguments: { id: "abc12345" } },
      }),
      call,
      VOCAB,
    ),
  );
  assert.deepEqual(body.result.structuredContent, {
    id: "abc12345",
    kind: "bug",
    markdown,
    follow_ups: [{ id: "f1", title: "More", markdown: "# more" }],
  });
});

// attach_screenshot is the one tool that reaches outside: it fetches a URL a caller handed it.
// `download_url` is filled in by ChatGPT in practice, but anyone holding a token can call the tool
// directly, so what it refuses matters as much as what it uploads.
const FILE = {
  download_url: "https://files.example.com/abc.png",
  file_id: "file-abc",
  mime_type: "image/png",
  file_name: "shot.png",
};

const attach = (file) =>
  rpc({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "attach_screenshot", arguments: { file } },
  });

test("attach_screenshot declares its file input the way a client looks for it", async () => {
  const { call } = recorder();
  const body = await read(
    await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), call, VOCAB),
  );
  const tool = body.result.tools.find((t) => t.name === "attach_screenshot");
  assert.deepEqual(tool._meta["openai/fileParams"], ["file"]);
  const props = tool.inputSchema.properties.file.properties;
  assert.deepEqual(Object.keys(props).sort(), [
    "download_url",
    "file_id",
    "file_name",
    "mime_type",
  ]);
  assert.deepEqual(tool.inputSchema.properties.file.required.sort(), ["download_url", "file_id"]);
});

test("attach_screenshot refuses a URL only the worker could reach", async () => {
  const { call, seen } = recorder();
  for (const url of [
    "http://files.example.com/a.png",
    "https://localhost/a.png",
    "https://127.0.0.1/a.png",
    "https://10.0.0.5/a.png",
    "https://169.254.169.254/latest/meta-data",
    "https://192.168.1.1/a.png",
    "not a url",
  ]) {
    const body = await read(await handleMcp(attach({ ...FILE, download_url: url }), call, VOCAB));
    assert.equal(body.result.isError, true, `${url} should be refused`);
    assert.match(body.result.content[0].text, /public https URL/);
  }
  // Nothing reached the API: a refused URL is refused before any of it is fetched or stored.
  assert.deepEqual(seen, []);
});

test("attach_screenshot uploads the bytes it fetched, labelled by what was served", async () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(png, { status: 200, headers: { "content-type": "image/png" } });
  try {
    const { call, seen } = recorder({
      "POST /v1/shots": {
        status: 201,
        text: JSON.stringify({ shot: { id: "s1", url: "https://passalong.dev/v1/shots/s1" } }),
      },
    });
    const body = await read(await handleMcp(attach(FILE), call, VOCAB));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].path, "/v1/shots");
    assert.equal(seen[0].raw.contentType, "image/png");
    assert.equal(seen[0].raw.headers["x-shot-name"], "shot.png");
    assert.equal(seen[0].body.byteLength, 4, "the bytes go up, not a description of them");
    // The markdown is the point: evidence lives in the document, so the tool hands back the line.
    assert.match(
      body.result.content[0].text,
      /!\[shot\.png\]\(https:\/\/passalong\.dev\/v1\/shots\/s1\)/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("attach_screenshot lets the route refuse, rather than inventing its own rules", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Uint8Array([1, 2]), {
      status: 200,
      headers: { "content-type": "image/tiff" },
    });
  try {
    const { call } = recorder({
      "POST /v1/shots": { status: 415, text: "screenshots must be image/png, image/jpeg" },
    });
    const body = await read(
      await handleMcp(attach({ ...FILE, mime_type: "image/png" }), call, VOCAB),
    );
    assert.equal(body.result.isError, true);
    // The served type wins over the client's claim, and `/v1/shots` is the one that says no.
    assert.match(body.result.content[0].text, /screenshots must be/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("file_bugs carries evidence into the issue it belongs to", async () => {
  const { call, seen } = recorder({
    "POST /v1/reports": { status: 201, text: JSON.stringify({ report: { id: "r1" } }) },
    "PUT /v1/guides": { status: 201, text: JSON.stringify({ url: "https://passalong.dev/g/x/y" }) },
  });
  const res = await handleMcp(
    rpc({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "file_bugs",
        arguments: {
          title: "Checkout pass",
          issues: [
            {
              title: "Save does nothing",
              problem: "Clicking Save does not save.",
              reproduce: "1. Click Save.",
              evidence: ["https://passalong.dev/v1/shots/abc123"],
            },
            { title: "No evidence here", problem: "P", reproduce: "R" },
          ],
        },
      },
    }),
    call,
    VOCAB,
  );
  await read(res);
  const puts = seen.filter((s) => s.method === "PUT");
  assert.equal(puts.length, 2);
  // Under Problem, ahead of Reproduce — the same placement bugGuide() uses in the CLI, because a
  // guide filed from either surface has to be the same document.
  const first = puts[0].body.markdown;
  assert.match(
    first,
    /## Problem\n[\s\S]*!\[evidence\]\(https:\/\/passalong\.dev\/v1\/shots\/abc123\)\n\n## Reproduce/,
  );
  // An issue with no evidence is untouched, so a report of eight bugs and one screenshot does not
  // put the screenshot on all eight.
  assert.doesNotMatch(puts[1].body.markdown, /!\[/);
});

test("the tools that write a guide say where a screenshot goes", async () => {
  const { call } = recorder();
  const body = await read(
    await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), call, VOCAB),
  );
  // The failure this guards: an agent reads file_bugs' fields, finds no attachment among them, and
  // concludes the product cannot carry evidence. The tool that can is named where it will be read.
  for (const name of ["file_bugs", "publish_guide"]) {
    const tool = body.result.tools.find((t) => t.name === name);
    assert.match(
      tool.description,
      /attach_screenshot/,
      `${name} should point at attach_screenshot`,
    );
  }
  const issue = body.result.tools.find((t) => t.name === "file_bugs").inputSchema.properties.issues;
  assert.ok(issue.items.properties.evidence, "each issue takes its own evidence");
});

// The one-call path: a client that can pass files hands them to the tool that writes the guide, so
// an agent does not have to call attach_screenshot and then copy a line into the document.
const SHOT_API = {
  "POST /v1/shots": {
    status: 201,
    text: JSON.stringify({ shot: { id: "s1", url: "https://passalong.dev/v1/shots/s1" } }),
  },
  "POST /v1/reports": { status: 201, text: JSON.stringify({ report: { id: "r1" } }) },
  "PUT /v1/guides": { status: 201, text: JSON.stringify({ url: "https://passalong.dev/g/x/y" }) },
  // What the route really answers with: publish_guide's output schema requires the id.
  "PUT /v1/guides/k3mq2xa7": {
    status: 201,
    text: JSON.stringify({ id: "k3mq2xa7", url: "https://passalong.dev/g/k3mq2xa7/y" }),
  },
};

async function withImageHost(fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

const tool = (name, args) =>
  rpc({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name, arguments: args } });

test("publish_guide and file_bugs declare attachments as file inputs, at the top level", async () => {
  const { call } = recorder();
  const body = await read(
    await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), call, VOCAB),
  );
  for (const name of ["publish_guide", "file_bugs"]) {
    const t = body.result.tools.find((x) => x.name === name);
    // Only a top-level field can be a file param, so this is where a client will look.
    assert.deepEqual(t._meta["openai/fileParams"], ["attachments"], name);
    const items = t.inputSchema.properties.attachments.items;
    assert.deepEqual(Object.keys(items.properties).sort(), [
      "download_url",
      "file_id",
      "file_name",
      "mime_type",
    ]);
    assert.deepEqual(items.required.sort(), ["download_url", "file_id"]);
  }
});

test("publish_guide stores its attachments and puts them under Problem", async () => {
  await withImageHost(async () => {
    const { call, seen } = recorder(SHOT_API);
    const markdown =
      "---\ntitle: Save fails\nkind: bug\n---\n\n## Problem\nSave does nothing.\n\n## Reproduce\n1. Save\n";
    const body = await read(
      await handleMcp(
        tool("publish_guide", { id: "k3mq2xa7", markdown, attachments: [FILE] }),
        call,
        VOCAB,
      ),
    );
    assert.notEqual(body.result.isError, true);
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.path}`),
      ["POST /v1/shots", "PUT /v1/guides/k3mq2xa7"],
      "the file is stored before the guide that names it",
    );
    assert.match(
      seen[1].body.markdown,
      /## Problem\nSave does nothing\.\n\n!\[shot\.png\]\(https:\/\/passalong\.dev\/v1\/shots\/s1\)\n\n## Reproduce/,
    );
  });
});

test("publish_guide writes nothing when an attachment cannot be fetched", async () => {
  const { call, seen } = recorder(SHOT_API);
  const body = await read(
    await handleMcp(
      tool("publish_guide", {
        markdown: "---\ntitle: x\n---\n\nbody\n",
        attachments: [{ ...FILE, download_url: "https://127.0.0.1/a.png" }],
      }),
      call,
      VOCAB,
    ),
  );
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /attachment 0 \(shot\.png\): .*public https URL/);
  assert.deepEqual(seen, []);
});

test("file_bugs puts each attachment on the issue that names it", async () => {
  await withImageHost(async () => {
    const { call, seen } = recorder(SHOT_API);
    await read(
      await handleMcp(
        tool("file_bugs", {
          attachments: [FILE],
          issues: [
            { title: "No shot", problem: "P1", reproduce: "R1" },
            { title: "Has shot", problem: "P2", reproduce: "R2", attachments: [0] },
          ],
        }),
        call,
        VOCAB,
      ),
    );
    const puts = seen.filter((s) => s.method === "PUT");
    assert.doesNotMatch(puts[0].body.markdown, /!\[/);
    assert.match(puts[1].body.markdown, /## Problem\nP2\n\n!\[shot\.png\]\(.*s1\)\n\n## Reproduce/);
  });
});

test("file_bugs with one issue gives it every attachment", async () => {
  await withImageHost(async () => {
    const { call, seen } = recorder(SHOT_API);
    await read(
      await handleMcp(
        tool("file_bugs", {
          attachments: [FILE],
          issues: [{ title: "Only", problem: "P", reproduce: "R" }],
        }),
        call,
        VOCAB,
      ),
    );
    const put = seen.find((s) => s.method === "PUT");
    assert.match(put.body.markdown, /!\[shot\.png\]/);
  });
});

test("file_bugs refuses to guess whose attachment it is, before writing anything", async () => {
  const { call, seen } = recorder(SHOT_API);
  const two = [
    { title: "A", problem: "P", reproduce: "R" },
    { title: "B", problem: "P", reproduce: "R" },
  ];
  let body = await read(
    await handleMcp(tool("file_bugs", { attachments: [FILE], issues: two }), call, VOCAB),
  );
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /attachment 0 belongs to no issue/);

  body = await read(
    await handleMcp(
      tool("file_bugs", {
        attachments: [FILE],
        issues: [{ ...two[0], attachments: [0, 3] }, two[1]],
      }),
      call,
      VOCAB,
    ),
  );
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /names attachment 3, but only 1 were passed/);
  assert.deepEqual(seen, [], "no shot stored and no report opened");
});

test("publish_guide carries a parent beside the document, and only when one was given", async () => {
  const { call, seen } = recorder({
    "PUT /v1/guides/k3mq2xa7": { status: 201, text: JSON.stringify({ url: "https://x/g/a/b" }) },
  });
  const publish = (args) =>
    handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "publish_guide",
          arguments: { id: "k3mq2xa7", markdown: "---\n---\n", ...args },
        },
      }),
      call,
      VOCAB,
    );
  await read(await publish({ parent: "zx9y8w42" }));
  await read(await publish({}));
  // The route writes `parent` into the frontmatter, so a model records lineage without editing YAML.
  assert.deepEqual(seen[0].body, { markdown: "---\n---\n", parent: "zx9y8w42" });
  // No parent means the body a publish has always sent — nothing new rides along by accident.
  assert.deepEqual(seen[1].body, { markdown: "---\n---\n" });
});

test("publish_guide mints an id when none is given, and uses the one it was handed", async () => {
  const { call, seen } = recorder();
  const publish = (args) =>
    handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "publish_guide", arguments: { markdown: "---\n---\n", ...args } },
      }),
      call,
      VOCAB,
    );
  await read(await publish({}));
  await read(await publish({ id: "k3mq2xa7" }));
  // Minted in the CLI's own alphabet, so nothing downstream can tell where an id came from. The
  // model no longer names guides, which is how one bug became khaimeteam4, 5 and 6.
  assert.match(seen[0].path, /^\/v1\/guides\/[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  // An update names the guide it updates; minting there would publish a copy instead.
  assert.equal(seen[1].path, "/v1/guides/k3mq2xa7");
});

// An agent that departs from a guide and writes nothing back is the loop this product exists to
// close. Being able to set `parent` is not enough; it has to be told when, where it will read it.
test("agents are told when a follow-up is a guide, at connect and with the guide itself", async () => {
  const { call } = recorder({
    "GET /v1/guides/k3mq2xa7": {
      status: 200,
      text: "---\nid: k3mq2xa7\ntitle: T\n---\n\n## Steps\n1. x\n",
    },
    "GET /v1/guides/bugbug12": {
      status: 200,
      text: "---\nid: bugbug12\nkind: bug\n---\n\n## Problem\nx\n",
    },
  });
  const init = await read(
    await handleMcp(
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: "t", version: "0" },
        },
      }),
      call,
      VOCAB,
    ),
  );
  assert.match(init.result.instructions, /FOLLOW-UP IS MORE CONTEXT FOR A GUIDE/);
  assert.match(init.result.instructions, /publish_guide `parent`/);
  assert.match(init.result.instructions, /get_guide returns a guide's follow-ups after it/);
  // Not the old rule: context is worth adding whether or not the guide worked as written.
  assert.doesNotMatch(init.result.instructions, /worked exactly as written|departed from/);

  const get = async (id) =>
    (
      await read(
        await handleMcp(
          rpc({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "get_guide", arguments: { id } },
          }),
          call,
          VOCAB,
        ),
      )
    ).result.content;
  const transfer = await get("k3mq2xa7");
  // The document is its own block, byte for byte; the note is a second one. An agent that writes
  // the guide back out cannot carry the note into it, and nothing lands in front of `---`.
  assert.equal(transfer[0].text, "---\nid: k3mq2xa7\ntitle: T\n---\n\n## Steps\n1. x\n");
  assert.match(transfer[1].text, /publish_guide parent=k3mq2xa7/);
  assert.match(transfer[1].text, /more context for this guide/);
  assert.match((await get("bugbug12"))[1].text, /once this is fixed[\s\S]*parent=bugbug12/);
});

const getGuide = async (call, id) =>
  (
    await read(
      await handleMcp(
        rpc({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "get_guide", arguments: { id } },
        }),
        call,
        VOCAB,
      ),
    )
  ).result.content;

const DOC = "---\nid: k3mq2xa7\ntitle: T\n---\n\n## Steps\n1. x\n";

test("get_guide hands over a guide's follow-ups after it, oldest first, with their bodies", async () => {
  const { call, seen } = recorder({
    "GET /v1/guides/k3mq2xa7": { status: 200, text: DOC },
    "GET /v1/guides/k3mq2xa7/children": {
      status: 200,
      text: JSON.stringify({
        guides: [
          { id: "aaaa2222", title: "Postgres 16 needs a flag", markdown: "first body\n" },
          { id: "bbbb3333", title: "What changed since", markdown: "second body" },
        ],
      }),
    },
  });
  const content = await getGuide(call, "k3mq2xa7");
  // The document block is still exactly the document.
  assert.equal(content[0].text, DOC);
  assert.equal(
    content[1].text,
    "FOLLOW-UPS — more context added to this guide, oldest first. Read them before acting; " +
      "where one contradicts the original, the follow-up is newer.\n\n" +
      "--- follow-up aaaa2222: Postgres 16 needs a flag ---\nfirst body\n\n" +
      "--- follow-up bbbb3333: What changed since ---\nsecond body",
  );
  assert.match(content[2].text, /^<!-- passalong:/);
  // Asked for with content, which is the form that records no pull on the children.
  assert.ok(seen.some((s) => s.path === "/v1/guides/k3mq2xa7/children?markdown=1"));
});

test("no follow-ups, or a failure fetching them, returns the guide as it always was", async () => {
  for (const children of [
    { status: 200, text: JSON.stringify({ guides: [] }) },
    { status: 500, text: "boom" },
    { status: 200, text: "not json" },
  ]) {
    const { call } = recorder({
      "GET /v1/guides/k3mq2xa7": { status: 200, text: DOC },
      "GET /v1/guides/k3mq2xa7/children": children,
    });
    const content = await getGuide(call, "k3mq2xa7");
    assert.equal(content.length, 2);
    assert.equal(content[0].text, DOC);
    assert.match(content[1].text, /^<!-- passalong:/);
  }
});

const callTool = (name, args) =>
  rpc({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name, arguments: args } });

test("take works any guide by id, and ends with what to call next", async () => {
  const answer = {
    guide: { id: "k3mq2xa7", kind: "transfer", markdown: "---\ntitle: t\n---\n\n## Steps\n1. x\n" },
    next: [{ tool: "hand_in", when: "you ran its Verification here", why: "its author hears" }],
  };
  const { call, seen } = recorder({
    "POST /v1/take": { status: 200, text: JSON.stringify(answer) },
  });
  const body = await read(
    await handleMcp(callTool("take", { agent: "chat-7f3k2m9q", id: "k3mq2xa7" }), call, VOCAB),
  );
  assert.deepEqual(seen[0].body, { agent: "chat-7f3k2m9q", id: "k3mq2xa7", repo: "", any: false });
  const said = body.result.content[0].text;
  assert.match(said, /## Steps/);
  assert.match(said, /next:\n\s+hand_in k3mq2xa7 — when you ran its Verification here/);
});

test("the old task tools are the new verbs under their old names", async () => {
  const { call, seen } = recorder({
    "POST /v1/take": {
      status: 200,
      text: JSON.stringify({ guide: null, next: [], say: "Nothing here. Stop." }),
    },
  });
  const body = await read(
    await handleMcp(callTool("next_task", { agent: "chat-7f3k2m9q" }), call, VOCAB),
  );
  assert.equal(seen[0].path, "/v1/take");
  assert.match(body.result.content[0].text, /Nothing here\. Stop\./);
  const { call: c2, seen: s2 } = recorder();
  await handleMcp(
    callTool("task_progress", { id: "t1", agent: "chat-7f3k2m9q", note: "half" }),
    c2,
    VOCAB,
  );
  assert.equal(s2[0].path, "/v1/guides/t1/progress");
  const { call: c3, seen: s3 } = recorder();
  await handleMcp(
    callTool("finish_task", { id: "t1", agent: "chat-7f3k2m9q", report: "r1" }),
    c3,
    VOCAB,
  );
  assert.equal(s3[0].path, "/v1/guides/t1/hand_in");
});

test("a refusal to stop says to stop", async () => {
  const { call } = recorder({
    "PUT /v1/guides/t1/progress": {
      status: 409,
      text: JSON.stringify({
        message: "this agent does not hold that",
        next: [],
        say: "You no longer hold this. Stop.",
      }),
    },
  });
  const body = await read(
    await handleMcp(callTool("progress", { id: "t1", agent: "chat-7f3k2m9q" }), call, VOCAB),
  );
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /Stop\./);
});

// ---- the work board as an MCP App (docs/V2.md §11) --------------------------------------------------

test("work is drawn as an app where the host can, and names the page it is drawn with", async () => {
  const { call } = recorder();
  const body = await read(
    await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), call, VOCAB),
  );
  const work = body.result.tools.find((t) => t.name === "work");
  assert.equal(work._meta.ui.resourceUri, "ui://passalong/work");
  // Nothing the app can press is hidden from the model: the review gate is not in the app.
  for (const t of body.result.tools) {
    const v = t._meta?.ui?.visibility;
    assert.ok(!v || v.includes("model"), `${t.name} is callable by the model`);
    assert.doesNotMatch(t.name, /approve|reject|send_back|close/, "no gate tool over MCP");
  }
});

test("the app page is served as an MCP App, speaks the host protocol, and loads nothing from outside", async () => {
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
  assert.match(page.text, /ui\/notifications\/tool-result/);
  assert.match(page.text, /ui\/open-link/);
  assert.doesNotMatch(page.text, /<script[^>]+src=|<link[^>]+href="http/, "self-contained");
});

test("work gathers what needs you, who is on what and what is open into one board", async () => {
  const task = (id, state, mine = true, extra = {}) => ({
    id,
    title: `task ${id}`,
    state,
    mine,
    url: `https://passalong.dev/g/${id}/k`,
    claim: null,
    ...extra,
  });
  const { call } = recorder({
    "GET /v1/tasks": {
      status: 200,
      text: JSON.stringify({
        tasks: [
          task("t1", "review"),
          task("t2", "ready"),
          task("t3", "ready"),
          task("t4", "draft"),
          task("t5", "done"),
        ],
      }),
    },
    "GET /v1/working": {
      status: 200,
      text: JSON.stringify({
        working: [
          {
            id: "h1",
            title: "Stream the PDF",
            kind: "transfer",
            state: "claimed",
            by: { name: "Ada", handle: "ada", you: false },
            note: "halfway",
            url: "u",
          },
        ],
      }),
    },
    "GET /v1/handed_in": {
      status: 200,
      text: JSON.stringify({
        handed_in: [
          {
            id: "h2",
            title: "CSV export",
            place: "o/r",
            by: { name: "Bami", handle: "bami" },
            note: "works",
            url: "u2",
          },
        ],
      }),
    },
    "GET /v1/inbox": {
      status: 200,
      text: JSON.stringify({ guides: [{ id: "g1", title: "Fix the header", url: "u3" }] }),
    },
  });
  const body = await read(await handleMcp(callTool("work", {}), call, VOCAB));
  const board = body.result.structuredContent;
  assert.deepEqual(board.counts, { needs: 3, working: 1, open: 3, done: 1 });
  assert.deepEqual(
    board.needs.map((n) => n.id),
    ["t1", "h2", "g1"],
  );
  assert.equal(board.hub, "https://passalong.dev/hub");
  assert.match(
    body.result.content[0].text,
    /3 need you/,
    "a text answer for hosts that draw no apps",
  );
});
