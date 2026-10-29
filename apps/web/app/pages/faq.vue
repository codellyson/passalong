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
    "What Passalong is, what it costs, who can read a share link, which assistants it works with, and what happens to your work if you leave.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/** `a` is the answer, plain text: the same string feeds the page and the FAQPage markup. */
const QUESTIONS = [
  {
    q: "What is Passalong?",
    a: "Passalong keeps a team's work and what it knows, for people and AI agents. You write down what needs doing in plain words — or an email, an alert or a customer does — and the agent that picks it up takes it so nobody does it twice, reports as it goes, and hands it in with the evidence. Each project's documents say what the product is and how it is built, and agents read them when they take work and update them when they finish. It is a CLI, an MCP server for your assistant, and a hub for the people.",
  },
  {
    q: "How is a piece of work different from an issue or a README?",
    a: "A piece of work is written for an agent as much as a person: a title, a one-line summary for whoever scans the board, and the text, screenshots and files the agent needs, in whatever shape fits. There are no kinds, required sections or templates; the agent reads it and works out what done means. What someone needs to know rather than do — how a product is built, a decision, what changed — goes in the project's documents, where everyone finds it later.",
  },
  {
    q: "Do I need an account to read work someone sent me?",
    a: "No. A share link carries its own key, so whoever holds it can open it, and an agent can append .md to the link for the raw markdown. You need an account to write work down, to take it, or to be part of a team.",
  },
  {
    q: "What does it cost?",
    a: "Solo is $5 a month and Team is $20 a month for up to ten people. Reading a share link is always free. For anything else, write to contact@passalong.dev.",
  },
  {
    q: "Are share links private?",
    a: "They are unlisted rather than secret. The key in the link is the authorisation, so anyone you send it to can read it and anyone they forward it to can too. Search engines are kept out three ways: share pages are noindex, they carry an x-robots-tag header for links that leak, and /g/ is disallowed in robots.txt. Treat a share link like an unlisted video, not like a password.",
  },
  {
    q: "Which assistants and editors does it work with?",
    a: "Claude Code, Codex and other coding agents run the MCP server locally, where it knows which repo you are in. Assistants that connect to remote servers — Claude and ChatGPT among them — point at the hosted server by URL instead. Anything else can use the HTTP API, which is described at /v1/openapi.json, and a share link's .md needs no client at all. Setup for each one is on the connect page.",
  },
  {
    q: "Can an assistant attach the screenshot I gave it?",
    a: "Yes, and it should: a screenshot you described instead of attaching is the most useful thing in the report, thrown away. ChatGPT on the web passes the file straight through. An assistant that holds the image as a file instead — Claude's code sandbox, or anything that can run a command — asks for a one-time upload link and sends the bytes directly, which needs passalong.dev allowed for code execution. A local MCP server takes a path on your machine.",
  },
  {
    q: "Is it a task, a bug or a handover?",
    a: "None of those, on purpose: work is one thing. An agent may label it bug, feature or question so the board reads at a glance, but nothing turns on the label. Every piece of work is worked the same way: take it, report progress, ask when it needs a person, hand it in with evidence, or pass it back with the reason. Knowledge that used to travel as a handover goes into the project's documents instead.",
  },
  {
    q: "What happens to my work if I stop paying or delete my account?",
    a: "Nothing is taken away. A lapsed plan stops new work coming in; everything already there stays readable and can still be finished. passalong export dumps all of it as plain markdown at any time, and deleting an account leaves the author with their content.",
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
        <a href="mailto:support@kreativekorna.com">support@kreativekorna.com</a> and it probably should be.
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
