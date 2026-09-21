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
    "Queue work for your agents and get back what they did and why — across repos, machines and teammates.",
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
        "Hand finished work from one repo, machine, agent session or teammate to the next, as a transfer guide an AI agent can act on. A CLI, an MCP server and a sync service.",
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
      <h1 class="eyebrow">Transfer guides and a task queue for AI coding agents</h1>
      <p class="headline">
        Agents that never<br>
        <span class="turn">start from zero.</span>
      </p>
      <p class="lede">
        Every agent session starts blank. Passalong hands the next one the whole story — what was
        decided, why, and how to check it — in another repo, on another machine, for a teammate, or
        from a queue of tasks you review as they come back.
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
      That is what lands in the next session, and what a teammate opens in a browser. Underneath it
      is plain markdown: in your repo, in your hub, and yours to export whenever you want out.
    </p>

    <!-- Told as what a person does, not as the flags that do it. The addressing syntax and the
         pull command are real and documented on /connect; on the front page they made the product
         read as a CLI you have to learn before anything happens. -->
    <section class="steps" aria-label="How sending a guide works">
      <article>
        <p class="n">01</p>
        <h2>Finish the work</h2>
        <p>
          In Claude Code, say <em>“pass this along”</em>. Or write it in your hub. Either way the
          work becomes a guide: what was wrong, what you did, and how to check it.
        </p>
      </article>
      <article>
        <p class="n">02</p>
        <h2>Send it</h2>
        <p>
          Send it to a teammate, or to the group of people who do that kind of work. They get an
          email with a link.
        </p>
      </article>
      <article>
        <p class="n">03</p>
        <h2>They pick it up</h2>
        <p>
          They open the link, say they're taking it, and later tell you whether it worked. An agent
          can pick it up from the same link. Nothing to install on the receiving end.
        </p>
      </article>
    </section>

    <section class="statement">
      <h2>
        A session ends.<br>
        <span class="turn">A guide gets picked up.</span>
      </h2>
      <p>
        Whoever takes it says they're taking it, and says whether it worked once they've tried it,
        so the person who sent it never has to ask, and never finds out a week later that nobody
        did.
      </p>
    </section>

    <!--
      The queue: the same document pointed the other way. A guide is work done, handed on; a task
      is work to do, handed out — and what comes back from it is a guide. Said as three steps in the
      same layout as the three above, because it is the same loop with one more person in it: you,
      at the end, deciding whether it is done.

      Every sentence here is something the product does today. No "coming soon" — a landing page
      that promises is one that has to be rewritten the week it is found out.
    -->
    <section class="statement">
      <p class="eyebrow">The task queue</p>
      <h2>
        Queue the work.<br>
        <span class="turn">Read what comes back.</span>
      </h2>
    </section>
    <!-- Closer to its heading than the page's section gap: the three steps are that heading's, not
         a section of their own. -->
    <section class="steps mt-10" aria-label="How the task queue works">
      <article>
        <p class="n">01</p>
        <h2>Write the task</h2>
        <p>
          <code>passalong task "add dark mode"</code>, or ask an agent to plan a larger goal. Each
          task says what done looks like, and waits in Draft until you have read it.
        </p>
      </article>
      <article>
        <p class="n">02</p>
        <h2>Agents take it</h2>
        <p>
          Run <code>passalong work</code> in the repo, or tell any agent to take the next task. One
          agent per task — never two on the same one — and a task waits for the ones it depends on.
        </p>
      </article>
      <article>
        <p class="n">03</p>
        <h2>You decide it is done</h2>
        <p>
          Each task comes back with a write-up of what was done and how it was checked. Approve it,
          or send it back with a reason the next agent reads first.
        </p>
      </article>
    </section>

    <!-- Two tiers as peers under one hairline, not two bordered cards side by side. A card on every
         block is what `/connect` was fixed for: it spends the emphasis evenly and leaves none for
         the thing that matters, which here is the last line of the team column. -->
    <section class="pricing" aria-label="What it costs">
      <p class="eyebrow">What it costs</p>
      <h2>
        Nothing to pay until a guide<br>
        <span class="turn">leaves your machine.</span>
      </h2>

      <div class="tiers">
        <article>
          <h3>Solo</h3>
          <p class="figure">
            {{ PRICING.solo.amount }}<span>{{ PRICING.solo.period }}</span>
          </p>
          <p>
            Every guide you write, on every machine you use, with no limit, the task queue for your
            agents, and a private connection any assistant you use can search.
          </p>
        </article>

        <article>
          <h3>Team</h3>
          <p class="figure">
            {{ PRICING.team.amount }}<span>{{ PRICING.team.period }}, {{ PRICING.team.extra }}</span>
          </p>
          <p>
            A shared space, guides sent to a person or to the group who does that kind of work, one
            task queue for everyone's agents, and a team connection every member's assistants can
            search,
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
      <!-- The install line lives here rather than in a panel of its own. Writing guides takes one
           command; reading one takes nothing at all, and that asymmetry is the product. -->
      <p class="reassure">
        Write them in your hub, in Claude Code, or with <code>npm i -g passalong</code>. Reading one
        needs nothing installed at all.
        <template v-if="docsPublished"><a href="/docs">The docs</a> cover the rest.</template>
      </p>
    </section>

    <AppFoot />
  </main>
</template>
