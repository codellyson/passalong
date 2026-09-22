<!--
  SKELETON — questions people ask before trying Passalong. `draft: true` in shared/pages.ts keeps
  it noindex, out of the sitemap and out of the footer until the answers are written.

  The questions are the part worth keeping: each is something a searcher types. `notes` on each one
  is where the true answer already lives, so writing it is rewording rather than research. The
  FAQPage JSON-LD is only emitted once the page is published and every answer is filled in — markup
  promising an answer the page does not give is worse than none.

  Script-free: route rule `/faq` is `noScripts` with the strict CSP. JSON-LD is a data block, and
  server/plugins/csp.ts does not count it as script.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/faq");

usePage({
  // TODO(copy): under ~60 characters.
  title: "Passalong FAQ — handing work between AI agent sessions",
  // TODO(copy): under ~155 characters.
  description:
    "What Passalong is, what it costs, who can read a share link, and which assistants it works with.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

/** `a` is the published answer, plain text. `notes` says where the facts are; delete once written. */
const QUESTIONS = [
  {
    q: "What is Passalong?",
    a: "",
    notes: "Landing lede; README.md opening paragraph.",
  },
  {
    q: "How is a guide different from a pull request description or a README?",
    a: "",
    notes:
      "Decisions, Verification and Gotchas; written for an agent in another context to act on.",
  },
  {
    q: "Do I need an account to read a guide someone sent me?",
    a: "",
    notes: "No. The key in the share link is the authorisation; append .md for raw markdown.",
  },
  {
    q: "What does it cost?",
    a: "",
    notes: "PRICING in pages/index.vue: local CLI free, Solo $5/month, Team $10 for three seats.",
  },
  {
    q: "Are share links private?",
    a: "",
    notes: "Whoever holds the link can read it. noindex, x-robots-tag, robots.txt disallows /g/.",
  },
  {
    q: "Which assistants and editors does it work with?",
    a: "",
    notes:
      "/connect: Claude Code, Cursor, Zed, Gemini CLI locally; any MCP connector by URL; HTTP API.",
  },
  {
    q: "Can an assistant attach the screenshot I gave it to a bug report?",
    a: "",
    notes:
      "/connect#screenshots: ChatGPT web passes the file; Claude uploads from its sandbox via create_upload once passalong.dev is allowed; local servers take a path.",
  },
  {
    q: "What is the difference between a task, a transfer and a bug?",
    a: "",
    notes: "/connect statement section; llms.txt 'Three kinds of guide'. Same four calls for all.",
  },
  {
    q: "What happens to my guides if I stop paying or delete my account?",
    a: "",
    notes:
      "llms.txt: passalong export dumps every guide; deleting an account leaves the author their content.",
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
      <p class="eyebrow">Questions</p>
      <h1>
        Before you pass
        <span class="turn">the first one along.</span>
      </h1>
      <p class="lede">TODO: one sentence, and where to ask if the answer is not here.</p>
    </header>

    <div class="rails">
      <section v-for="x in QUESTIONS" :key="x.q">
        <h2>{{ x.q }}</h2>
        <div class="say">
          <p>{{ x.a || `TODO — ${x.notes}` }}</p>
        </div>
      </section>
    </div>

    <AppFoot />
  </main>
</template>
