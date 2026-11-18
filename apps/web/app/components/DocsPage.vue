<!-- A docs reference page: an "On this page" list beside the content, marking the section in view. -->
<script setup lang="ts">
const props = defineProps<{ toc: { id: string; label: string }[] }>();
const { active, go } = useScrollSpy(() => props.toc.map((t) => t.id));
</script>

<template>
  <div class="dpage">
    <nav class="dtoc" aria-label="On this page">
      <p>On this page</p>
      <a
        v-for="t in toc"
        :key="t.id"
        :href="`#${t.id}`"
        :class="{ here: active === t.id }"
        :aria-current="active === t.id ? 'location' : undefined"
        @click="go(t.id, $event)"
        >{{ t.label }}</a
      >
    </nav>
    <div class="dbody"><slot /></div>
  </div>
</template>

<style>
/* Shared by the docs reference pages: what their sections, rows and code look like. */
.dpage {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  gap: var(--s-7);
  max-width: 60rem;
  margin: var(--s-8) auto var(--s-8);
  text-align: left;
}
.dtoc {
  position: sticky;
  top: var(--s-5);
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.dtoc p {
  margin: 0 0 var(--s-2);
  font: 600 0.6875rem / 1 var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.dtoc a {
  margin-left: -0.75rem;
  padding: 0.3125rem 0 0.3125rem 0.625rem;
  border-left: 2px solid transparent;
  color: var(--muted);
  font-size: var(--t-sm);
  text-decoration: none;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
}
.dtoc a:hover {
  color: var(--fg);
}
.dtoc a.here {
  border-left-color: var(--accent);
  color: var(--fg);
  font-weight: 600;
}
.dbody > section {
  margin: 0 0 var(--s-8);
  scroll-margin-top: var(--s-5);
}
.dbody > section:last-child {
  margin-bottom: 0;
}
.dbody h2 {
  margin: 0 0 var(--s-2);
  font: 600 1.375rem / 1.3 var(--font-sans);
  letter-spacing: -0.01em;
}
.dbody p {
  margin: var(--s-2) 0 0;
  color: var(--muted);
  line-height: 1.6;
}
.dbody p b {
  color: var(--fg);
  font-weight: 600;
}
.dbody pre {
  margin: var(--s-4) 0 0;
  padding: var(--s-4) var(--s-5);
  border: 0;
  border-radius: var(--r-2);
  background: light-dark(#1d1c1a, #0f0e0d);
  color: #f4efe9;
  font: 0.8125rem / 1.7 var(--font-mono);
  overflow-x: auto;
}
.dbody pre code {
  padding: 0;
  background: none;
  color: inherit;
}
/* Rows: a name in mono on the left, one line about it on the right, ruled between. */
.drows {
  margin: var(--s-4) 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}
.drows li {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: var(--s-4);
  margin: 0;
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--line);
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--muted);
}
.drows li > code:first-child {
  align-self: start;
  justify-self: start;
  padding: 0.125rem 0.5rem;
  border-radius: var(--r-1);
  background: var(--surface);
  color: var(--fg);
  font: 0.8125rem / 1.5 var(--font-mono);
  overflow-wrap: anywhere;
}
.drows.narrow li {
  grid-template-columns: 11rem minmax(0, 1fr);
}
.dcmd {
  display: inline-flex;
  align-items: flex-start;
  gap: var(--s-2);
  justify-self: start;
  align-self: start;
  max-width: 100%;
  padding: 0.25rem 0.5rem;
  border-radius: var(--r-1);
  background: var(--surface);
}
.dcmd code {
  padding: 0;
  background: none;
  color: var(--fg);
  font: 0.8125rem / 1.5 var(--font-mono);
  overflow-wrap: anywhere;
}
.dbody .code {
  margin-top: var(--s-4);
}
.dreq {
  margin-left: var(--s-2);
  font: 600 0.625rem / 1 var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
/* Numbered setup steps, short enough to follow without reading around them. */
.dsteps {
  margin: var(--s-4) 0 0;
  padding: 0;
  list-style: none;
  counter-reset: dstep;
}
.dsteps li {
  position: relative;
  margin: 0 0 var(--s-2);
  padding-left: 2.25rem;
  color: var(--muted);
  line-height: 1.6;
  counter-increment: dstep;
}
.dsteps li::before {
  content: counter(dstep);
  position: absolute;
  left: 0;
  top: 0.125rem;
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--r-pill);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-strong);
  color: var(--fg);
  font: 600 0.75rem / 1 var(--font-sans);
}
.dsteps b {
  color: var(--fg);
  font-weight: 600;
}
.dbody p.dnote {
  margin-top: var(--s-4);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-2);
  background: var(--surface);
  font-size: var(--t-sm);
}
.dlede {
  max-width: 34rem;
  margin: 0 auto;
  font-size: var(--t-lede);
  color: var(--muted);
}
@media (max-width: 52rem) {
  .dpage {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-5);
    margin-top: var(--s-6);
  }
  .dtoc {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-3);
    padding-bottom: var(--s-4);
    border-bottom: 1px solid var(--line);
  }
  .dtoc p {
    width: 100%;
  }
  .dtoc a {
    margin-left: 0;
    padding-left: 0;
    border-left: 0;
  }
  .drows li,
  .drows.narrow li {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-1);
  }
}
</style>
