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
  title: "MCP server for Claude Code and Codex · Passalong",
  description:
    "Your agents take work from Passalong, read the project's documents, report as they go and hand in with proof: a screenshot or a command's output.",
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
      "Work lives in one place, written in plain words with its screenshots and files. An agent " +
      "asks for the next thing waiting, or takes one by id, reads it and works out what done " +
      "means. Nothing is copied from a ticket into a prompt.",
  },
  {
    h: "One agent per job",
    p:
      "Taking work holds it. Nobody else can take it while it is held, and everyone can see who " +
      "has what. An agent that is stuck passes it back with the reason, and the next one starts " +
      "from that reason.",
  },
  {
    h: "Progress you can see",
    p:
      "Agents post a line at each milestone, and half an hour of silence marks the work as " +
      "stalled. An agent that needs a decision asks and waits, keeping what it holds; your reply " +
      "reaches it on its next call.",
  },
  {
    h: "Evidence on every hand-in",
    p:
      "A hand-in without evidence is refused: the command that was run and what it returned, a " +
      "test summary, a link, a screenshot. Finished work goes to Done with what was shown, and " +
      "anyone on the team can reopen it with a reason.",
  },
  {
    h: "What your agents know",
    p:
      "Each project has documents: a README saying what the product is and how it is built, a " +
      "page per area, a Log of what changed. Agents read them when they take work and update them " +
      "when they hand it in, and every version is kept.",
  },
  {
    h: "Local or hosted",
    p:
      "Run it locally over stdio, where it knows which repo it is in: `passalong setup` for " +
      "Claude Code, `codex mcp add passalong -- passalong mcp` for Codex. Or add the hosted " +
      "server at `https://passalong.dev/v1/mcp` as a connector in ChatGPT or Claude, signed in " +
      "with OAuth.",
  },
  {
    h: "The tools",
    p:
      "Four nouns. Work: `take`, `progress`, `hand_in`, `pass`, `ask`, `create_work`, " +
      "`find_work`, `update_work`. Projects: `find_projects`, `save_project`, `read_document`, " +
      "`save_document`, `delete_document`. Files: `add_file`, `read_file`, `delete_file`. And " +
      "`accounts`, locally, for a machine signed in more than once. Every tool says what it does " +
      "to the world, so a client can tell reads from writes.",
  },
  {
    h: "Your data stays yours",
    p:
      "Work is markdown with frontmatter, and `passalong export` writes all of it back out as " +
      "plain markdown whenever you want it. A share link needs no account to read.",
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
        Passalong is an MCP server for handing work to AI coding agents. Your agents take work from
        it, one agent per job, report as they go, and hand it in with evidence. It works with
        Claude Code, Codex, ChatGPT and Claude.
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
            <a href="/docs/work-format">work format</a>, or see how to
            <a href="/learn/run-multiple-ai-coding-agents">run several agents at once</a>.
          </p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
