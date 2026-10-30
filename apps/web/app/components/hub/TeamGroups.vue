<!--
  A team's groups: the people who do a thing, addressable as one.

  Addressing had two settings and needed a third. Naming one person is precise and wrong when you
  do not know who is free; leaving it off shares with everybody and reaches people it has nothing
  to do with. Both end the same way — the work sits in a lane nobody treats as theirs.

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
  <div class="@container flex flex-col">
    <HubSkeleton v-if="loadingGroups" variant="lines" :rows="2" label="Loading groups" />
    <template v-else-if="groups.length">
      <div aria-hidden="true" class="register-label hidden grid-cols-[12rem_minmax(0,1fr)_auto] gap-x-4 border-b border-line pt-3 pb-2 @2xl:grid">
        <span>Group</span><span>People</span><span />
      </div>
      <ul class="m-0 list-none p-0">
        <li v-for="g in groups" :key="g.id" class="border-b border-line py-3">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-sm @2xl:grid @2xl:gap-x-4 @2xl:grid-cols-[12rem_minmax(0,1fr)_auto]">
            <span class="min-w-0 basis-full font-medium break-words text-fg @2xl:basis-auto">#{{ g.slug }}</span>
            <span v-if="g.members.length" class="min-w-0 grow text-muted @2xl:text-fg">{{ g.members.map(nameOf).join(", ") }}</span>
            <!-- An empty group reaches nobody, and work sent to it lands with no one at all. Said
                 plainly, because it looks like it is working. -->
            <span v-else class="flex min-w-0 grow items-center gap-2 text-fg">
              <span class="size-1.5 shrink-0 rounded-pill bg-warn" aria-hidden="true" />Nobody yet, so work sent here reaches no one
            </span>
            <span class="flex basis-full flex-wrap gap-2 pt-1 @2xl:basis-auto @2xl:justify-end @2xl:pt-0">
              <button class="btn sm" type="button" :disabled="busy" :aria-expanded="editing === g.id" @click="edit(g)">
                {{ editing === g.id ? "Cancel" : "Choose people" }}
              </button>
              <button v-if="removing !== g.id" class="btn sm" type="button" @click="removing = g.id">Remove…</button>
            </span>
          </div>

          <div v-if="editing === g.id" class="appears mt-3 flex flex-wrap items-center gap-2">
            <label v-for="h in handles" :key="h" class="chip-pick font-ui text-sm">
              <input type="checkbox" :checked="picked.has(h)" @change="toggle(h)">{{ nameOf(h) }}
            </label>
            <p v-if="!handles.length" class="m-0 font-ui text-sm text-muted">Nobody in the team has an @name yet.</p>
            <button class="btn primary sm" type="button" :disabled="busy" @click="save(g)">Save</button>
          </div>

          <div v-if="removing === g.id" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
            <p class="m-0 min-w-0 grow basis-64 font-ui text-sm">Remove #{{ g.slug }}? Nobody receives work sent to it any more; work already sent keeps the name.</p>
            <button class="btn sm outline danger" type="button" @click="drop(g)">Remove</button>
            <button class="btn sm" type="button" @click="removing = null">Keep it</button>
          </div>
        </li>
      </ul>
    </template>
    <p v-else class="m-0 border-b border-line py-3 font-ui text-sm text-muted">
      No groups yet. Without one, work goes to one person or to the whole team.
    </p>

    <form v-if="adding" class="appears mt-3 flex flex-wrap items-end gap-3" @submit.prevent="add">
      <div class="grow basis-48">
        <label class="mb-2 block font-ui text-sm font-medium text-fg" for="group-slug">
          What do these people do?
        </label>
        <input id="group-slug" v-model="slug" class="w-full" placeholder="frontend" required>
      </div>
      <button class="btn primary" type="submit" :disabled="busy || !slug.trim()">
        {{ busy ? "Adding…" : "Add group" }}
      </button>
      <button class="btn" type="button" @click="adding = false; slug = ''">Cancel</button>
      <p class="m-0 basis-full font-ui text-xs text-muted">Agents can send to it by name too.</p>
    </form>
    <button v-else class="btn sm mt-3 self-start" type="button" @click="adding = true">
      <AppIcon name="plus" />New group
    </button>

    <p v-if="trouble" class="mt-2 mb-0 font-ui text-sm text-danger" role="alert">{{ trouble }}</p>
  </div>
</template>
