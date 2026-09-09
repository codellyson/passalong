<!--
  A team's groups: the people who do a thing, addressable as one.

  Addressing had two settings and needed a third. Naming one person is precise and wrong when you
  do not know who is free; leaving it off shares with everybody and reaches people it has nothing
  to do with. Both end the same way — the guide sits in a lane nobody treats as theirs.

  Membership is edited as a list rather than one person at a time, because "who is in #frontend" is
  a thing somebody decides in one sitting, and two controls racing over one list is how a person
  ends up half-added.
-->
<script setup lang="ts">
import type { TeamDetail } from "~/types/hub";

interface Group {
  id: string;
  slug: string;
  name: string;
  created: string;
  members: string[];
}

const props = defineProps<{ team: TeamDetail }>();

const { api, json } = useHub();

const groups = ref<Group[]>([]);
const adding = ref(false);
const slug = ref("");
const busy = ref(false);
const trouble = ref("");
/** Which group's membership is open, and the draft of it. One at a time. */
const editing = ref<string | null>(null);
const picked = ref<Set<string>>(new Set());
const removing = ref<string | null>(null);

/**
 * The team's members, by handle. An account without one cannot be put in a group: a group is
 * written by hand in frontmatter as `#slug`, and its membership is resolved by handle, so someone
 * who has not chosen one has no name for this list to hold.
 */
const handles = computed(() =>
  (props.team.members || []).map((m) => m.handle).filter((h): h is string => Boolean(h)),
);

async function load() {
  try {
    groups.value =
      (await api<{ groups: Group[] }>(`/v1/teams/${props.team.slug}/groups`))?.groups || [];
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}
onMounted(load);

async function add() {
  if (busy.value || !slug.value.trim()) return;
  busy.value = true;
  trouble.value = "";
  try {
    await api(`/v1/teams/${props.team.slug}/groups`, json("POST", { slug: slug.value.trim() }));
    adding.value = false;
    slug.value = "";
    await load();
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function edit(g: Group) {
  editing.value = editing.value === g.id ? null : g.id;
  picked.value = new Set(g.members);
}

function toggle(handle: string) {
  const next = new Set(picked.value);
  if (next.has(handle)) next.delete(handle);
  else next.add(handle);
  picked.value = next;
}

async function save(g: Group) {
  busy.value = true;
  try {
    await api(
      `/v1/teams/${props.team.slug}/groups/${g.id}/members`,
      json("PUT", { handles: [...picked.value] }),
    );
    editing.value = null;
    await load();
  } catch (e) {
    trouble.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function drop(g: Group) {
  try {
    await api(`/v1/teams/${props.team.slug}/groups/${g.id}`, { method: "DELETE" });
    removing.value = null;
    await load();
  } catch (e) {
    trouble.value = (e as Error).message;
  }
}
</script>

<template>
  <!-- A hairline and an indent, the same as the channels below it: this belongs to the team above
       rather than being a card inside a card inside a section. -->
  <div class="mt-2 border-t border-line pt-2 pl-3">
    <ul v-if="groups.length" class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="g in groups" :key="g.id" class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <code class="font-code text-sm text-fg">#{{ g.slug }}</code>
          <span v-if="g.members.length" class="font-ui text-sm text-muted">
            {{ g.members.map((h) => `@${h}`).join(", ") }}
          </span>
          <!-- An empty group is an address that reaches nobody, and a guide handed to it lands
               in no inbox at all. Said plainly, because it looks like it is working. -->
          <span v-else class="font-ui text-sm text-warn">nobody in it — nothing sent here arrives</span>
          <span class="ml-auto flex flex-wrap items-center gap-2">
            <button class="btn sm" :disabled="busy" @click="edit(g)">
              {{ editing === g.id ? "cancel" : "who is in it" }}
            </button>
            <template v-if="removing === g.id">
              <span class="font-ui text-sm text-muted">Guides already sent keep the name.</span>
              <button class="btn outline danger sm" @click="drop(g)">Remove it</button>
              <button class="btn sm" @click="removing = null">Keep it</button>
            </template>
            <button v-else class="btn destructive sm" @click="removing = g.id">remove</button>
          </span>
        </div>

        <div v-if="editing === g.id" class="appears flex flex-wrap items-center gap-2">
          <label
            v-for="h in handles"
            :key="h"
            class="flex cursor-pointer items-center gap-2 rounded-pill border border-line px-3 py-1 font-ui text-sm"
            :class="picked.has(h) ? 'border-accent bg-accent-soft text-accent' : 'text-muted'"
          >
            <input
              type="checkbox"
              class="w-auto"
              :checked="picked.has(h)"
              @change="toggle(h)"
            >@{{ h }}
          </label>
          <button class="btn primary sm" :disabled="busy" @click="save(g)">save who is in it</button>
        </div>
      </li>
    </ul>
    <p v-else class="m-0 font-ui text-sm text-muted">
      No groups. A guide goes to one person or to everybody.
    </p>

    <form v-if="adding" class="appears mt-2 flex flex-wrap items-end gap-3" @submit.prevent="add">
      <div class="grow basis-48">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="group-slug">
          What do these people do?
        </label>
        <input id="group-slug" v-model="slug" class="w-full" placeholder="frontend" required>
      </div>
      <button class="btn primary sm" type="submit" :disabled="busy || !slug.trim()">
        {{ busy ? "Adding…" : "Add group" }}
      </button>
      <button class="btn sm" type="button" @click="adding = false; slug = ''">Cancel</button>
      <p class="m-0 basis-full font-ui text-sm text-muted">
        Hand something to it with <code class="font-code">to: {{ team.slug }}/#{{ slug.trim() || "frontend" }}</code>
        in the frontmatter. It reaches everyone in the group, and the first to say they are on it
        takes it off the others' boards.
      </p>
    </form>
    <button v-else class="btn sm mt-2" @click="adding = true">
      <AppIcon name="plus" />new group
    </button>

    <p v-if="trouble" class="mt-2 mb-0 font-ui text-sm text-danger">{{ trouble }}</p>
  </div>
</template>
