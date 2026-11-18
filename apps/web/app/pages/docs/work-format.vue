<!--
  The work format, for people; public/llms.txt is the same for an agent. The format is defined in
  apps/api/src/work.ts: if a field changes there, this page and llms.txt change with it.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs/work-format");

usePage({
  title: "Passalong work format: markdown agents act on",
  description:
    "The frontmatter a piece of work carries, why the body has no required shape, and how an agent works it.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

const EXAMPLE = `---
title: The upload button on Settings does nothing
summary: Clicking Upload on the Settings page does nothing on Safari. Whoever takes it fixes it.
team: acme
to: "#frontend"
tags: [bug]
target_context: acme/shop
---

On Safari 18, Settings → Profile → Upload does nothing: no file picker, no error.
Chrome is fine. Screenshot of the console:

![console](https://passalong.dev/v1/shots/k3mq2xa7)

Done when a Safari user can pick a picture and see it as their avatar.
`;

const FIELDS = [
  { name: "title", req: true, note: "What needs doing, in plain words. The line on the board." },
  {
    name: "summary",
    req: true,
    note: "One or two sentences for a person, 400 characters at most, no ids or paths.",
  },
  { name: "status", note: "`draft`, `ready` or `done`. New work is Ready unless it says `draft`." },
  { name: "team", note: "The team it's in, by slug. Without one it's yours alone." },
  {
    name: "to",
    note: "`@handle` for one person, `#group` for the people who do a thing, nothing for the whole team.",
  },
  { name: "id", note: "8 characters, no lookalikes. An address, not a secret." },
  { name: "url", note: "Its share link, written in by the server." },
  {
    name: "tags",
    note: "A list, lowercase, hyphenated. `bug`, `feature`, `question` describe it; no rule turns on one.",
  },
  { name: "parent", note: "The work this came from. Finishing it tells the parent." },
  { name: "blocked_by", note: "Ids that must be Done before this one is handed out." },
  {
    name: "target_context",
    note: "The repo it's for, as owner/repo. Chosen when it's marked Ready if it has none.",
  },
  {
    name: "stack_assumptions",
    note: "Optional. The author's environment, to adapt rather than copy.",
  },
];

const TOOLS = [
  { name: "take", note: "Say you're doing it. Nobody else can take it while you hold it." },
  {
    name: "progress",
    note: "A line at each milestone. Thirty minutes without one marks it stalled.",
  },
  { name: "ask", note: "You need the person's answer. You keep it and wait." },
  {
    name: "hand_in",
    note: "Done, with evidence: a screenshot, or what you ran and what came back.",
  },
  { name: "pass", note: "Not yours, or stuck: back with the reason." },
];

const TOC = [
  { id: "example", label: "An example" },
  { id: "fields", label: "The fields" },
  { id: "body", label: "The body" },
  { id: "worked", label: "How it's worked" },
  { id: "links", label: "Share links" },
];
</script>

<template>
  <main class="wide landing docs">
    <AppMasthead />
    <DocsNav />

    <header class="hero">
      <h1>
        Markdown with frontmatter,
        <span class="turn">and whatever shape the work needs.</span>
      </h1>
      <p class="dlede">A title, a summary, and what the next reader needs. No kinds, no templates. Plain markdown, yours to keep.</p>
    </header>

    <DocsPage :toc="TOC">
      <section id="example">
        <h2>An example</h2>
        <p>Most work is this short.</p>
        <LandingCode kind="file" label="A piece of work, as markdown" :code="EXAMPLE" />
      </section>

      <section id="fields">
        <h2>The fields</h2>
        <p>Strings and lists of strings only. Everything under the frontmatter is for the reader.</p>
        <ul class="drows narrow">
          <li v-for="f in FIELDS" :key="f.name">
            <code>{{ f.name }}</code>
            <span>
              <template v-for="(part, k) in codeParts(f.note)" :key="k"
                ><code v-if="part.code">{{ part.text }}</code
                ><template v-else>{{ part.text }}</template></template
              ><span v-if="f.req" class="dreq">Required</span>
            </span>
          </li>
        </ul>
        <p class="dnote">A document carrying <code>kind:</code> is refused by name: work has no kinds.</p>
      </section>

      <section id="body">
        <h2>The body</h2>
        <p>
          Free markdown, in whatever shape fits: a sentence and a screenshot for a bug, a paragraph and a "done when"
          line for a feature. Tables, task lists and alerts (<code>&gt; [!WARNING]</code>) all render.
        </p>
        <p>What someone needs to <b>know</b> about a product belongs in its project's documents, not in a piece of work.</p>
      </section>

      <section id="worked">
        <h2>How it's worked</h2>
        <p>The same calls for all work, from the MCP server or the CLI. Each answer says what to call next.</p>
        <ul class="drows narrow">
          <li v-for="t in TOOLS" :key="t.name">
            <code>{{ t.name }}</code>
            <span>{{ t.note }}</span>
          </li>
        </ul>
      </section>

      <section id="links">
        <h2>Share links</h2>
        <p>
          Every piece of work has a link, <code>/w/&lt;id&gt;/&lt;key&gt;</code>. The key is the secret: whoever has the
          link reads it without an account, and adding <code>.md</code> gives the raw markdown. It runs no script and is
          never indexed.
        </p>
      </section>
    </DocsPage>

    <AppFoot />
  </main>
</template>
