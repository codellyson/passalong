<!--
  The CLI, for people: the list in the comment at the top of packages/passalong/bin/passalong, less
  the commands only whoever runs Passalong uses (admin, gift). A command added there is added here.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs/cli");

usePage({
  title: "Passalong CLI: every command",
  description:
    "Install the passalong command, write work down, take it, hand it in, and run agents on a queue: every command, grouped by what it is for.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

const INSTALL = `npm i -g passalong
passalong login     # sign in from the browser
passalong setup     # MCP server, hooks and skill for Claude Code
codex mcp add passalong -- passalong mcp   # Codex`;

const GROUPS = [
  {
    id: "write",
    h: "Write work down",
    rows: [
      {
        cmd: 'passalong new "<what needs doing>" [--to TARGET] [--parent ID] [--draft]',
        note: '`--to` takes a team, `team/@handle` or `"team/#group"` (quote it: `#` starts a shell comment). `--draft` holds it for a person to read first.',
      },
      {
        cmd: "passalong new <file.md> [--to TARGET] [--parent ID] [--draft]",
        note: "The same, from a markdown file.",
      },
      {
        cmd: "passalong attach <file>",
        note: "Upload a picture or file; prints the markdown that points at it.",
      },
    ],
  },
  {
    id: "find",
    h: "Find it",
    rows: [
      { cmd: "passalong board", note: "What needs you, who is on what, what is ready." },
      { cmd: "passalong list [query]", note: "Work you and your teams can see, newest first." },
      {
        cmd: "passalong open <id> [--print]",
        note: "Open it in the browser, or print it with `--print`.",
      },
      { cmd: "passalong now", note: "What this worktree holds. The Claude Code hooks call it." },
      { cmd: "passalong hub", note: "Open the hub in the browser, signed in." },
    ],
  },
  {
    id: "do",
    h: "Do it, and say so",
    rows: [
      {
        cmd: "passalong take [id] [--save]",
        note: "You're doing it; nobody else can take it. No id takes the next one waiting. `--save` writes `./.passalong/<id>.md`.",
      },
      { cmd: "passalong progress <id> <note>", note: "Still on it, with a one-line note." },
      { cmd: "passalong ask <id> <question>", note: "Ask the person, keep it, and wait." },
      {
        cmd: "passalong wait <id>",
        note: "Wait for the reply and print it. Run it in the background after `ask`.",
      },
      {
        cmd: "passalong hand-in <id> <note> --evidence TEXT [--writeup TEXT] [--pr LINK]",
        note: "Done: it goes to Done with what you showed.",
      },
      { cmd: "passalong pass <id> <why>", note: "Not yours, or stuck: back with your reason." },
    ],
  },
  {
    id: "move",
    h: "Move it",
    rows: [
      {
        cmd: "passalong reply <id> <text> [--file PATH]",
        note: "Write to whoever holds it, or leave a note for whoever's next.",
      },
      {
        cmd: "passalong assign <id> <to>",
        note: "Give it to `@handle` (or `@ada @bola`), a `#group`, or `team`.",
      },
      { cmd: "passalong release <id>", note: "Take work back from whoever holds it." },
      {
        cmd: "passalong ready <id...|--all>",
        note: "Mark it Ready, so whoever it's for may take it.",
      },
      {
        cmd: "passalong reopen <id> <why>",
        note: "Finished but not right: back to Ready, with why.",
      },
      { cmd: "passalong archive <id>", note: "Off the board and out of the free tier's count." },
      { cmd: "passalong rm <id>", note: "Delete it." },
    ],
  },
  {
    id: "teams",
    h: "Teams",
    rows: [
      {
        cmd: "passalong me [--handle H] [--name N] [--email E]",
        note: "Who you are to teammates.",
      },
      { cmd: "passalong team", note: "The current team and its members." },
      { cmd: "passalong team create <name>", note: "Start a team; you're its owner." },
      {
        cmd: "passalong team invite [email]",
        note: "An invite link, mailed if you give an email. Accepted in the browser.",
      },
      { cmd: "passalong team join <link|code>", note: "Accept an invite." },
      { cmd: "passalong team use <slug>", note: "Switch the current team." },
      {
        cmd: "passalong team promote|demote <@handle>",
        note: "Make someone an admin, or a member again.",
      },
      {
        cmd: "passalong team remove <@handle>",
        note: "Take someone out. `passalong team leave` leaves yourself.",
      },
    ],
  },
  {
    id: "accounts",
    h: "Accounts",
    rows: [
      { cmd: "passalong login", note: "Sign in from the browser." },
      { cmd: "passalong login --with-token", note: "Read a token from stdin, for CI and scripts." },
      { cmd: "passalong login --new", note: "Add another account to this machine." },
      { cmd: "passalong accounts", note: "The accounts signed in here, and the default." },
      { cmd: "passalong use <name>", note: "Make one the default." },
      { cmd: "passalong logout [name]", note: "Forget one; the current one by default." },
    ],
  },
  {
    id: "agents",
    h: "Agents and your data",
    rows: [
      {
        cmd: "passalong setup",
        note: "The Claude Code skill, MCP server, hooks and a status line.",
      },
      { cmd: "passalong mcp", note: "Run the MCP server over stdio." },
      {
        cmd: "passalong work [--once] [--agent CMD]",
        note: "Run an agent on each piece of ready work for this repo.",
      },
      {
        cmd: "passalong export [dir]",
        note: "Every piece of work as markdown, to `./passalong-export` by default.",
      },
      { cmd: "passalong version", note: "The installed version (also `-v`, `--version`)." },
    ],
  },
];

const TOC = [
  { id: "install", label: "Install" },
  ...GROUPS.map((g) => ({ id: g.id, label: g.h })),
  { id: "several", label: "Several accounts" },
  { id: "unattended", label: "Running unattended" },
];

const AGENT_SH = `#!/bin/sh
# The prompt must come first: --allowedTools takes any number of values and would swallow it.
exec claude -p "$@" --permission-mode acceptEdits \\
  --allowedTools "mcp__passalong__*,Bash(npm test:*),Bash(node:*),Bash(git add:*),Bash(git commit:*)"`;
</script>

<template>
  <main class="wide landing docs">
    <AppMasthead />
    <DocsNav />

    <header class="hero">
      <h1>
        Every command,
        <span class="turn">grouped by what it is for.</span>
      </h1>
      <p class="dlede">Everything the hub does, from a terminal. The server holds your work, not your machine.</p>
    </header>

    <DocsPage :toc="TOC">
      <section id="install">
        <h2>Install</h2>
        <LandingCode :code="INSTALL" />
      </section>

      <section v-for="g in GROUPS" :id="g.id" :key="g.id">
        <h2>{{ g.h }}</h2>
        <ul class="drows">
          <li v-for="r in g.rows" :key="r.cmd">
            <span class="dcmd"><code>{{ r.cmd }}</code><DocsCopy :text="r.cmd" /></span>
            <span>
              <template v-for="(part, k) in codeParts(r.note)" :key="k"
                ><code v-if="part.code">{{ part.text }}</code
                ><template v-else>{{ part.text }}</template></template
              >
            </span>
          </li>
        </ul>
      </section>

      <section id="several">
        <h2>Several accounts</h2>
        <p>
          <code>passalong login --new</code> adds one, <code>passalong use &lt;name&gt;</code> sets the default, and
          <code>--as &lt;name&gt;</code> or <code>PASSALONG_ACCOUNT</code> picks one for a single command.
        </p>
        <p>
          An agent with two or more accounts and nothing chosen asks you which, then calls the
          <code>accounts</code> tool with <code>use</code>. That lasts for the session only.
        </p>
      </section>

      <section id="unattended">
        <h2>Running unattended</h2>
        <p>
          <code>passalong work</code> runs <code>claude -p</code> on each piece of ready work in this repo. A headless
          agent only uses the tools you allow, so point <code>--agent</code> (or <code>PASSALONG_AGENT</code>) at a
          script:
        </p>
        <LandingCode kind="file" label="agent.sh" :code="AGENT_SH" />
        <p>
          Work that needs anything else ends with a <code>BLOCKED:</code> note. Not right?
          <code>passalong reopen &lt;id&gt; &lt;why&gt;</code>, and the next agent reads why first.
        </p>
      </section>
    </DocsPage>

    <AppFoot />
  </main>
</template>
