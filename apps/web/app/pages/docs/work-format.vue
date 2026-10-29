<!--
  The work format, for people. public/llms.txt is the same material written for an agent.

  The format itself is defined in apps/api/src/guide.ts; if a field changes there, this page and
  llms.txt change with it.

  Script-free: route rule `/docs/**` is `noScripts` with the strict CSP.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs/work-format");

usePage({
  title: "Passalong work format — markdown agents act on",
  description:
    "The frontmatter a piece of work carries, why the body has no required shape, and how an agent works it.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/** Frontmatter, in order. From llms.txt "Work format". */
const FIELDS = [
  {
    name: "title",
    note: "What needs doing, in plain words. Required; it is the line on the board.",
  },
  {
    name: "summary",
    note: "One or two plain sentences for a person, 400 characters at most, no ids or paths. Required: it is what the hub shows first.",
  },
  {
    name: "status",
    note: "`draft` (read it first), `published` (Ready) or `consumed` (archived). New work is Ready unless it says `draft`. `promoted` still parses, and nothing can set it.",
  },
  { name: "team", note: "The team it is in, by slug. Without one it is yours alone." },
  {
    name: "to",
    note: "Inside that team: `@handle` asks one person, `#group` asks the people who do a thing, several names ask each of them, and leaving it off asks the whole team.",
  },
  { name: "id", note: "8 characters from a no-lookalike alphabet. An address, not a secret." },
  { name: "url", note: "Its share link, written in by the server." },
  {
    name: "tags",
    note: "A list. Lowercase, words joined by a hyphen. An agent may tag `bug`, `feature` or `question` as a description; no rule turns on a tag.",
  },
  {
    name: "parent",
    note: "The work this came from: a customer's request, or a bigger piece of work. Finishing it tells the parent.",
  },
  {
    name: "blocked_by",
    note: "A list of ids that must be Done before this one is handed out.",
  },
  {
    name: "target_context",
    note: "The repo it is for, as owner/repo, when there is one. Chosen when it is marked Ready if it has none.",
  },
  {
    name: "stack_assumptions",
    note: "A list, optional. The author's environment, to adapt rather than copy.",
  },
];

/** The calls every piece of work is worked with, in the order they are used. */
const TOOLS = [
  {
    name: "take",
    note: "Say you are doing it, and get it: by id, or the next one waiting. Nobody else can take it while you hold it.",
  },
  {
    name: "progress",
    note: "A one-line note at each milestone. Thirty minutes without one marks it stalled.",
  },
  {
    name: "hand_in",
    note: "Done, with evidence: what you ran and what came back, or a screenshot. It goes to Done; a person can reopen it with a reason.",
  },
  { name: "pass", note: "Not yours, or stuck: give it back with the reason for whoever is next." },
  {
    name: "ask",
    note: "You need the person's answer. You keep it, stop, and take it again once they reply.",
  },
];

/** A short piece of work, written out. Short on purpose: most work is a few lines. */
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
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>
        Markdown with frontmatter,
        <span class="turn">and whatever shape the work needs.</span>
      </h1>
      <p class="lede">
        A piece of work is one thing: a title, a summary for a person, and the text, pictures and
        files the next reader needs. There are no kinds, required sections or templates — the agent
        that takes it reads it and works out what done means. Under that, it is plain markdown,
        yours to grep, export and keep.
      </p>
    </header>

    <div class="rails">
      <section>
        <h2>The fields, in order</h2>
        <div class="say">
          <p>
            Frontmatter is what the product reads: what the work is called, who it is for and where
            it came from. Strings and lists of strings only. Everything under it is for the reader.
          </p>
          <dl class="kinds">
            <template v-for="f in FIELDS" :key="f.name">
              <dt>{{ f.name }}</dt>
              <dd>
                <template v-for="(part, k) in codeParts(f.note)" :key="k"
                  ><code v-if="part.code">{{ part.text }}</code
                  ><template v-else>{{ part.text }}</template></template
                >
              </dd>
            </template>
          </dl>
          <p>
            A document carrying <code>kind:</code> is refused by name: work has no kinds, and a
            field that used to steer the reader would now say something nobody meant.
          </p>
        </div>
      </section>

      <section>
        <h2>The body</h2>
        <div class="say">
          <p>
            Free markdown. Write what the next reader needs, in the shape that fits: a sentence and a
            screenshot for a bug, a paragraph of context and a line saying "done when" for a feature.
            Nothing requires a heading. GitHub-flavored markdown renders — tables, task lists,
            footnotes and alerts (<code>&gt; [!WARNING]</code>), so what must not be missed is not
            left to bold text.
          </p>
          <p>
            What someone needs to <em>know</em> about a product — how it is built, a decision, what
            changed — belongs in its project's documents, not in a piece of work handed to one person.
          </p>
        </div>
      </section>

      <section>
        <h2>How it is worked</h2>
        <div class="say">
          <p>
            Every piece of work is worked with the same calls, from the MCP server or the CLI, and
            each answer ends with what to call next.
          </p>
          <dl class="kinds">
            <template v-for="t in TOOLS" :key="t.name">
              <dt>{{ t.name }}</dt>
              <dd>{{ t.note }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <section>
        <h2>Share links</h2>
        <div class="say">
          <p>
            Every piece of work has a link, <code>/g/&lt;id&gt;/&lt;key&gt;</code>. The key is the
            secret: whoever holds the link reads it without an account, and appending
            <code>.md</code> gives the raw markdown. The page runs no script and is never indexed.
          </p>
        </div>
      </section>

      <section>
        <h2>A piece of work</h2>
        <div class="say">
          <pre><code>{{ EXAMPLE }}</code></pre>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
