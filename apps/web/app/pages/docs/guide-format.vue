<!--
  SKELETON — the guide format, for people. `draft: true` in shared/pages.ts keeps it noindex, out
  of the sitemap and out of the footer until the copy is written.

  The facts here are already true and come from public/llms.txt, which is the authority. The format
  itself is defined in apps/api/src/guide.ts; if a field or heading changes there, this page and
  llms.txt both change with it. What is still TODO is the prose around the facts.

  Script-free: route rule `/docs/**` is `noScripts` with the strict CSP.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs/guide-format");

usePage({
  // TODO(copy): under ~60 characters.
  title: "The Passalong guide format — markdown an agent can act on",
  // TODO(copy): under ~155 characters.
  description:
    "Frontmatter fields and section headings for transfer guides and bug reports, and what a receiving agent does with each.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/** Frontmatter, in order. From llms.txt "Guide format". */
const FIELDS = [
  { name: "id", note: "8 characters from a no-lookalike alphabet. An address, not a secret." },
  { name: "title", note: "TODO(copy)" },
  { name: "kind", note: "transfer (or absent) or bug. Read it before acting." },
  { name: "created", note: "TODO(copy)" },
  { name: "author", note: "TODO(copy)" },
  { name: "source_context", note: "TODO(copy): the project the work was done in." },
  { name: "status", note: "draft or published; consumed is the author's shelf." },
  { name: "team", note: "TODO(copy)" },
  { name: "to", note: "@handle asks one person; #group asks the people who do a thing." },
  { name: "stack_assumptions", note: "A list. The author's environment, to adapt rather than copy." },
  { name: "tags", note: "A list." },
  { name: "report, area, severity", note: "Bugs only. severity runs s1 (blocker) to s4 (cosmetic)." },
];

/** Transfer sections, in order. The headings are what a receiving agent keys on. */
const TRANSFER = [
  { h: "Problem", note: "What was actually wrong. Required." },
  { h: "Solution shape", note: "The approach, not a diff." },
  { h: "Decisions and rationale", note: "What was chosen over what, and why." },
  { h: "Steps", note: "What to do. Required." },
  { h: "Verification", note: "How to know it worked. A guide without it is flagged to the reader." },
  { h: "Gotchas", note: "What failed on the way. The highest-value section." },
];

const BUG = [
  { h: "Problem", note: "What is wrong." },
  { h: "Reproduce", note: "How to see the bug. Running it produces the bug; it is not a remedy." },
  { h: "Verification", note: "The behaviour that should have happened." },
  { h: "Gotchas", note: "TODO(copy)" },
];

/** A minimal transfer guide. TODO(copy): replace with a real, short example. */
const EXAMPLE = `---
title: TODO
kind: transfer
author: TODO
source_context: TODO
stack_assumptions:
  - TODO
tags: [TODO]
---

## Problem

## Solution shape

## Decisions and rationale

## Steps

## Verification

## Gotchas
`;
</script>

<template>
  <main class="wide landing">
    <nav class="masthead">
      <AppBrand />
      <a class="btn" href="/hub">Sign in</a>
    </nav>

    <header class="hero">
      <p class="eyebrow">Docs · Guide format</p>
      <h1>
        Markdown with frontmatter,
        <span class="turn">shaped so the next agent can act on it.</span>
      </h1>
      <p class="lede">
        TODO: why the format is fixed — the headings are what a receiving agent keys on — and that it
        is plain markdown you can export and keep.
      </p>
    </header>

    <div class="rails">
      <section>
        <p class="eyebrow">Frontmatter</p>
        <h2>The fields, in order</h2>
        <div class="say">
          <p>TODO: one sentence on what frontmatter is for here.</p>
          <dl class="kinds">
            <template v-for="f in FIELDS" :key="f.name">
              <dt>{{ f.name }}</dt>
              <dd>{{ f.note }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <section>
        <p class="eyebrow">kind: transfer</p>
        <h2>Finished work to repeat</h2>
        <div class="say">
          <p>TODO: what the receiver does — follow Steps, adapt assumptions, run Verification, answer.</p>
          <dl class="kinds">
            <template v-for="s in TRANSFER" :key="s.h">
              <dt>## {{ s.h }}</dt>
              <dd>{{ s.note }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <section>
        <p class="eyebrow">kind: bug</p>
        <h2>A defect to fix</h2>
        <div class="say">
          <p>
            TODO: why a bug has Reproduce rather than Steps — Steps is the heading an agent is told
            to execute.
          </p>
          <dl class="kinds">
            <template v-for="s in BUG" :key="s.h">
              <dt>## {{ s.h }}</dt>
              <dd>{{ s.note }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <section>
        <p class="eyebrow">More context</p>
        <h2>Follow-ups</h2>
        <div class="say">
          <p>
            TODO: a follow-up is a whole guide with <code>parent</code> set, listed under the
            original; where they disagree, the follow-up is newer.
          </p>
        </div>
      </section>

      <section>
        <p class="eyebrow">Example</p>
        <h2>A transfer guide</h2>
        <div class="say">
          <pre><code>{{ EXAMPLE }}</code></pre>
        </div>
      </section>

      <section>
        <p class="eyebrow">Writing a good one</p>
        <h2>What makes a guide worth picking up</h2>
        <div class="say">
          <!-- TODO(copy): from llms.txt "Writing a good guide" — one problem per guide, Verification
               first, Gotchas over Steps, state the environment. -->
          <p>TODO</p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
