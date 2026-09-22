// A task's markdown and its write-up's, split into sections, for the review page.
//
// The cache lives here in the browser, outside Nuxt's payload. Documents are immutable enough for a page visit: a task is
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
      // The body is awaited before the cache is read. Written as one expression, the spread of the
      // old cache ran first and the await after it, so of a task and its write-up loading together
      // the second to land wrote back a cache from before the first — and the task vanished.
      const doc = sectionsOf(await res.text());
      cache.value = { ...cache.value, [id]: doc };
    } catch {}
  }

  /** Both documents for a task: its own, and the write-up that came back with it. */
  const docsFor = (t: Task) => ({
    task: cache.value[t.id] ?? null,
    report: t.claim?.report ? (cache.value[t.claim.report] ?? null) : null,
  });
  const loadTask = (t: Task) => Promise.all([load(t.id), load(t.claim?.report || "")]);
  /** Load both, then hand them back: for a caller that keeps its own copy. */
  const docsOf = async (t: Task) => {
    await loadTask(t);
    return docsFor(t);
  };

  return { docsFor, docsOf, loadTask, token };
}
