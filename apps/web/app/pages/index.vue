<!--
  The landing page.

  What it does not have any more is a drawn browser window — three traffic-light dots, a fake
  address bar, and a guide by a person who does not exist. A picture of software that was never
  photographed is the tell of a template, and it was the loudest thing on the page.

  What replaces it is the artifact itself. Passalong's output is a markdown file, so the page shows
  a markdown file: no chrome, no invented screenshot, nothing claiming to be a photograph of
  anything. The claim underneath it — plain markdown, exportable — is then something the reader has
  already seen rather than something they are asked to believe.

  Everything else is typography and space, which is all this page needs and all its CSP allows: the
  route rule is `noScripts` with `default-src 'none'`, so there is no embed, no third-party font and
  no script here, and there never will be.
-->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { published } from "#shared/pages";

/** The closer points at the docs once they are written, and not before. */
const docsPublished = published("/docs");

usePage({
  // Long enough to be worth a search result. "Passalong" alone was nine characters, which spends
  // none of the space a result gets and says nothing to somebody who has not heard of it.
  // Under ~60 characters: longer than that and a search result cuts it mid-phrase.
  title: "Passalong — hand work to your AI coding agents",
  // Under 125, because previews truncate around there and a sentence cut mid-clause reads as a
  // page that did not think about being shared. This one ends where it means to.
  description:
    "Give your coding agents tasks, bugs and handoffs. One agent per job, progress you can see, and a write-up to approve before it counts.",
  // Absolute, because a crawler resolves nothing. Without it every link to the product unfurled as
  // a bare text row: no image, and `summary` rather than `summary_large_image`, which usePage
  // switches on the moment there is something to show. The apex rather than the serving host, so
  // the legacy host's copy of this page points at the same card and the same canonical.
  image: `${APEX}/og.png`,
  url: `${APEX}/`,
});

/**
 * What it costs, in one place, because a price stated twice is a price that will disagree with
 * itself.
 *
 * There is no free tier here. What stays free is everything that never leaves the machine: the CLI
 * writes and reads guides against a local store with no account and no ceiling, which is §10 and is
 * not a concession — it is how the tool works. What is paid for is the crossing, which is the
 * product.
 *
 * The server agrees: `FREE_SIGNUP` is "0" in apps/web/wrangler.jsonc, so a new account may sync
 * nothing until it has a plan (`ceilingFor()` in apps/api/src/quota.ts answers "none"). Only
 * accounts from before the cutover keep the 25 synced guides they had (migrations/0016_grandfather.sql),
 * and the page does not advertise that, because nobody new can get it.
 */
const PRICING = {
  solo: { amount: "$5", period: "per month" },
  team: { amount: "$10", period: "for three seats", extra: "then $5 per extra seat" },
  /** Plain mailto: this page runs no script and its CSP allows none, so a form is not an option. */
  contact: "contact@passalong.dev",
};

/**
 * What a search engine is told about the product, as JSON-LD.
 *
 * Built from PRICING so the price in the markup cannot drift from the price on the page. A data
 * block rather than script: browsers never execute it, so the landing's CSP, which allows no script
 * at all, is untouched — and server/plugins/csp.ts knows not to count it as one.
 *
 * Only what the page itself says. No ratings or reviews: there are none to cite.
 */
const perMonth = (amount: string) => Number(amount.replace(/[^0-9.]/g, ""));
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
        "Hand work to AI coding agents — a task, a bug, or finished work to repeat — and get back what they did and how they checked it, with one agent on each piece of work and everyone able to see who has what. A CLI, an MCP server and a sync service.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux, Windows",
      publisher: { "@id": `${APEX}/#organization` },
      offers: [
        {
          "@type": "Offer",
          name: "Local",
          description: "The CLI against a local store, with no account.",
          price: 0,
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Solo",
          price: perMonth(PRICING.solo.amount),
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: perMonth(PRICING.solo.amount),
            priceCurrency: "USD",
            billingDuration: "P1M",
          },
        },
        {
          "@type": "Offer",
          name: "Team",
          description: `Three seats, ${PRICING.team.extra}.`,
          price: perMonth(PRICING.team.amount),
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: perMonth(PRICING.team.amount),
            priceCurrency: "USD",
            billingDuration: "P1M",
          },
        },
      ],
    },
  ],
};
useHead({ script: [{ type: "application/ld+json", innerHTML: JSON.stringify(STRUCTURED) }] });

/**
 * The specimen: one piece of work, going out and coming back, side by side.
 *
 * It used to be a single finished handoff, which told the old story — Passalong as a way to write
 * up what you did. The product now leads with handing work to an agent, so the page shows both
 * halves of that: the task as it was handed out (what done looks like, what to leave alone) and
 * what the agent handed back against it (what it decided, how it checked each line of done). The
 * checks on the right are the lines on the left, one for one, which is the whole point of a review.
 *
 * Built from the devices the guide page uses — the fact row, the sectioning — so it is a real
 * surface of this product rather than a drawing of one. Nothing claims to be a screenshot.
 */
const SPECIMEN = {
  out: {
    label: "The task you handed out",
    title: "Backfill order totals without locking the table",
    facts: [
      { label: "For", value: "orders-api" },
      { label: "Waits for", value: "Add total column" },
    ],
    sections: [
      {
        h: "Goal",
        p: "Every order has a stored total, so checkout stops computing it per request.",
      },
      {
        h: "Constraints",
        p: "No lock that stalls checkout. Postgres 16, in production, during trading hours.",
      },
    ],
    acceptance: [
      "Every row reconciles: pnpm verify:totals exits 0",
      "No lock wait over 50ms in pg_stat_activity",
      "total is NOT NULL once the backfill ends",
    ],
  },
  back: {
    label: "What came back",
    title: "Backfill order totals: done",
    facts: [
      { label: "Taken by", value: "Ada’s agent" },
      { label: "Change", value: "commit 3f9a2c1" },
    ],
    sections: [
      {
        h: "Decisions",
        p: "Chunked by primary key rather than one statement: the lock is the cost here, not the work. Nullable first and NOT NULL last, so nothing waits on a rewrite.",
      },
      {
        h: "Gotchas",
        p: "Chunks under 1,000 ran slower, not faster: the planner stopped using the index and each pass read the table.",
      },
    ],
    checked: [
      "pnpm verify:totals exits 0 across 4.1M rows",
      "Longest lock wait 12ms, sampled every second",
      "NOT NULL set after the tail was clean",
    ],
  },
};

/**
 * A number from real use, for the proof line under the specimen — and nothing until there is one.
 * The page states no figure it cannot stand behind: set this from the dogfooding metric in
 * docs/V2.md §7 (the share of tasks approved the first time they come back) once it exists.
 */
const PROOF = null as { figure: string; says: string } | null;
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <!-- The h1 names what the product is, because that is what a search engine reads first and
           the claim below never says it. The claim keeps the display type as a <p class="headline">:
           same look, no longer the page’s heading. -->
      <h1 class="eyebrow">Handing work between AI coding agents</h1>
      <p class="headline">
        Agents that never<br>
        <span class="turn">start from zero.</span>
      </p>
      <p class="lede">
        Tell your agent what you need. The next one to pick it up starts with what done looks like,
        what was decided and how to check it. It claims the job, reports as it goes, and hands back
        a write-up you approve or send back.
      </p>
      <!-- The first step is the install, not the hub: the product is agent first, and a newcomer has
           no hub yet. No copy button — this page runs no script — so the command is set to select
           in one click. -->
      <p class="ways">
        <code class="install"><span>npm i -g passalong &amp;&amp;</span> <span>passalong setup</span></code>
        <a class="quiet" href="/hub">or open your hub</a>
      </p>
      <p class="works">
        Works with Claude Code and any MCP client. Hosted for assistants that connect to remote
        servers. <a href="/connect">How to connect</a>
      </p>
    </header>

    <!--
      A guide, as it arrives — not as a file.

      This block has been two wrong things. It was a drawn browser window, which was a picture of
      software nobody photographed. Then it was the markdown source, which is the aesthetic of a
      config file and argues that what this product makes is a text file.

      What it makes is the document at `/g/:id/:key`: the reasoning, the decisions, the steps, how to
      check it and what went wrong — set so a person can read it and shaped so an agent can act on
      it. That is a real surface of this product, built here from the same devices that page uses:
      the fact row, the tags, the sectioning. Nothing is invented and nothing claims to be a
      screenshot.
    -->
    <section class="specimen pair" aria-label="A task as it was handed out, and what the agent handed back">
      <article v-for="side in [SPECIMEN.out, SPECIMEN.back]" :key="side.label">
        <p class="side">{{ side.label }}</p>
        <h2>{{ side.title }}</h2>

        <dl class="facts">
          <div v-for="f in side.facts" :key="f.label">
            <dt>{{ f.label }}</dt>
            <dd>{{ f.value }}</dd>
          </div>
        </dl>

        <!-- The lines of done first, on both sides, so each check sits level with the line it
             answers: that comparison is the review. -->
        <div class="sec">
          <h3>{{ "acceptance" in side ? "Done when" : "How it checked each line" }}</h3>
          <ul class="checks" :class="{ met: !('acceptance' in side) }">
            <li v-for="line in 'acceptance' in side ? side.acceptance : side.checked" :key="line">{{ line }}</li>
          </ul>
        </div>

        <div>
          <div v-for="sec in side.sections" :key="sec.h" class="sec">
            <h3>{{ sec.h }}</h3>
            <p>{{ sec.p }}</p>
          </div>
        </div>
      </article>
    </section>
    <p class="under">
      What you asked for, beside what it says it checked, one line for one line — so a write-up that
      skips a line shows. Underneath both is plain markdown: in your repo, in your hub, and yours to
      export whenever you want out.
    </p>
    <p v-if="PROOF" class="proof"><b>{{ PROOF.figure }}</b> {{ PROOF.says }}</p>

    <!--
      One loop, whatever the work is. Tasks and handoffs used to be told as two products with two
      sets of steps; they are one thing — work handed from one context to another — so the page
      tells it once (docs/V2.md §11). Told as what a person does, not as the flags that do it, and
      every sentence is something the product does today.

      Agent first: nothing here is typed into a form. You say it to your agent, and it writes it.
    -->
    <section class="steps" aria-label="How handing work to an agent works">
      <article>
        <p class="n">01</p>
        <h2>Say what you need</h2>
        <p>
          <em>“Add a Passalong task: dark mode in settings.”</em> <em>“Plan this into tasks.”</em>
          <em>“Pass this along.”</em> Your agent writes the brief from the code and the
          conversation, and nothing runs until you’ve read it.
        </p>
      </article>
      <article>
        <p class="n">02</p>
        <h2>An agent claims it</h2>
        <p>
          One of yours, in any repo, or a teammate’s. Only one agent can hold a job, and a task waits
          for the ones it depends on. Run <code>passalong work</code> and your agents work through
          the queue on their own.
        </p>
      </article>
      <article>
        <p class="n">03</p>
        <h2>You see it moving</h2>
        <p>
          A one-line update at each milestone, next to who has it and where. Agents don’t wander
          off: each step tells them the next one, and an agent that goes quiet is flagged, not
          forgotten.
        </p>
      </article>
      <article>
        <p class="n">04</p>
        <h2>You decide it’s done</h2>
        <p>
          It hands back what it did and how it checked each line of done. Approve it, or send it
          back with a reason the next agent reads first.
        </p>
      </article>
    </section>

    <section class="statement">
      <h2>
        One agent per job.<br>
        <span class="turn">Everyone sees who has what.</span>
      </h2>
      <p>
        What needs you, who’s working on what, what’s open and what’s done, for every agent,
        machine and teammate, on one page. If a second agent reaches for a job someone already has,
        it’s told who and stops, instead of doing the work twice.
      </p>
    </section>

    <!-- The four questions that decide whether this is worth installing, answered in a sentence
         each. Every answer is true of the product today. -->
    <section class="faq" aria-labelledby="faq-h">
      <p class="eyebrow">Questions</p>
      <h2 id="faq-h">Before you install it</h2>
      <dl>
        <div>
          <dt>Does Passalong run my agents?</dt>
          <dd>
            No. They run where they run now, on your machine and in your repos. Passalong holds the
            work, who has it, and what came back.
          </dd>
        </div>
        <div>
          <dt>Why not Linear or GitHub Issues?</dt>
          <dd>
            A ticket says what to do. A Passalong task says what done looks like, and comes back
            with how it was checked, for you to approve.
          </dd>
        </div>
        <div>
          <dt>What if two agents grab the same task?</dt>
          <dd>Only one can take it. The other is told who has it.</dd>
        </div>
        <div>
          <dt>Am I locked in?</dt>
          <dd>Everything is plain markdown, and you can export it at any time.</dd>
        </div>
      </dl>
    </section>

    <!-- Two tiers as peers under one hairline, not two bordered cards side by side. A card on every
         block is what `/connect` was fixed for: it spends the emphasis evenly and leaves none for
         the thing that matters, which here is the last line of the team column. -->
    <section class="pricing" aria-label="What it costs">
      <p class="eyebrow">What it costs</p>
      <h2>
        Free on one machine.<br>
        <span class="turn">{{ PRICING.solo.amount }} when your agents share the work.</span>
      </h2>
      <p class="note">
        The CLI writes and keeps guides locally, with no account. The queue, the claims and your
        hub are the paid part.
      </p>

      <div class="tiers">
        <article>
          <h3>Solo</h3>
          <p class="figure">
            {{ PRICING.solo.amount }}<span>{{ PRICING.solo.period }}</span>
          </p>
          <p>
            Every piece of work, on every machine you use, with no limit: hand it to any of your
            agents, see who has what, and connect any assistant you use.
          </p>
        </article>

        <article>
          <h3>Team</h3>
          <p class="figure">
            {{ PRICING.team.amount }}<span>{{ PRICING.team.period }}, {{ PRICING.team.extra }}</span>
          </p>
          <p>
            <b>One subscription covers the whole team.</b> Hand work to a person, to the group that
            does that kind of work, or to anyone’s agents, and see who’s on what.
          </p>
        </article>

        <!-- Not a tier and it does not pretend to be one: no figure, because the answer to "how
             much" is the conversation. It sits in the same row because that is where somebody is
             standing when they work out the per-seat number does not suit them. -->
        <article>
          <h3>Larger</h3>
          <p class="figure">Talk to us</p>
          <p>
            More people than a seat count suits, a procurement process, or a question the two
            columns beside this one do not answer.
          </p>
          <p class="ask">
            <a class="btn" :href="`mailto:${PRICING.contact}`">Contact sales</a>
          </p>
        </article>
      </div>
    </section>

    <section class="closer">
      <p class="eyebrow">When the next session starts</p>
      <h2>
        Hand it the job.<br>
        <span class="turn">Get back the work.</span>
      </h2>
      <p class="ways">
        <a class="go" href="/hub">Open your hub</a>
        <a class="quiet" href="/connect">or connect your tools</a>
      </p>
      <!-- The install line lives here rather than in a panel of its own. Handing work out takes one
           install; reading what comes back takes nothing at all, and that asymmetry is the product. -->
      <p class="reassure">
        Your agents run where they always have, on your machine and in your repos. Passalong holds
        the brief, the claim and the write-up. Reading a guide needs nothing installed.
        <template v-if="docsPublished"><a href="/docs">The docs</a> cover the rest.</template>
      </p>
    </section>

    <AppFoot />
  </main>
</template>
