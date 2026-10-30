<!--
  The hero's promise, played: one thing that came in, followed to done — it arrives, Passalong's
  agent sorts it, an agent takes it, it is handed in with proof, and a person sends the reply.

  Each moment has its own motion, so the card reads like the thing happening rather than rows
  fading in: the email flies in and lands, the sorting stamps its project and group, the agent
  arrives and works, the checks tick one by one, and the reply rises and goes. Moments that have
  not happened yet keep their place, so the card never jumps.

  It plays itself, holds still while a pointer or keyboard is on it, and any moment can be chosen. A
  visitor can write their own message and watch it go the same way; that part is a demo run in the
  browser, nothing is sent anywhere, and the page says so.

  The server renders the finished story, so it reads whole without script and to anyone who asked
  for less motion; the browser rewinds it and plays.
-->
<script setup lang="ts">
interface Story {
  from: string;
  said: string;
  title: string;
  project: string;
  group: string;
  reason: string;
  agent: string;
  working: string;
  checks: [string, string];
  reply: string;
  sender: string;
}

const MAYA: Story = {
  from: "Maya",
  said: "I was charged twice for October. Can you refund one?",
  title: "Charged twice this month",
  project: "Billing app",
  group: "#billing",
  reason: "a duplicate charge, so billing",
  agent: "Bola’s agent",
  working: "Reading the Billing app’s documents, then the retry job…",
  checks: ["pnpm test billing: 42 passed", "Refund issued, receipt attached"],
  reply:
    "Hi Maya, sorry about that. We’ve refunded the second charge; it’s on its way back to you.",
  sender: "Ada",
};

/**
 * The demo's sorting: a few words decide the project, the way a team would set it up. The real
 * sorting is Passalong's agent reading the message; this only has to be honest about being a
 * stand-in, which the line under the box says.
 */
const RULES: { words: RegExp; project: string; group: string; why: string; title: string }[] = [
  {
    words: /charg|refund|invoice|bill|pay|price|plan|card/i,
    project: "Billing app",
    group: "#billing",
    why: "it is about money, so billing",
    title: "A billing question",
  },
  {
    words: /crash|error|bug|broken|blank|slow|500|fail/i,
    project: "Web app",
    group: "#developers",
    why: "something is broken, so the developers",
    title: "Something is broken",
  },
  {
    words: /iphone|android|mobile|app store|phone/i,
    project: "Mobile app",
    group: "#mobile",
    why: "it is about the phone app",
    title: "A mobile app problem",
  },
  {
    words: /site|page|link|typo|docs|website/i,
    project: "Website",
    group: "#marketing",
    why: "it is about the website",
    title: "A website fix",
  },
];

function sortTyped(text: string): Story {
  const said = text.trim().slice(0, 220);
  const rule = RULES.find((r) => r.words.test(said));
  return {
    from: "you",
    said,
    title: rule?.title ?? "A request from a customer",
    project: rule?.project ?? "Support desk",
    group: rule?.group ?? "#support",
    reason: rule?.why ?? "a customer asking for help, so support",
    agent: "An agent",
    working: `Reading the ${rule?.project ?? "Support desk"} documents first…`,
    checks: ["The checks it ran, and what came back", "A screenshot of it working"],
    reply: "Hi, thanks for writing in. It’s fixed, and here’s what we changed.",
    sender: "Someone on your team",
  };
}

const STEPS = [
  { name: "Arrives", status: "New" },
  { name: "Sorted", status: "Sorted" },
  { name: "Taken", status: "In progress" },
  { name: "Proof", status: "Handed in" },
  { name: "Sent", status: "Done" },
];
const STEP_MS = 2600;

const story = ref<Story>(MAYA);
/** How far the story has got, 1–5. The server renders it finished. */
const step = ref(5);
const playing = ref(false);
const held = ref(false);
const typed = ref("");
/** Bumped on every replay, so each moment's motion starts again from the top. */
const run = ref(0);
let timer: ReturnType<typeof setTimeout> | undefined;

function tick() {
  clearTimeout(timer);
  if (!playing.value || held.value) return;
  timer = setTimeout(
    () => {
      // Hold on the finished story a little longer, then go round again.
      if (step.value >= STEPS.length) {
        run.value++;
        step.value = 1;
      } else step.value++;
      tick();
    },
    step.value >= STEPS.length ? STEP_MS * 2 : STEP_MS,
  );
}
function play(from = 1) {
  run.value++;
  step.value = from;
  playing.value = true;
  tick();
}
function choose(n: number) {
  playing.value = false;
  clearTimeout(timer);
  step.value = n;
}
function hold(on: boolean) {
  held.value = on;
  tick();
}
function tryIt() {
  if (!typed.value.trim()) return;
  story.value = sortTyped(typed.value);
  typed.value = "";
  play(1);
}

onMounted(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  play(1);
});
onBeforeUnmount(() => clearTimeout(timer));

/** A moment that has happened plays its entrance; one that has not keeps its place, unseen. */
const at = (n: number) => (step.value >= n ? "in" : "later");
</script>

<template>
  <section class="story" aria-label="One thing that came in, followed to done">
    <div
      class="story-card"
      @mouseenter="hold(true)"
      @mouseleave="hold(false)"
      @focusin="hold(true)"
      @focusout="hold(false)"
    >
      <header class="story-head">
        <h3 :key="story.title" class="story-title">{{ story.title }}</h3>
        <span :key="`${run}-${step}`" class="story-status" :class="{ done: step === STEPS.length }" aria-live="polite">{{ STEPS[step - 1]?.status }}</span>
      </header>

      <ol :key="run" class="story-rows">
        <!-- 1 · The email flies in and lands. -->
        <li class="story-row arrive" :class="at(1)">
          <span class="story-mark"><AppIcon name="inbox" /></span>
          <div>
            <p class="story-what">Email from {{ story.from }} <span class="story-at">09:12</span></p>
            <p class="story-said">“{{ story.said }}”</p>
          </div>
        </li>

        <!-- 2 · The sorting stamps its project and group, then gives its reason. -->
        <li class="story-row sort" :class="at(2)">
          <span class="story-mark"><AppIcon name="project" /></span>
          <div>
            <p class="story-what">
              Sorted to
              <span class="story-stamp">{{ story.project }}</span>
              <span class="story-stamp second">{{ story.group }}</span>
              <span class="story-at">09:12</span>
            </p>
            <p class="story-note reveal">The agent’s reason: {{ story.reason }}. A tracking number went back by email.</p>
          </div>
        </li>

        <!-- 3 · An agent arrives and works. -->
        <li class="story-row take" :class="[at(3), { working: step === 3 }]">
          <span class="story-mark agent" aria-hidden="true">A</span>
          <div>
            <p class="story-what">{{ story.agent }} took it <span class="story-at">09:20</span></p>
            <p class="story-note">{{ story.working }}</p>
            <span class="story-work" aria-hidden="true" />
          </div>
        </li>

        <!-- 4 · The checks tick, one after the other. -->
        <li class="story-row proof" :class="at(4)">
          <span class="story-mark"><AppIcon name="check" /></span>
          <div>
            <p class="story-what">Handed in with proof <span class="story-at">11:31</span></p>
            <ul class="story-checks">
              <li v-for="c in story.checks" :key="c">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
                <span>{{ c }}</span>
              </li>
            </ul>
          </div>
        </li>

        <!-- 5 · The reply rises and goes. -->
        <li class="story-row send" :class="at(5)">
          <span class="story-mark"><AppIcon name="support" /></span>
          <div>
            <p class="story-what">Reply sent by {{ story.sender }} <span class="story-at">11:40</span></p>
            <p class="story-reply">{{ story.reply }}</p>
            <p class="story-note">Drafted by the agent, read and sent by a person.</p>
          </div>
        </li>
      </ol>

      <!-- Where the story is: one segment per moment, the current one filling while it plays. -->
      <div class="story-track" role="group" aria-label="Choose a moment">
        <button
          v-for="(s, i) in STEPS"
          :key="s.name"
          type="button"
          class="story-step"
          :class="{ past: step > i + 1, now: step === i + 1, running: step === i + 1 && playing && !held }"
          :aria-pressed="step === i + 1"
          @click="choose(i + 1)"
        >
          <span class="story-bar" aria-hidden="true" />
          {{ s.name }}
        </button>
      </div>
    </div>

    <form class="story-try" @submit.prevent="tryIt">
      <label for="story-input">Try it with your own message</label>
      <div class="story-try-row">
        <input
          id="story-input"
          v-model="typed"
          type="text"
          maxlength="220"
          autocomplete="off"
          placeholder="e.g. The checkout page is blank on my phone"
        />
        <button class="btn primary" type="submit" :disabled="!typed.trim()">Send it in</button>
      </div>
      <p class="story-small">A demo in your browser: nothing is sent, and the sorting here is a stand-in for Passalong’s agent.</p>
    </form>
  </section>
</template>
