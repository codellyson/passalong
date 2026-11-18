<!-- A copyable block: terminal commands, an address to paste, a file's text, or a message to send an assistant. -->
<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    code: string;
    kind?: "terminal" | "paste" | "file" | "prompt";
    label?: string;
    /** What the terminal prints back, shown under the command and never copied. */
    output?: string;
    /** One row, no header: the command and a copy button, for a list of steps. */
    compact?: boolean;
  }>(),
  { kind: "terminal", label: "", output: "", compact: false },
);
const emit = defineEmits<{ copied: [] }>();

const lines = computed(() => props.code.split("\n"));
// Comments are there to read; only the commands are copied.
const copyText = computed(() =>
  props.kind === "terminal"
    ? lines.value.filter((l) => l.trim() && !l.trim().startsWith("#")).join("\n")
    : props.code,
);
const heading = computed(
  () =>
    props.label ||
    { terminal: "Terminal", paste: "Copy and paste", file: "File", prompt: "Send this message" }[
      props.kind
    ],
);

const body = ref<HTMLElement | null>(null);
const { state, copy: write } = useCopy();
async function copy() {
  if (await write(copyText.value, body.value)) emit("copied");
}
</script>

<template>
  <figure v-if="compact" class="code row-code" :class="kind">
    <pre ref="body"><code><template v-for="(line, i) in lines" :key="i"><span class="ln"><span v-if="kind === 'terminal'" class="ps" aria-hidden="true">$ </span>{{ line }}</span>
</template></code></pre>
    <button type="button" class="copy icon" :class="state" :aria-label="state === 'copied' ? 'Copied' : 'Copy'" @click="copy">
      <svg v-if="state === 'copied'" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>
      <span>{{ state === "copied" ? "Copied" : state === "manual" ? "Selected" : "Copy" }}</span>
    </button>
    <p v-if="output" class="row-out"><span>Output</span>{{ output }}</p>
  </figure>
  <figure v-else class="code" :class="kind">
    <figcaption>
      <span class="label">
        <svg v-if="kind === 'terminal'" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 5 5-5 5M12 17h7" /></svg>
        <svg v-else-if="kind === 'prompt'" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H9l-4 4z" /></svg>
        <svg v-else-if="kind === 'file'" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" /></svg>
        {{ heading }}
      </span>
      <button type="button" class="copy" :class="state" :aria-label="`Copy ${heading.toLowerCase()}`" @click="copy">
        <svg v-if="state === 'copied'" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>
        <span aria-live="polite">{{ state === "copied" ? "Copied" : state === "manual" ? "Selected, now copy" : "Copy" }}</span>
      </button>
    </figcaption>
    <pre ref="body"><code><template v-for="(line, i) in lines" :key="i"><span class="ln" :class="{ cmt: kind === 'terminal' && line.trim().startsWith('#'), gap: !line.trim() }"><span v-if="kind === 'terminal' && line.trim() && !line.trim().startsWith('#')" class="ps" aria-hidden="true">$ </span>{{ line }}</span>
</template></code></pre>
    <div v-if="output" class="out">
      <span class="out-label">You should see something like</span>
      <pre><code>{{ output }}</code></pre>
    </div>
  </figure>
</template>

<style scoped>
.code {
  margin: 0;
  border-radius: var(--r-2);
  overflow: hidden;
  background: light-dark(#1d1c1a, #0f0e0d);
  box-shadow:
    0 0 0 1px light-dark(rgb(0 0 0 / 0.08), rgb(255 255 255 / 0.07)),
    0 10px 24px -14px rgb(0 0 0 / 0.45);
  color: #f4efe9;
  text-align: left;
}
figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
  border-bottom: 1px solid rgb(255 255 255 / 0.08);
  font: 500 var(--t-xs) / 1 var(--font-sans);
  color: rgb(244 239 233 / 0.6);
}
.label {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}
svg {
  width: 0.9375rem;
  height: 0.9375rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: none;
}
.copy {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  height: 2rem;
  padding: 0 var(--s-3);
  border: 0;
  border-radius: var(--r-1);
  background: rgb(255 255 255 / 0.08);
  color: #f4efe9;
  font: 500 var(--t-xs) / 1 var(--font-sans);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
.copy:hover {
  background: rgb(255 255 255 / 0.14);
}
.copy:active {
  scale: 0.96;
}
.copy:focus-visible {
  outline: 2px solid var(--coral);
  outline-offset: 2px;
}
.copy.copied {
  background: var(--coral);
  color: #1a1410;
}
pre {
  margin: 0;
  border: 0;
  border-radius: 0;
  padding: var(--s-4);
  overflow-x: auto;
  background: none;
  font: 0.875rem / 1.7 var(--font-mono);
}
code {
  display: block;
  padding: 0;
  background: none;
  color: inherit;
  font: inherit;
  white-space: pre;
}
/* Long lines wrap rather than scroll sideways; indentation is kept. */
.terminal code,
.paste code,
.file code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ps {
  color: var(--coral);
  user-select: none;
}
/* Compact: the command and its copy button on one line, the output as a quiet line under it. */
.row-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0 var(--s-2);
  padding: 0 var(--s-2) 0 0;
}
.row-code pre {
  padding: var(--s-3) var(--s-4);
}
.row-code.file pre,
.row-code.paste pre {
  white-space: pre;
}
.copy.icon {
  align-self: start;
  margin-top: 0.375rem;
}
.row-out {
  grid-column: 1 / -1;
  display: flex;
  gap: var(--s-2);
  margin: 0;
  padding: var(--s-2) var(--s-4);
  border-top: 1px dashed rgb(255 255 255 / 0.1);
  font: 0.8125rem / 1.5 var(--font-mono);
  color: #9fd88f;
  user-select: none;
}
.row-out span {
  font: 600 0.625rem / 1.9 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(244 239 233 / 0.4);
}
.out {
  border-top: 1px dashed rgb(255 255 255 / 0.1);
  padding-top: var(--s-3);
  user-select: none;
}
.out-label {
  display: block;
  padding: 0 var(--s-4);
  font: 500 0.6875rem / 1 var(--font-sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgb(244 239 233 / 0.4);
}
.out pre {
  padding-top: var(--s-2);
  color: #9fd88f;
}
.cmt {
  color: rgb(244 239 233 / 0.45);
}

/* A message to an assistant reads as a chat bubble, wrapped rather than scrolled. */
.prompt {
  background: var(--surface-raised);
  color: var(--fg);
  box-shadow: 0 0 0 1px var(--line);
}
.prompt figcaption {
  border-bottom-color: var(--line);
  color: var(--muted);
}
.prompt .copy {
  background: var(--surface);
  color: var(--fg);
}
.prompt .copy:hover {
  background: var(--line-strong);
}
.prompt pre {
  font: 500 var(--t-body) / 1.5 var(--font-sans);
}
.prompt code {
  white-space: pre-wrap;
}
.paste pre,
.file pre {
  white-space: pre;
}
</style>
