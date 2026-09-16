// What connecting each app takes, decided here rather than asked of the person connecting it.
//
// Settings used to offer one form for every app: a name, a callback address, and a checkbox asking
// whether the app "keeps a secret". Every field was a question the person could not answer, and the
// checkbox had a wrong answer that looked reasonable — a ChatGPT connector made with a secret is
// refused at every sign-in. Each app's requirements are known, so they are stated, and only the
// steps that are the person's are left for them.
//
// Pure data and pure functions, no imports: test/settings.test.mjs loads this file directly.

export const MCP_URL = "https://passalong.dev/v1/mcp";
/** Exact-matched at authorize. /connect shows the same one; test/connect-claude.test.mjs pins both. */
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

/** "none": nothing to do. "done": decided for you. "you": a step that is yours. */
export type Need = "none" | "done" | "you";

export interface Requirement {
  label: string;
  value: string;
  need: Need;
}

export interface Step {
  /** Plain text. `{path}` is replaced with `path`, shown as a menu path. */
  text: string;
  path?: string;
  copy?: string;
  /** A form in the app, field by field. `null` means leave it empty. */
  fields?: [string, string | null][];
}

export interface ConnectApp {
  id: string;
  group: "Assistants" | "On your machine" | "Anything else";
  /** Which mark AppMark.vue draws. Each vendor's own logo; a plug and braces for the two that have none. */
  mark: "chatgpt" | "claude" | "claude-code" | "cursor" | "mcp" | "script";
  name: string;
  how: string;
  method: string;
  lede: string;
  /** "oauth" apps sign themselves in and can be followed live; the others use a token. */
  kind: "oauth" | "local" | "token";
  requirements: Requirement[];
  steps: Step[];
  notes: { tone: "warn" | "info"; label: string; text: string }[];
  /**
   * For an app that asks for a client ID instead of taking the address. `callback` is filled in
   * when it is known; empty means the app's setup screen has it.
   */
  manual?: { callback: string };
}

export const APPS: ConnectApp[] = [
  {
    id: "chatgpt",
    group: "Assistants",
    mark: "chatgpt",
    name: "ChatGPT",
    how: "Address and a client ID",
    method: "OAuth · client ID",
    lede: "ChatGPT asks for a client ID, so you make one here and paste it back. It needs no secret.",
    kind: "oauth",
    requirements: [
      { label: "Client ID", value: "Make one below", need: "you" },
      { label: "Secret", value: "Not needed", need: "none" },
      { label: "Callback", value: "From ChatGPT's form", need: "you" },
    ],
    steps: [
      {
        text: "In ChatGPT, open {path} and start a custom connector.",
        path: "Settings → Connectors",
      },
      {
        text: "Paste the server address, and choose OAuth when it asks how to sign in.",
        copy: MCP_URL,
      },
      {
        text: "Copy the callback address ChatGPT shows, then make a client ID for it below. Leave the secret off.",
      },
      {
        text: "Back in ChatGPT, fill in only these:",
        fields: [
          ["Server URL", "the address above"],
          ["Authentication", "OAuth"],
          ["Client ID", "the one made below"],
          ["Client secret", null],
        ],
      },
      { text: "Save, and approve Passalong in the window that opens." },
    ],
    notes: [
      {
        tone: "warn",
        label: "Watch for",
        text: 'Leave the client secret empty, and make the client ID without a secret. A connector made with one is refused with "secret missing" at every sign-in.',
      },
      {
        tone: "info",
        label: "Screenshots",
        text: "Attach them in ChatGPT on the web. The mobile apps send a file Passalong can't download.",
      },
    ],
    manual: { callback: "" },
  },
  {
    id: "claude",
    group: "Assistants",
    mark: "claude",
    name: "Claude",
    how: "Paste an address",
    method: "Signs itself in",
    lede: "Claude signs itself in. Paste one address, approve it, and allow one domain so screenshots work.",
    kind: "oauth",
    requirements: [
      { label: "Client ID", value: "Not needed", need: "none" },
      { label: "Secret", value: "Not needed", need: "none" },
      { label: "Network", value: "Allow passalong.dev", need: "you" },
    ],
    steps: [
      { text: "In Claude, open {path} and add a custom connector.", path: "Settings → Connectors" },
      { text: "Paste the server address and leave the advanced fields empty.", copy: MCP_URL },
      { text: "Approve Passalong in the window that opens." },
      {
        text: "For screenshots, allow this domain in Claude's code execution network settings.",
        copy: "passalong.dev",
      },
    ],
    notes: [
      {
        tone: "info",
        label: "Screenshots",
        text: "Claude sends images from its sandbox to a one-time upload link, which needs the domain allowed.",
      },
    ],
    manual: { callback: CLAUDE_CALLBACK },
  },
  {
    id: "claude-code",
    group: "On your machine",
    mark: "claude-code",
    name: "Claude Code",
    how: "Three commands",
    method: "Local server",
    lede: "Runs Passalong on your machine, so it knows which repo you're in and works offline.",
    kind: "local",
    requirements: [
      { label: "Install", value: "npm", need: "done" },
      { label: "Sign in", value: "Once, in the terminal", need: "you" },
      { label: "Screenshots", value: "File paths", need: "none" },
    ],
    steps: [
      { text: "Install the command line tool.", copy: "npm i -g passalong" },
      {
        text: "Sign in. This machine gets its own token, listed under API tokens.",
        copy: "passalong login",
      },
      { text: "Register the skill and MCP server with Claude Code.", copy: "passalong setup" },
    ],
    notes: [],
  },
  {
    id: "cursor",
    group: "On your machine",
    mark: "cursor",
    name: "Cursor",
    how: "Install, then one file",
    method: "Local server",
    lede: "The same local server, added to Cursor's MCP settings.",
    kind: "local",
    requirements: [
      { label: "Install", value: "npm", need: "done" },
      { label: "Sign in", value: "Once, in the terminal", need: "you" },
      { label: "Config", value: "Written for you", need: "done" },
    ],
    steps: [
      { text: "Install and sign in.", copy: "npm i -g passalong && passalong login" },
      {
        text: "Add this to {path}.",
        path: ".cursor/mcp.json",
        copy: '{\n  "mcpServers": {\n    "passalong": { "command": "passalong", "args": ["mcp"] }\n  }\n}',
      },
      { text: "Reload Cursor." },
    ],
    notes: [],
  },
  {
    id: "other",
    group: "Anything else",
    mark: "mcp",
    name: "Another MCP app",
    how: "Address, or a client ID",
    method: "Signs itself in",
    lede: "Most apps take the address and sign themselves in. If yours asks for a client ID instead, make one below.",
    kind: "oauth",
    requirements: [
      { label: "Client ID", value: "Only if it asks", need: "you" },
      { label: "Secret", value: "Only if it insists", need: "you" },
      { label: "Callback", value: "From the app", need: "you" },
    ],
    steps: [
      {
        text: "Add a custom MCP connector in the app, paste the address, and choose OAuth if it asks.",
        copy: MCP_URL,
      },
      { text: "Approve Passalong in the window that opens." },
    ],
    notes: [],
    manual: { callback: "" },
  },
  {
    id: "script",
    group: "Anything else",
    mark: "script",
    name: "Script or API",
    how: "A token",
    method: "Token",
    lede: "For your own code. Make a token under API tokens, then call the API with it.",
    kind: "token",
    requirements: [
      { label: "Token", value: "Named, revocable", need: "done" },
      { label: "Reach", value: "Your whole account", need: "you" },
      { label: "Docs", value: "/v1/openapi.json", need: "none" },
    ],
    steps: [
      { text: "Make a token under {path}, named after where it will live.", path: "API tokens" },
      {
        text: "Call the API with it.",
        copy: 'curl -H "authorization: Bearer $TOKEN" \\\n  https://passalong.dev/v1/inbox',
      },
    ],
    notes: [],
  },
];

export const appById = (id: string) => APPS.find((a) => a.id === id) ?? APPS[0]!;

/** The mark for a listed connector, from its host. A vendor's logo where we know it, a plug otherwise. */
export const markForHost = (host: string) => appById(appForHost(host)).mark;

/** The app a listed connector most likely is, from where it sends people back to. */
export function appForHost(host: string): string {
  if (/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/.test(host)) return "chatgpt";
  if (/(^|\.)claude\.ai$/.test(host)) return "claude";
  return "other";
}

/** A row of Settings → Connected apps, as /v1/oauth/clients sends it. */
export interface ConnectorRow {
  id: string;
  name: string;
  host: string;
  registered: "manual" | "dynamic";
  created: string;
  approved: string | null;
  last_used: string | null;
  used?: string | null;
  confidential: number;
  grants: number;
  last_error?: string;
  last_error_at?: string;
}

/** The token endpoint's reasons, as a person reads them. Mirrors `invalidClient` in apps/api. */
const REFUSALS: Record<string, string> = {
  secret_missing:
    "Its client ID was made with a secret, and the app never sends one. Make a new client ID without a secret.",
  secret_mismatch:
    "The secret the app sends does not match its client ID. Paste the right one into the app, or make a client ID without a secret.",
};

export interface ConnectorState {
  tone: "ok" | "bad" | "idle";
  label: string;
  detail: string;
}

export function connectorState(c: ConnectorRow): ConnectorState {
  const refused = c.last_error ? REFUSALS[c.last_error] : undefined;
  if (refused) return { tone: "bad", label: "Sign-in refused", detail: refused };
  if (c.used) return { tone: "ok", label: "Connected", detail: "" };
  if (c.grants > 0) return { tone: "ok", label: "Signed in", detail: "Hasn't used a tool yet." };
  if (c.approved) {
    return { tone: "idle", label: "Approved", detail: "Waiting for the app to finish signing in." };
  }
  return { tone: "idle", label: "Not approved", detail: "" };
}

/**
 * How far a connection opened since `since` has got: 0 nothing yet, 1 approved, 2 signed in,
 * 3 used a tool. `refused` carries the reason when the app was turned away on the way.
 */
export function handshake(rows: ConnectorRow[], since: string) {
  const recent = rows
    .filter((r) => (r.approved ?? "") >= since || (r.last_error_at ?? "") >= since)
    .sort((a, b) => (b.approved ?? b.created).localeCompare(a.approved ?? a.created));
  const match = recent[0] ?? null;
  if (!match) return { match, reached: 0, refused: "" };
  const reached = match.used ? 3 : match.grants > 0 ? 2 : match.approved ? 1 : 0;
  const refused = match.last_error ? (REFUSALS[match.last_error] ?? "") : "";
  return { match, reached, refused };
}

export interface ChannelRow {
  id: string;
  name: string;
  host: string;
  failures: number;
  last_error: string;
}

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
  members: string[];
}

export interface AttentionItem {
  tone: "bad" | "warn";
  text: string;
  where: string;
  action: string;
  /** The section to go to. */
  anchor: string;
  /** For a team item, which of its tabs to open. */
  team?: { slug: string; tab: "groups" | "channels" };
  /** For a connector item, which app's steps to open. */
  app?: string;
}

/** Everything on Settings that is broken or quietly not working, most urgent first. */
export function attention(input: {
  hasPassword: boolean;
  /** Your own sync ceiling, as /v1/me sends it. At the limit, nothing new can be sent. */
  plan?: { sync: string; guides: number; limit: number };
  connectors: ConnectorRow[];
  teams: { slug: string; name: string; channels: ChannelRow[]; groups: GroupRow[] }[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  // First, because it stops the one thing Passalong is for: sending a guide.
  const plan = input.plan;
  if (plan?.sync === "none") {
    items.push({
      tone: "bad",
      text: "New guides can't be sent until you're on a plan.",
      where: "Your plan",
      action: "See your plan",
      anchor: "plan",
    });
  } else if (plan?.sync === "free" && plan.limit > 0 && plan.guides >= plan.limit) {
    items.push({
      tone: "bad",
      text: `You've used all ${plan.limit} guides on the free plan, so new guides can't be sent. Archiving a finished guide frees a space.`,
      where: "Your plan",
      action: "See your plan",
      anchor: "plan",
    });
  }
  for (const c of input.connectors) {
    const state = connectorState(c);
    if (state.tone !== "bad") continue;
    items.push({
      tone: "bad",
      text: `${c.name || c.host || "A connected app"} can't sign in. ${state.detail}`,
      where: "Connected apps",
      action: "Reconnect",
      anchor: "apps",
      app: appForHost(c.host),
    });
  }
  for (const t of input.teams) {
    for (const ch of t.channels) {
      if (!ch.failures) continue;
      items.push({
        tone: "bad",
        text: `The ${ch.name || ch.host} channel is failing${ch.last_error ? `: ${ch.last_error}` : ""}.`,
        where: `${t.name} · Channels`,
        action: "Fix channel",
        anchor: `team-${t.slug}`,
        team: { slug: t.slug, tab: "channels" },
      });
    }
    for (const g of t.groups) {
      if (g.members.length) continue;
      items.push({
        tone: "warn",
        text: `Group ${g.name || g.slug} has nobody in it, so guides sent there reach no one.`,
        where: `${t.name} · Groups`,
        action: "Choose people",
        anchor: `team-${t.slug}`,
        team: { slug: t.slug, tab: "groups" },
      });
    }
  }
  if (!input.hasPassword) {
    items.push({
      tone: "warn",
      text: "You can only sign in on this browser.",
      where: "Sign-in",
      action: "Add a password",
      anchor: "signin",
    });
  }
  return items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1));
}
