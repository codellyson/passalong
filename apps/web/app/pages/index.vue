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
 * The seat price, and the only number on this page nobody can derive from the code.
 *
 * §11 of the PRD sets the shape — per seat, teams are the revenue, the solo tier is distribution —
 * and names no figure, so there is nothing in this repository to read it from. It lives here as one
 * constant rather than inline in the markup, so the price is changed in one place and cannot end up
 * stated two different ways on the same page.
 *
 * SET THIS BEFORE THE PAGE IS PUBLIC.
 */
const SEAT = { amount: "$6", period: "per seat, per month" };

/** What the free tier actually holds, so the page and `quota.ts` cannot drift apart. */
const FREE_SYNCED = 25;

/**
 * A guide, as the file it actually is.
 *
 * Held as lines rather than one string because the three things a reader should be able to tell
 * apart — the frontmatter a machine reads, the headings that give every guide the same shape, and
 * the prose — are told apart by weight here, the way they would be in an editor. That is markup,
 * not highlighting: this page runs no script, so nothing can colour it after the fact.
 *
 * One line per element, so a `<pre>` needs no literal newlines and cannot pick up the template's
 * own indentation.
 */
type Line = { t: string; k?: "fm" | "h" };
const guide: Line[] = [
  { t: "---", k: "fm" },
  { t: "id: ejdq3v8q", k: "fm" },
  { t: "title: Backfill order totals without locking the table", k: "fm" },
  { t: "kind: transfer", k: "fm" },
  { t: "source_context: orders-api@main", k: "fm" },
  { t: "stack_assumptions: [Postgres 16, Node 22]", k: "fm" },
  { t: "tags: [migrations, backfill]", k: "fm" },
  { t: "---", k: "fm" },
  { t: "" },
  { t: "## Problem", k: "h" },
  { t: "Totals were computed per request. The obvious backfill takes" },
  { t: "an ACCESS EXCLUSIVE lock and stalls checkout for ~40s." },
  { t: "" },
  { t: "## Steps", k: "h" },
  { t: "1. Add the column nullable, no default." },
  { t: "2. Backfill in chunks of 5,000 by primary key." },
  { t: "3. Set NOT NULL once the tail is clean." },
  { t: "" },
  { t: "## Verification", k: "h" },
  { t: "Run `pnpm verify:totals` — every row reconciles, exit 0." },
  { t: "No lock wait over 50ms in pg_stat_activity." },
  { t: "" },
  { t: "## Gotchas", k: "h" },
  { t: "Chunks under 1,000 finish slower: the planner stops using" },
  { t: "the index and each pass reads the table." },
];
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

    <!-- The artifact, not a rendering of one. Scrollable rather than wrapped: a guide is a file,
         and a file with its lines folded in half stops looking like one. -->
    <section class="artifact" aria-label="A transfer guide, as the file it is">
      <pre><code><span
        v-for="(l, i) in guide"
        :key="i"
        :class="l.k"
      >{{ l.t }}</span></code></pre>
    </section>
    <p class="under">
      Every guide is this: plain markdown with frontmatter, in your repo and in your hub.
      <code>passalong export</code> gives you all of them, and deleting your account leaves you
      holding every one.
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
        Free until a team needs it.<br>
        <span class="turn">Then it is per seat.</span>
      </h2>

      <div class="tiers">
        <article>
          <h3>Solo</h3>
          <p class="figure">Free</p>
          <p>
            Every guide you write, on your machine, with no ceiling and no account.
            {{ FREE_SYNCED }} of them kept in sync across your machines, and an MCP endpoint of your
            own. No card, and no clock running.
          </p>
        </article>

        <article>
          <h3>Team</h3>
          <p class="figure">
            {{ SEAT.amount }}<span>{{ SEAT.period }}</span>
          </p>
          <p>
            A shared workspace, handoffs addressed to a person or to the people who do a thing, a
            team MCP endpoint every member's agents can search, and no limit on synced guides —
            <b>for everyone in the team, including the members who never paid for a seat.</b>
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
