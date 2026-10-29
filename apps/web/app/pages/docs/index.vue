<!--
  The docs front page: the searchable home of what otherwise lives in README.md, public/llms.txt
  and docs/wiki.

  Each rail is one topic, a line of what it covers, and where it goes next. A rail whose
  destination is not written yet says where that material is today rather than linking nowhere —
  a docs page that promises pages it does not have is worse than a short one.

  Script-free like the landing and /connect: its route rule is `noScripts` with the strict CSP.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs");

usePage({
  title: "Passalong docs — hand work to AI coding agents",
  description:
    "Install it, connect your assistant, and write work an agent in another repo or session can act on: the format, the calls, projects and documents, and the API.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/**
 * The rails, as data so the outline is easy to reorder while the copy is being written.
 * `href` null means the destination page does not exist yet.
 */
const TOPICS = [
  {
    h: "Handing work to agents",
    p:
      "What a piece of work needs before an agent takes it, how to say what done means so it can " +
      "check, and how to look at what comes back. Written for any agent, with or without " +
      "Passalong.",
    href: "/learn/ai-agent-handoff",
    link: "Read it",
  },
  {
    h: "Running several agents",
    p:
      "A workspace for each agent, one held piece of work per agent, work split so it does not " +
      "overlap, and a board you can keep up with. Written for any mix of agents.",
    href: "/learn/run-multiple-ai-coding-agents",
    link: "Read it",
  },
  {
    h: "Install and connect",
    p:
      "`npm i -g passalong` installs it, `passalong setup` registers the MCP server, the capture " +
      "skill and the Claude Code hooks, and `passalong login` signs you in. Reading work somebody " +
      "sent you needs none of this: a share link opens in a browser, and an agent appends .md to it.",
    href: "/connect",
    link: "Connect your tools",
  },
  {
    h: "The work format",
    p:
      "Markdown with frontmatter: a title, a summary for a person, and a body in whatever shape " +
      "fits. No kinds, required sections or templates — the agent that takes it works out what " +
      "done means. A tag such as bug describes it; nothing turns on one.",
    href: "/docs/work-format",
    link: "Read the format",
  },
  {
    h: "Write work down",
    p:
      'Type it into the box in the hub, ask your agent, or run `passalong new "what needs doing"`. ' +
      "`--to @handle` asks one person, `--to #group` asks the people who do a thing, and leaving " +
      "it off asks the whole team. `--draft` holds it for a person to read first.",
    href: "/connect",
    link: "Connect an assistant",
  },
  {
    h: "Do it, and say so",
    p:
      "The same calls for all work: take it — which tells the sender somebody is on it, and stops " +
      "a second agent doing the same work — report progress, ask when it needs a person's answer, " +
      "hand it in with the evidence, or pass it back with the reason. The sender hears each one, " +
      "and finished work that is not right is reopened with why.",
    href: null,
    link: "",
  },
  {
    h: "Projects and documents",
    p:
      "A project is a place for one product; its documents are what to know about it — a README, a " +
      'page per area, a Log of what changed. Say "pass this along" in Claude Code and the capture ' +
      "skill writes what the session learned into those documents. Anything someone must still do " +
      "is work, not a document, with the screenshot attached, not described.",
    href: "/connect#screenshots",
    link: "Attaching screenshots",
  },
  {
    h: "Errors, alerts and email in",
    p:
      "Point Sentry, PostHog, an email address or your own code at Passalong and each one becomes " +
      "work, with what was sent quoted in it and the reader's title, summary and label on it. " +
      "Customers get an address of their own and a tracking number. Repeats of one issue stay one " +
      "piece of work.",
    href: "/docs/integrations",
    link: "Set up integrations",
  },
  {
    h: "CLI, MCP tools and API",
    p:
      "Every command and every MCP tool is listed in llms.txt, which is written for an agent and " +
      "reads perfectly well as a person's reference. The HTTP API has an OpenAPI document, for a " +
      "client that adds no MCP server at all.",
    href: "/v1/openapi.json",
    link: "The API document",
  },
];
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>
        Write it once,
        <span class="turn">and have the next agent act on it.</span>
      </h1>
      <p class="lede">
        Passalong keeps a team's work and what it knows: work someone must still do, written so an
        agent in another repo or a later session can act on it, and the documents that say what
        each project is. Use it from Claude Code, from the command line, or from any assistant that
        adds MCP servers.
      </p>
    </header>

    <div class="rails">
      <section v-for="t in TOPICS" :key="t.h">
        <h2>{{ t.h }}</h2>
        <div class="say">
          <!-- Backticks in the copy render as code, the way they do everywhere else in the
               product, rather than as backticks. -->
          <p>
            <template v-for="(part, k) in codeParts(t.p)" :key="k"
              ><code v-if="part.code">{{ part.text }}</code
              ><template v-else>{{ part.text }}</template></template
            >
          </p>
          <p v-if="t.href"><a :href="t.href">{{ t.link }}</a></p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
