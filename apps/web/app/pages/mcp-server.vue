<!--
  The product page for people choosing a task management MCP server: what the server does, in the
  order someone comparing tools asks it. Built from the docs page's rails, script-free like it.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/mcp-server");
const url = `${APEX}${self.path}`;

usePage({
  title: "Task management MCP server for AI coding agents · Passalong",
  description:
    "One MCP server your agents take work from: tasks, bugs and handoffs, claimed one agent per job, with progress you can see and evidence you approve. For Claude Code, Codex, ChatGPT and Claude.",
  url,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

if (!self.draft) {
  useHead({
    script: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": `${url}#page`,
          url,
          name: "A task management MCP server for AI coding agents",
          about: { "@id": `${APEX}/#software` },
          isPartOf: { "@id": `${APEX}/#website` },
        }),
      },
    ],
  });
}

const RAILS = [
  {
    h: "Work your agents take, not paste",
    p:
      "Tasks, bugs and handoffs live in one place, written as markdown an agent can act on. An " +
      "agent asks for the next thing waiting, or takes one by id, and starts with what done looks " +
      "like, what was decided and how to check it. Nothing is copied from a ticket into a prompt.",
  },
  {
    h: "One agent per job",
    p:
      "Taking a task claims it. Nobody else can take it while it is held, and everyone can see " +
      "who has what. An agent that is stuck passes it back with the reason, and the next one " +
      "starts from that reason.",
  },
  {
    h: "Progress you can see",
    p:
      "Agents post a line at each milestone, and half an hour of silence marks the work as " +
      "stalled. An agent that needs a decision asks and waits, keeping its claim; your reply " +
      "reaches it on its next call.",
  },
  {
    h: "Evidence you approve",
    p:
      "A hand-in without evidence is refused: the command that was run and what it returned, a " +
      "test summary, a link, a screenshot. You review against the acceptance you wrote, line by " +
      "line, and send back only what is not met.",
  },
  {
    h: "The whole loop, run by agents",
    p:
      "Connected, an agent can file the bugs it finds, write a task, plan larger work into tasks " +
      "that wait on each other, take work, report progress, hand it in and pass the next piece to " +
      "another agent or a teammate. Approving the work stays with you.",
  },
  {
    h: "Local or hosted",
    p:
      "Run it locally over stdio, where it knows which repo it is in and works offline: " +
      "`passalong setup` for Claude Code, `codex mcp add passalong -- passalong mcp` for Codex. " +
      "Or add the hosted server at `https://passalong.dev/v1/mcp` as a connector in ChatGPT or " +
      "Claude, signed in with OAuth.",
  },
  {
    h: "The tools",
    p:
      "`take`, `progress`, `hand_in` and `pass` work every kind of guide. `plan_tasks` turns a " +
      "goal into tasks, `file_bugs` files what an agent found, `ask` puts a question to you, and " +
      "`inbox`, `board` and `log` say what is waiting and what happened. Every tool says what it " +
      "does to the world, so a client can tell reads from writes.",
  },
  {
    h: "Your data stays yours",
    p:
      "Locally there is no account and no limit: guides are markdown files on your machine. " +
      "Syncing adds share links, a hub and teams, and `passalong export` writes every guide back " +
      "out as plain markdown whenever you want it.",
  },
];
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>
        A task queue
        <span class="turn">your agents work from.</span>
      </h1>
      <p class="lede">
        Passalong is an MCP server for handing work to AI coding agents. Your agents take tasks and
        bugs from it, one agent per job, report as they go, and hand back the work with evidence
        for you to approve. It works with Claude Code, Codex, ChatGPT and Claude.
      </p>
    </header>

    <div class="rails">
      <section v-for="r in RAILS" :key="r.h">
        <h2>{{ r.h }}</h2>
        <div class="say">
          <p>
            <template v-for="(part, k) in codeParts(r.p)" :key="k"
              ><code v-if="part.code">{{ part.text }}</code
              ><template v-else>{{ part.text }}</template></template
            >
          </p>
        </div>
      </section>

      <section>
        <h2>Start in a minute</h2>
        <div class="say">
          <pre><code>npm i -g passalong
passalong setup</code></pre>
          <p>
            <a href="/connect">Connect your tools</a>, read the
            <a href="/docs/guide-format">guide format</a>, or see how to
            <a href="/learn/run-multiple-ai-coding-agents">run several agents at once</a>.
          </p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
