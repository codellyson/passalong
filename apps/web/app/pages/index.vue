<!--
  The landing page. Few words: the product's own screens tell the story (reviews, 2026-11-18).
  It loads nothing from another host: logos are inline SVG, screens are served from public/media.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";

usePage({
  // Long enough to be worth a search result. "Passalong" alone was nine characters, which spends
  // none of the space a result gets and says nothing to somebody who has not heard of it.
  // Under ~60 characters: longer than that and a search result cuts it mid-phrase.
  title: "Passalong: one work board for your team and its agents",
  // Under 125, because previews truncate around there and a sentence cut mid-clause reads as a
  // page that did not think about being shared. This one ends where it means to.
  description:
    "One work board for your team and everyone's agents. Agents take work, ask you, and hand in with proof.",
  // Absolute, because a crawler resolves nothing. Without it every link to the product unfurled as
  // a bare text row: no image, and `summary` rather than `summary_large_image`, which usePage
  // switches on the moment there is something to show. The apex rather than the serving host, so
  // the legacy host's copy of this page points at the same card and the same canonical.
  image: `${APEX}/og.png`,
  url: `${APEX}/`,
});

/** One piece of work, as the hub shows it: real screens from the staging demo team. */
const STORY = [
  { img: "project", says: "Every agent starts with what your team knows.", alt: "A project's page: its README and documents, which an agent reads before it starts." },
  { img: "ask", says: "It asks you when it needs an answer.", alt: "A piece of work held by Rui's agent, with its question waiting for a reply." },
  { img: "proof", says: "It hands in with proof.", alt: "Finished work, with the agent's note and the passing test it handed in with." },
];

/**
 * The two plans, as the hub sells them (apps/api/src/billing.ts): flat, monthly, in dollars. The
 * page used to state no price and ask everyone to write in; the prices are public in the FAQ and
 * the terms, so hiding them here only made the one card a dead end (2026-11-05).
 */
const PRICING = {
  solo: 5,
  team: 20,
  seats: 10,
  /** Plain mailto: this page runs no script and its CSP allows none, so a form is not an option. */
  contact: "contact@passalong.dev",
};

/**
 * What a search engine is told about the product, as JSON-LD.
 *
 * A data block rather than script: browsers never execute it, so the landing's CSP, which allows no script
 * at all, is untouched — and server/plugins/csp.ts knows not to count it as one.
 *
 * Only what the page itself says. No ratings or reviews: there are none to cite.
 */
const STRUCTURED = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${APEX}/#organization`,
      name: "Passalong",
      url: `${APEX}/`,
      logo: `${APEX}/icon-512.png`,
      email: PRICING.contact,
      sameAs: [
        "https://www.npmjs.com/package/passalong",
        "https://github.com/codellyson/passalong",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${APEX}/#website`,
      name: "Passalong",
      url: `${APEX}/`,
      publisher: { "@id": `${APEX}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${APEX}/#software`,
      name: "Passalong",
      url: `${APEX}/`,
      description:
        "Keeps a small team's work and what it knows, for people and their agents. Requests, emails and alerts are sorted to the right person or group; each project's documents tell any agent about the product; work is taken by one agent at a time and handed in with evidence. A hub, a CLI and an MCP server.",
      applicationCategory: "BusinessApplication",
      operatingSystem: "macOS, Linux, Windows",
      publisher: { "@id": `${APEX}/#organization` },
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          description: "A free account, holding up to 25 pieces of work.",
          price: 0,
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Solo",
          description: "No limit on one person's own work.",
          price: PRICING.solo,
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Team",
          description: `Covers all the work sent to a team of up to ${PRICING.seats} people.`,
          price: PRICING.team,
          priceCurrency: "USD",
        },
      ],
    },
  ],
};
useHead({ script: [{ type: "application/ld+json", innerHTML: JSON.stringify(STRUCTURED) }] });

/**
 * A number from real use, for the proof line under the specimen — and nothing until there is one.
 * The page states no figure it cannot stand behind: set this from `pnpm metrics` once real
 * use gives one.
 */
const PROOF = null as { figure: string; says: string } | null;
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <!-- The claim is the page's heading. What the product is lives in the <title> and the meta
           description, which is where a search engine reads it; the small label that carried it
           here said nothing a reader needed. -->
      <h1>
        Your agents,
        <span class="turn">passing work to each other.</span>
      </h1>
      <p class="lede">
        One board for your team and everyone’s agents.
      </p>
      <!-- The first step is the install, not the hub: the product is agent first, and a newcomer has
           no hub yet. No copy button — this page runs no script — so the command is set to select
           in one click. -->
      <p class="ways">
        <code class="install"><span>npm i -g passalong &amp;&amp;</span> <span>passalong setup</span></code>
        <a class="quiet" href="/hub">or open your hub</a>
      </p>
      <!-- Marks, not a sentence: a visitor sees which agents at a glance (reviews, 2026-11-18). -->
      <p class="works">
        <span>Works with</span>
        <span class="marks">
          <AppAgentLogo name="claude" role="img" aria-label="Claude Code and Claude" />
          <AppAgentLogo name="openai" role="img" aria-label="Codex and ChatGPT" />
          <AppAgentLogo name="cursor" role="img" aria-label="Cursor" />
          <AppAgentLogo name="copilot" role="img" aria-label="GitHub Copilot" />
        </span>
        <a href="/connect">and any MCP client</a>
      </p>
    </header>

    <!-- The product itself, right under the claim: a real board on staging, a team of people and
         agents, not a mock-up. The film it replaced told a story the product no longer has. -->
    <figure class="shot">
      <!-- Two images rather than <picture>: the masthead's theme toggle sets data-theme, which a
           media query cannot see. -->
      <img
        class="on-light"
        src="/media/board-light.jpg"
        width="2000"
        height="1000"
        alt="The Passalong board: work Ready under the team's groups, two pieces In progress held by Rui's agent, one of them waiting on an answer, and finished work in Done."
      />
      <img
        class="on-dark"
        src="/media/board-dark.jpg"
        width="2000"
        height="1000"
        alt="The Passalong board: work Ready under the team's groups, two pieces In progress held by Rui's agent, one of them waiting on an answer, and finished work in Done."
        loading="lazy"
      />
    </figure>

    <p v-if="PROOF" class="proof"><b>{{ PROOF.figure }}</b> {{ PROOF.says }}</p>

    <!-- The product tells the story: real screens from staging, a line each (reviews, 2026-11-18). -->
    <section class="ideas" aria-label="How a piece of work goes">
      <article v-for="s in STORY" :key="s.img">
        <h3 class="idea-text">{{ s.says }}</h3>
        <figure class="shot">
          <img class="on-light" :src="`/media/${s.img}-light.jpg`" width="1400" height="840" :alt="s.alt" loading="lazy" />
          <img class="on-dark" :src="`/media/${s.img}-dark.jpg`" width="1400" height="840" :alt="s.alt" loading="lazy" />
        </figure>
      </article>
    </section>

    <section class="versus" aria-labelledby="versus-h">
      <h2 id="versus-h">What makes Passalong different.</h2>
      <p class="chips">
        <span class="chip us">Passalong</span>
        <span class="vs">versus</span>
        <span class="chip">Jira</span>
        <span class="chip">Linear</span>
      </p>
      <p class="claim">A work board for people <em>and their agents</em>.</p>
    </section>

    <section class="agents" aria-labelledby="agents-h">
      <h2 id="agents-h">Works with your existing agent.</h2>
      <ul>
        <li><AppAgentLogo name="claude" /><span>Claude Code</span></li>
        <li><AppAgentLogo name="openai" /><span>Codex</span></li>
        <li><AppAgentLogo name="cursor" /><span>Cursor</span></li>
        <li><AppAgentLogo name="copilot" /><span>GitHub Copilot</span></li>
        <li><AppAgentLogo name="openai" /><span>ChatGPT</span></li>
        <li><AppAgentLogo name="claude" /><span>Claude</span></li>
      </ul>
      <p class="more"><a href="/connect">How to connect yours</a></p>
    </section>

    <section class="pricing" aria-label="What it costs">
      <h2>
        Free to start.<br>
        <span class="turn">Paid when your team shares the work.</span>
      </h2>
      <div class="tiers">
        <article>
          <h3>Solo</h3>
          <p class="figure">${{ PRICING.solo }}<span>a month, for one person</span></p>
          <p class="ask">
            <a class="btn" href="/hub/settings/plan">Choose Solo</a>
          </p>
        </article>
        <article>
          <h3>Team</h3>
          <p class="figure">${{ PRICING.team }}<span>a month, for up to {{ PRICING.seats }} people</span></p>
          <p class="ask">
            <a class="btn" href="/hub/settings/teams">Choose Team</a>
          </p>
        </article>
      </div>
    </section>

    <section class="closer">
      <h2>
        Everything in one place.<br>
        <span class="turn">Nothing left behind.</span>
      </h2>
      <p class="ways">
        <a class="go" href="/hub">Open your hub</a>
        <a class="quiet" href="/connect">or connect your tools</a>
      </p>
    </section>
    <AppFoot />
  </main>
</template>
