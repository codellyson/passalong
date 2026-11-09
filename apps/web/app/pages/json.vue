<!--
  Paste anything close to JSON, see what it holds and what had to be repaired to read it. The text
  never leaves the browser. Not listed in shared/pages.ts, so nothing links it and search engines
  are told to leave it.
-->
<script setup lang="ts">
usePage({
  title: "JSON viewer",
  description: "Read, repair, search and browse JSON, in your browser.",
  noindex: true,
});

const LARGE = 200_000;
const MAX_FILE = 20 * 1024 * 1024;
const TABLE_PAGE = 500;
const SAMPLE = `// copied from a log, with a few mistakes
{
  id: 12345678901234567890,
  'name': "Ada",
  "active": True,
  "created_at": 1794250000,
  "profile_url": "https://passalong.dev",
  "settings": "{\\"theme\\":\\"dark\\",\\"beta\\":true}",
  "orders": [
    {"sku": "A1", "qty": 2},
    {"sku": "B2", "qty": 1, "gift": true},
  ],
}`;

const text = ref("");
const source = ref("");
const query = ref("");
const input = ref<HTMLTextAreaElement>();
const picker = ref<HTMLInputElement>();
const fileProblem = ref("");
const showTable = ref(false);
const tableShown = ref(TABLE_PAGE);

const view = shallowReactive<JsonTreeView>({
  levels: 0,
  query: "",
  found: null,
  selected: null,
  overrides: shallowReactive(new Map<string, boolean>()),
});
provide(JSON_VIEW, view);

const parsed = computed(() => (source.value.trim() ? parseJson(source.value) : null));
const ok = computed(() => (parsed.value?.ok ? parsed.value : null));
const frame = computed(() =>
  parsed.value && !parsed.value.ok ? frameAt(source.value, parsed.value.at) : null,
);
const notes = computed(() => (ok.value ? [...ok.value.repairs, ...ok.value.warnings] : []));
const size = computed(() => sizeText(new TextEncoder().encode(source.value).length));

const tableSource = computed(() => {
  if (!ok.value) return null;
  const picked = view.selected?.value;
  if (picked !== undefined && isTable(picked)) return picked;
  return isTable(ok.value.value) ? ok.value.value : null;
});
const table = computed(() =>
  showTable.value && tableSource.value ? tableOf(tableSource.value) : null,
);

let parseTimer: ReturnType<typeof setTimeout>;
watch(text, (now) => {
  clearTimeout(parseTimer);
  if (now.length < LARGE) source.value = now;
  else parseTimer = setTimeout(() => (source.value = now), 250);
});

function runSearch() {
  const q = query.value.trim();
  view.overrides.clear();
  view.query = q;
  view.found = q && ok.value ? searchJson(ok.value.value, q) : null;
}

let searchTimer: ReturnType<typeof setTimeout>;
watch(query, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 120);
});

watch(ok, (now) => {
  view.selected = null;
  view.levels = now ? levelsWithin(now.value, 200) : 0;
  showTable.value = false;
  tableShown.value = TABLE_PAGE;
  runSearch();
});

/** Through the editing command where it can be, so Undo in the box brings the old text back. */
function rewrite(next: string) {
  const el = input.value as HTMLTextAreaElement;
  el.focus();
  el.select();
  if (next.length > 1_000_000 || !document.execCommand("insertText", false, next)) text.value = next;
}

function goTo(at: number) {
  const el = input.value as HTMLTextAreaElement;
  const { line, column } = placeOf(text.value, at);
  el.focus();
  el.setSelectionRange(at, at + 1);
  const style = getComputedStyle(el);
  el.scrollTop = (line - 3) * Number.parseFloat(style.lineHeight);
  el.scrollLeft = column * Number.parseFloat(style.fontSize) * 0.6 - el.clientWidth / 2;
}

async function load(file?: File | null) {
  fileProblem.value = "";
  if (!file) return;
  if (file.size > MAX_FILE) {
    fileProblem.value = `${file.name} is ${sizeText(file.size)}. This page reads up to ${sizeText(MAX_FILE)}.`;
    return;
  }
  text.value = await file.text();
}

async function onPick() {
  const el = picker.value as HTMLInputElement;
  await load(el.files?.[0]);
  el.value = "";
}

function expand() {
  if (!ok.value) return;
  view.overrides.clear();
  view.levels = levelsWithin(ok.value.value, 5000);
}

function collapse() {
  view.overrides.clear();
  view.levels = 1;
}

const valueText = (v: Json) => (typeof v === "string" ? v : serialize(v, 2));
</script>

<template>
  <main class="wide">
    <AppMasthead />

    <h1>JSON viewer</h1>
    <p>
      Paste JSON, or something close to it. Mistakes are repaired and listed. It stays in this
      browser: nothing is sent or saved.
    </p>

    <div class="mb-8 grid gap-4 md:h-[80vh] md:grid-cols-2">
      <div class="flex min-h-0 min-w-0 flex-col gap-2">
        <label for="json-input">JSON</label>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn outline" :disabled="!ok" @click="ok && rewrite(serialize(ok.value, 2))">
            Format
          </button>
          <button type="button" class="btn outline" :disabled="!ok" @click="ok && rewrite(serialize(ok.value, 0))">
            Minify
          </button>
          <button
            type="button"
            class="btn outline"
            :disabled="!ok"
            @click="ok && rewrite(serialize(sortKeys(ok.value), 2))"
          >
            Sort keys
          </button>
          <button type="button" class="btn outline" @click="picker?.click()">Open file</button>
          <input
            ref="picker"
            type="file"
            accept=".json,.jsonl,.ndjson,.txt,.log,application/json,text/plain"
            class="hidden"
            @change="onPick"
          />
        </div>
        <p v-if="fileProblem" role="status" class="font-ui text-sm text-danger">{{ fileProblem }}</p>
        <textarea
          id="json-input"
          ref="input"
          v-model="text"
          rows="12"
          wrap="off"
          spellcheck="false"
          class="w-full flex-1 resize-none font-mono"
          @dragover.prevent
          @drop.prevent="load($event.dataTransfer?.files[0])"
        />
      </div>

      <div class="flex min-h-0 min-w-0 flex-col gap-2">
        <label for="json-search">Search keys and values, or a path like .orders[].sku</label>
        <div class="flex gap-2">
          <input
            id="json-search"
            v-model="query"
            type="search"
            class="min-w-0 flex-1"
            :disabled="!ok || !!table"
            placeholder="Search"
          />
          <button type="button" class="btn outline" :disabled="!ok || !!view.found || !!table" @click="expand">
            Expand
          </button>
          <button type="button" class="btn outline" :disabled="!ok || !!view.found || !!table" @click="collapse">
            Collapse
          </button>
        </div>

        <div class="flex min-h-0 flex-1 flex-col rounded-2 border border-line">
          <div
            v-if="ok"
            class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 font-ui text-xs text-muted"
          >
            <span role="status">
              <span :class="ok.repairs.length ? 'text-danger' : 'text-ok'">
                {{ ok.repairs.length ? "Repaired" : "Valid" }}
              </span>
              · {{ size }} · {{ ok.values }} values · {{ ok.depth + 1 }} levels
              <template v-if="view.found">
                · {{ view.found.count }}{{ view.found.capped ? "+" : "" }} matches
              </template>
            </span>
            <button v-if="tableSource" type="button" class="linkish" @click="showTable = !showTable">
              {{ table ? "Show tree" : "Show as table" }}
            </button>
            <button
              v-if="table"
              type="button"
              class="linkish"
              @click="copy(toCsv(table), $event.currentTarget)"
            >
              Copy as CSV
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-sm">
            <div v-if="parsed && !parsed.ok && frame" role="status" class="font-ui">
              <p class="text-danger">Line {{ frame.line }}, column {{ frame.column }}: {{ parsed.message }}</p>
              <pre class="mt-3 font-mono"><code>{{ frame.code }}
{{ frame.caret }}</code></pre>
              <button type="button" class="linkish mt-3" @click="goTo(parsed.at)">Go to it</button>
            </div>

            <template v-else-if="ok">
              <div v-if="notes.length" class="mb-3 flex flex-col items-start gap-2 border-b border-line pb-3 font-ui text-xs">
                <p v-if="ok.repairs.length">Not valid as pasted. Format writes the repaired version.</p>
                <button
                  v-for="note in notes"
                  :key="note.message"
                  type="button"
                  class="linkish text-left"
                  @click="goTo(note.at)"
                >
                  {{ note.message }}<template v-if="note.count > 1"> ×{{ note.count }}</template>
                  · line {{ placeOf(source, note.at).line }}
                </button>
              </div>

              <template v-if="table">
                <table class="w-full">
                  <thead>
                    <tr>
                      <th v-for="column in table.columns" :key="column" class="sticky top-0 bg-bg">{{ column }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, r) in table.rows.slice(0, tableShown)" :key="r">
                      <td v-for="(column, c) in table.columns" :key="column">{{ cellText(row[c]) }}</td>
                    </tr>
                  </tbody>
                </table>
                <button
                  v-if="table.rows.length > tableShown"
                  type="button"
                  class="linkish mt-3"
                  @click="tableShown += TABLE_PAGE"
                >
                  Show more of {{ table.rows.length - tableShown }} rows
                </button>
              </template>
              <p v-else-if="view.found && !view.found.count" class="font-ui text-muted">No matches.</p>
              <JsonNode v-else :value="ok.value" id="0" path="" :depth="0" />
            </template>

            <div v-else class="flex flex-col items-start gap-3 font-ui text-muted">
              <p>
                Reads comments, trailing commas, single quotes, unquoted keys, Python literals, cut-off
                text, one value per line, and JSON inside a log line. Strings holding JSON or a JWT open
                in place.
              </p>
              <button type="button" class="linkish" @click="text = SAMPLE">Try a messy example</button>
            </div>
          </div>

          <div
            v-if="view.selected && !table"
            class="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2"
          >
            <code class="min-w-0 flex-1 text-xs [overflow-wrap:anywhere]">{{ view.selected.path || "." }}</code>
            <button type="button" class="btn sm outline" @click="copy(view.selected?.path || '.', $event.currentTarget)">
              Copy path
            </button>
            <button
              type="button"
              class="btn sm outline"
              @click="view.selected && copy(valueText(view.selected.value), $event.currentTarget)"
            >
              Copy value
            </button>
          </div>
        </div>
      </div>
    </div>

    <AppFoot />
  </main>
</template>
