<!--
  Everything a guide can do that is not the one thing its row leads with.

  What a person does comes first, in words: open it, copy its link, see what followed from it,
  answer it. The terminal commands are still here, because agents and people with the CLI use
  them every day, but under their own label rather than as the first two items of every menu.
-->
<script setup lang="ts">
import type { Guide } from "~/types/hub";

const props = defineProps<{ g: Guide }>();
const emit = defineEmits<{ verdict: []; ack: [] }>();

const { data, onArchive, onRemove } = useHub();

/** Archived is a shelf, not a verdict: the guide is off your list and off the free plan's count. */
const archived = computed(() => props.g.status === "consumed");

const open = ref(false);
/** Deleting asks in the menu it was chosen from. `confirm()` threw where dialogs are blocked. */
const confirming = ref(false);
const root = ref<HTMLElement | null>(null);

const pull = computed(() => `passalong pull ${props.g.id}`);
/** A follow-up is written where guides are written — here, a terminal, or an agent. */
const follow = computed(() => `passalong share --follows ${props.g.id}`);

const me = computed(() => data.value.me?.handle || null);
/** Only the person a guide was sent to answers it, and only the question that is still open. */
const canTake = computed(() => !props.g.mine && !archived.value && !props.g.my_ack);
const canJudge = computed(
  () =>
    !props.g.mine &&
    !archived.value &&
    Boolean(props.g.my_ack?.taken) &&
    !(props.g.verdict && me.value && props.g.verdict.by === me.value),
);

/** Yours and in a team: you may give it to someone else there. The menu turns into the picker. */
const canAssign = computed(() => props.g.mine && Boolean(props.g.team) && !archived.value);
const assigning = ref(false);
const assignedTo = computed(() =>
  props.g.to ? `@${props.g.to}` : props.g.to_group ? `#${props.g.to_group}` : "",
);

function shut() {
  open.value = false;
  confirming.value = false;
  assigning.value = false;
}

/** A menu that stays open behind you is worse than no menu. */
function onDocument(e: MouseEvent) {
  if (open.value && !root.value?.contains(e.target as Node)) shut();
}

onMounted(() => document.addEventListener("click", onDocument));
onBeforeUnmount(() => document.removeEventListener("click", onDocument));

function run(work: () => void) {
  shut();
  work();
}
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="shut">
    <button
      class="btn icon"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-label="`More for ${g.title || 'this guide'}`"
      @click="open = !open"
    >
      <AppIcon name="more" />
    </button>

    <div v-if="open && assigning" class="menu w-72">
      <HubAssignPicker :id="g.id" :team="g.team || ''" :to="assignedTo" @done="shut" />
    </div>
    <div v-else-if="open" class="menu">
      <a class="menu-item" :href="g.url" target="_blank" rel="noopener" @click="shut">Open the guide</a>
      <button class="menu-item" @click="copy(g.url, $event.currentTarget)">Copy link</button>
      <button class="menu-item" type="button" @click="copy(followUpAsk(g.id), $event.currentTarget)">
        <span data-label>Copy a follow-up ask for your agent</span>
      </button>
      <NuxtLink
        v-if="g.children"
        class="menu-item"
        :to="{ path: '/hub', query: { follows: g.id } }"
        @click="shut"
      >
        See follow-ups ({{ g.children }})
      </NuxtLink>
      <p class="menu-note">A follow-up adds more context to this guide. Anyone who opens it gets that too.</p>

      <template v-if="canAssign">
        <div class="menu-rule" />
        <button class="menu-item" type="button" @click.stop="assigning = true">
          Give it to someone else
        </button>
      </template>

      <template v-if="canTake || canJudge">
        <div class="menu-rule" />
        <button v-if="canTake" class="menu-item" @click="run(() => emit('ack'))">
          Say whether you're taking it
        </button>
        <button v-if="canJudge" class="menu-item" @click="run(() => emit('verdict'))">
          Say how it went
        </button>
      </template>

      <div class="menu-rule" />
      <p class="menu-note">Terminals and agents</p>
      <button class="menu-item" :title="pull" @click="copy(pull, $event.currentTarget)">
        Copy pull command
      </button>
      <button class="menu-item" :title="follow" @click="copy(follow, $event.currentTarget)">
        Copy follow-up command
      </button>

      <template v-if="g.mine">
        <div class="menu-rule" />
        <!-- Above delete, because it is what most people reaching for "remove" actually want:
             the guide out of the way, not gone. It is also how to make room on the free plan
             without throwing anything away. -->
        <button v-if="archived" class="menu-item" @click="run(() => onArchive(g, false))">
          Put it back
        </button>
        <button v-else class="menu-item" @click="run(() => onArchive(g, true))">Archive</button>
        <button v-if="!confirming" class="menu-item destructive" @click="confirming = true">
          Delete
        </button>
        <template v-else>
          <p class="menu-note">
            Deletes it for everyone. Copies people already downloaded stay theirs.
          </p>
          <button class="menu-item destructive" @click="run(() => onRemove(g))">Yes, delete it</button>
          <button class="menu-item" @click="confirming = false">Keep it</button>
        </template>
      </template>
    </div>
  </div>
</template>
