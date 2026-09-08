<!--
  The landing page, ported from `renderHome()` in apps/api/src/render.ts.

  It leads with what the product *produces* — a guide, rendered — rather than describing it in
  paragraphs, and puts the two things a stranger can do (install it, open the hub) above the fold.
  The `.showcase` is built from markup rather than an image or an embed because this page runs no
  script and loads no third-party asset; its route rule is `noScripts` with the strict CSP, the
  same pair a guide page gets.
-->
<script setup lang="ts">
usePage({
  title: "Passalong",
  description:
    "Hand finished work to another context. A baton pass between repos, machines, agent sessions, and teammates, in a form an agent can act on.",
});
</script>

<template>
  <main class="wide">
    <header class="hero">
      <AppBrand />
      <h1>Hand finished work to another context.</h1>
      <p class="lede">
        Solve something non-trivial in one agent session. Open a session somewhere else — another
        repo, another machine, a teammate — and the agent there already knows the whole story: the
        problem, the decisions, the steps, how to verify, and what went wrong along the way.
      </p>
      <div class="cta">
        <a class="btn primary lg" href="/hub">Open your hub</a>
        <span class="cta-cmd"><b>$</b><span>npm i -g passalong</span></span>
      </div>
    </header>

    <section class="showcase" aria-label="A transfer guide, as the person picking it up sees it">
      <div class="bar">
        <span class="dot" /><span class="dot" /><span class="dot" />
        <span class="url">passalong.dev/g/ejdq3v8q · Verify</span>
      </div>
      <div class="body">
        <div class="meta">
          <span>id <b>ejdq3v8q</b></span>
          <span class="status">published</span>
          <span>by <b>@marta</b></span>
          <span>assumes <b>Postgres 16, Node 22</b></span>
          <span class="tag">#migrations</span>
        </div>
        <h3>Backfill order totals without locking the table</h3>
        <div class="sc-prose">
          <h4>Verification</h4>
          <ol>
            <li>Run <code>pnpm verify:totals</code> — every row reconciles, exit 0.</li>
            <li>Check <code>pg_stat_activity</code> during the backfill: no lock waits over 50ms.</li>
          </ol>
          <h4>Gotchas</h4>
          <p>
            The obvious single <code>UPDATE</code> takes an <code>ACCESS EXCLUSIVE</code> lock and
            stalls checkout for ~40s. Batching by primary key in chunks of 5,000 avoids it.
          </p>
        </div>
        <p class="folded">How it was built · Problem, Solution shape, Decisions, Steps</p>
      </div>
    </section>

    <h2 class="eyebrow">How a transfer works</h2>
    <ol class="steps">
      <li>
        <b>Finish the work</b>
        <p>
          In an agent session, say <em>“pass this along”</em>, or run <code>passalong share</code>.
          It distills what you just did into a guide.
        </p>
      </li>
      <li>
        <b>Review and publish</b>
        <p>
          Trim the draft. You get a short id and a link. Hand it to a teammate with
          <code>--to team/@them</code>.
        </p>
      </li>
      <li>
        <b>Pick it up anywhere</b>
        <p>
          Run <code>passalong pull &lt;id&gt;</code> in the other context, or paste the link to an
          agent. Nothing to install on the receiving end.
        </p>
      </li>
    </ol>

    <div class="two">
      <section class="panel">
        <h2>If you write the guides</h2>
        <pre><code>npm i -g passalong
passalong setup     # Claude Code skill + MCP
passalong login     # sync across machines</code></pre>
        <p>
          <code>passalong board</code> then tells you what is waiting on you, what you handed over
          that nobody has taken, what landed, and what someone says does not work.
        </p>
      </section>
      <section class="panel">
        <h2>If you pick them up</h2>
        <p>
          Testers, teammates, anyone the work gets handed to. <b>Nothing to install.</b> Open the
          invite link, pick a handle, and guides addressed to you land in your hub.
        </p>
        <ul>
          <li>
            Every guide has a <b>Verify</b> view that leads with what to check and folds the
            implementation away.
          </li>
          <li>
            Two answers when you have tried it: it works, or it does not — with a reason the author
            sees the same day.
          </li>
          <li>The person who handed it over can see it landed, so nobody has to ask.</li>
        </ul>
      </section>
    </div>

    <section class="closer">
      <h2>No lock-in</h2>
      <p>
        Guides are plain markdown with frontmatter. <code>passalong export</code> dumps everything.
        Deleting your account leaves you with all of your content.
      </p>
      <div class="cta">
        <a class="btn primary lg" href="/hub">Open your hub</a>
        <a class="btn lg" href="/connect">Connect your tools</a>
        <a class="btn lg" href="https://www.npmjs.com/package/passalong">passalong on npm</a>
      </div>
    </section>

    <footer>
      Already have an account? <a href="/hub">Open your hub</a>, or run <code>passalong hub</code>.
    </footer>
  </main>
</template>
