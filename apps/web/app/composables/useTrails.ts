// The recent events of each held guide, read from the thread route, so a card can show what came
// before the last thing said. Refreshed every 20 seconds while the tab is on screen and visible.
import type { ThreadItem, Working } from "~/types/hub";

export function useTrails(rows: () => Working[]) {
  const { api } = useHub();
  const trails = ref<Record<string, ThreadItem[]>>({});
  let latest = 0;
  async function load() {
    const ask = ++latest;
    const ids = [...new Set(rows().map((r) => r.id))];
    const got = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await api<{ thread: ThreadItem[] }>(
            `/v1/guides/${encodeURIComponent(id)}/thread`,
          );
          return [id, r?.thread ?? []] as const;
        } catch {
          // A trail that did not load is a card without one, not a tab that failed.
          return [id, trails.value[id] ?? []] as const;
        }
      }),
    );
    if (ask === latest) trails.value = Object.fromEntries(got);
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    load();
    timer = setInterval(() => !document.hidden && load(), 20000);
  });
  onBeforeUnmount(() => clearInterval(timer));
  watch(
    () =>
      rows()
        .map((r) => `${r.id}|${r.note}|${r.lease_until}|${r.asking}`)
        .join(),
    load,
  );
  return { trails };
}
