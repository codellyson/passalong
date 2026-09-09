<!--
  One issue, which is one guide once it is saved.

  Collapsed it is a line you can scan; open it is the whole form. A tester filing six bugs spends
  most of the session looking at five collapsed rows and one open one, so the collapsed line
  carries what tells them apart: the key, the title, how bad it is, and whether it has evidence.
-->
<script setup lang="ts">
import type { Issue } from "~/utils/report";

const props = defineProps<{ issue: Issue; code: string; index: number }>();
const emit = defineEmits<{ (e: "remove"): void; (e: "duplicate"): void; (e: "touch"): void }>();

const { api } = useHub();

const key = computed(() => `${props.code}-${props.index + 1}`);
const uploading = ref(0);
const trouble = ref("");
const over = ref(false);
const picker = ref<HTMLInputElement | null>(null);

const severityClass: Record<string, string> = {
  s1: "bg-danger-soft text-danger",
  s2: "bg-warn-soft text-warn",
  s3: "bg-accent-soft text-accent",
  s4: "bg-surface text-muted",
};

function toggle() {
  props.issue.open = !props.issue.open;
}

/**
 * Screenshots upload as they are dropped rather than being held for the save.
 *
 * Two reasons, and the second is the one that decided it: a guide's markdown carries the image as
 * a URL, so the bytes have to exist somewhere before the document can name them — and the hub's
 * CSP is `img-src 'self'`, so there is no `blob:` preview to show in the meantime anyway. What
 * you see in the strip is the stored file.
 */
async function take(files: File[]) {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (!images.length) {
    trouble.value = "Only images can be attached as evidence.";
    return;
  }
  trouble.value = "";
  emit("touch");
  for (const file of images) {
    uploading.value += 1;
    try {
      const body = await shrinkImage(file);
      const shot = await api<{ shot: { id: string; url: string } }>("/v1/shots", {
        method: "POST",
        headers: { "content-type": body.type || file.type, "x-shot-name": asciiName(file.name) },
        body,
      });
      if (shot?.shot) {
        props.issue.shots.push({ id: shot.shot.id, url: shot.shot.url, name: file.name });
        emit("touch");
      }
    } catch (e) {
      trouble.value = (e as Error).message || `${file.name} did not upload.`;
    } finally {
      uploading.value -= 1;
    }
  }
}

/** A header value has to be latin-1; a screenshot called "Bildschirmfoto ….png" must not 400. */
const asciiName = (name: string) => name.replace(/[^\x20-\x7E]/g, "_").slice(0, 120);

function onDrop(event: DragEvent) {
  over.value = false;
  take(Array.from(event.dataTransfer?.files || []));
}

function drop(id: string) {
  props.issue.shots = props.issue.shots.filter((s) => s.id !== id);
  emit("touch");
}

const detailed = computed(() =>
  Boolean(
    props.issue.where ||
      props.issue.device ||
      props.issue.expected ||
      props.issue.actual ||
      props.issue.steps,
  ),
);
</script>

<template>
  <article class="border-t border-line first:border-t-0">
    <!-- The whole line is the control, so hitting anywhere on a collapsed row opens it. -->
    <div
      class="issue-head flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface"
      role="button"
      tabindex="0"
      :aria-expanded="issue.open"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <span
        class="shrink-0 font-code text-xs text-muted transition-transform"
        :class="issue.open ? 'rotate-90' : ''"
      >&#9656;</span>
      <span class="shrink-0 font-code text-xs text-muted">{{ key }}</span>
      <span
        class="min-w-0 flex-1 basis-full truncate font-ui text-sm font-semibold sm:basis-auto"
        :class="issue.title ? 'text-fg' : 'text-muted italic font-normal'"
      >{{ issue.title || "Untitled issue" }}</span>

      <span
        class="shrink-0 rounded-pill px-2 py-0.5 font-code text-[11px] uppercase"
        :class="severityClass[issue.severity] || 'bg-surface text-muted'"
        :title="severityLabel(issue.severity)"
      >{{ issue.severity }}</span>
      <span v-if="issue.shots.length" class="shrink-0 font-code text-[11px] text-muted">
        {{ issue.shots.length }} shot{{ issue.shots.length === 1 ? "" : "s" }}
      </span>

      <span class="ml-auto flex shrink-0 gap-1" @click.stop>
        <button type="button" class="btn sm" @click="emit('duplicate')">duplicate</button>
        <button type="button" class="btn destructive sm" @click="emit('remove')">remove</button>
      </span>
    </div>

    <div v-if="issue.open" class="issue-body flex flex-col gap-4 px-4 pt-1 pb-5 sm:pl-10">
      <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <label class="flex flex-col gap-2">
          <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">Issue title</span>
          <input
            v-model="issue.title"
            type="text"
            placeholder="One line: what is broken, and where"
            @input="emit('touch')"
          >
        </label>
        <label class="flex flex-col gap-2">
          <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">Severity</span>
          <select v-model="issue.severity" @change="emit('touch')">
            <option v-for="s in SEVERITIES" :key="s.slug" :value="s.slug">
              {{ s.slug.toUpperCase() }} · {{ s.label }} — {{ s.note }}
            </option>
          </select>
        </label>
      </div>

      <div class="flex flex-col gap-2">
        <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">Evidence</span>
        <div
          class="rounded-2 border border-dashed px-4 py-4 text-center font-ui text-sm transition-colors"
          :class="over ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-muted hover:border-accent hover:text-accent'"
          role="button"
          tabindex="0"
          @click="picker?.click()"
          @keydown.enter.prevent="picker?.click()"
          @dragenter.prevent="over = true"
          @dragover.prevent="over = true"
          @dragleave="over = false"
          @drop.prevent="onDrop"
        >
          Drop screenshots here, or <u>choose files</u>
        </div>
        <input
          ref="picker"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="take(Array.from(($event.target as HTMLInputElement).files || [])); picker && (picker.value = '')"
        >

        <p v-if="uploading" class="m-0 font-code text-xs text-muted">
          uploading {{ uploading }}…
        </p>
        <p v-if="trouble" class="m-0 font-ui text-sm text-danger">{{ trouble }}</p>

        <div v-if="issue.shots.length" class="flex flex-wrap gap-2">
          <figure
            v-for="shot in issue.shots"
            :key="shot.id"
            class="relative m-0 w-32 overflow-hidden rounded-2 border border-line bg-surface"
          >
            <img :src="shot.url" :alt="shot.name" class="block h-20 w-full object-cover">
            <!-- A filename cut at a pixel loses the date and keeps "Screenshot 2026-0…", which
                 is the one part every shot shares. Cut by unit, and openable, it keeps whichever
                 part of the name distinguishes this shot from the one beside it. -->
            <figcaption class="px-2 py-1 font-code text-[10px] break-words text-muted">
              <AppShorten :value="shot.name" :max="18" />
            </figcaption>
            <button
              type="button"
              class="btn icon sm absolute top-1 right-1"
              :aria-label="`Remove ${shot.name}`"
              @click="drop(shot.id)"
            >&times;</button>
          </figure>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <span class="font-ui text-xs font-semibold tracking-wide text-muted uppercase">What happened</span>
        <HubReportEditor
          :html="issue.html"
          placeholder="What you saw, and anything you noticed while it happened — console output, how often it repeats."
          @update:html="issue.html = $event; emit('touch')"
          @files="take"
        />
      </div>

      <!-- Optional, and folded away unless it has something in it. Everything under here makes a
           bug easier to fix; none of it should stand between a tester and filing the next one. -->
      <!-- The three zero widths are load-bearing. `border-dashed` sets border-style on all four
           sides, and this app layers Tailwind's theme and utilities over its own base without
           preflight — so nothing has zeroed border-width, and the other three sides fall back to
           the initial `medium`, drawing a 3px dashed box nobody asked for. -->
      <details
        class="border-t border-r-0 border-b-0 border-l-0 border-dashed border-line pt-3"
        :open="detailed"
      >
        <summary class="cursor-pointer font-ui text-xs font-semibold tracking-wide text-muted uppercase hover:text-fg">
          Repro detail
        </summary>
        <div class="flex flex-col gap-3 pt-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-2">
              <span class="font-ui text-xs text-muted">URL or screen</span>
              <input v-model="issue.where" type="text" placeholder="/editor/sections" @input="emit('touch')">
            </label>
            <label class="flex flex-col gap-2">
              <span class="font-ui text-xs text-muted">Device &amp; browser</span>
              <input v-model="issue.device" type="text" placeholder="Chrome 141 · macOS 15.2" @input="emit('touch')">
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-2">
              <span class="font-ui text-xs text-muted">Expected — what counts as fixed</span>
              <textarea v-model="issue.expected" rows="3" placeholder="What should have happened" @input="emit('touch')" />
            </label>
            <label class="flex flex-col gap-2">
              <span class="font-ui text-xs text-muted">Actual</span>
              <textarea v-model="issue.actual" rows="3" placeholder="What happened instead" @input="emit('touch')" />
            </label>
          </div>
          <label class="flex flex-col gap-2">
            <span class="font-ui text-xs text-muted">Steps to reproduce</span>
            <textarea v-model="issue.steps" rows="4" placeholder="1. …&#10;2. …&#10;3. …" @input="emit('touch')" />
          </label>
        </div>
      </details>
    </div>
  </article>
</template>
