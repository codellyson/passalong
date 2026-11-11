<!--
  The CLI, for people. The list is the comment at the top of packages/passalong/bin/passalong,
  less the commands only whoever runs Passalong uses (admin, gift); public/llms.txt carries the
  same list for an agent. A command added there is added here.

  Script-free: route rule `/docs/**` is `noScripts` with the strict CSP.
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

/** Grouped by what a person is doing, in the order they meet it. */
const GROUPS = [
  {
    h: "Write work down",
    rows: [
      {
        cmd: 'passalong new "<what needs doing>" [--to TARGET] [--parent ID] [--draft]',
        note: 'Write work down in a sentence. `--to` is a team, `team/@handle` for one person, or `"team/#group"` for the people who do a thing (quote it: a shell reads `#` as a comment). `--draft` holds it for a person to read first.',
      },
      {
        cmd: "passalong new <file.md> [--to TARGET] [--parent ID] [--draft]",
        note: "The same, from a markdown file.",
      },
      {
        cmd: "passalong attach <file>",
        note: "Upload a picture or a file and print the markdown that points at it.",
      },
    ],
  },
  {
    h: "Find it",
    rows: [
      { cmd: "passalong board", note: "What needs you, who is on what, and what is ready." },
      { cmd: "passalong list [query]", note: "Work you and your teams can see, newest first." },
      {
        cmd: "passalong open <id> [--print]",
        note: "View it in the browser, or in the terminal with `--print`.",
      },
      {
        cmd: "passalong now",
        note: "What this worktree holds and what is waiting. The Claude Code hooks call it.",
      },
      { cmd: "passalong hub", note: "Open the hub in the browser, signed in." },
    ],
  },
  {
    h: "Do it, and say so",
    rows: [
      {
        cmd: "passalong take [id] [--save]",
        note: "You are doing it: nobody else can take it while you hold it. With no id, the next thing waiting for you. `--save` also writes `./.passalong/<id>.md`.",
      },
      {
        cmd: "passalong progress <id> <note>",
        note: "Still on it, with a one-line note the hub shows.",
      },
      {
        cmd: "passalong ask <id> <question>",
        note: "Ask the person, keep it, and wait for their answer.",
      },
      {
        cmd: "passalong wait <id>",
        note: "Wait for the person's reply and print it. Run it in the background after `ask`.",
      },
      {
        cmd: "passalong hand-in <id> <note> --evidence TEXT [--writeup TEXT] [--pr LINK]",
        note: "It is done: it goes to Done with what you showed.",
      },
      {
        cmd: "passalong pass <id> <why>",
        note: "It is not yours, or you are stuck: hands it back with your reason.",
      },
    ],
  },
  {
    h: "Move it",
    rows: [
      {
        cmd: "passalong reply <id> <text> [--file PATH]",
        note: "Write to whoever holds it, or leave a note for whoever takes it next.",
      },
      {
        cmd: "passalong assign <id> <to>",
        note: "Give it to `@handle` (or several: `@ada @bola`), a `#group`, or `team`.",
      },
      { cmd: "passalong release <id>", note: "Take work back from whoever holds it." },
      {
        cmd: "passalong ready <id...|--all>",
        note: "Work you have read is Ready: whoever it is for may take it now.",
      },
      {
        cmd: "passalong reopen <id> <why>",
        note: "Finished work is not right: back to Ready, and whoever takes it next reads why.",
      },
      { cmd: "passalong archive <id>", note: "Off the board and out of the free tier's count." },
      { cmd: "passalong rm <id>", note: "Delete it." },
    ],
  },
  {
    h: "Teams",
    rows: [
      {
        cmd: "passalong me [--handle H] [--name N] [--email E]",
        note: "Who you are to teammates.",
      },
      { cmd: "passalong team", note: "The current team and its members." },
      { cmd: "passalong team create <name>", note: "Start a team; you become its owner." },
      {
        cmd: "passalong team invite [email]",
        note: "Make an invite link, mailed when an email is given. It is accepted in the browser, so a teammate needs no terminal.",
      },
      { cmd: "passalong team join <link|code>", note: "Accept an invite." },
      { cmd: "passalong team use <slug>", note: "Switch the current team." },
      {
        cmd: "passalong team promote|demote <@handle>",
        note: "Make a teammate an admin, or a member again.",
      },
      {
        cmd: "passalong team remove <@handle>",
        note: "Take a teammate out. `passalong team leave` leaves yourself.",
      },
    ],
  },
  {
    h: "Accounts",
    rows: [
      { cmd: "passalong login", note: "Sign in from the browser." },
      {
        cmd: "passalong login --with-token",
        note: "Read a token from stdin instead, for CI and scripts.",
      },
      { cmd: "passalong login --new", note: "Add another account to this machine." },
      { cmd: "passalong accounts", note: "The accounts signed in here, and which is the default." },
      { cmd: "passalong use <name>", note: "Make one of them the default." },
      { cmd: "passalong logout [name]", note: "Forget one of them; the current one by default." },
    ],
  },
  {
    h: "Agents and your data",
    rows: [
      {
        cmd: "passalong setup",
        note: "Install the Claude Code capture skill, the MCP server, its hooks and a status line.",
      },
      { cmd: "passalong mcp", note: "Run the MCP server over stdio." },
      {
        cmd: "passalong work [--once] [--agent CMD]",
        note: "Run an agent on each piece of ready work for this repo, one after another.",
      },
      {
        cmd: "passalong export [dir]",
        note: "Dump every piece of work as plain markdown, `./passalong-export` by default.",
      },
      { cmd: "passalong version", note: "Print the installed version (also `-v`, `--version`)." },
    ],
  },
];

const AGENT_SH = `#!/bin/sh
# The prompt must come first: --allowedTools takes any number of values and would swallow it.
exec claude -p "$@" --permission-mode acceptEdits \\
  --allowedTools "mcp__passalong__*,Bash(npm test:*),Bash(node:*),Bash(git add:*),Bash(git commit:*)"`;
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>
        Every command,
        <span class="turn">grouped by what it is for.</span>
      </h1>
      <p class="lede">
        The <code>passalong</code> command does from a terminal what the hub does in a browser and an
        agent does over MCP. It keeps no work on your machine unless you ask: the server holds it.
      </p>
    </header>

    <div class="rails">
      <section>
        <h2>Install</h2>
        <div class="say">
          <pre><code>{{ INSTALL }}</code></pre>
        </div>
      </section>

      <section v-for="g in GROUPS" :key="g.h">
        <h2>{{ g.h }}</h2>
        <div class="say">
          <dl class="kinds">
            <template v-for="r in g.rows" :key="r.cmd">
              <dt><code>{{ r.cmd }}</code></dt>
              <dd>
                <template v-for="(part, k) in codeParts(r.note)" :key="k"
                  ><code v-if="part.code">{{ part.text }}</code
                  ><template v-else>{{ part.text }}</template></template
                >
              </dd>
            </template>
          </dl>
        </div>
      </section>

      <section>
        <h2>More than one account</h2>
        <div class="say">
          <p>
            A machine can be signed in to several accounts, say a work one and a personal one.
            <code>passalong login --new</code> adds another, and <code>passalong use &lt;name&gt;</code>
            picks the default a person at a terminal gets. For one command,
            <code>--as &lt;name&gt;</code> or <code>PASSALONG_ACCOUNT=&lt;name&gt;</code> says which.
          </p>
          <p>
            An agent has no terminal to be asked at, so with two or more accounts and nothing saying
            which, it is refused and told to ask you. You answer, and it calls the
            <code>accounts</code> tool with <code>use</code> and the name. That lasts for the session
            and moves nothing on disk. The current team belongs to the account, not the machine.
          </p>
        </div>
      </section>

      <section>
        <h2>Working a queue unattended</h2>
        <div class="say">
          <p>
            <code>passalong work</code> runs <code>claude -p</code> on each piece of ready work for the
            repo you are in, one after another. The agent runs headless, so it can only use the tools
            you allow up front; work that needs anything else ends with a <code>BLOCKED:</code>
            progress note. To allow tools, point <code>--agent</code> (or
            <code>PASSALONG_AGENT</code>) at a small script:
          </p>
          <pre><code>{{ AGENT_SH }}</code></pre>
          <p>
            Each agent commits its change and hands it in, which puts the work in Done. If it is not
            right, <code>passalong reopen &lt;id&gt; &lt;why&gt;</code>: the next agent reads the reason
            before it starts again.
          </p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
