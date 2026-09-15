<!--
  SKELETON — the docs front page. `draft: true` in shared/pages.ts keeps it noindex, out of the
  sitemap and out of the footer until the copy is written.

  What it is for: the searchable home of what today only lives in README.md, public/llms.txt and
  docs/wiki. Each rail is one topic with a line of what it covers and where it goes next. Rails that
  point at pages not written yet say so rather than linking nowhere.

  Script-free like the landing and /connect: its route rule is `noScripts` with the strict CSP.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs");

usePage({
  // TODO(copy): under ~60 characters, and name what someone would search for.
  title: "Passalong docs — transfer guides for AI coding agents",
  // TODO(copy): under ~155 characters.
  description:
    "How to write, send and pick up Passalong guides from the CLI, an MCP server or the API.",
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
    eyebrow: "Start",
    h: "Install and connect",
    // TODO(copy): npm i -g passalong, passalong setup, passalong login — and that reading needs nothing.
    p: "TODO: the three commands, what each one does, and that reading a guide needs no install.",
    href: "/connect",
    link: "Connect your tools",
  },
  {
    eyebrow: "The document",
    h: "The guide format",
    p: "TODO: one line on frontmatter plus sections, and why the headings are stable.",
    href: "/docs/guide-format",
    link: "Read the format",
  },
  {
    eyebrow: "Sending",
    h: "Share a guide",
    // TODO(copy): passalong share, --to team/handle and #group, "pass this along" in Claude Code, the hub's writer.
    p: "TODO: share from Claude Code, the CLI or the hub; addressing a person or a group.",
    href: null,
    link: "",
  },
  {
    eyebrow: "Receiving",
    h: "Pick one up and answer",
    // TODO(copy): start/take/pass, works/broken, done — and that the sender hears each one.
    p: "TODO: taking or passing, then saying whether it worked.",
    href: null,
    link: "",
  },
  {
    eyebrow: "More context",
    h: "Follow-ups and bug reports",
    // TODO(copy): --follows / parent, file_bugs, kind: bug vs transfer, and attaching screenshots
    // (per assistant, already written at /connect#screenshots).
    p: "TODO: adding context to a guide, and filing a set of bugs as one report.",
    href: null,
    link: "",
  },
  {
    eyebrow: "Reference",
    h: "CLI, MCP tools and API",
    // TODO(copy): decide whether these become /docs/cli and /docs/mcp, or stay in llms.txt.
    p: "TODO: every command, every MCP tool, and the OpenAPI document.",
    href: "/v1/openapi.json",
    link: "The API document",
  },
];
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <p class="eyebrow">Docs</p>
      <!-- TODO(copy): the h1 should say what the reader will be able to do. -->
      <h1>
        Everything a guide needs
        <span class="turn">to get from one context to the next.</span>
      </h1>
      <p class="lede">
        TODO: two sentences. What Passalong is, and the three ways to use it — Claude Code, the
        command line, or any assistant that adds MCP servers.
      </p>
    </header>

    <div class="rails">
      <section v-for="t in TOPICS" :key="t.h">
        <p class="eyebrow">{{ t.eyebrow }}</p>
        <h2>{{ t.h }}</h2>
        <div class="say">
          <p>{{ t.p }}</p>
          <p v-if="t.href"><a :href="t.href">{{ t.link }}</a></p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
