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
  title: "Passalong — agents that never start from zero",
  // Under 125, because previews truncate around there and a sentence cut mid-clause reads as a
  // page that did not think about being shared. This one ends where it means to.
  description:
    "Hand work to your agents and get back what they did, why, and how they checked — across repos, machines and teammates.",
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
 * NOTE: `apps/api/src/quota.ts` still grants an unpaid account 25 synced guides. Until that changes
 * the server is more generous than this page — the safe direction to be wrong in, but they have to
 * meet, and doing it locks out existing accounts unless they are grandfathered.
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
 * The specimen guide, as fields rather than as a text file.
 *
 * The page used to print the markdown source: twenty-five lines of monospace, which is the
 * aesthetic of a config file and quietly argues that what this product makes is a text file.
 * Anybody can make a text file. What it makes is the document at `/g/:id/:key` — typeset,
 * sectioned, with its facts in a labelled row — and that is a real surface of this product rather
 * than a drawing of one, so it is what the front page shows.
 */
const SPECIMEN = {
  title: "Backfill order totals without locking the table",
  // No id and no repo@branch: the guide page stopped leading with either, and the specimen of it
  // should not teach a visitor that guides are named by strings like those.
  facts: [
    { label: "From", value: "Ada Okafor" },
    { label: "Project", value: "orders-api" },
    { label: "Assumes", value: "Postgres 16 \u00b7 Node 22" },
  ],
  tags: ["migrations", "backfill"],
  sections: [
    {
      h: "Problem",
      p: "Totals were computed per request. The obvious backfill takes an ACCESS EXCLUSIVE lock and stalls checkout for about forty seconds.",
    },
    {
      h: "Decisions and rationale",
      p: "Chunked rather than one statement: the lock is the cost here, not the work. Nullable first and NOT NULL last, so nothing blocks on a rewrite.",
    },
    {
      h: "Steps",
      p: "Add the column nullable with no default, backfill in chunks of 5,000 by primary key, then set NOT NULL once the tail is clean.",
    },
    {
      h: "Verification",
      p: "pnpm verify:totals reconciles every row and exits 0, with no lock wait over 50ms in pg_stat_activity.",
    },
    {
      h: "Gotchas",
      p: "Chunks under 1,000 finish slower, not faster: the planner stops using the index and each pass reads the table.",
    },
  ],
};
</script>

<template>
  <main class="wide landing">
    <AppMasthead />

    <header class="hero">
      <!-- The h1 names what the product is, because that is what a search engine reads first and
           the claim below never says it. The claim keeps the display type as a <p class="headline">:
           same look, no longer the page's heading. -->
      <h1 class="eyebrow">Handing work between AI coding agents</h1>
      <p class="headline">
        Agents that never<br>
        <span class="turn">start from zero.</span>
      </p>
      <p class="lede">
        Every agent session starts blank. Hand it work through Passalong and it starts with the
        whole story — what done looks like, what was decided, how to check it. It says it's on it,
        keeps you posted, and hands back what it did for you to judge.
      </p>
      <p class="ways">
        <a class="go" href="/hub">Open your hub</a>
        <a class="quiet" href="https://www.npmjs.com/package/passalong">or install the command-line tool</a>
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
    <section class="specimen" aria-label="A transfer guide, as it arrives in the next session">
      <article>
        <h2>{{ SPECIMEN.title }}</h2>

        <dl class="facts">
          <div v-for="f in SPECIMEN.facts" :key="f.label">
            <dt>{{ f.label }}</dt>
            <dd>{{ f.value }}</dd>
          </div>
        </dl>

        <p class="tags">
          <span v-for="t in SPECIMEN.tags" :key="t" class="tag">#{{ t }}</span>
        </p>

        <div v-for="sec in SPECIMEN.sections" :key="sec.h" class="sec">
          <h3>{{ sec.h }}</h3>
          <p>{{ sec.p }}</p>
        </div>
      </article>
    </section>
    <p class="under">
      That is what an agent hands back, and what the next session starts from. The work you hand
      out has the same shape: what done looks like, what to leave alone. Underneath it is plain
      markdown — in your repo, in your hub, and yours to export whenever you want out.
    </p>

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
          Tell your agent: <em>“add a Passalong task: dark mode in the settings”</em>, or
          <em>“plan this into tasks”</em>, or <em>“pass this along”</em> when something is finished.
          It writes the brief from the code and the conversation. You read it before anything runs.
        </p>
      </article>
      <article>
        <p class="n">02</p>
        <h2>An agent takes it</h2>
        <p>
          Yours, in any repo, or a teammate's. Taking it says so: one agent on each piece of work,
          never two, and a task waits for the ones it depends on. Run <code>passalong work</code>
          and your agents work the queue on their own.
        </p>
      </article>
      <article>
        <p class="n">03</p>
        <h2>It keeps you posted</h2>
        <p>
          A line at each milestone, shown in your hub beside who has it and where. Every answer it
          gets tells it what to do next, so it does not drift, and an agent that goes quiet is
          flagged rather than forgotten.
        </p>
      </article>
      <article>
        <p class="n">04</p>
        <h2>You decide it is done</h2>
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
        Your hub shows what needs you, who is working on what, what is open and what is done —
        every agent, every machine, every teammate, on one page. When a second agent reaches for
        work somebody already has, it is told who, and stops, rather than doing it twice.
      </p>
    </section>

    <!-- Two tiers as peers under one hairline, not two bordered cards side by side. A card on every
         block is what `/connect` was fixed for: it spends the emphasis evenly and leaves none for
         the thing that matters, which here is the last line of the team column. -->
    <section class="pricing" aria-label="What it costs">
      <p class="eyebrow">What it costs</p>
      <h2>
        Nothing to pay until work<br>
        <span class="turn">leaves your machine.</span>
      </h2>

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
            One place for the team's work: hand it to a person, to the group who does that kind of
            work, or to anyone's agents, and see who is on what — with a team connection every
            member's assistants can use,
            <b>for everyone in the team, including the members who never paid for a seat.</b>
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
        Give it the whole story<br>
        <span class="turn">instead of a blank page.</span>
      </h2>
      <p class="ways">
        <a class="go" href="/hub">Open your hub</a>
        <a class="quiet" href="/connect">or connect your tools</a>
      </p>
      <!-- The install line lives here rather than in a panel of its own. Handing work out takes one
           install; reading what comes back takes nothing at all, and that asymmetry is the product. -->
      <p class="reassure">
        <code>npm i -g passalong</code>, then <code>passalong setup</code> connects Claude Code;
        from there you just say what you need. Reading a guide needs nothing installed at all.
        <template v-if="docsPublished"><a href="/docs">The docs</a> cover the rest.</template>
      </p>
    </section>

    <AppFoot />
  </main>
</template>
