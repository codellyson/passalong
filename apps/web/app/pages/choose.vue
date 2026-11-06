<!--
  Picking an agent's option from the email that asked (0074_choice_link.sql). Each option's button
  in the mail opens this page with the link's token and the option tapped, in the URL fragment:
  browsers never send it, so no log holds it, as with a password reset.

  It asks once more before it picks, with the option tapped ready to confirm. Mail scanners open
  every link in a message, and a link that picked by being opened would answer for you before you
  had read it. No sign-in: the link is the credential, for that one question, once.
-->
<script setup lang="ts">
usePage({
  title: "Answer your agent",
  description: "Pick one of the options your agent offered.",
  noindex: true,
});
useHead({ bodyAttrs: { class: "hub-app" } });

type Choice = { label: string; detail: string; picture: string };
const token = ref("");
const tapped = ref(0);
const ask = ref<{
  title: string;
  question: string;
  choices: Choice[];
  open: boolean;
  why: string;
  /** The agent that asked still holds the work. Stopped, a pick is a note for whoever is next. */
  held: boolean;
  picked: number;
} | null>(null);
const problem = ref("");
const busy = ref(false);
const done = ref("");
/** Whether the pick reached an agent still on it, or was left for whoever takes it next. */
const reached = ref(true);
const mounted = ref(false);

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(out.message || res.statusText);
  return out;
}

/**
 * Read the link from the fragment and scrub it. Again whenever only the fragment changes: a second
 * link opened in the same tab is the same page, which would otherwise keep showing the first.
 */
async function open() {
  if (!location.hash) return;
  const p = new URLSearchParams(location.hash.slice(1));
  token.value = p.get("t") || "";
  tapped.value = Number(p.get("n")) || 0;
  history.replaceState(null, "", location.pathname);
  ask.value = null;
  done.value = "";
  problem.value = "";
  if (!token.value) return;
  try {
    ask.value = await post("/v1/choose/read", { token: token.value });
  } catch (e) {
    problem.value = (e as Error).message;
  }
}
onMounted(async () => {
  window.addEventListener("hashchange", open);
  mounted.value = true;
  await open();
});
onBeforeUnmount(() => window.removeEventListener("hashchange", open));

/** Why the link can't pick any more, said plainly. */
const closed = computed(() => {
  const a = ask.value;
  if (!a || a.open) return "";
  if (a.why === "used")
    return `This was answered with this link: ${a.choices[a.picked - 1]?.label || "an option"}. Nothing more is needed.`;
  if (a.why === "answered") return "This question was already answered. Nothing more is needed.";
  return "This link has expired. Answer it in the hub instead.";
});

async function pick(n: number) {
  busy.value = true;
  problem.value = "";
  try {
    const got = await post<{ label: string; held: boolean }>("/v1/choose/pick", {
      token: token.value,
      n,
    });
    reached.value = got.held;
    done.value = got.label;
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main>
    <header>
      <AppBrand />
      <h1>{{ ask ? ask.title : "Answer your agent" }}</h1>
      <div class="meta">
        <span>{{ ask && !ask.held ? "The agent that asked has stopped." : "Your agent is waiting on this to carry on." }}</span>
      </div>
    </header>

    <p
      v-if="mounted && !token"
      class="mb-5 rounded-2 border border-danger bg-danger-soft px-3 py-3 font-ui text-sm text-danger"
    >
      This link is incomplete. It may have been cut off when it was copied.
      <a href="/hub">Answer it in the hub</a>
    </p>

    <p v-else-if="done" role="status" class="font-ui text-sm">
      Done: you chose <b class="font-medium">{{ done }}</b>.
      <template v-if="reached">Your agent carries on with it.</template>
      <template v-else>The agent that asked had stopped, so it is saved on the work for whoever takes it next.</template>
      You can close this page.
    </p>

    <template v-else-if="ask">
      <p class="mb-4 max-w-[65ch] font-ui text-sm">“{{ ask.question }}”</p>
      <p v-if="ask.open && !ask.held" class="mb-4 font-ui text-sm text-muted">
        The agent that asked has stopped. Your pick is saved on the work for whoever takes it next.
      </p>
      <p v-if="closed" class="mb-4 rounded-2 border border-line bg-raised px-3 py-3 font-ui text-sm">
        {{ closed }}
        <a v-if="ask.why === 'expired'" href="/hub">Open the hub</a>
      </p>
      <ol v-else class="m-0 grid list-none gap-3 p-0 sm:grid-cols-2" aria-label="Pick one">
        <li
          v-for="(c, n) in ask.choices"
          :key="n"
          class="flex flex-col gap-2 rounded-2 border bg-surface p-3"
          :class="tapped === n + 1 ? 'border-fg' : 'border-line'"
        >
          <img
            v-if="c.picture"
            :src="c.picture"
            :alt="`Option ${n + 1}: ${c.label}`"
            class="w-full rounded-1 border border-line"
          />
          <p class="m-0 font-ui text-sm font-medium">{{ n + 1 }}. {{ c.label }}</p>
          <p v-if="c.detail" class="m-0 font-ui text-xs text-muted">{{ c.detail }}</p>
          <button
            class="btn sm mt-auto self-start"
            :class="tapped === n + 1 ? 'primary' : ''"
            type="button"
            :disabled="busy"
            @click="pick(n + 1)"
          >
            {{ tapped === n + 1 ? `Confirm: ${c.label}` : "Choose this" }}
          </button>
        </li>
      </ol>
    </template>

    <p v-if="problem" role="alert" class="mt-4 font-ui text-sm text-danger">{{ problem }}</p>
  </main>
</template>
