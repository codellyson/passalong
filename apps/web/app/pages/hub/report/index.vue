<!--
  Filing a bug report, which is filing several guides at once.

  The hub has had no authoring surface until now, and the guide page still has none — the markdown
  is written wherever the author already works, and that is what lets a guide page run no script at
  all. This is the exception, and it earns it: nobody writing down the fourth bug of a QA pass is
  going to open an editor, write frontmatter, and remember the section names five more times.

  What comes out the other end is not a special kind of thing. Each issue is a guide with its own
  id, share key, pull count and verdict, filed through the same `PUT /v1/guides/:id` the CLI uses,
  and the report is only the parent that keeps the set together. Someone can pull one of them
  tomorrow and say whether it worked, which is the whole reason the answer to "can an issue be
  verified on its own?" had to be yes.
-->
<script setup lang="ts">
import {
  type Area,
  areaLabel,
  blankArea,
  blankReport,
  counts,
  ENVIRONMENTS,
  issueMarkdown,
  type Report,
} from "~/utils/report";

usePage({
  title: "Report a bug",
  description: "File a set of bugs and hand them over.",
  noindex: true,
});

const { data, api } = useHub();

/**
 * A draft lives in this browser, not on the board.
 *
 * It used to publish every issue as a draft guide the moment you hit Save — which put half-written
 * bugs on your board as loose rows, findable individually and not as a set, and still lost the
 * report itself when the tab closed. A report that nobody has handed over is not yet six guides;
 * it is a form someone is halfway through. So it is kept here, written on every change, and the
 * only thing that creates guides is handing it over.
 */
const DRAFT = "passalong.bug-draft";

function readDraft(): Report | null {
  try {
    const raw = window.localStorage.getItem(DRAFT);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Report;
    return saved?.areas?.length ? saved : null;
  } catch {
    return null;
  }
}

function writeDraft(value: Report | null) {
  try {
    if (value) window.localStorage.setItem(DRAFT, JSON.stringify(value));
    else window.localStorage.removeItem(DRAFT);
  } catch {
    // A browser with storage blocked still files reports; it just cannot keep one for later.
  }
}

const report = ref<Report>(blankReport());
const restored = ref(false);
const status = ref("");
const trouble = ref("");
const busy = ref(false);
const dirty = ref(false);
/** Set when the report has been handed over. The form is done; what replaces it is the receipt. */
const filed = ref<{ id: string; issues: { key: string; title: string; url: string }[] } | null>(
  null,
);

const tally = computed(() => counts(report.value));
const teams = computed(() => data.value.me?.teams || []);
const mates = computed(() => teams.value.find((t) => t.slug === report.value.team));

/** Which area cards repeat one already claimed above them. */
const repeats = computed(() => {
  const seen = new Set<string>();
  return report.value.areas.map((a) => {
    const already = Boolean(a.area) && seen.has(a.area);
    if (a.area) seen.add(a.area);
    return already;
  });
});

function touch() {
  dirty.value = true;
  status.value = "";
}

function addArea() {
  report.value.areas.push(blankArea());
  touch();
}

function removeArea(area: Area) {
  report.value.areas = report.value.areas.filter((a) => a.id !== area.id);
  if (!report.value.areas.length) report.value.areas.push(blankArea());
  touch();
}

/** What is missing, said as the sentence the foot bar will print. */
function missing(): string[] {
  const problems: string[] = [];
  for (const area of report.value.areas) {
    if (!area.area) problems.push("one area card still has no product area");
    for (const issue of area.issues) {
      if (!issue.title.trim()) {
        issue.open = true;
        problems.push("an issue still needs a title");
      }
    }
  }
  return [...new Set(problems)];
}

function saveDraft() {
  writeDraft(report.value);
  dirty.value = false;
  status.value = `Draft kept in this browser · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function discardDraft() {
  writeDraft(null);
  report.value = blankReport();
  restored.value = false;
  dirty.value = false;
  status.value = "Draft discarded.";
}

/**
 * Hand the report over: the report row first, because an issue's frontmatter names it, then the
 * issues one at a time rather than in parallel — they are writes to the same account against a
 * rate limit, and a partial failure that has filed four of six should say which four, since those
 * four are real guides someone can already act on.
 */
async function persist(state: "published") {
  busy.value = true;
  trouble.value = "";
  status.value = "Handing it over…";
  try {
    const addressing = {
      title: report.value.title.trim(),
      environment: report.value.environment,
      team: report.value.team,
      to: report.value.to,
    };
    if (!report.value.id) {
      const made = await api<{ report: { id: string } }>("/v1/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(addressing),
      });
      if (!made?.report?.id) throw new Error("the report could not be created");
      report.value.id = made.report.id;
    } else {
      await api(`/v1/reports/${report.value.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(addressing),
      });
    }

    const written: { key: string; title: string; url: string }[] = [];
    for (const area of report.value.areas) {
      for (const [n, issue] of area.issues.entries()) {
        const saved = await api<{ id: string; url: string }>(`/v1/guides/${issue.id}`, {
          method: "PUT",
          headers: { "content-type": "text/markdown" },
          body: issueMarkdown(report.value, area, issue, state),
        });
        issue.saved = true;
        written.push({
          key: `${areaCode(area.area)}-${n + 1}`,
          title: issue.title.trim() || "Untitled issue",
          url: saved?.url || "",
        });
      }
    }

    dirty.value = false;
    // The form is finished with; the draft it came from should not be waiting next time.
    writeDraft(null);
    filed.value = { id: report.value.id, issues: written };
  } catch (e) {
    trouble.value = (e as Error).message;
    status.value = "";
  } finally {
    busy.value = false;
  }
}

function submit() {
  const problems = missing();
  if (problems.length) {
    trouble.value = `Nearly — ${problems.join(", ")}.`;
    return;
  }
  persist("published");
}

function again() {
  report.value = blankReport();
  filed.value = null;
  status.value = "";
  dirty.value = false;
}

// Kept as you type, so closing the tab in the middle of a QA pass costs nothing and there is no
// dialog asking whether you meant it.
let pending: ReturnType<typeof setTimeout> | null = null;
watch(
  report,
  () => {
    if (filed.value) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => writeDraft(report.value), 700);
  },
  { deep: true },
);

onMounted(() => {
  const saved = readDraft();
  if (!saved) return;
  report.value = saved;
  restored.value = true;
  status.value = "Draft restored from this browser.";
});

onBeforeUnmount(() => {
  if (pending) clearTimeout(pending);
});
</script>

<template>
  <HubShell heading="Report a bug">
    <template #sub>
      Group everything from one pass. Each issue becomes a guide someone can pull and answer for on
      its own.
    </template>

    <!-- Handed over. Every issue is a guide now, so the useful thing to show is the links. -->
    <section v-if="filed" class="rounded-3 border border-line border-t-2 border-t-ok bg-raised p-6">
      <h2 class="mt-0 mb-1 text-h2">Handed over</h2>
      <p class="m-0 text-muted">
        {{ filed.issues.length }} issue{{ filed.issues.length === 1 ? "" : "s" }}
        <template v-if="report.team"> to {{ report.team }}<template v-if="report.to"> / @{{ report.to.replace(/^@/, "") }}</template></template>.
        Each one can be pulled and verified separately.
      </p>
      <ul class="mt-4 mb-0 flex list-none flex-col gap-1.5 p-0">
        <li v-for="issue in filed.issues" :key="issue.key" class="flex items-baseline gap-2.5">
          <span class="font-code text-xs text-muted">{{ issue.key }}</span>
          <a :href="issue.url" target="_blank" rel="noopener" class="font-ui text-sm">{{ issue.title }}</a>
        </li>
      </ul>
      <div class="mt-5 flex flex-wrap gap-2">
        <NuxtLink :to="`/hub/report/${filed.id}`" class="btn primary">See the whole report</NuxtLink>
        <button type="button" class="btn" @click="again">Report more bugs</button>
        <NuxtLink to="/hub" class="btn">Back to the board</NuxtLink>
      </div>
    </section>

    <template v-else>
      <!-- What the whole report is, said once. Everything here is inherited by every issue in it,
           which is the same bargain the area card makes one level down. -->
      <!-- Said once, where it answers the question "is what I typed yesterday still here?" -->
      <p
        v-if="restored"
        class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2 border border-line bg-raised px-4 py-2.5 font-ui text-sm text-muted"
      >
        Picked up where you left off — this report was kept in this browser.
        <button type="button" class="btn sm" @click="discardDraft">Start fresh</button>
      </p>

      <section class="mb-5 rounded-3 border border-line bg-raised p-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">
              Report title <span class="font-normal normal-case tracking-normal">(optional)</span>
            </span>
            <input
              v-model="report.title"
              type="text"
              placeholder="Pre-release sweep, 8 Sep build"
              @input="touch"
            >
          </label>

          <div class="flex flex-col gap-1.5">
            <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">Environment</span>
            <div class="flex w-max overflow-hidden rounded-2 border border-line-strong">
              <button
                v-for="(env, n) in ENVIRONMENTS"
                :key="env"
                type="button"
                class="border-0 px-3 py-1.5 font-ui text-sm capitalize"
                :class="[
                  report.environment === env ? 'bg-accent-soft text-accent font-semibold' : 'bg-raised text-muted hover:text-fg',
                  n ? 'border-l border-l-line-strong' : '',
                ]"
                :aria-pressed="report.environment === env"
                @click="report.environment = env; touch()"
              >{{ env }}</button>
            </div>
          </div>

          <!-- A report nobody is handed sits on your own board and nothing else happens. That is a
               legitimate way to use it, so the team is optional and says what it does. -->
          <label v-if="teams.length" class="flex flex-col gap-1.5">
            <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">Hand it to</span>
            <select v-model="report.team" @change="report.to = ''; touch()">
              <option value="">Nobody — keep it on my board</option>
              <option v-for="t in teams" :key="t.slug" :value="t.slug">{{ t.name }}</option>
            </select>
          </label>

          <label v-if="report.team" class="flex flex-col gap-1.5">
            <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">
              Anyone in particular
            </span>
            <input
              v-model="report.to"
              type="text"
              :placeholder="`a handle in ${mates?.name || report.team}`"
              @input="touch"
            >
          </label>
        </div>

        <p class="mt-4 mb-0 flex flex-wrap items-baseline gap-x-2 border-t border-line pt-3 font-code text-sm text-muted">
          <b class="font-semibold text-fg">{{ tally.issues }}</b>
          issue{{ tally.issues === 1 ? "" : "s" }} across
          <b class="font-semibold text-fg">{{ tally.areas }}</b>
          area{{ tally.areas === 1 ? "" : "s" }}
          <template v-if="tally.shots">· {{ tally.shots }} screenshot{{ tally.shots === 1 ? "" : "s" }}</template>
        </p>
      </section>

      <div class="flex flex-col gap-4">
        <HubReportArea
          v-for="(area, n) in report.areas"
          :key="area.id"
          :area="area"
          :duplicate="repeats[n] || false"
          @remove="removeArea(area)"
          @touch="touch"
        />
      </div>

      <button
        type="button"
        class="mt-4 w-full rounded-3 border border-dashed border-line-strong bg-transparent px-4 py-3 text-left font-ui text-sm text-muted hover:border-accent hover:text-accent"
        @click="addArea"
      >
        + Add another product area
      </button>

      <div class="mt-6 flex flex-wrap items-center gap-3 rounded-3 border border-line bg-raised px-4 py-3">
        <p v-if="trouble" class="m-0 flex-1 font-ui text-sm text-danger">{{ trouble }}</p>
        <p v-else class="m-0 flex-1 font-code text-sm" :class="status ? 'text-ok' : 'text-muted'">
          {{ status || (dirty ? "Unsaved changes" : "Nothing saved yet") }}
        </p>
        <div class="ml-auto flex gap-2">
          <button type="button" class="btn" :disabled="busy" @click="saveDraft">
            Save draft
          </button>
          <button type="button" class="btn primary" :disabled="busy" @click="submit">
            {{ report.team ? "Hand it over" : "File the report" }}
          </button>
        </div>
      </div>
    </template>
  </HubShell>
</template>
