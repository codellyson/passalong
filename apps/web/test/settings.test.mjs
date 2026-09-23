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

test("no assistant is ever told to give its connector a secret", () => {
  // The failure this guards: a ChatGPT connector made with a secret, refused at every sign-in with
  // "secret missing", because the form made the secret look like a reasonable thing to add.
  for (const id of ["chatgpt", "claude"]) {
    const app = APPS.find((a) => a.id === id);
    assert.equal(app.kind, "oauth");
    const secret = app.requirements.find((r) => r.label === "Secret");
    assert.equal(secret?.need, "none", `${id} must not need a secret`);
  }
  // ChatGPT asks for a client ID, so its steps make one here rather than leaving the field empty.
  const chatgpt = APPS.find((a) => a.id === "chatgpt");
  assert.equal(chatgpt.requirements.find((r) => r.label === "Client ID").need, "you");
  assert.ok(chatgpt.manual, "ChatGPT needs the client ID form");
  assert.equal(chatgpt.manual.callback, "", "its callback comes from ChatGPT's own form");
  const fields = chatgpt.steps.flatMap((s) => s.fields ?? []);
  assert.deepEqual(
    fields.filter(([, v]) => v === null).map(([k]) => k),
    ["Client secret"],
    "only the secret is left empty",
  );
  assert.match(
    fields.find(([k]) => k === "Client ID")[1],
    /below/,
    "the client ID field points at the one made here",
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
  assert.match(connectorState(row({ last_error: "secret_missing" })).detail, /without a secret/);
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

// The screenshot that found this: 25 of 25 guides used, a banner saying nothing new can be sent,
// and a Settings page with nothing under Needs you.
test("a full free plan is the first thing Needs you says", () => {
  const full = attention({
    hasPassword: true,
    plan: { sync: "free", guides: 25, limit: 25 },
    connectors: [row({ last_error: "secret_missing" })],
    teams: [],
  });
  assert.equal(full[0].anchor, "plan");
  assert.match(full[0].text, /all 25 guides/);
  assert.equal(
    attention({
      hasPassword: true,
      plan: { sync: "free", guides: 24, limit: 25 },
      connectors: [],
      teams: [],
    }).length,
    0,
    "room left is not a problem",
  );
  assert.equal(
    attention({
      hasPassword: true,
      plan: { sync: "unlimited", guides: 900, limit: 0 },
      connectors: [],
      teams: [],
    }).length,
    0,
  );
  assert.match(
    attention({
      hasPassword: true,
      plan: { sync: "none", guides: 3, limit: 0 },
      connectors: [],
      teams: [],
    })[0].text,
    /on a plan/,
  );
});

test("a connector's host picks which app's steps a Reconnect opens", () => {
  assert.equal(appForHost("chatgpt.com"), "chatgpt");
  assert.equal(appForHost("claude.ai"), "claude");
  assert.equal(appForHost("notchatgpt.com.evil.test"), "other");
});

// ---- running the product (apps/web/app/pages/admin.vue) ----------------------------------------
//
// Read rather than rendered: there is no component runner here, and what matters is where this
// lives and who reaches it — not in a customer's Settings, and not shown to a customer at all.

const { readFileSync } = await import("node:fs");
const settings = readFileSync(new URL("../app/pages/hub/settings.vue", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/pages/admin.vue", import.meta.url), "utf8");
const menu = readFileSync(
  new URL("../app/components/hub/AccountMenu.vue", import.meta.url),
  "utf8",
);
const admin = readFileSync(new URL("../app/components/hub/Admin.vue", import.meta.url), "utf8");

test("running the product is its own page, and no part of a customer's settings", () => {
  // Settings is what somebody keeps about themselves. Comping another account is the business
  // being run, and beside a team's own owner/member roles it read as one more of those.
  assert.doesNotMatch(settings, /HubAdmin|Operator|isSuper/);
  assert.match(page, /const isSuper = computed\(\(\) => data\.value\.me\?\.role === "super"\)/);
  assert.match(page, /<HubAdmin v-else-if="isSuper" \/>/);
});

test("a customer who finds the address is sent back to their work, not refused", () => {
  assert.match(page, /navigateTo\("\/hub"\)/);
  // Only once the account has loaded: an empty `me` on first paint is not "not a super".
  assert.match(page, /!pending\.value && data\.value\.me && !isSuper\.value/);
  // `loading` is an object of per-endpoint flags, so `!loading.value` is never true: an earlier
  // version of this line meant the redirect never ran and a customer sat on an empty Admin page.
  assert.match(page, /const pending = computed\(\(\) => loading\.value\.me\)/);
  assert.match(page, /noindex: true/);
});

test("only a super is shown the way there", () => {
  assert.match(menu, /v-if="data\.me\?\.role === 'super'"/);
  assert.match(menu, /to="\/admin"/);
});

test("taking a plan back and removing a super both ask on the row first", () => {
  for (const name of ["taking", "dropping"]) {
    assert.match(admin, new RegExp(`const ${name} = ref<string \\| null>\\(null\\)`));
  }
  assert.match(admin, /Take it back\?/);
  assert.match(admin, /Remove\?/);
});

test("what the server can never show again is marked where it is shown", () => {
  assert.match(admin, /Copy both now\. Neither is shown again\./);
});
