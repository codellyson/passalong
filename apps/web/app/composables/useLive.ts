/**
 * The hub, kept live: reads `/v1/events` while you are signed in and the tab is visible, refreshes
 * what an event touches, and turns notifications into toasts.
 *
 * - A `note` is news addressed to you — taken, passed, handed in, approved, works, closed, went
 *   quiet. It becomes a toast and refreshes the lists it could have moved.
 * - A `change` is a guide you can see that moved: a hold, a progress note, a verdict, an ack. It
 *   refreshes that guide's page and the lists, and says nothing: progress notes stay quiet.
 *
 * Read with fetch, not EventSource, because EventSource cannot send the bearer token a token
 * sign-in uses. The server ends each connection after a few minutes and this reconnects from the
 * last cursor it saw, so nothing between the two is lost. A hidden tab disconnects and catches up
 * when it is shown again, which is also when a burst of toasts would be read, so a catch-up shows
 * the last few and says how many more there were.
 */
import type { QueryClient } from "@tanstack/vue-query";

export interface Toast {
  key: number;
  text: string;
  guide: string;
  kind: string;
}

const TOAST_MS = 7000;
/** A catch-up shows this many toasts at most, and one line for the rest. */
const BURST = 3;

function build(queryClient: QueryClient) {
  const { token, signedIn } = useHub();
  const toasts = useState<Toast[]>("live:toasts", () => []);
  let cursor = "";
  let running = false;
  let controller: AbortController | null = null;
  let seq = 0;

  function dismiss(key: number) {
    toasts.value = toasts.value.filter((t) => t.key !== key);
  }
  function toast(t: Omit<Toast, "key">) {
    const key = ++seq;
    toasts.value = [...toasts.value.slice(-(BURST + 1)), { ...t, key }];
    setTimeout(() => dismiss(key), TOAST_MS);
  }

  // Refreshes are coalesced: an agent handing in writes a hold, a verdict and a notification in
  // one moment, and each would otherwise refetch every list on its own.
  const touched = new Set<string>();
  let flush: ReturnType<typeof setTimeout> | null = null;
  function refresh(guide: string) {
    if (guide) touched.add(guide);
    flush ??= setTimeout(() => {
      flush = null;
      for (const id of touched)
        void queryClient.invalidateQueries({ queryKey: hubKeys.context(id) });
      touched.clear();
      for (const key of [
        hubKeys.notifications,
        hubKeys.board,
        hubKeys.allGuides,
        hubKeys.tasks,
        hubKeys.working,
        hubKeys.handedIn,
        hubKeys.log,
      ])
        void queryClient.invalidateQueries({ queryKey: key });
    }, 400);
  }

  async function connect(): Promise<void> {
    controller = new AbortController();
    const headers: Record<string, string> = { accept: "text/event-stream" };
    if (token.value) headers.authorization = `Bearer ${token.value}`;
    if (cursor) headers["last-event-id"] = cursor;
    const res = await fetch("/v1/events", { headers, signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    const parse = sseParser();
    // Events that arrive in the first moment of a connection are what happened while it was down.
    const caughtUp: string[] = [];
    let settled = false;
    setTimeout(() => {
      settled = true;
      const extra = caughtUp.length - BURST;
      if (extra > 0)
        toast({
          text: `${extra} more update${extra === 1 ? "" : "s"} in your activity`,
          guide: "",
          kind: "",
        });
    }, 1500);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      for (const e of parse(value)) {
        if (e.id) cursor = e.id;
        if (e.event === "note") {
          const n = JSON.parse(e.data) as { text: string; guide: string; kind: string };
          refresh(n.guide);
          if (!settled) {
            caughtUp.push(n.text);
            if (caughtUp.length > BURST) continue;
          }
          toast({ text: n.text, guide: n.guide, kind: n.kind });
        } else if (e.event === "change") {
          refresh((JSON.parse(e.data) as { guide_id: string }).guide_id);
        }
      }
    }
  }

  async function loop() {
    if (running) return;
    running = true;
    let wait = 1000;
    while (running && signedIn.value && document.visibilityState === "visible") {
      try {
        await connect();
        wait = 1000;
      } catch {
        if (!running) break;
        // Back off on failure, up to half a minute: a server that is down should not be asked
        // every second by every open tab.
        await new Promise((r) => setTimeout(r, wait));
        wait = Math.min(wait * 2, 30_000);
      }
    }
    running = false;
  }

  function stop() {
    running = false;
    controller?.abort();
  }

  // Once per app: the shell remounts on every hub page, and each mount calls this.
  let started = false;
  function start() {
    if (import.meta.server || started) return;
    started = true;
    watch(
      signedIn,
      (yes) => {
        if (yes) void loop();
        else stop();
      },
      { immediate: true },
    );
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void loop();
      else stop();
    });
  }

  return { toasts, dismiss, start };
}

const lives = new WeakMap<object, ReturnType<typeof build>>();

export function useLive() {
  const nuxtApp = useNuxtApp();
  let live = lives.get(nuxtApp);
  if (!live) {
    live = effectScope(true).run(() => build(nuxtApp.$queryClient as QueryClient)) as ReturnType<
      typeof build
    >;
    lives.set(nuxtApp, live);
  }
  return live;
}
