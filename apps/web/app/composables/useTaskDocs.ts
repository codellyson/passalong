// A task's markdown and its write-up's, split into sections, for the review page.
//
// The cache lives here in the browser, outside Nuxt's payload. The prototype kept it in useState,
// and hydration replaced it with the server's empty copy after the first loads had landed, so the
// Acceptance column rendered empty. Documents are immutable enough for a page visit: a task is
// only rewritten by reject or release, which move it out of review, and a write-up not at all.
import type { Task } from "~/types/hub";
import { type Sections, sectionsOf } from "~/utils/task-docs";

const cache = ref<Record<string, Sections>>({});

export function useTaskDocs() {
  const { token } = useHub();

  async function load(id: string) {
    if (import.meta.server || !id || cache.value[id]) return;
    const headers: Record<string, string> = token.value
      ? { authorization: `Bearer ${token.value}` }
      : {};
    try {
      const res = await fetch(`/v1/guides/${encodeURIComponent(id)}`, { headers });
      // Not cached, so it is asked for again when the token arrives or the item is reopened.
      if (!res.ok) return;
      cache.value = { ...cache.value, [id]: sectionsOf(await res.text()) };
    } catch {}
  }

  /** Both documents for a task: its own, and the write-up that came back with it. */
  const docsFor = (t: Task) => ({
    task: cache.value[t.id] ?? null,
    report: t.claim?.report ? (cache.value[t.claim.report] ?? null) : null,
  });
  const loadTask = (t: Task) => Promise.all([load(t.id), load(t.claim?.report || "")]);

  return { docsFor, loadTask, token };
}
