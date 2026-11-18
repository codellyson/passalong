<!-- The hero's product shot: the team board drawn in HTML with illustrative work, not a screenshot. -->
<script setup lang="ts">
import { AGENT_LOGOS, SOURCE_LOGOS } from "~/utils/landing-logos";

defineProps<{ focus?: number }>();

const mark = (slug: string) =>
  [...AGENT_LOGOS, ...SOURCE_LOGOS].find((l) => l.slug === slug) as (typeof AGENT_LOGOS)[number];

type Card = {
  title: string;
  tag: "Bug" | "Alert" | "Request" | "Email";
  from?: { icon: "mail" | "phone" | "box"; label: string } | { logo: string; label: string };
  holder?: { logo: string; name: string; note: string; asking?: boolean };
  proof?: { kind: "shot" | "check"; label: string };
  for?: string;
};

const COLUMNS: { name: string; cards: Card[] }[] = [
  {
    name: "Ready",
    cards: [
      {
        title: "Export button does nothing",
        tag: "Bug",
        from: { icon: "phone", label: "Screenshot from a phone" },
        for: "You",
      },
      {
        title: "Add a seat for the new hire",
        tag: "Request",
        from: { icon: "mail", label: "Forwarded email" },
        for: "#accounts",
      },
    ],
  },
  {
    name: "In progress",
    cards: [
      {
        title: "Payments webhook failing",
        tag: "Alert",
        from: { logo: "sentry", label: "Sentry" },
        holder: { logo: "claude", name: "Claude Code", note: "Reproduced it. Writing the fix." },
      },
      {
        title: "Invoice PDF is blank",
        tag: "Bug",
        holder: { logo: "openai", name: "Codex", note: "Which logo goes on it?", asking: true },
      },
    ],
  },
  {
    name: "Done",
    cards: [
      {
        title: "Menu covers the logo on mobile",
        tag: "Bug",
        proof: { kind: "shot", label: "Screenshot" },
      },
      {
        title: "Dark mode on settings",
        tag: "Request",
        proof: { kind: "check", label: "pnpm test: 151 passed" },
      },
    ],
  },
];
</script>

<template>
  <div class="board" aria-hidden="true">
    <div class="bar">
      <span class="b-brand"><img src="/favicon.svg" alt="" /> Passalong</span>
      <span class="crumb">Web app</span>
      <span class="who">
        <span class="face face-a">A</span>
        <span class="face face-t">T</span>
        <span class="face agent claude"><img src="/landing/logos/claude.svg" alt="" /></span>
        <span class="face agent openai"><svg viewBox="0 0 24 24"><path :d="mark('openai').d" /></svg></span>
      </span>
    </div>
    <div class="cols">
      <section v-for="(col, i) in COLUMNS" :key="col.name" class="col" :class="{ lit: i === focus }">
        <h4>
          {{ col.name }} <span>{{ col.cards.length }}</span>
          <span class="where" aria-hidden="true"><i v-for="(c, j) in COLUMNS" :key="c.name" :class="{ here: j === i }" /></span>
        </h4>
        <article v-for="card in col.cards" :key="card.title" class="card" :class="{ done: card.proof }">
          <p class="c-meta">
            <span class="c-tag" :class="card.tag.toLowerCase()">{{ card.tag }}</span>
            <span v-if="card.for" class="c-for">for {{ card.for }}</span>
          </p>
          <p class="title">{{ card.title }}</p>
          <p v-if="card.from" class="from">
            <svg v-if="'logo' in card.from" viewBox="0 0 24 24"><path :d="mark(card.from.logo).d" /></svg>
            <svg v-else-if="card.from.icon === 'mail'" viewBox="0 0 24 24" class="line"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            <svg v-else viewBox="0 0 24 24" class="line"><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></svg>
            {{ card.from.label }}
          </p>
          <div v-if="card.holder" class="holder" :class="{ asking: card.holder.asking }">
            <span class="face agent" :class="card.holder.logo">
              <img v-if="card.holder.logo === 'claude'" src="/landing/logos/claude.svg" alt="" />
              <svg v-else viewBox="0 0 24 24"><path :d="mark(card.holder.logo).d" /></svg>
            </span>
            <span><b>{{ card.holder.name }}</b> {{ card.holder.note }}</span>
          </div>
          <div v-if="card.proof" class="c-proof" :class="card.proof.kind">
            <span v-if="card.proof.kind === 'shot'" class="thumb"><i /><i /><i /></span>
            <svg v-else viewBox="0 0 24 24" class="line"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            <span>{{ card.proof.label }}</span>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.board {
  border-radius: var(--r-3);
  background: var(--surface-raised);
  box-shadow:
    0 0 0 1px var(--line-strong),
    0 30px 80px -30px light-dark(rgb(40 30 20 / 0.25), rgb(0 0 0 / 0.7));
  overflow: hidden;
  text-align: left;
  font-size: var(--t-xs);
}
.bar {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.b-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-weight: 600;
}
.b-brand img {
  width: 1.125rem;
  height: 1.125rem;
}
.crumb {
  color: var(--muted);
}
.crumb::before {
  content: "/";
  margin-right: var(--s-3);
  color: var(--line-strong);
}
.who {
  margin-left: auto;
  display: flex;
}
.who .face + .face {
  margin-left: -0.375rem;
}
.face {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--r-pill);
  font-weight: 600;
  font-size: 0.6875rem;
  box-shadow: 0 0 0 2px var(--bg);
  flex: none;
}
.face-a {
  background: #f5d7c8;
  color: #6b3420;
}
.face-t {
  background: #d8e4f5;
  color: #233f66;
}
.agent svg,
.agent img {
  width: 0.875rem;
  height: 0.875rem;
  fill: #fff;
}
.claude {
  background: #f4f1ea;
}
.openai {
  background: #111;
}
.cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
  padding: var(--s-4);
}
.col {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-3);
  border-radius: var(--r-2);
  background: var(--surface);
  box-shadow: 0 0 0 0 transparent;
  transition:
    box-shadow 0.5s var(--ease-out),
    background-color 0.5s var(--ease-out);
}
/* The column the notes are talking about right now. */
.col.lit {
  background: color-mix(in oklab, var(--coral) 9%, var(--surface));
  box-shadow: 0 0 0 1.5px color-mix(in oklab, var(--coral) 55%, transparent);
}
.col.lit h4 {
  color: var(--accent);
}
h4 {
  transition: color 0.5s var(--ease-out);
  margin: 0;
  font: 600 var(--t-xs) / 1 var(--font-sans);
  color: var(--muted);
}
h4 span:not(.where) {
  margin-left: var(--s-1);
  font-weight: 500;
  opacity: 0.7;
}
.card {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-3);
  border-radius: var(--r-1);
  background: var(--bg);
  box-shadow: 0 0 0 1px var(--line), var(--shadow-1);
}
.card p {
  margin: 0;
}
.c-meta {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.c-tag {
  padding: 0.125rem var(--s-2);
  border-radius: var(--r-1);
  font-weight: 600;
  font-size: 0.6875rem;
}
.bug {
  background: var(--danger-soft);
  color: var(--danger);
}
.alert {
  background: var(--warn-soft);
  color: var(--warn);
}
.request {
  background: var(--ok-soft);
  color: var(--ok);
}
.c-for {
  color: var(--muted);
}
.title {
  font: 500 var(--t-sm) / 1.3 var(--font-sans);
  color: var(--fg);
}
.done .title {
  color: var(--muted);
}
.from {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  color: var(--muted);
}
.from svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: currentColor;
}
svg.line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.holder {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
  padding: var(--s-2);
  border-radius: var(--r-1);
  background: var(--surface);
  line-height: 1.35;
  color: var(--muted);
}
.holder b {
  display: block;
  color: var(--fg);
  font-weight: 600;
}
.holder .face {
  box-shadow: none;
}
.holder.asking {
  background: var(--accent-soft);
}
.c-proof {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--ok);
  font-weight: 500;
}
.c-proof.check {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
}
.c-proof svg {
  width: 1rem;
  height: 1rem;
}
.thumb {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 2.75rem;
  height: 1.875rem;
  padding: 4px;
  border-radius: 4px;
  background: linear-gradient(135deg, #2b2a28, #45413c);
}
.thumb i {
  height: 3px;
  border-radius: 2px;
  background: #f2805d;
  width: 60%;
}
.thumb i + i {
  background: rgb(255 255 255 / 0.4);
  width: 85%;
}

/* A phone shows two columns and lets the third run off the edge, as the real board scrolls. */
.where {
  display: none;
}

/* A phone shows one column at a time, the one the stage is about, full width, with dots for where it is. */
@media (max-width: 40rem) {
  .cols {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--s-3);
  }
  .col:not(.lit) {
    display: none;
  }
  .col.lit {
    background: var(--surface);
    box-shadow: none;
    animation: col-in 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .col.lit h4 {
    display: flex;
    align-items: center;
    font-size: var(--t-sm);
  }
  .where {
    display: flex;
    gap: 0.3125rem;
    margin-left: auto;
  }
  .where i {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--line-strong);
    transition: width 0.3s var(--ease-out);
  }
  .where i.here {
    width: 1.125rem;
    border-radius: 3px;
    background: var(--accent);
  }
}
@keyframes col-in {
  from {
    opacity: 0;
    translate: 16px 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .col.lit {
    animation: none;
  }
}
</style>
