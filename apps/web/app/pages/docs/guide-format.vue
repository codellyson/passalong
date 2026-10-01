<!--
  The guide format, for people. public/llms.txt is the same material written for an agent.

  The format itself is defined in apps/api/src/guide.ts; if a field or a heading changes there,
  this page and llms.txt change with it.

  Script-free: route rule `/docs/**` is `noScripts` with the strict CSP.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs/guide-format");

usePage({
  title: "Passalong guide format — markdown agents act on",
  description:
    "Frontmatter fields and section headings for transfer guides, bug reports and tasks, and what a receiving agent does with each.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/** Frontmatter, in order. From llms.txt "Guide format". */
const FIELDS = [
  { name: "id", note: "8 characters from a no-lookalike alphabet. An address, not a secret." },
  {
    name: "title",
    note: "What the work accomplishes, as a verb phrase. It is the line in an inbox.",
  },
  { name: "kind", note: "transfer (or absent), bug or task. Read it before acting." },
  {
    name: "created",
    note: "When it was written. Stamped for you; the reader uses it to judge the stack.",
  },
  {
    name: "author",
    note: "Who wrote it, from git. Who to ask when the guide turns out to be wrong.",
  },
  { name: "source_context", note: "The project and branch the work was done in, as repo@branch." },
  { name: "status", note: "draft or published; consumed is the author's shelf." },
  { name: "team", note: "The team it is shared with, by slug. Without one it is yours alone." },
  { name: "to", note: "@handle asks one person; #group asks the people who do a thing." },
  {
    name: "stack_assumptions",
    note: "A list. The author's environment, to adapt rather than copy.",
  },
  { name: "tags", note: "A list." },
  {
    name: "report, area, severity",
    note: "Bugs only. severity runs s1 (blocker) to s4 (cosmetic).",
  },
  {
    name: "target_context",
    note: "Tasks only. The repo the work is for, as owner/repo. Empty is a task for no repo.",
  },
  {
    name: "blocked_by",
    note: "Tasks only. A list of task ids it waits for; it is not handed out until each is approved.",
  },
];

/** Transfer sections, in order. The headings are what a receiving agent keys on. */
const TRANSFER = [
  { h: "Problem", note: "What was actually wrong. Required." },
  { h: "Solution shape", note: "The approach, not a diff." },
  { h: "Decisions and rationale", note: "What was chosen over what, and why." },
  { h: "Steps", note: "What to do. Required." },
  {
    h: "Verification",
    note: "How to know it worked. A guide without it is flagged to the reader.",
  },
  { h: "Gotchas", note: "What failed on the way. The highest-value section." },
];

const BUG = [
  { h: "Problem", note: "What is wrong." },
  { h: "Reproduce", note: "How to see the bug. Running it produces the bug; it is not a remedy." },
  { h: "Verification", note: "The behaviour that should have happened." },
  { h: "Gotchas", note: "What made it hard to see, and what a fix must not break." },
];

/** Task sections, in order. A brief written before the work, so there are no Steps. */
const TASK = [
  { h: "Goal", note: "What is true when this is done. Required." },
  { h: "Context", note: "What the agent needs to know first: where the code is, what exists." },
  { h: "Constraints", note: "What must not change, and what to use or avoid." },
  {
    h: "Acceptance",
    note: "Checks a person can run. What the work is approved against. Required.",
  },
  { h: "Out of scope", note: "What looks related and is not part of this task." },
];

/** The four calls every guide is worked with, whatever its kind, in the order they are used. */
const TASK_TOOLS = [
  {
    name: "take",
    note: "Say you are doing it, and get it: by id, or the next one waiting. Nobody else can take it there while you hold it.",
  },
  {
    name: "progress",
    note: "A one-line note at each milestone. Thirty minutes without one marks it stalled.",
  },
  {
    name: "hand_in",
    note: "Done here, with evidence: what you ran and what came back. A task hands in a write-up too, for its author to review; a handoff or a bug, whether it worked.",
  },
  { name: "pass", note: "Not yours, or stuck: give it back with the reason for whoever is next." },
];

/**
 * A short transfer guide, written out. Short on purpose: the shape is the lesson, and a long
 * example teaches that guides are long.
 */
const EXAMPLE = `---
title: Verify Paystack webhooks before trusting them
kind: transfer
author: Ada Lovelace
source_context: acme/shop@main
stack_assumptions:
  - Cloudflare Workers, Hono 4
  - Paystack, live keys in wrangler secrets
tags: [webhooks, payments, security]
---

## Problem

Any POST to /webhooks/paystack was treated as real, so a forged body could mark an order
paid. It showed up as one order paid twice, from two different IPs.

## Solution shape

Verify the signature before reading the body, with the raw bytes rather than the parsed
JSON — re-serialising changes the bytes and the HMAC never matches.

## Decisions and rationale

- **Verify in the route, not in middleware**, because only this route has the secret.
- **Chose HMAC over an IP allowlist**: Paystack's egress addresses change without notice.

## Steps

1. Read the raw body: \`const raw = await c.req.text()\`.
2. HMAC-SHA512 it with PAYSTACK_SECRET and compare, in constant time, to the
   \`x-paystack-signature\` header.
3. Refuse with 401 before parsing. Only then \`JSON.parse(raw)\`.

## Verification

\`\`\`sh
curl -X POST localhost:8787/webhooks/paystack -d '{"event":"charge.success"}'   # 401
npm test -w apps/api -- webhook                                                # 6 pass
\`\`\`

## Gotchas

Comparing with \`===\` leaks where two signatures diverge, one character at a time. Use a
constant-time compare. And Paystack sends a test event on save: it is signed with the same
secret, so a 401 there means the secret is wrong, not that the check works.
`;
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>
        Markdown with frontmatter,
        <span class="turn">shaped so the next agent can act on it.</span>
      </h1>
      <p class="lede">
        The headings are fixed because they are what a receiving agent keys on: it is told to follow
        Steps, to run Verification before saying it worked, and never to execute Reproduce. Under
        that, it is plain markdown — yours to grep, commit, export and keep.
      </p>
    </header>

    <div class="rails">
      <section>
        <h2>The fields, in order</h2>
        <div class="say">
          <p>
            Frontmatter is what the product reads: who a guide is for, what it is, and what the
            author's machine was. Everything under it is for the reader.
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
        </div>
      </section>

      <section>
        <h2>Finished work to repeat: <code>kind: transfer</code></h2>
        <div class="say">
          <p>
            The receiver follows Steps, adapting anything the author marked as an assumption to the
            codebase in front of it, runs Verification before saying it worked, and answers — which
            is the half that makes the next guide better.
          </p>
          <dl class="kinds">
            <template v-for="s in TRANSFER" :key="s.h">
              <dt>## {{ s.h }}</dt>
              <dd>
                <template v-for="(part, k) in codeParts(s.note)" :key="k"
                  ><code v-if="part.code">{{ part.text }}</code
                  ><template v-else>{{ part.text }}</template></template
                >
              </dd>
            </template>
          </dl>
        </div>
      </section>

      <section>
        <h2>A defect to fix: <code>kind: bug</code></h2>
        <div class="say">
          <p>
            Reproduce, not Steps, and the difference is load-bearing: Steps is the heading an agent
            is told to execute, and steps that produce a defect are the one list that must never be
            run as a remedy. An agent that confuses them reproduces the bug, checks Verification,
            finds it false because the bug is real, and reports the guide as broken.
          </p>
          <dl class="kinds">
            <template v-for="s in BUG" :key="s.h">
              <dt>## {{ s.h }}</dt>
              <dd>
                <template v-for="(part, k) in codeParts(s.note)" :key="k"
                  ><code v-if="part.code">{{ part.text }}</code
                  ><template v-else>{{ part.text }}</template></template
                >
              </dd>
            </template>
          </dl>
        </div>
      </section>

      <section>
        <h2>Work for an agent: <code>kind: task</code></h2>
        <div class="say">
          <p>
            A task is written before any work exists. It has no Steps: the agent that takes it works
            out how to reach Goal within Constraints, and a person approves the result against
            Acceptance. What the agent did comes back as a transfer guide.
          </p>
          <dl class="kinds">
            <template v-for="s in TASK" :key="s.h">
              <dt>## {{ s.h }}</dt>
              <dd>
                <template v-for="(part, k) in codeParts(s.note)" :key="k"
                  ><code v-if="part.code">{{ part.text }}</code
                  ><template v-else>{{ part.text }}</template></template
                >
              </dd>
            </template>
          </dl>
          <p>
            Every kind is worked with the same four calls, and each answer ends with what to call
            next. Write tasks with <code>plan_tasks</code>.
          </p>
          <dl class="kinds">
            <template v-for="t in TASK_TOOLS" :key="t.name">
              <dt>{{ t.name }}</dt>
              <dd>{{ t.note }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <section>
        <h2>Follow-ups</h2>
        <div class="say">
          <p>
            A follow-up is a whole guide — its own id, its own link, its own verdicts — with
            <code>parent</code> set to the guide it adds to. It is listed under the original, and
            whoever opens the original gets it too, person or agent. Where the two disagree, the
            follow-up is the newer fact.
          </p>
        </div>
      </section>

      <section>
        <h2>A transfer guide</h2>
        <div class="say">
          <pre><code>{{ EXAMPLE }}</code></pre>
        </div>
      </section>

      <section>
        <h2>What makes a guide worth picking up</h2>
        <div class="say">
          <ul>
            <li>
              <b>One problem per guide.</b> A session that solved three things is three guides.
            </li>
            <li>
              <b>Write Verification first.</b> If you cannot say how to check it, the guide is not
              ready to send.
            </li>
            <li>
              <b>Gotchas is worth more than Steps.</b> Steps can be re-derived. The dead end that
              cost an hour cannot.
            </li>
            <li>
              <b>Say what your environment was</b> rather than assuming the reader shares it.
            </li>
          </ul>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
