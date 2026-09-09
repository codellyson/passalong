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
  title: "Passalong",
  description:
    "Hand finished work to another context. A baton pass between repos, machines, agent sessions, and teammates, in a form an agent can act on.",
});

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
        Free while it is small. <code>npm i -g passalong</code> to write them — and nothing at all
        to install to read one.
      </p>
    </section>

    <footer class="site-foot">
      <div class="who">
        <AppBrand />
        <p>Finished work, handed over.<br>Between repos, machines and people.</p>
      </div>
      <nav>
        <p class="eyebrow">Product</p>
        <a href="/hub">Open your hub</a>
        <a href="/connect">Connect your tools</a>
        <a href="/llms.txt">For AI agents</a>
      </nav>
      <nav>
        <p class="eyebrow">Elsewhere</p>
        <a href="https://www.npmjs.com/package/passalong">passalong on npm</a>
        <a href="https://github.com/codellyson/passalong">GitHub</a>
      </nav>
      <p class="rule">© 2026 Passalong · a KreativeKorna product</p>
    </footer>
  </main>
</template>
