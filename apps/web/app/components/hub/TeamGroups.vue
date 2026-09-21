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
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import type { TeamDetail } from "~/types/hub";

interface Group {
  id: string;
  slug: string;
  name: string;
  created: string;
  members: string[];
}

const props = defineProps<{ team: TeamDetail }>();

const { api, json, signedIn } = useHub();
const queryClient = useQueryClient();

const key = computed(() => ["groups", props.team.slug] as const);
const {
  data: loaded,
  isPending: loadingGroups,
  error: loadFailed,
} = useQuery({
  queryKey: key,
  queryFn: async () =>
    (await api<{ groups: Group[] }>(`/v1/teams/${props.team.slug}/groups`))?.groups ?? [],
  enabled: signedIn,
});
const groups = computed(() => loaded.value ?? []);
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

/** A member by name. Groups store handles, so this is the lookup back to the person. */
const nameOf = (handle: string) => {
  const m = (props.team.members || []).find((x) => x.handle === handle);
  return m ? m.display || personName(m.name, m.handle) : `@${handle}`;
};

const load = () => queryClient.invalidateQueries({ queryKey: key.value });
watch(loadFailed, (e) => {
  if (e) trouble.value = e.message;
});

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
    <HubSkeleton v-if="loadingGroups" variant="lines" :rows="2" label="Loading groups" />
    <ul v-else-if="groups.length" class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="g in groups" :key="g.id" class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <b class="font-ui text-sm font-semibold text-fg">{{ g.name || g.slug }}</b>
          <span v-if="g.members.length" class="font-ui text-sm text-muted">
            {{ g.members.map(nameOf).join(", ") }}
          </span>
          <!-- An empty group reaches nobody, and a guide sent to it lands with no one at all.
               Said plainly, because it looks like it is working. -->
          <span v-else class="font-ui text-sm text-warn">Nobody in it yet, so guides sent here reach no one</span>
          <span class="ml-auto flex flex-wrap items-center gap-2">
            <button class="btn sm" :disabled="busy" @click="edit(g)">
              {{ editing === g.id ? "Cancel" : "Choose who's in it" }}
            </button>
            <template v-if="removing === g.id">
              <span class="font-ui text-sm text-muted">Guides already sent keep the name.</span>
              <button class="btn outline danger sm" @click="drop(g)">Remove it</button>
              <button class="btn sm" @click="removing = null">Keep it</button>
            </template>
            <button v-else class="btn destructive sm" @click="removing = g.id">Remove</button>
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
            >{{ nameOf(h) }}
          </label>
          <button class="btn primary sm" :disabled="busy" @click="save(g)">Save</button>
        </div>
      </li>
    </ul>
    <p v-else class="m-0 font-ui text-sm text-muted">
      No groups yet. Without one, a guide goes to one person or to the whole team.
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
        A guide sent to the group reaches everyone in it, and the first person to take it takes it
        off everyone else's list. Agents can send to it by name too.
      </p>
    </form>
    <button v-else class="btn sm mt-2" @click="adding = true">
      <AppIcon name="plus" />New group
    </button>

    <p v-if="trouble" class="mt-2 mb-0 font-ui text-sm text-danger">{{ trouble }}</p>
  </div>
</template>
