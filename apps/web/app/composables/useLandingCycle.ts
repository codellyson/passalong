import type { Ref } from "vue";

/**
 * Steps an index through `count` items every `ms`, pausing while the element is off screen, the tab is
 * hidden or the pointer is on it. Reduced motion never auto-advances; picking still works. While
 * `held` is true something else (scrolling) drives the index and the timer stays off.
 */
export function useLandingCycle(
  count: number,
  ms: number,
  root: Ref<HTMLElement | null>,
  held: Ref<boolean> = ref(false),
) {
  const index = ref(0);
  const hovering = ref(false);
  let visible = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let observer: IntersectionObserver | undefined;
  let calm = false;

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  const start = () => {
    stop();
    if (calm || held.value || !visible || hovering.value || document.hidden) return;
    timer = setInterval(() => {
      index.value = (index.value + 1) % count;
    }, ms);
  };
  const pick = (i: number) => {
    index.value = i;
    start();
  };
  const onVisibility = () => start();

  onMounted(() => {
    calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    observer = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      start();
    });
    if (root.value) observer.observe(root.value);
    document.addEventListener("visibilitychange", onVisibility);
  });
  onBeforeUnmount(() => {
    stop();
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
  });
  watch([hovering, held], start);

  return { index, pick, hovering };
}
