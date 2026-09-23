<!--
  A field that takes an account or a team, and suggests them as you type.

  The routes behind /admin take `@handle`, `team/slug` or an account id, all three exact — and
  nobody remembers a handle. This was a native <datalist> first, for the list, the filtering and the
  keyboard behaviour the browser gives away. The browser also draws that popup itself, outside the
  page, and positions it against the window: inside an embedded view it landed hundreds of pixels
  from its field, over whatever else was on screen. Nothing in CSS can reach it, so the list is
  drawn here instead, and the keyboard and screen-reader behaviour is written out below.

  What the field holds stays a plain string either way. Picking a suggestion fills it in; typing an
  id nobody suggested still works, because the server is what decides who exists.
-->
<script setup lang="ts">
interface Person {
  id: string;
  handle: string;
  name: string;
  email: string;
  role: string;
}

const props = defineProps<{
  id: string;
  modelValue: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [string] }>();

const { api } = useHub();

const suggestions = ref<PickerChoice[]>([]);
const open = ref(false);
/** Which suggestion the keyboard is on; -1 is "none, what I typed stands". */
const active = ref(-1);
let lookingUp: ReturnType<typeof setTimeout> | undefined;

const listId = computed(() => `${props.id}-list`);
const optionId = (i: number) => `${props.id}-option-${i}`;

/**
 * Which side of the field the list opens on. The second of these fields sits near the bottom of
 * /admin, where a list below it opens into the fold: the first suggestion is the only one you can
 * see, and choosing means scrolling a page that moves the field you are typing in. Measured each
 * time it opens, because where the field is depends on how far down the page has been scrolled.
 */
const box = useTemplateRef<HTMLInputElement>("box");
const up = ref(false);
/** The list's own cap, from `.menu.under-field`. */
const LIST_MAX = 16 * 16;
function show(yes: boolean) {
  if (yes && box.value) {
    const seat = box.value.getBoundingClientRect();
    const below = window.innerHeight - seat.bottom;
    up.value = below < LIST_MAX && seat.top > below;
  }
  open.value = yes;
}

function look(q: string) {
  clearTimeout(lookingUp);
  // Typed, not pasted: a request per keystroke is a request per keystroke.
  lookingUp = setTimeout(async () => {
    const said = q.trim();
    if (said.length < 2) {
      suggestions.value = [];
      show(false);
      return;
    }
    try {
      const r = await api<{ people: Person[]; teams: { slug: string; name: string }[] }>(
        `/v1/admin/people?q=${encodeURIComponent(said)}`,
      );
      suggestions.value = personChoices(r?.people ?? [], r?.teams ?? []);
    } catch {
      // A picker that cannot reach the server is a field you type into, which is what it was.
      suggestions.value = [];
    }
    active.value = -1;
    show(suggestions.value.length > 0);
  }, 200);
}

function typed(e: Event) {
  const said = (e.target as HTMLInputElement).value;
  emit("update:modelValue", said);
  look(said);
}

function pick(c: PickerChoice) {
  emit("update:modelValue", c.value);
  show(false);
  active.value = -1;
}

/**
 * The arrow keys, Enter and Escape, which the browser did for a <datalist> and does not do here.
 * Enter only counts as a choice while one is highlighted; otherwise it is the Enter that submits
 * the form, which is what someone who typed an id in full is pressing it for.
 */
function key(e: KeyboardEvent) {
  const n = suggestions.value.length;
  if (e.key === "Escape") {
    show(false);
    active.value = -1;
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!n) return;
    e.preventDefault();
    show(true);
    // Counted from 0 = "none of them", so the cycle runs back through what was typed rather than
    // trapping the keyboard in a list somebody arrowed into by accident.
    const step = e.key === "ArrowDown" ? 1 : -1;
    active.value = ((active.value + 1 + step + n + 1) % (n + 1)) - 1;
    return;
  }
  if (e.key === "Enter" && open.value && active.value >= 0) {
    e.preventDefault();
    const chosen = suggestions.value[active.value];
    if (chosen) pick(chosen);
  }
}

const field =
  "block w-full rounded-1 border border-line-strong bg-raised px-2 py-1.5 font-ui text-sm text-fg";
</script>

<template>
  <!-- The list is positioned against this wrapper, so it sits under its own field wherever the
       form has been wrapped to. -->
  <div class="relative">
    <label class="block font-ui text-xs font-medium text-muted" :for="id">{{ label }}</label>
    <input
      :id="id"
      ref="box"
      :class="field"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open && active >= 0 ? optionId(active) : undefined"
      @input="typed"
      @keydown="key"
      @focus="show(suggestions.length > 0)"
      @blur="show(false)"
    />
    <ul v-if="open" :id="listId" :class="['menu under-field', up ? 'above' : '']" role="listbox" :aria-label="label">
      <li v-for="(s, i) in suggestions" :id="optionId(i)" :key="s.value" role="option" :aria-selected="i === active">
        <!-- mousedown, not click: the field blurs first otherwise, and the list is gone by the
             time the click lands. -->
        <button
          type="button"
          class="menu-item flex-col items-start gap-0"
          :class="i === active ? 'bg-surface' : ''"
          tabindex="-1"
          @mousedown.prevent="pick(s)"
        >
          <span class="w-full truncate text-fg">{{ s.title }}</span>
          <span v-if="s.hint" class="w-full truncate font-code text-xs text-muted">{{ s.hint }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
