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
usePage({
  // Long enough to be worth a search result. "Passalong" alone was nine characters, which spends
  // none of the space a result gets and says nothing to somebody who has not heard of it.
  title: "Passalong — hand finished work to the next repo or agent",
  // Under 125, because previews truncate around there and a sentence cut mid-clause reads as a
  // page that did not think about being shared. This one ends where it means to.
  description:
    "A baton pass between repos, machines, agent sessions and teammates — finished work, in a form the next agent can act on.",
  // Absolute, because a crawler resolves nothing. Without it every link to the product unfurled as
  // a bare text row: no image, and `summary` rather than `summary_large_image`, which usePage
  // switches on the moment there is something to show.
  image: `${useRequestURL().origin}/og.png`,
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
  facts: [
    { label: "ID", value: "ejdq3v8q", mono: true },
    { label: "From", value: "orders-api@main", mono: true },
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
    <nav class="masthead">
      <AppBrand />
      <!-- One, not two. The hub *is* the sign-in, so a masthead offering both was the same door
           twice. This is for the returning visitor; the claim below is for everyone else. -->
      <a class="btn" href="/hub">Sign in</a>
    </nav>

    <header class="hero">
      <p class="eyebrow">Finished work, handed over</p>
      <h1>
        You already solved this.<br>
        Somewhere else, someone
        <span class="turn">is about to solve it again.</span>
      </h1>
      <p class="lede">
        Passalong takes what an agent session just worked out — the problem, the decisions, the
        steps, how to check it, and what went wrong on the way — and hands it to the next repo,
        machine or teammate in a form they can act on.
      </p>
      <p class="ways">
        <a class="go" href="/hub">Open your hub</a>
        <a class="quiet" href="https://www.npmjs.com/package/passalong">or install the CLI</a>
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
            <dd :class="f.mono ? 'font-code' : ''">{{ f.value }}</dd>
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
      is plain markdown with frontmatter — in your repo, in your hub, and in
      <code>passalong export</code> if you ever want out.
    </p>

    <section class="steps" aria-label="How a transfer works">
      <article>
        <p class="n">01</p>
        <h2>Finish the work</h2>
        <p>
          In an agent session, say <em>“pass this along”</em>, or run <code>passalong share</code>.
          It distills what you just did into a guide.
        </p>
      </article>
      <article>
        <p class="n">02</p>
        <h2>Hand it over</h2>
        <p>
          Trim the draft. You get a short id and a link. Address it to a teammate with
          <code>--to team/@them</code>, or to the people who do a thing with
          <code>team/#group</code>.
        </p>
      </article>
      <article>
        <p class="n">03</p>
        <h2>Pick it up anywhere</h2>
        <p>
          Run <code>passalong pull &lt;id&gt;</code> in the other context, or paste the link to an
          agent. Nothing to install on the receiving end.
        </p>
      </article>
    </section>

    <section class="statement">
      <h2>
        A session ends.<br>
        <span class="turn">A guide gets picked up.</span>
      </h2>
      <p>
        Whoever takes it says whether they are on it, and says whether it worked when they have run
        it — so the person who handed it over never has to ask, and never finds out a week later
        that nobody did.
      </p>
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
            Every guide you write, synced across your machines with no ceiling, and an MCP endpoint
            of your own so any agent you use can search them.
          </p>
        </article>

        <article>
          <h3>Team</h3>
          <p class="figure">
            {{ PRICING.team.amount }}<span>{{ PRICING.team.period }}, {{ PRICING.team.extra }}</span>
          </p>
          <p>
            A shared workspace, handoffs addressed to a person or to the people who do a thing, and a
            team MCP endpoint every member's agents can search —
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
      <p class="eyebrow">When the next one starts</p>
      <h2>
        Somewhere to put<br>
        <span class="turn">what you just worked out.</span>
      </h2>
      <p class="ways">
        <a class="go" href="/hub">Open your hub</a>
        <a class="quiet" href="/connect">or connect your tools</a>
      </p>
      <!-- The install line lives here rather than in a panel of its own. Writing guides takes one
           command; reading one takes nothing at all, and that asymmetry is the product. -->
      <p class="reassure">
        <code>npm i -g passalong</code> to write them — and nothing at all to install to read one.
      </p>
    </section>

    <AppFoot />
  </main>
</template>
