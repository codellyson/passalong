// Settings decides what each app needs so the person connecting it does not have to, and gathers
// what is broken into "Needs you". Both are pure, in utils/connect-apps.ts, and pinned here.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPS,
  appForHost,
  attention,
  CLAUDE_CALLBACK,
  connectorState,
  handshake,
} from "../app/utils/connect-apps.ts";

const row = (over = {}) => ({
  id: "c1",
  name: "ChatGPT",
  host: "chatgpt.com",
  registered: "manual",
  created: "2026-09-15T15:00:00Z",
  approved: "2026-09-15T15:00:00Z",
  last_used: null,
  used: null,
  confidential: 0,
  grants: 0,
  last_error: "",
  last_error_at: "",
  ...over,
});

test("the assistants that sign themselves in are never asked for a client ID or secret", () => {
  // The failure this guards: a ChatGPT connector made by hand with a secret, refused at every
  // sign-in, because the form made the secret look like a reasonable thing to add.
  for (const id of ["chatgpt", "claude"]) {
    const app = APPS.find((a) => a.id === id);
    assert.equal(app.kind, "oauth");
    for (const label of ["Client ID", "Secret"]) {
      const req = app.requirements.find((r) => r.label === label);
      assert.equal(req?.need, "none", `${id} must not need a ${label}`);
    }
  }
  const chatgpt = APPS.find((a) => a.id === "chatgpt");
  const fields = chatgpt.steps.flatMap((s) => s.fields ?? []);
  assert.deepEqual(
    fields.filter(([, v]) => v === null).map(([k]) => k),
    ["Client ID", "Client secret"],
    "ChatGPT's steps say to leave both empty",
  );
});

test("Claude's manual callback is filled in, and every app has steps", () => {
  assert.equal(APPS.find((a) => a.id === "claude").manual.callback, CLAUDE_CALLBACK);
  assert.equal(
    APPS.find((a) => a.id === "other").manual.callback,
    "",
    "an unknown app supplies its own",
  );
  const ids = new Set();
  for (const a of APPS) {
    assert.ok(!ids.has(a.id), `duplicate app id ${a.id}`);
    ids.add(a.id);
    assert.ok(a.steps.length, `${a.name} needs steps`);
    for (const s of a.steps) {
      if (s.text.includes("{path}")) assert.ok(s.path, `${a.name}: a {path} step needs a path`);
    }
  }
});

test("a connector's state says why it is not working, in order of what matters", () => {
  assert.equal(connectorState(row({ last_error: "secret_missing" })).tone, "bad");
  assert.match(connectorState(row({ last_error: "secret_missing" })).detail, /without a client ID/);
  assert.equal(connectorState(row({ used: "2026-09-15T16:00:00Z", grants: 1 })).label, "Connected");
  assert.equal(connectorState(row({ grants: 1 })).label, "Signed in");
  assert.equal(connectorState(row()).label, "Approved");
  assert.equal(connectorState(row({ approved: null })).label, "Not approved");
  // An error code the page does not know is not shown as a failure it cannot explain.
  assert.notEqual(connectorState(row({ last_error: "something_new" })).tone, "bad");
});

test("the connection being set up is followed from approval to its first tool call", () => {
  const since = "2026-09-15T16:00:00Z";
  const old = row({
    id: "old",
    approved: "2026-09-01T00:00:00Z",
    used: "2026-09-02T00:00:00Z",
    grants: 1,
  });
  assert.equal(handshake([old], since).reached, 0, "an older connector is not this connection");
  const fresh = row({ id: "new", approved: "2026-09-15T16:01:00Z" });
  assert.equal(handshake([old, fresh], since).match.id, "new");
  assert.equal(handshake([fresh], since).reached, 1);
  assert.equal(handshake([{ ...fresh, grants: 1 }], since).reached, 2);
  assert.equal(
    handshake([{ ...fresh, grants: 1, used: "2026-09-15T16:02:00Z" }], since).reached,
    3,
  );
  const refused = { ...old, last_error: "secret_missing", last_error_at: "2026-09-15T16:01:42Z" };
  assert.match(handshake([refused], since).refused, /secret/);
});

test("Needs you lists what is broken, most urgent first, each with where to fix it", () => {
  const items = attention({
    hasPassword: false,
    connectors: [row({ last_error: "secret_missing" }), row({ id: "ok", used: "x", grants: 1 })],
    teams: [
      {
        slug: "khaime",
        name: "Khaime",
        channels: [
          {
            id: "q",
            name: "QA space",
            host: "chat.googleapis.com",
            failures: 3,
            last_error: "404",
          },
          { id: "r", name: "Releases", host: "hooks.slack.com", failures: 0, last_error: "" },
        ],
        groups: [
          { id: "g1", slug: "design", name: "", members: [] },
          { id: "g2", slug: "frontend", name: "", members: ["tunde"] },
        ],
      },
    ],
  });
  assert.deepEqual(
    items.map((i) => [i.tone, i.action]),
    [
      ["bad", "Reconnect"],
      ["bad", "Fix channel"],
      ["warn", "Choose people"],
      ["warn", "Add a password"],
    ],
  );
  assert.equal(items[0].app, "chatgpt");
  assert.deepEqual(items[1].team, { slug: "khaime", tab: "channels" });
  assert.match(items[2].text, /design/);
  assert.equal(attention({ hasPassword: true, connectors: [], teams: [] }).length, 0);
});

test("a connector's host picks which app's steps a Reconnect opens", () => {
  assert.equal(appForHost("chatgpt.com"), "chatgpt");
  assert.equal(appForHost("claude.ai"), "claude");
  assert.equal(appForHost("notchatgpt.com.evil.test"), "other");
});
