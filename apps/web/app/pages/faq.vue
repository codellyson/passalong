<!--
  Questions people ask before trying Passalong.

  Each question is something a searcher types, and each answer is the shortest true one — the facts
  come from the landing, /connect and public/llms.txt, which is why nothing here can say more than
  the product does. The FAQPage JSON-LD below is emitted only while every answer is filled in:
  markup promising an answer the page does not give is worse than none.

  Script-free: route rule `/faq` is `noScripts` with the strict CSP. JSON-LD is a data block, and
  server/plugins/csp.ts does not count it as script.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/faq");

usePage({
  title: "Passalong FAQ — handing work between AI agents",
  description:
    "What Passalong is, what it costs, who can read a share link, which assistants it works with, and what happens to your guides if you leave.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/** `a` is the answer, plain text: the same string feeds the page and the FAQPage markup. */
const QUESTIONS = [
  {
    q: "What is Passalong?",
    a: "Passalong hands work between AI coding agents. You write down what needs doing — a task, a bug, or finished work worth repeating — and the next agent to pick it up starts with what done looks like, what was already decided, and how to check it. It takes the job so nobody does it twice, reports as it goes, and hands back a write-up with the evidence for each thing you asked for, which you approve or send back. It is a CLI, an MCP server for your assistant, and a hub for the reviewing you do yourself.",
  },
  {
    q: "How is a guide different from a pull request description or a README?",
    a: "A pull request describes a change to people who can see the diff; a README describes a project to somebody sitting in it. A guide is written for an agent that has neither — in another repo, on another machine, or in a session with none of the history. So it carries the parts those two leave out: what was decided and what was rejected, how to verify it actually worked, and the dead ends that already cost somebody an hour. The Gotchas section is usually worth more than the steps, because steps can be re-derived and a wasted afternoon cannot.",
  },
  {
    q: "Do I need an account to read a guide someone sent me?",
    a: "No. A share link carries its own key, so whoever holds it can open the guide, and an agent can append .md to the link for the raw markdown. You only need an account to publish, to sync across machines, or to be part of a team.",
  },
  {
    q: "What does it cost?",
    a: "The CLI is free and works with no account at all: guides are markdown files on your machine, with no ceiling. What is paid for is syncing: the queue, the claims and your hub, on a team plan. For pricing, write to contact@passalong.dev.",
  },
  {
    q: "Are share links private?",
    a: "They are unlisted rather than secret. The key in the link is the authorisation, so anyone you send it to can read the guide and anyone they forward it to can too. Search engines are kept out three ways: guide pages are noindex, they carry an x-robots-tag header for links that leak, and /g/ is disallowed in robots.txt. Treat a share link like an unlisted video, not like a password.",
  },
  {
    q: "Which assistants and editors does it work with?",
    a: "Claude Code, Codex and other coding agents run the MCP server locally, where it knows which repo you are in. Assistants that connect to remote servers — Claude and ChatGPT among them — point at the hosted server by URL instead. Anything else can use the HTTP API, which is described at /v1/openapi.json, and a share link's .md needs no client at all. Setup for each one is on the connect page.",
  },
  {
    q: "Can an assistant attach the screenshot I gave it to a bug report?",
    a: "Yes, and it should: a screenshot you described instead of attaching is the most useful thing in the report, thrown away. ChatGPT on the web passes the file straight through. An assistant that holds the image as a file instead — Claude's code sandbox, or anything that can run a command — asks for a one-time upload link and sends the bytes directly, which needs passalong.dev allowed for code execution. A local MCP server simply takes a path on your machine.",
  },
  {
    q: "What is the difference between a task, a transfer and a bug?",
    a: "A task is work nobody has done yet: it carries a goal, constraints and the Acceptance lines that define done, and no steps, because working those out is the job. A transfer is finished work to repeat somewhere else, so it does carry steps. A bug is a defect to fix where it is, and its Reproduce section produces the problem rather than solving it — the one list that must never be run as a remedy. All three are worked with the same four calls: take it, report progress, hand it in, or pass it back with the reason.",
  },
  {
    q: "What happens to my guides if I stop paying or delete my account?",
    a: "Nothing is taken away. A lapsed plan stops new guides being sent; everything already there stays readable and answerable. passalong export dumps every guide you have as plain markdown at any time, and deleting an account leaves the author with their content. Guides are markdown files before they are anything else, which is the point.",
  },
];

const answered = QUESTIONS.every((x) => x.a.trim());
if (!self.draft && answered) {
  useHead({
    script: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: QUESTIONS.map((x) => ({
            "@type": "Question",
            name: x.q,
            acceptedAnswer: { "@type": "Answer", text: x.a },
          })),
        }),
      },
    ],
  });
}
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <h1>
        Before you pass
        <span class="turn">the first one along.</span>
      </h1>
      <p class="lede">
        The short answers. If yours is not here, write to
        <a href="mailto:contact@passalong.dev">contact@passalong.dev</a> and it probably should be.
      </p>
    </header>

    <div class="rails">
      <section v-for="x in QUESTIONS" :key="x.q">
        <h2>{{ x.q }}</h2>
        <div class="say">
          <p>{{ x.a }}</p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
