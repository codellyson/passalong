<!-- How to connect an agent: pick how you work, take the fastest way, or follow the steps. -->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { AGENT_TILES, EDITOR_TILES, type Tile } from "~/utils/landing-logos";

usePage({
  title: "Connect Passalong to Claude Code, Codex, Cursor, ChatGPT or Claude",
  description:
    "Pick how you work, then take the fastest way: one command, one click, or one address to paste. Step by step for Claude Code, Codex, ChatGPT and Claude.",
  url: `${APEX}/connect`,
  image: `${APEX}/og.png`,
});

const MCP_URL = "https://passalong.dev/v1/mcp";
const tile = (key: string) => [...AGENT_TILES, ...EDITOR_TILES].find((t) => t.key === key);

// The one-click install links Cursor and VS Code document, pointed at the hosted server, which signs
// the editor in through the browser: nothing to install first.
const CURSOR_LINK = `cursor://anysphere.cursor-deeplink/mcp/install?name=passalong&config=${encodeURIComponent(btoa(JSON.stringify({ url: MCP_URL })))}`;
const VSCODE_LINK = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "passalong", type: "http", url: MCP_URL }))}`;
// Claude's documented install link: opens "Add custom connector" with the name and address filled in.
const CLAUDE_LINK = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Passalong&connectorUrl=${encodeURIComponent(MCP_URL)}`;

type Mode = "terminal" | "editor" | "chat" | "none";
type Code = {
  code: string;
  kind?: "terminal" | "paste" | "file" | "prompt";
  label?: string;
  output?: string;
};
type Step = {
  tag: string;
  title: string;
  text: string;
  link?: { label: string; href: string };
  button?: { label: string; href: string; tile?: Tile };
  code?: Code;
  tip?: string;
  warn?: string;
};
/** The fastest way in, shown above the steps: one command, one click, or one address. */
type Quick = {
  title: string;
  text: string;
  code?: Code;
  button?: Step["button"];
  link?: Step["link"];
};
type Guide = {
  id: string;
  name: string;
  mode: Mode;
  tile?: Tile;
  icon?: "mcp" | "team";
  quick?: Quick;
  steps: Step[];
  check?: string;
  trouble: { q: string; a: string }[];
  more?: string;
};

const NODE: Step = {
  tag: "Check",
  title: "Check you have Node.js",
  text: "Passalong installs with npm, which comes with Node.js. Any v22 or higher is fine.",
  code: { code: "node -v", output: "v22.11.0" },
  tip: "Lower, or nothing at all? Install Node.js, then reopen your terminal.",
  link: { label: "Get Node.js", href: "https://nodejs.org/" },
};
const INSTALL: Step = {
  tag: "Install",
  title: "Install Passalong",
  text: "One command. When your cursor comes back, it's done.",
  code: { code: "npm i -g passalong" },
};
const LOGIN: Step = {
  tag: "Sign in",
  title: "Sign in",
  text: "Your browser opens Passalong. Click approve. You never type a password in the terminal.",
  code: { code: "passalong login" },
};
const HUB: Step = {
  tag: "Account",
  title: "Sign in to Passalong",
  text: "You need a Passalong account. Open your hub, and sign in or create one.",
  link: { label: "Open your hub", href: "/hub" },
};
const EDITOR_SIGN_IN: Step = {
  tag: "Sign in",
  title: "Sign in when it asks",
  text: "The first time it connects, your browser opens Passalong. Sign in, approve, and come back. That's the whole setup.",
};

const GUIDES: Guide[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    mode: "terminal",
    tile: tile("claude"),
    quick: {
      title: "One command does it all",
      text: "Installs Passalong, connects it to Claude Code, then opens your browser to sign in. Needs Node.js 22 or newer.",
      code: { code: "npm i -g passalong && passalong setup && passalong login" },
    },
    steps: [
      NODE,
      INSTALL,
      {
        tag: "Connect",
        title: "Connect it to Claude Code",
        text: "Adds Passalong to Claude Code, plus a skill that saves what a session learned and reminders so no work is forgotten.",
        code: { code: "passalong setup" },
      },
      LOGIN,
      {
        tag: "Check",
        title: "Check it's there",
        text: "Passalong should be in the list.",
        code: { code: "claude mcp list", output: "passalong: passalong mcp - ✓ Connected" },
      },
    ],
    check: "What is on my Passalong board?",
    trouble: [
      {
        q: "passalong isn't in the list",
        a: "Add it by hand: claude mcp add passalong -- passalong mcp. Then start a new session.",
      },
      { q: "It says I'm not signed in", a: "Run passalong login again, then start a new session." },
    ],
    more: "/learn/setup-claude-code",
  },
  {
    id: "codex",
    name: "Codex",
    mode: "terminal",
    tile: tile("openai"),
    quick: {
      title: "One command does it all",
      text: "Installs Passalong, adds it to Codex, then opens your browser to sign in. Needs Node.js 22 or newer.",
      code: {
        code: "npm i -g passalong && codex mcp add passalong -- passalong mcp && passalong login",
      },
    },
    steps: [
      NODE,
      INSTALL,
      {
        tag: "Connect",
        title: "Connect it to Codex",
        text: "Adds Passalong to your Codex settings.",
        code: { code: "codex mcp add passalong -- passalong mcp" },
      },
      LOGIN,
      {
        tag: "Check",
        title: "Check it's there",
        text: "Passalong should be listed as enabled. Start a new Codex session so it picks it up.",
        code: { code: "codex mcp list" },
      },
      {
        tag: "Bonus",
        title: "Make every session check first",
        text: "Codex reads AGENTS.md when a session starts. Add these lines to the one in your project.",
        code: {
          kind: "file",
          label: "AGENTS.md",
          code: "At the start of a session, check Passalong for work you\nare holding. Before ending, hand it in or pass it back,\nand write what you learned into the project's documents.",
        },
      },
    ],
    check: "What is on my Passalong board?",
    trouble: [
      {
        q: "passalong isn't in the list",
        a: "Run the codex mcp add command again, and check which passalong prints a path.",
      },
      {
        q: "Codex doesn't use the tools",
        a: "Start a new session. Tools load when a session starts.",
      },
    ],
    more: "/learn/setup-codex",
  },
  {
    id: "cursor",
    name: "Cursor",
    mode: "editor",
    tile: tile("cursor"),
    quick: {
      title: "One click. Nothing to install.",
      text: "Cursor opens and asks to add Passalong. Say yes, then sign in when your browser opens.",
      button: { label: "Add to Cursor", href: CURSOR_LINK, tile: tile("cursor") },
    },
    steps: [
      {
        tag: "Connect",
        title: "Add it to Cursor",
        text: "Cursor opens and asks to install Passalong. Say yes.",
        button: { label: "Add to Cursor", href: CURSOR_LINK, tile: tile("cursor") },
        tip: "Button didn't open Cursor? Paste the settings above into ~/.cursor/mcp.json.",
        code: {
          kind: "file",
          label: "~/.cursor/mcp.json",
          code: `{\n  "mcpServers": {\n    "passalong": {\n      "url": "${MCP_URL}"\n    }\n  }\n}`,
        },
      },
      EDITOR_SIGN_IN,
      {
        tag: "Check",
        title: "Check it's on",
        text: "In Cursor's settings, under MCP, passalong should show a green dot.",
      },
    ],
    check: "What is on my Passalong board?",
    trouble: [
      {
        q: "Cursor says it needs a login",
        a: "Click the login prompt next to passalong in Cursor's MCP settings, and approve in the browser.",
      },
      {
        q: "Cursor doesn't see the tools",
        a: "Check passalong is switched on in Cursor's MCP settings, then start a new chat.",
      },
    ],
  },
  {
    id: "vscode",
    name: "VS Code",
    mode: "editor",
    tile: tile("vscode"),
    quick: {
      title: "One click. Nothing to install.",
      text: "VS Code opens and asks to install Passalong. Say yes, then sign in when your browser opens.",
      button: { label: "Add to VS Code", href: VSCODE_LINK, tile: tile("vscode") },
    },
    steps: [
      {
        tag: "Connect",
        title: "Add it to VS Code",
        text: "VS Code opens and asks to install Passalong. Say yes.",
        button: { label: "Add to VS Code", href: VSCODE_LINK, tile: tile("vscode") },
        tip: "Button didn't open VS Code? Paste the settings above into .vscode/mcp.json in your project.",
        code: {
          kind: "file",
          label: ".vscode/mcp.json",
          code: `{\n  "servers": {\n    "passalong": {\n      "type": "http",\n      "url": "${MCP_URL}"\n    }\n  }\n}`,
        },
      },
      EDITOR_SIGN_IN,
      {
        tag: "Use",
        title: "Use it from Copilot",
        text: "Open Copilot Chat, switch it to agent mode, and check passalong is ticked in its tools list.",
      },
    ],
    check: "What is on my Passalong board?",
    trouble: [
      {
        q: "Copilot doesn't use the tools",
        a: "Switch Copilot Chat to agent mode, and check passalong is ticked in its tools list.",
      },
    ],
  },
  {
    id: "other",
    name: "Another editor",
    mode: "editor",
    icon: "mcp",
    steps: [
      NODE,
      INSTALL,
      LOGIN,
      {
        tag: "Connect",
        title: "Add it to your editor",
        text: "Windsurf, Zed and most others take a settings file shaped like this. Your editor's docs say where it lives.",
        code: {
          kind: "file",
          label: "MCP settings",
          code: '{\n  "mcpServers": {\n    "passalong": {\n      "command": "passalong",\n      "args": ["mcp"]\n    }\n  }\n}',
        },
        tip: `Does it ask for a server address instead? Paste ${MCP_URL} and choose OAuth if it asks how to sign in.`,
      },
    ],
    check: "What is on my Passalong board?",
    trouble: [
      {
        q: "The editor doesn't see the tools",
        a: "Restart the editor or start a new chat. Most load their tools on start.",
      },
    ],
    more: "/docs/integrations",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    mode: "chat",
    tile: tile("openai"),
    quick: {
      title: "It all starts with one address",
      text: "Copy it, then follow the steps below. ChatGPT needs one extra thing from your hub, a client ID.",
      code: { kind: "paste", label: "Server address", code: MCP_URL },
    },
    steps: [
      HUB,
      {
        tag: "Open",
        title: "Start a connector in ChatGPT",
        text: "In ChatGPT, open Settings, then Connectors, and start a custom connector.",
      },
      {
        tag: "Paste",
        title: "Paste the address",
        text: "Paste this as the server address. When it asks how to sign in, choose OAuth.",
        code: { kind: "paste", label: "Server address", code: MCP_URL },
      },
      {
        tag: "Copy",
        title: "Copy ChatGPT's callback address",
        text: "ChatGPT shows a callback address. Copy it for the next step.",
      },
      {
        tag: "Make",
        title: "Make a client ID in Passalong",
        text: "In your hub's settings, open “Set up a connector manually”, paste the callback address, and make a client ID. Leave the secret off.",
        link: { label: "Open hub settings", href: "/hub/settings" },
      },
      {
        tag: "Finish",
        title: "Finish in ChatGPT",
        text: "Fill in the server address, OAuth and the client ID. Save, then approve Passalong in the window that opens.",
        warn: "Leave the client secret empty. With a secret, every sign-in fails with “secret missing”.",
      },
    ],
    check: "What is on my Passalong board?",
    trouble: [
      {
        q: "Sign-in says “secret missing”",
        a: "Make a new client ID without a secret, and leave ChatGPT's secret field empty.",
      },
      {
        q: "ChatGPT doesn't offer the tools",
        a: "Refresh the connector. ChatGPT can remember an old list of tools.",
      },
      {
        q: "My screenshots don't arrive",
        a: "Attach them in ChatGPT on the web. The phone apps send a file Passalong can't download.",
      },
    ],
    more: "/learn/setup-chatgpt",
  },
  {
    id: "claude",
    name: "Claude",
    mode: "chat",
    tile: tile("claude"),
    quick: {
      title: "One click. Nothing to install.",
      text: "Claude opens with Passalong already filled in. Click Add, then approve Passalong in the window that opens.",
      button: { label: "Add to Claude", href: CLAUDE_LINK, tile: tile("claude") },
    },
    steps: [
      HUB,
      {
        tag: "Add",
        title: "Add Passalong to Claude",
        text: "Claude opens its Add custom connector window with the name and address filled in. Check them and click Add.",
        button: { label: "Add to Claude", href: CLAUDE_LINK, tile: tile("claude") },
        tip: "Button didn't open it? In Claude, go to Customize, then Connectors, add a custom connector and paste the address above. On the Free plan you can add one custom connector.",
        code: { kind: "paste", label: "Server address", code: MCP_URL },
      },
      {
        tag: "Callback",
        title: "Only if it asks for a callback",
        text: "Most setups don't. If yours does, it's Claude's own address:",
        code: {
          kind: "paste",
          label: "Callback address",
          code: "https://claude.ai/api/mcp/auth_callback",
        },
      },
      {
        tag: "Approve",
        title: "Approve Passalong",
        text: "A window opens. Approve Passalong, and you're connected.",
      },
      {
        tag: "Bonus",
        title: "Let screenshots through",
        text: "So Claude can attach pictures to work, allow this domain in Claude's code execution network settings.",
        code: { kind: "paste", label: "Domain to allow", code: "passalong.dev" },
      },
    ],
    check: "What is on my Passalong board?",
    trouble: [
      {
        q: "My screenshots don't arrive",
        a: "Allow passalong.dev in Claude's code execution network settings, then try again.",
      },
      {
        q: "Claude doesn't offer the tools",
        a: "Remove the connector and add it again. Claude can remember an old list of tools.",
      },
    ],
    more: "/learn/setup-claude",
  },
  {
    id: "team",
    name: "Your teammates",
    mode: "none",
    icon: "team",
    steps: [
      {
        tag: "Join",
        title: "Open your invite",
        text: "Someone on your team sends an invite link. Open it, pick a name, and you're on the board.",
      },
      {
        tag: "Write",
        title: "Write it in the hub",
        text: "Type what needs doing in your own words. Passalong gives it a title and sends it to the right person.",
        link: { label: "Open your hub", href: "/hub" },
      },
      {
        tag: "Send",
        title: "Or send it from anywhere",
        text: "Forward an email to your team's Passalong address, shown in your hub. On Android, add the hub to your home screen and share a screenshot to it. On iPhone, email the screenshot.",
      },
      {
        tag: "Watch",
        title: "See it get done",
        text: "Your hub shows who took it and how it's going, and it comes back with proof: a screenshot or a passing test.",
      },
    ],
    trouble: [
      {
        q: "I don't have an invite",
        a: "Ask whoever set up your team's Passalong to send you one.",
      },
    ],
  },
];

useHead({
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Connect Passalong to your AI agent",
        description:
          "One command for coding agents, one click for editors, one address for chat assistants.",
        url: `${APEX}/connect`,
        step: GUIDES.filter((g) => g.quick).map((g, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: `${g.name}: ${g.quick!.title}`,
          text: g.quick!.text,
          url: `${APEX}/connect#${g.id}`,
        })),
      }),
    },
  ],
});

const MODES: { id: Mode; title: string; line: string }[] = [
  { id: "terminal", title: "Terminal", line: "Claude Code, Codex" },
  { id: "editor", title: "Editor", line: "Cursor, VS Code: one click" },
  { id: "chat", title: "Chat", line: "ChatGPT, Claude" },
  { id: "none", title: "No AI", line: "Just sending work" },
];

const TRY = [
  {
    tag: "01 / Take work",
    say: "Your agent picks up what's waiting and does it.",
    prompt: "Take the next Passalong work and do it.",
  },
  {
    tag: "02 / Write it down",
    say: "Turn a plan, a bug or a chat into work someone can take.",
    prompt: "Write this down as Passalong work, and say what done looks like.",
  },
  {
    tag: "03 / Catch up",
    say: "See what needs you and who is on what.",
    prompt: "What needs me on Passalong, and who is on what?",
  },
];

const mode = ref<Mode>("terminal");
const current = ref(GUIDES[0]!.id);
const guide = computed(() => GUIDES.find((g) => g.id === current.value)!);
const apps = computed(() => GUIDES.filter((g) => g.mode === mode.value));
const done = ref<Set<number>>(new Set());
const total = computed(() => guide.value.steps.length);
const progress = computed(() => done.value.size / total.value);
const fire = ref(0);
const quickUsed = ref(false);
const tried = ref(false);
const quickNext = computed(() =>
  guide.value.quick?.button
    ? guide.value.mode === "chat"
      ? `In the ${guide.value.name} tab that opened, click Add, then approve Passalong.`
      : `Say yes in ${guide.value.name}, then sign in when your browser opens.`
    : guide.value.mode === "chat"
      ? "Copied. Now paste it where the steps below say."
      : "Copied. Paste it into your terminal and press Enter.",
);
const panel = ref<HTMLElement | null>(null);
const usesTerminal = computed(() =>
  [guide.value.quick?.code, ...guide.value.steps.map((s) => s.code)].some(
    (c) => c && (c.kind ?? "terminal") === "terminal",
  ),
);

function open(id: string) {
  const g = GUIDES.find((x) => x.id === id);
  if (!g) return;
  mode.value = g.mode;
  current.value = id;
  done.value = new Set();
  quickUsed.value = false;
  tried.value = false;
}
// Web links open beside this page; app links (cursor:, vscode:) hand off to the app.
const newTab = (href: string) =>
  href.startsWith("https:") ? { target: "_blank", rel: "noopener" } : {};
function pickMode(m: Mode) {
  open(GUIDES.find((g) => g.mode === m)!.id);
  history.replaceState(null, "", `#${current.value}`);
  nextTick(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.value?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  });
}
function pickApp(id: string) {
  open(id);
  history.replaceState(null, "", `#${id}`);
}
// Copying a step, or following its link, means it and every step before it are done.
function reach(i: number) {
  const next = new Set(done.value);
  for (let j = 0; j <= i; j++) next.add(j);
  done.value = next;
}
// Copying the first message is the finish line: everything is ticked and the confetti goes.
function tryIt() {
  done.value = new Set(guide.value.steps.map((_, i) => i));
  if (!tried.value) fire.value++;
  tried.value = true;
}

// A link to /connect#cursor opens that guide, from another page or from this one.
function fromHash() {
  const id = location.hash.slice(1);
  if (id && id !== current.value) open(id);
}
// The crossfade is turned on only after the hash has been read: swapping the keyed panel mid-hydration
// left the server-rendered guide stuck on screen.
const animate = ref(false);
onMounted(async () => {
  fromHash();
  window.addEventListener("hashchange", fromHash);
  await nextTick();
  animate.value = true;
});
onBeforeUnmount(() => window.removeEventListener("hashchange", fromHash));
</script>

<template>
  <main class="wide v2">
    <AppMasthead />

    <header class="top">
      <p class="kicker">Connect</p>
      <h1>How do you<br /><em>work with AI?</em></h1>
      <p class="top-line">Pick yours. Every way ends the same: your agent can take work, and you get proof back.</p>
    </header>

    <nav class="door-row" aria-label="How you work">
      <LandingConnectDoor
        v-for="m in MODES"
        :key="m.id"
        :kind="m.id"
        :title="m.title"
        :line="m.line"
        :on="mode === m.id"
        @pick="pickMode(m.id)"
      />
    </nav>

    <section ref="panel" class="guide" :aria-labelledby="`g-${guide.id}`">
      <div v-if="apps.length > 1" class="apps" role="tablist" aria-label="Your app">
        <button
          v-for="a in apps"
          :key="a.id"
          type="button"
          role="tab"
          :aria-selected="a.id === current"
          :class="{ on: a.id === current }"
          @click="pickApp(a.id)"
        >
          <LandingTile v-if="a.tile" class="at" flat :tile="a.tile" />
          <LandingTile v-else class="at" flat><span class="word">MCP</span></LandingTile>
          {{ a.name }}
        </button>
      </div>

      <Transition :name="animate ? 'swap' : 'none'" :mode="animate ? 'out-in' : 'default'" :css="animate">
        <div :key="guide.id" class="guide-in">
          <h2 :id="`g-${guide.id}`" class="g-title">
            {{ guide.id === "team" ? "Get your team on board" : `Set up ${guide.name}` }}
          </h2>

          <div v-if="guide.quick" class="quick">
            <p class="q-badge">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
              Fastest way
            </p>
            <h3>{{ guide.quick.title }}</h3>
            <p class="q-text">{{ guide.quick.text }}</p>
            <a
              v-if="guide.quick.button"
              class="oneclick big"
              :href="guide.quick.button.href"
              v-bind="newTab(guide.quick.button.href)"
              @click="quickUsed = true"
            >
              <LandingTile v-if="guide.quick.button.tile" class="ot" flat :tile="guide.quick.button.tile" />
              {{ guide.quick.button.label }}
            </a>
            <LandingCode
              v-if="guide.quick.code"
              :code="guide.quick.code.code"
              :kind="guide.quick.code.kind"
              :label="guide.quick.code.label"
              @copied="quickUsed = true"
            />
            <a v-if="guide.quick.link" class="step-link" :href="guide.quick.link.href" target="_blank" rel="noopener">
              {{ guide.quick.link.label }} <span aria-hidden="true">↗</span>
            </a>
            <Transition name="nudge">
              <p v-if="quickUsed" class="q-next" aria-live="polite">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                {{ quickNext }}
              </p>
            </Transition>
          </div>

          <div v-if="guide.check && guide.quick" class="finish" :class="{ won: tried }">
            <LandingConfetti :fire="fire" />
            <span class="medal" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" /></svg>
            </span>
            <div>
              <h3>{{ tried ? "You're connected." : "Then try it" }}</h3>
              <p>{{ tried ? "Paste it into a new chat. Your Passalong board shows up." : "Send this in a new chat or session." }}</p>
            </div>
            <LandingCode class="finish-code" kind="prompt" :code="guide.check" @copied="tryIt" />
          </div>

          <details class="sbs" :open="!guide.quick">
            <summary>
              <span class="sbs-title">{{ guide.quick ? "Prefer step by step?" : "Step by step" }}</span>
              <span class="sbs-meta">
                <span class="track"><span class="fill" :style="animate ? { width: `${progress * 100}%` } : undefined" /></span>
                <span class="count">{{ done.size }}/{{ total }}</span>
                <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>

            <details v-if="usesTerminal" class="help">
              <summary><span class="help-ic" aria-hidden="true">?</span> Never opened a terminal?</summary>
              <p>
                On a <b>Mac</b>, press ⌘ Space, type <b>Terminal</b>, press Enter. On <b>Windows</b>, open
                <b>PowerShell</b> the same way. Then for each step: copy, paste (⌘V or Ctrl+V), press Enter.
              </p>
            </details>

            <ol class="steps">
              <li v-for="(s, i) in guide.steps" :key="s.title" :class="{ done: done.has(i) }">
                <span class="num" aria-hidden="true">
                  <svg v-if="done.has(i)" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <div class="body">
                  <h3>{{ s.title }}<span v-if="done.has(i)" class="sr"> (done)</span></h3>
                  <p>
                    {{ s.text }}
                    <a v-if="s.link" :href="s.link.href" @click="reach(i)">{{ s.link.label }}</a>
                  </p>
                  <a v-if="s.button" class="oneclick" :href="s.button.href" v-bind="newTab(s.button.href)" @click="reach(i)">
                    <LandingTile v-if="s.button.tile" class="ot" flat :tile="s.button.tile" />
                    {{ s.button.label }}
                  </a>
                  <LandingCode
                    v-if="s.code"
                    compact
                    :code="s.code.code"
                    :kind="s.code.kind"
                    :output="s.code.output"
                    @copied="reach(i)"
                  />
                  <p v-if="s.tip" class="tip">{{ s.tip }}</p>
                  <p v-if="s.warn" class="warn">{{ s.warn }}</p>
                </div>
              </li>
            </ol>
          </details>

          <div class="trouble">
            <h3>If something's off</h3>
            <details v-for="t in guide.trouble" :key="t.q">
              <summary>{{ t.q }}</summary>
              <p>{{ t.a }}</p>
            </details>
            <p v-if="guide.more" class="more"><a :href="guide.more">The full guide</a></p>
          </div>
        </div>
      </Transition>
    </section>

    <section v-if="guide.mode !== 'none'" class="try" aria-labelledby="try-h">
      <h2 id="try-h">Then let it<br /><em>do the work.</em></h2>
      <div class="chapters">
        <article v-for="t in TRY" :key="t.tag">
          <p class="st-tag">{{ t.tag }}</p>
          <p class="ch-say">{{ t.say }}</p>
          <LandingCode kind="prompt" label="Try this" :code="t.prompt" />
        </article>
      </div>
    </section>

    <section class="dev" aria-labelledby="dev-h">
      <h2 id="dev-h">Writing a script?</h2>
      <p>
        Anything that speaks HTTP can use the API. Make a token in <a href="/hub/settings">your hub's settings</a>;
        <a href="/v1/openapi.json">the API document</a> describes every call.
      </p>
      <LandingCode
        kind="paste"
        label="Terminal"
        :code="'curl -H &quot;authorization: Bearer $TOKEN&quot; \\\n  https://passalong.dev/v1/tasks'"
      />
    </section>

    <AppFoot />
  </main>
</template>

<style scoped>
.top,
.try,
.dev {
  text-align: center;
}
h1,
.try h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-weight: 500;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
h1 em,
.try h2 em {
  color: var(--accent);
}
.top {
  margin: 0;
  border: 0;
  padding: var(--s-8) 0 var(--s-6);
}
.kicker {
  margin: 0 0 var(--s-4);
  font: 600 var(--t-xs) / 1 var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}
h1 {
  font-size: var(--t-display);
  line-height: 1.04;
}
.top-line {
  margin: var(--s-5) auto 0;
  max-width: 34rem;
  font-size: var(--t-lede);
  color: var(--muted);
}

.door-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-3);
  max-width: 56rem;
  margin-inline: auto;
}

.guide {
  max-width: 46rem;
  margin: var(--s-8) auto 0;
  scroll-margin-top: var(--s-5);
}
/* One segmented pill: a rounded track, each option a pill inside it, the chosen one lifted. */
.apps {
  display: inline-flex;
  max-width: 100%;
  gap: 0.25rem;
  margin-bottom: var(--s-6);
  padding: 0.25rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  overflow-x: auto;
  scrollbar-width: none;
}
.apps button {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--s-2);
  height: 2.5rem;
  padding: 0 var(--s-4) 0 0.3125rem;
  border: 0;
  border-radius: var(--r-pill);
  background: none;
  color: var(--muted);
  font: 500 var(--t-sm) / 1 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}
.apps button:hover {
  color: var(--fg);
}
.apps button:active {
  scale: 0.96;
}
.apps button.on {
  background: var(--bg);
  color: var(--fg);
  box-shadow:
    0 0 0 1px var(--line-strong),
    0 2px 8px -2px rgb(0 0 0 / 0.35);
}
.apps .at {
  width: 1.875rem;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
}
.apps button:not(.on) .at {
  filter: saturate(0.6);
  opacity: 0.85;
}
.word {
  position: relative;
  z-index: 1;
  font: 700 0.625rem / 1 var(--font-mono);
  color: var(--fg);
}

.g-title {
  margin: 0;
  font: 500 var(--t-h1) / 1.15 var(--font-serif);
  letter-spacing: -0.02em;
}
.q-next {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin: 0;
  font: 500 var(--t-sm) / 1.4 var(--font-sans);
  color: var(--ok);
}
.q-next svg {
  width: 1rem;
  height: 1rem;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.nudge-enter-active {
  transition:
    opacity 0.3s ease,
    translate 0.3s var(--ease-out);
}
.nudge-enter-from {
  opacity: 0;
  translate: 0 -4px;
}

/* Step by step, folded away under the fast way. */
.sbs {
  margin-top: var(--s-5);
  border-radius: 1.25rem;
  background: var(--surface-raised);
  box-shadow: 0 0 0 1px var(--line);
}
.sbs > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  list-style: none;
  cursor: pointer;
}
.sbs > summary::-webkit-details-marker {
  display: none;
}
.sbs > summary:hover .sbs-title {
  color: var(--accent);
}
.sbs-title {
  font: 600 var(--t-body) / 1.3 var(--font-sans);
  transition: color 0.2s ease;
}
.sbs-meta {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}
.chev {
  width: 1.125rem;
  height: 1.125rem;
  fill: none;
  stroke: var(--muted);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: rotate 0.25s var(--ease-out);
}
.sbs[open] .chev {
  rotate: 180deg;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.track {
  position: relative;
  width: 5rem;
  height: 0.375rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  overflow: hidden;
}
/* Its width is bound only after mount: Vue then sets it through the CSSOM, which the style policy allows. */
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  border-radius: inherit;
  background: var(--ok);
  transition: width 0.5s cubic-bezier(0.34, 1.3, 0.64, 1);
}
.count {
  font: 600 var(--t-sm) / 1 var(--font-sans);
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

/* The fastest way in: the one bordered card, set apart by its line rather than a glow. */
.quick {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin-top: var(--s-5);
  padding: var(--s-5);
  border-radius: 1.25rem;
  background: var(--surface-raised);
  box-shadow: 0 0 0 1px var(--line-strong);
}
.q-badge {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: var(--s-1);
  margin: 0;
  padding: 0.25rem 0.625rem 0.25rem 0.5rem;
  border-radius: var(--r-pill);
  background: var(--coral);
  color: #1a1410;
  font: 700 0.6875rem / 1 var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.q-badge svg {
  width: 0.75rem;
  height: 0.75rem;
  fill: currentColor;
}
.quick h3 {
  margin: 0;
  font: 600 var(--t-h2) / 1.2 var(--font-sans);
  letter-spacing: -0.01em;
}
.quick .q-text {
  margin: 0;
  color: var(--muted);
}
.or {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin: var(--s-6) 0 0;
  font: 600 0.6875rem / 1 var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.or::before,
.or::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--line);
}

.help {
  margin: 0 var(--s-5);
  border-radius: var(--r-2);
  background: var(--surface);
}
.help summary {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  font: 600 var(--t-sm) / 1.4 var(--font-sans);
  list-style: none;
  cursor: pointer;
}
.help summary::-webkit-details-marker {
  display: none;
}
.help-ic {
  display: grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: var(--r-pill);
  background: var(--coral);
  color: #1a1410;
  font: 700 0.6875rem / 1 var(--font-sans);
}
.help p {
  margin: 0;
  padding: 0 var(--s-3) var(--s-3);
  font-size: var(--t-sm);
  color: var(--muted);
}
.help b {
  color: var(--fg);
}

/* The rail: a number per step that turns green on its own as you copy your way down. */
.steps {
  margin: 0;
  padding: var(--s-5) var(--s-5) var(--s-2);
  list-style: none;
}
.steps li {
  position: relative;
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr);
  gap: var(--s-3);
  margin: 0;
  padding-bottom: var(--s-5);
}
.steps li:not(:last-child)::before {
  content: "";
  position: absolute;
  left: calc(0.875rem - 1px);
  top: 2rem;
  bottom: var(--s-1);
  width: 2px;
  border-radius: 1px;
  background: var(--line);
  transition: background-color 0.3s ease;
}
.steps li.done::before {
  background: var(--ok);
}
.num {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--line-strong);
  color: var(--muted);
  font: 600 var(--t-xs) / 1 var(--font-sans);
  transition:
    background-color 0.25s ease,
    box-shadow 0.25s ease,
    color 0.25s ease;
}
.done .num {
  background: var(--ok);
  box-shadow: none;
  color: #fff;
  animation: pop 0.4s cubic-bezier(0.34, 1.6, 0.64, 1);
}
@keyframes pop {
  50% {
    scale: 1.2;
  }
}
.num svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.body {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
  padding-top: 0.1875rem;
}
.body h3 {
  margin: 0;
  font: 600 var(--t-body) / 1.35 var(--font-sans);
  transition: color 0.25s ease;
}
.done .body h3 {
  color: var(--muted);
}
.body > p {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--muted);
  text-wrap: pretty;
}
.body > p a {
  margin-left: 0.25em;
  font-weight: 600;
  color: var(--fg);
}
.body .tip {
  font-size: var(--t-xs);
  overflow-wrap: anywhere;
}
.body .warn {
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-1);
  background: var(--warn-soft);
  color: var(--fg);
}
.step-link {
  align-self: flex-start;
  font-weight: 600;
}
.oneclick {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--s-3);
  height: 3rem;
  padding: 0 var(--s-5) 0 0.375rem;
  border-radius: var(--r-pill);
  background: var(--fg);
  color: var(--bg);
  font: 600 var(--t-body) / 1 var(--font-sans);
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    scale 0.15s ease-out;
}
.oneclick:hover {
  background: color-mix(in oklab, var(--fg) 88%, var(--bg));
}
.oneclick:active {
  scale: 0.97;
}
.oneclick.big {
  height: 3.5rem;
  padding: 0 var(--s-6) 0 0.4375rem;
  font-size: 1.0625rem;
}
.oneclick.big .ot {
  width: 2.625rem;
}
.oneclick .ot {
  width: 2.25rem;
}
.finish {
  position: relative;
  margin-top: var(--s-4);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--s-4);
  align-items: center;
  padding: var(--s-5);
  border-radius: 1.25rem;
  background: var(--surface-raised);
  box-shadow: 0 0 0 1px var(--line);
  transition:
    background-color 0.5s ease,
    box-shadow 0.5s ease;
}
.finish.won {
  background: color-mix(in oklab, var(--ok) 12%, var(--surface-raised));
  box-shadow: 0 0 0 2px var(--ok);
}
.medal {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--r-pill);
  background: var(--coral);
  color: #1a1410;
  transition: background-color 0.4s ease;
}
.won .medal {
  background: var(--ok);
  color: #fff;
  animation: pop 0.5s cubic-bezier(0.34, 1.6, 0.64, 1);
}
.medal svg {
  width: 1.375rem;
  fill: currentColor;
}
.finish h3 {
  margin: 0;
  font: 600 var(--t-h3) / 1.3 var(--font-sans);
}
.finish p {
  margin: var(--s-1) 0 0;
  color: var(--muted);
}
.finish-code {
  grid-column: 1 / -1;
}

.trouble {
  margin-top: var(--s-6);
}
.trouble h3 {
  margin: 0 0 var(--s-2);
  font: 600 var(--t-body) / 1.3 var(--font-sans);
}
.trouble details {
  border-bottom: 1px solid var(--line);
}
.trouble summary {
  display: flex;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-3) 0;
  list-style: none;
  cursor: pointer;
}
.trouble summary::-webkit-details-marker {
  display: none;
}
.trouble summary::after {
  content: "+";
  color: var(--muted);
  transition: rotate 0.2s var(--ease-out);
}
.trouble details[open] summary::after {
  rotate: 45deg;
}
.trouble details p {
  margin: 0 0 var(--s-3);
  color: var(--muted);
}
.more {
  margin: var(--s-4) 0 0;
}

.try,
.dev {
  margin-top: var(--s-9);
}
.try h2 {
  font-size: var(--t-section);
  line-height: 1.08;
}
.chapters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-5);
  margin-top: var(--s-7);
  text-align: left;
}
.chapters article {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}
.chapters .st-tag {
  color: var(--accent);
}
.chapters .ch-say {
  margin: 0 0 var(--s-1);
  font: 500 var(--t-h3) / 1.35 var(--font-sans);
}
.dev {
  max-width: 40rem;
  margin-inline: auto;
  padding-bottom: var(--s-8);
}
.dev h2 {
  margin: 0;
  font: 600 var(--t-h2) / 1.3 var(--font-sans);
}
.dev p {
  margin: var(--s-3) 0 var(--s-4);
  color: var(--muted);
}

.swap-enter-active,
.swap-leave-active {
  transition:
    opacity 0.22s ease,
    translate 0.22s var(--ease-out),
    filter 0.22s ease;
}
.swap-enter-from {
  opacity: 0;
  translate: 0 8px;
  filter: blur(4px);
}
.swap-leave-to {
  opacity: 0;
  filter: blur(4px);
}

@media (max-width: 60rem) {
  .door-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .chapters {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 36rem) {
  .door-row {
    gap: var(--s-3);
  }
  .sbs > summary {
    padding: var(--s-3) var(--s-4);
  }
  .steps {
    padding: var(--s-4) var(--s-3) var(--s-1);
  }
  .help {
    margin: 0 var(--s-3);
  }
  .track {
    width: 3rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .swap-enter-from,
  .swap-leave-to {
    translate: none;
    filter: none;
  }
  .done .num,
  .won .medal {
    animation: none;
  }
}
</style>
