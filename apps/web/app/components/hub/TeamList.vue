<!--
  Every team you are in, with the link that adds someone to it.

  This replaces a panel that showed one team — whichever the scope chips happened to be pointing
  at — which meant the answer to "who is in my other team" was to change a filter first. There is
  no endpoint for all of them at once, so it is one call per team, in parallel, on a page that is
  opened rarely and lists a handful.
-->
<script setup lang="ts">
import type { TeamDetail } from "~/types/hub";

const { data, api, json, scope, createTeam } = useHub();
const router = useRouter();

const teams = computed(() => data.value.me?.teams || []);
const details = ref<TeamDetail[]>([]);
const open = ref<string | null>(null);

async function loadDetails() {
  const slugs = teams.value.map((t) => t.slug);
  const got = await Promise.all(
    slugs.map((s) => api<TeamDetail>(`/v1/teams/${encodeURIComponent(s)}`).catch(() => null)),
  );
  details.value = got.filter(Boolean) as TeamDetail[];
}

onMounted(loadDetails);
watch(teams, loadDetails);

/** "@bo, @mira, @sol and you" — you are always in it, and always last. */
function who(t: TeamDetail) {
  const me = data.value.me?.handle;
  const others = t.members
    .map((m) => m.handle)
    .filter((h) => h && h !== me)
    .map((h) => `@${h}`);
  if (!others.length) return "just you";
  return `${others.join(", ")} and you`;
}

/** One click: mint a link and put it on the clipboard. Nobody wants to read it. */
async function invite(t: TeamDetail, el: EventTarget | null) {
  const made = await api<{ url: string }>(
    `/v1/teams/${encodeURIComponent(t.slug)}/invites`,
    json("POST"),
  );
  if (made) copy(made.url, el);
}

function guides(t: TeamDetail) {
  scope.value = t.slug;
  router.push("/hub/guides");
}

const item =
  "flex w-full cursor-pointer items-center rounded-1 border-0 bg-transparent px-2 py-1.5 text-left font-ui text-sm text-fg hover:bg-surface";
</script>

<template>
  <div>
    <ul class="m-0 flex list-none flex-col gap-3 p-0">
      <li
        v-for="t in details"
        :key="t.slug"
        class="flex flex-wrap items-start justify-between gap-3"
      >
        <div class="min-w-0">
          <p class="m-0 font-ui text-base font-semibold text-fg">{{ t.slug }}</p>
          <p class="mt-0.5 mb-0 font-ui text-sm text-muted">
            {{ t.role }} · {{ plural(t.members.length, "member") }} · {{ who(t) }}
          </p>
        </div>

        <div class="relative flex shrink-0 items-center gap-2">
          <button
            class="cursor-pointer rounded-1 border border-line-strong px-3 py-2 font-ui text-sm font-medium whitespace-nowrap text-fg transition-colors hover:border-muted hover:bg-surface"
            @click="invite(t, $event.currentTarget)"
          >
            copy invite link
          </button>
          <button
            class="cursor-pointer rounded-1 border border-line-strong px-2.5 py-2 font-ui text-sm leading-none font-semibold text-muted transition-colors hover:border-muted hover:text-fg"
            :aria-expanded="open === t.slug"
            aria-haspopup="menu"
            @click="open = open === t.slug ? null : t.slug"
          >
            ⋯
          </button>
          <div
            v-if="open === t.slug"
            class="absolute top-full right-0 z-20 mt-1 flex w-52 flex-col gap-0.5 rounded-2 border border-line-strong bg-raised p-1.5 shadow-lift"
            @keydown.esc="open = null"
          >
            <button :class="item" @click="guides(t)">see this team's guides</button>
            <button :class="item" @click="copy(t.slug, $event.currentTarget)">copy team slug</button>
            <p class="mt-1 mb-0 px-2 font-ui text-xs text-muted">
              {{ plural(t.guides, "guide") }} shared here
            </p>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="!teams.length" class="mt-0 mb-3 font-ui text-sm text-muted">
      No team yet. A team is who you can hand work to.
    </p>

    <button
      class="mt-3 cursor-pointer rounded-1 border border-line-strong px-3 py-2 font-ui text-sm font-medium text-fg transition-colors hover:border-muted hover:bg-surface"
      @click="createTeam"
    >
      + new team
    </button>
  </div>
</template>
