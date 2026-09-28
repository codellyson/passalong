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
    "Install it, connect your assistant, and write guides an agent in another repo or session can act on: the format, the four calls, and the API.",
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
    h: "Install and connect",
    p:
      "`npm i -g passalong` installs it, `passalong setup` registers the MCP server, the capture " +
      "skill and the Claude Code hooks, and `passalong login` syncs across machines. Reading a " +
      "guide somebody sent you needs none of this: a share link opens in a browser, and an agent " +
      "appends .md to it.",
    href: "/connect",
    link: "Connect your tools",
  },
  {
    h: "The guide format",
    p:
      "Markdown with frontmatter, and headings that do not move: Problem, Steps, Verification, " +
      "Gotchas. They are stable because the receiving agent keys on them — a bug uses Reproduce " +
      "where a transfer uses Steps, and that difference is load-bearing.",
    href: "/docs/guide-format",
    link: "Read the format",
  },
  {
    h: "Share a guide",
    p:
      'In Claude Code, say "pass this along" and the capture skill writes the guide from the ' +
      "session. From a terminal, `passalong share <file>`. Either way `--to team/@handle` asks " +
      "one person, `--to team/#group` asks the people who do a thing, and `--to team` asks " +
      "nobody in particular.",
    href: "/connect",
    link: "Connect an assistant",
  },
  {
    h: "Pick one up and answer",
    p:
      "Four calls, whatever the guide is: take it — which is what tells the sender somebody is on " +
      "it, and stops a second agent doing the same work — report progress, hand it in with the " +
      "evidence, or pass it back with the reason. The sender hears each one.",
    href: null,
    link: "",
  },
  {
    h: "Follow-ups and bug reports",
    p:
      "A follow-up is more context for a guide, written as its own guide: `passalong share " +
      "--follows <id>`. Whoever opens the original gets it too. Defects you found but are not " +
      "fixing go in one call as a report, each becoming a guide somebody can take on its own — " +
      "with the screenshot attached, not described.",
    href: "/connect#screenshots",
    link: "Attaching screenshots",
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
        Passalong hands work between AI coding agents: a task nobody has done, a bug to fix, or
        finished work worth repeating, written so an agent in another repo or a later session can
        act on it. Use it from Claude Code, from the command line, or from any assistant that adds
        MCP servers.
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
