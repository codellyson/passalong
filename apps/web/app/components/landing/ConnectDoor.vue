<!-- One way in on /connect, with a small looping picture of what that way looks like. -->
<script setup lang="ts">
defineProps<{
  kind: "terminal" | "editor" | "chat" | "none";
  on: boolean;
  title: string;
  line: string;
}>();
defineEmits<{ pick: [] }>();
</script>

<template>
  <button type="button" class="door" :class="[kind, { on }]" :aria-pressed="on" @click="$emit('pick')">
    <span class="scene" aria-hidden="true">
      <!-- Terminal: the two commands type themselves, then the tick. -->
      <span v-if="kind === 'terminal'" class="term">
        <span class="tl t1"><i>$</i> npm i -g passalong</span>
        <span class="tl t2"><i>$</i> passalong setup</span>
        <span class="tl t3 ok">✓ Connected to Claude Code</span>
        <span class="caret" />
      </span>
      <!-- Editor: the one-click button is pressed and the editor says so. -->
      <span v-else-if="kind === 'editor'" class="ed">
        <span class="side"><i /><i /><i /></span>
        <span class="pane">
          <span class="add">Add to Cursor</span>
          <span class="toast">✓ passalong installed</span>
        </span>
      </span>
      <!-- Chat: a question, the dots, and a little board back. -->
      <span v-else-if="kind === 'chat'" class="talk">
        <span class="b me">What's on my Passalong board?</span>
        <span class="dots"><i /><i /><i /></span>
        <span class="b them"><i class="bar r" /><i class="bar y" /><i class="bar g" /></span>
      </span>
      <!-- No AI: an email flies onto the board and becomes a card. -->
      <span v-else class="mail">
        <span class="env">Fwd: Invoice is blank</span>
        <span class="col"><i /><i /><i class="new" /></span>
      </span>
    </span>
    <span class="d-say">
      <b>{{ title }}</b>
      <span>{{ line }}</span>
    </span>
    <span class="tick" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
    </span>
  </button>
</template>

<style scoped>
.door {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0.375rem;
  border: 0;
  border-radius: 1rem;
  background: var(--surface-raised);
  box-shadow: 0 0 0 1px var(--line);
  color: var(--fg);
  text-align: left;
  cursor: pointer;
  transition:
    translate 0.3s var(--ease-out),
    box-shadow 0.3s var(--ease-out);
}
.door:hover {
  box-shadow: 0 0 0 1px var(--line-strong);
}
.door:active {
  scale: 0.985;
}
.door.on {
  box-shadow: 0 0 0 2px var(--coral);
}
.door:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
.d-say {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-3) var(--s-2) var(--s-2);
}
.d-say b {
  font: 600 var(--t-body) / 1.2 var(--font-sans);
}
.d-say span {
  font-size: var(--t-xs);
  color: var(--muted);
}
.tick {
  position: absolute;
  top: var(--s-3);
  right: var(--s-3);
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--r-pill);
  background: var(--coral);
  color: #1a1410;
  opacity: 0;
  scale: 0.5;
  transition:
    opacity 0.25s ease,
    scale 0.35s cubic-bezier(0.34, 1.6, 0.64, 1);
}
.on .tick {
  opacity: 1;
  scale: 1;
}
.tick svg {
  width: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.scene {
  position: relative;
  display: block;
  height: 6.25rem;
  border-radius: 0.75rem;
  overflow: hidden;
  font: 500 0.6875rem / 1.5 var(--font-mono);
}

/* Terminal */
.terminal .scene {
  background: #141311;
  color: #f4efe9;
}
.term {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: var(--s-3);
}
.tl {
  overflow: hidden;
  white-space: nowrap;
  width: 0;
  animation: type 6s steps(22, end) infinite;
}
.tl i {
  font-style: normal;
  color: var(--coral);
}
.t2 {
  animation-name: type2;
}
.t3 {
  animation-name: type3;
  color: #9fd88f;
}
@keyframes type {
  0% { width: 0; }
  20%, 100% { width: 22ch; }
}
@keyframes type2 {
  0%, 25% { width: 0; }
  42%, 100% { width: 22ch; }
}
@keyframes type3 {
  0%, 50% { width: 0; }
  58%, 100% { width: 26ch; }
}
.caret {
  width: 0.5rem;
  height: 0.875rem;
  background: var(--coral);
  animation: blink 1s steps(1) infinite;
}
@keyframes blink {
  50% { opacity: 0; }
}

/* Editor */
.editor .scene {
  background: light-dark(#eef0f3, #1d2026);
}
.ed {
  display: flex;
  height: 100%;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 2.5rem;
  padding: var(--s-3) var(--s-2);
  background: light-dark(#e2e5ea, #171a1f);
}
.side i {
  height: 0.375rem;
  border-radius: 2px;
  background: light-dark(#c9ced6, #343944);
}
.pane {
  position: relative;
  flex: 1;
  display: grid;
  place-items: center;
}
.add {
  padding: 0.5rem 0.875rem;
  border-radius: var(--r-pill);
  background: #111;
  color: #fff;
  font: 600 0.75rem / 1 var(--font-sans);
  box-shadow: 0 6px 16px -6px rgb(0 0 0 / 0.5);
  animation: press 6s ease-in-out infinite;
}
@keyframes press {
  0%, 30% { scale: 1; }
  34% { scale: 0.9; }
  40%, 100% { scale: 1; }
}
.toast {
  position: absolute;
  right: var(--s-3);
  bottom: var(--s-3);
  padding: 0.375rem 0.625rem;
  border-radius: 0.5rem;
  background: light-dark(#fff, #2a2f38);
  color: light-dark(#2f8a3c, #9fd88f);
  font: 600 0.6875rem / 1 var(--font-sans);
  box-shadow: 0 6px 16px -6px rgb(0 0 0 / 0.35);
  opacity: 0;
  animation: toast 6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}
@keyframes toast {
  0%, 40% { opacity: 0; translate: 0 12px; }
  48%, 88% { opacity: 1; translate: 0 0; }
  100% { opacity: 0; translate: 0 0; }
}

/* Chat */
.chat .scene {
  background: light-dark(#fbf4ee, #2a211c);
}
.talk {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: var(--s-3);
  font-family: var(--font-sans);
}
.b {
  max-width: 85%;
  padding: 0.3125rem 0.5625rem;
  border-radius: 0.75rem;
  opacity: 0;
}
.me {
  align-self: flex-end;
  background: var(--coral);
  color: #1a1410;
  border-bottom-right-radius: 0.25rem;
  animation: pop1 6s ease-out infinite;
}
.them {
  display: flex;
  gap: 0.25rem;
  align-self: flex-start;
  width: 7rem;
  background: light-dark(#fff, #3a2f28);
  border-bottom-left-radius: 0.25rem;
  animation: pop3 6s ease-out infinite;
}
.bar {
  flex: 1;
  height: 1.125rem;
  border-radius: 3px;
}
.r { background: #f2805d; }
.y { background: #f7c948; }
.g { background: #7fcf6a; }
.dots {
  display: flex;
  gap: 0.1875rem;
  align-self: flex-start;
  padding: 0.5rem 0.625rem;
  border-radius: 0.875rem;
  background: light-dark(#fff, #3a2f28);
  opacity: 0;
  animation: dots 6s linear infinite;
}
.dots i {
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: 50%;
  background: var(--muted);
  animation: bounce 0.9s ease-in-out infinite;
}
.dots i:nth-child(2) { animation-delay: 0.15s; }
.dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes pop1 {
  0%, 8% { opacity: 0; translate: 0 8px; }
  14%, 92% { opacity: 1; translate: 0 0; }
  100% { opacity: 0; }
}
@keyframes dots {
  0%, 20% { opacity: 0; }
  24%, 44% { opacity: 1; }
  48%, 100% { opacity: 0; height: 0; padding: 0; }
}
@keyframes pop3 {
  0%, 46% { opacity: 0; translate: 0 8px; }
  54%, 92% { opacity: 1; translate: 0 0; }
  100% { opacity: 0; }
}
@keyframes bounce {
  50% { translate: 0 -3px; }
}

/* No AI */
.none .scene {
  background: light-dark(#eef6ea, #1c261b);
}
.mail {
  display: block;
  height: 100%;
}
.env {
  position: absolute;
  left: var(--s-3);
  top: var(--s-3);
  padding: 0.5rem 0.625rem;
  border-radius: 0.5rem;
  background: light-dark(#fff, #2c3a2a);
  color: var(--fg);
  font: 600 0.6875rem / 1 var(--font-sans);
  box-shadow: 0 6px 16px -8px rgb(0 0 0 / 0.4);
  animation: fly 6s cubic-bezier(0.55, 0, 0.3, 1) infinite;
}
@keyframes fly {
  0%, 15% { translate: 0 0; rotate: -4deg; opacity: 1; scale: 1; }
  45% { translate: 5rem 2rem; rotate: 2deg; opacity: 0; scale: 0.5; }
  100% { translate: 5rem 2rem; opacity: 0; }
}
.col {
  position: absolute;
  right: var(--s-3);
  bottom: var(--s-2);
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
  width: 6rem;
  padding: 0.375rem;
  border-radius: 0.5rem;
  background: light-dark(#dcebd5, #263424);
}
.col i {
  height: 0.875rem;
  border-radius: 0.25rem;
  background: light-dark(#fff, #34452f);
}
.col .new {
  background: var(--coral);
  animation: land 6s cubic-bezier(0.34, 1.6, 0.64, 1) infinite;
}
@keyframes land {
  0%, 44% { scale: 0; opacity: 0; }
  52%, 92% { scale: 1; opacity: 1; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .scene * {
    animation: none !important;
  }
  .tl {
    width: 26ch;
  }
  .b,
  .toast,
  .col .new {
    opacity: 1;
  }
  .dots,
  .env {
    display: none;
  }
  .door:hover {
    translate: none;
  }
}
</style>
