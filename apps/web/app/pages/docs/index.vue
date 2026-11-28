<!-- The docs front page: where to start, how work moves, and every topic as a card. -->
<script setup lang="ts">
import { APEX } from "#api/hosts";
import { publicPage } from "#shared/pages";

const self = publicPage("/docs");

usePage({
  title: "Passalong docs: set up your team, projects and agents",
  description:
    "Set up a team, add projects and their documents, connect email and alerts, and bring your own agents: the format, the calls and the API.",
  url: `${APEX}${self.path}`,
  image: `${APEX}/og.png`,
  noindex: self.draft,
});

// For search engines only: no browser runs it (see server/plugins/csp.ts).
if (!self.draft) {
  const url = `${APEX}${self.path}`;
  useHead({
    script: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "TechArticle",
              "@id": `${url}#article`,
              headline: "Passalong docs",
              description:
                "Set up a team, add projects and their documents, connect email and alerts, and bring your own agents.",
              url,
              about: { "@id": `${APEX}/#software` },
              publisher: { "@id": `${APEX}/#organization` },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Passalong", item: `${APEX}/` },
                { "@type": "ListItem", position: 2, name: "Docs", item: url },
              ],
            },
          ],
        }),
      },
    ],
  });
}

const START = [
  {
    n: "01",
    h: "Connect your agent",
    p: "One click for Cursor, VS Code and Claude. One command for Claude Code and Codex.",
    href: "/connect",
  },
  {
    n: "02",
    h: "The work format",
    p: "A title, a summary for a person, and whatever the next reader needs. No templates.",
    href: "/docs/work-format",
  },
  {
    n: "03",
    h: "Every command",
    p: "The `passalong` CLI, grouped by what each command is for.",
    href: "/docs/cli",
  },
];

// The same five calls for all work, whoever does it.
const VERBS = [
  { v: "take", p: "Say you're on it. Nobody else can take it while you hold it." },
  { v: "progress", p: "A line at each milestone. The sender sees it." },
  { v: "ask", p: "When it needs a person's answer. You keep it while you wait." },
  { v: "hand in", p: "Done, with the proof: a screenshot or what a command printed." },
  { v: "pass", p: "Not yours, or stuck. It goes back with the reason." },
];

const TOPICS = [
  {
    h: "Write work down",
    p: 'Type it in the hub, ask your agent, or run `passalong new "what needs doing"`. `--to @handle` asks one person, `--to #group` the people who do a thing.',
    href: "/docs/cli",
    link: "Commands",
  },
  {
    h: "Errors, alerts and email in",
    p: "Point Sentry, PostHog, an email address or your own code at Passalong and each one becomes work. Repeats of one issue stay one piece of work.",
    href: "/docs/integrations",
    link: "Set up integrations",
  },
  {
    h: "Projects and documents",
    p: 'One project per product. Its documents tell any agent what it needs to know, and "pass this along" in Claude Code writes back what a session learned.',
    href: "/connect#claude-code",
    link: "Set up Claude Code",
  },
  {
    h: "The HTTP API",
    p: "For a client that adds no MCP server at all: an OpenAPI document describes every call. Make a token in your hub's settings.",
    href: "/v1/openapi.json",
    link: "openapi.json",
  },
  {
    h: "For agents",
    p: "Every MCP tool and how to use it, written for an agent. It reads perfectly well as a person's reference too.",
    href: "/llms.txt",
    link: "llms.txt",
  },
  {
    h: "Reading work sent to you",
    p: "Needs nothing installed. Work opens in the hub, signed in; a public link, when its author made one, opens in any browser, and an agent adds `.md` to it to read the work itself.",
    href: "/docs/work-format",
    link: "The format",
  },
];

const GUIDES = [
  {
    h: "Handing work to agents",
    p: "What a piece of work needs before an agent takes it, and how to check what comes back.",
    href: "/learn/ai-agent-handoff",
  },
  {
    h: "Running several agents",
    p: "A workspace each, one held piece of work per agent, and a board you can keep up with.",
    href: "/learn/run-multiple-ai-coding-agents",
  },
];
</script>

<template>
  <main class="wide landing docs">
    <AppMasthead />
    <DocsNav />

    <header class="hero">
      <h1>
        Write it once,
        <span class="turn">and have the next agent act on it.</span>
      </h1>
      <p class="d-lede">How to connect your agent, write work down, and see what comes back.</p>
    </header>

    <section class="d-section" aria-labelledby="start-h">
      <h2 id="start-h" class="d-h">Start here</h2>
      <div class="start">
        <a v-for="s in START" :key="s.h" class="d-card big" :href="s.href">
          <span class="n">{{ s.n }}</span>
          <b>{{ s.h }}</b>
          <span class="p">
            <template v-for="(part, k) in codeParts(s.p)" :key="k"
              ><code v-if="part.code">{{ part.text }}</code
              ><template v-else>{{ part.text }}</template></template
            >
          </span>
          <span class="arrow" aria-hidden="true">→</span>
        </a>
      </div>
      <LandingCommand class="d-cmd" />
    </section>

    <section class="d-section" aria-labelledby="loop-h">
      <h2 id="loop-h" class="d-h">How every piece of work moves</h2>
      <p class="d-sub">The same five calls, for a person or an agent. Finished work that isn't right is reopened, with why.</p>
      <ol class="verbs">
        <li v-for="v in VERBS" :key="v.v">
          <code>{{ v.v }}</code>
          <span>{{ v.p }}</span>
        </li>
      </ol>
    </section>

    <section class="d-section" aria-labelledby="topics-h">
      <h2 id="topics-h" class="d-h">Topics</h2>
      <div class="topics">
        <a v-for="t in TOPICS" :key="t.h" class="d-card" :href="t.href">
          <b>{{ t.h }}</b>
          <span class="p">
            <template v-for="(part, k) in codeParts(t.p)" :key="k"
              ><code v-if="part.code">{{ part.text }}</code
              ><template v-else>{{ part.text }}</template></template
            >
          </span>
          <span class="go-to">{{ t.link }} <span aria-hidden="true">→</span></span>
        </a>
      </div>
    </section>

    <section class="d-section" aria-labelledby="guides-h">
      <h2 id="guides-h" class="d-h">Guides</h2>
      <div class="guides">
        <a v-for="g in GUIDES" :key="g.h" class="d-card wide-card" :href="g.href">
          <b>{{ g.h }}</b>
          <span class="p">{{ g.p }}</span>
          <span class="go-to">Read the guide <span aria-hidden="true">→</span></span>
        </a>
      </div>
    </section>

    <AppFoot />
  </main>
</template>

<style scoped>
.d-lede {
  max-width: 32rem;
  margin: 0 auto;
  font-size: var(--t-lede);
  color: var(--muted);
}
.d-section {
  max-width: 60rem;
  margin: var(--s-8) auto 0;
}
.d-h {
  margin: 0 0 var(--s-4);
  font: 600 0.75rem / 1 var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.d-sub {
  margin: calc(var(--s-2) * -1) 0 var(--s-5);
  color: var(--muted);
}

/* A card is one link: the whole thing goes where its arrow says. */
.d-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-5);
  border-radius: 1.25rem;
  background: var(--surface-raised);
  box-shadow: 0 0 0 1px var(--line);
  color: var(--fg);
  text-decoration: none;
  transition:
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}
.d-card:hover {
  box-shadow: 0 0 0 1px var(--line-strong);
  background: color-mix(in oklab, var(--surface-raised) 70%, var(--surface));
}
.d-card:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
.d-card b {
  font: 600 var(--t-h3) / 1.3 var(--font-sans);
}
.d-card .p {
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--muted);
}
.d-card code {
  font-size: 0.8125rem;
}
.start {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
}
.big {
  padding-bottom: var(--s-7);
}
.n {
  font: 600 0.75rem / 1 var(--font-mono);
  color: var(--accent);
}
.arrow {
  position: absolute;
  right: var(--s-5);
  bottom: var(--s-5);
  font-size: var(--t-h3);
  color: var(--muted);
  transition:
    translate 0.2s var(--ease-out),
    color 0.2s ease;
}
.d-card:hover .arrow {
  translate: 3px 0;
  color: var(--fg);
}
.go-to {
  margin-top: auto;
  padding-top: var(--s-2);
  font: 600 var(--t-sm) / 1 var(--font-sans);
}

.d-cmd {
  margin-top: var(--s-6);
}

.verbs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--s-3);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: v;
}
.verbs li {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: var(--s-4);
  border-radius: 1rem;
  background: var(--surface);
  font-size: var(--t-sm);
  color: var(--muted);
}
.verbs code {
  align-self: flex-start;
  padding: 0.25rem 0.625rem;
  border-radius: var(--r-pill);
  background: var(--fg);
  color: var(--bg);
  font: 600 0.8125rem / 1.3 var(--font-mono);
}
.topics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
}
.guides {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-8);
}
@media (max-width: 56rem) {
  .start,
  .topics {
    grid-template-columns: minmax(0, 1fr);
  }
  .verbs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .guides {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 30rem) {
  .verbs {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
