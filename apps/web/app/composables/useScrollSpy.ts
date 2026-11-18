/** Which of these sections is being read: the last heading above `offset` px, or the last one at the page's foot. */
export function useScrollSpy(ids: MaybeRefOrGetter<string[]>, offset = 120) {
  const active = ref("");
  let frame = 0;

  function measure() {
    frame = 0;
    const list = toValue(ids);
    let here = list[0] ?? "";
    for (const id of list) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= offset) here = id;
    }
    const doc = document.documentElement;
    if (list.length && window.innerHeight + window.scrollY >= doc.scrollHeight - 2)
      here = list.at(-1) ?? here;
    active.value = here;
  }
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  /** Scrolls to a section and keeps the URL's query, which the hub's tabs live in. */
  function go(id: string, e?: MouseEvent) {
    const el = document.getElementById(id);
    if (!el || e?.metaKey || e?.ctrlKey) return;
    e?.preventDefault();
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    history.replaceState(history.state, "", `${location.pathname}${location.search}#${id}`);
    active.value = id;
  }

  onMounted(() => {
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue, { passive: true });
    measure();
  });
  onBeforeUnmount(() => {
    window.removeEventListener("scroll", queue);
    window.removeEventListener("resize", queue);
    if (frame) cancelAnimationFrame(frame);
  });
  // The list changes when another document opens; its headings render on the next tick.
  watch(
    () => toValue(ids).join(" "),
    () => nextTick(queue),
  );

  return { active, go };
}
