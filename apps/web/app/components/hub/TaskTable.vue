<!--
  Tasks as a table: the Open and Done tabs' task lists, one line each, in the same shape as Needs you
  and Taken. A task is the title, what it says to a person, where it stands, who it is for or who
  has it, and its age; what a row can do is the author's alone, and only what the state allows
  (TaskRow.vue's rules, which this replaces for these lists): give it to someone, mark a draft ready,
  stop the agent holding it. Approve and send-back stay on the review pane, where the evidence is.
-->
<script setup lang="ts">
import type { Task } from "~/types/hub";

const props = defineProps<{ tasks: Task[] }>();
const { onRelease, onTaskReady } = useHub();
const { on, list, setAll } = useSelection();
const { open } = useThread();

/** The rows whose box can be ticked: only the author may archive or delete. */
const mineRows = computed(() =>
  props.tasks
    .filter((t) => t.mine)
    .map((t) => ({ id: t.id, title: t.title || "", archived: t.state === "done" })),
);
const picked = computed(() => mineRows.value.filter((p) => list.value.some((q) => q.id === p.id)));
const allPicked = computed(
  () => mineRows.value.length > 0 && picked.value.length === mineRows.value.length,
);
const head = ref<HTMLInputElement | null>(null);
// Some but not all: the box says so rather than looking either on or off.
watchEffect(() => {
  if (head.value) head.value.indeterminate = picked.value.length > 0 && !allPicked.value;
});

const STATE: Record<Task["state"], { text: string; tone: string }> = {
  review: { text: "handed in, waiting on its author", tone: "text-accent" },
  stalled: { text: "agent went silent", tone: "text-warn" },
  claimed: { text: "being worked on", tone: "text-ok" },
  ready: { text: "ready for the next agent", tone: "text-muted" },
  blocked: { text: "blocked", tone: "text-muted" },
  draft: { text: "draft", tone: "text-muted" },
  done: { text: "done", tone: "text-muted" },
};

const held = (t: Task) => t.state === "claimed" || t.state === "stalled";
const canNote = (t: Task) =>
  (t.mine || Boolean(t.for_me)) && ["ready", "blocked", "draft"].includes(t.state);
const talk = (t: Task) =>
  open({
    id: t.id,
    title: t.title,
    stamp: `${t.state}|${t.claim?.note}|${t.claim?.lease_until}`,
    reply: held(t) || canNote(t),
    noting: !held(t) && canNote(t),
  });

/** Whose it is: the agent that has it, who it is for, or nobody yet. */
function holder(t: Task) {
  const b = t.claim?.by;
  if (b) return b.you ? "Your agent" : `${personName(b.name, b.handle) || "A teammate"}'s agent`;
  if (t.for_me && !t.mine) return "For you";
  return t.to ? `For ${t.to}` : "";
}

const canAssign = (t: Task) =>
  (t.mine || Boolean(t.for_me)) && Boolean(t.team) && t.state !== "done";

/** The one row whose assign picker is open. */
const assigning = ref("");
const root = ref<HTMLElement | null>(null);
function onDocument(e: MouseEvent) {
  if (assigning.value && !root.value?.contains(e.target as Node)) assigning.value = "";
}
onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));
</script>

<template>
  <div ref="root" class="rounded-3 bg-raised shadow-edge">
    <table class="rows m-0 w-full font-ui text-sm">
      <thead>
        <tr class="text-xs text-muted">
          <th class="w-8">
            <label v-if="on && mineRows.length" class="flex cursor-pointer items-center">
              <input
                ref="head"
                type="checkbox"
                class="size-4 accent-[var(--accent)]"
                aria-label="Select all of these"
                :checked="allPicked"
                @change="setAll(mineRows, ($event.target as HTMLInputElement).checked)"
              >
            </label>
          </th>
          <th>Task</th>
          <th>What it says</th>
          <th>State</th>
          <th>Held by</th>
          <th>Age</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tasks" :key="t.id">
          <td><HubSelectBox :id="t.id" :title="t.title" :archived="t.state === 'done'" :mine="t.mine" /></td>
          <td class="min-w-60 max-w-[22rem] font-medium">
            <NuxtLink :to="`/hub/g/${t.id}`" class="line-clamp-2 text-fg no-underline hover:text-accent">{{ t.title || t.id }}</NuxtLink>
            <span class="font-code text-xs font-normal text-muted">{{ t.id }}</span>
          </td>
          <td class="max-w-[24rem] text-muted"><span class="line-clamp-2">{{ t.summary || "—" }}</span></td>
          <td class="whitespace-nowrap" :class="STATE[t.state].tone">{{ STATE[t.state].text }}</td>
          <td class="whitespace-nowrap text-muted">
            <b v-if="holder(t)" class="font-medium text-fg">{{ holder(t) }}</b>
            <span v-if="t.target" class="ml-1 font-code text-xs">{{ shorten(t.target, 24).text }}</span>
          </td>
          <td class="whitespace-nowrap text-muted tabular-nums">{{ rel(t.created) }}</td>
          <td class="relative text-right whitespace-nowrap">
            <button type="button" class="btn sm mr-2" @click="talk(t)"><AppIcon name="open" />Conversation</button>
            <button
              v-if="canAssign(t)"
              type="button"
              class="btn sm"
              :aria-expanded="assigning === t.id"
              @click.stop="assigning = assigning === t.id ? '' : t.id"
              @keydown.esc="assigning = ''"
            >Give to…</button>
            <button v-if="t.mine && t.state === 'draft'" type="button" class="btn sm ml-2" @click="onTaskReady(t)">Ready for agents</button>
            <button
              v-if="t.mine && held(t)"
              type="button"
              class="btn outline warn sm ml-2"
              @click="onRelease(t)"
            >Stop this agent</button>
            <div v-if="assigning === t.id" class="menu absolute right-5 z-10 w-72 text-left" @click.stop>
              <HubAssignPicker :id="t.id" :team="t.team || ''" :to="t.to" @done="assigning = ''" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
